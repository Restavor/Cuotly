import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { AgentsNavContext } from "@/components/shell/navigation";
import { isReservationServiceStatus } from "@/core/app/products";
import {
  agentsPageHref,
  guardAgentsPage,
  type AgentsPage,
} from "@/core/reservations/agents-routes";
import { formatCentsAsEuros } from "@/core/reservations/money";
import { canSeeAmounts, type ReservationsActor } from "@/core/reservations/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadDevice, loadElevation } from "@/services/agents/device";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quién mira: una persona con cuenta, la tablet del local o el soporte de Restavor en sesión. */
export type AgentsMode = "user" | "device" | "support";

export type AgentsRestaurant =
  /** Puede entrar: es Propietario o Encargado (o la tablet del local, o el soporte en sesión) y el restaurante tiene Reservas. */
  | { readonly state: "ok"; readonly nav: AgentsNavContext; readonly mode: AgentsMode }
  /** No es Propietario ni Encargado de este restaurante (o no existe: no se distingue). */
  | { readonly state: "no_access" }
  /** Es de los suyos, pero todavía no tiene Reservas. */
  | { readonly state: "not_contracted" }
  /** Es soporte de este espacio y su sesión ya no está abierta: vuelve a la ficha del espacio (PRD §3.4). */
  | { readonly state: "support_expired"; readonly spaceSlug: string }
  /** No se ha podido mirar: no es lo mismo que «no hay». */
  | { readonly state: "failed" };

/**
 * Quién es quien mira en este restaurante y cómo está su Reservas (PRD de agents §3.1, §3.3, §3.4 y
 * §5.1). Una sola lectura por petición: el layout y la página la comparten.
 *
 * **No autoriza nada**: decide qué se pinta. `reservations_my_role()`, las políticas de RLS y las
 * RPC contestan por su cuenta a cada lectura y a cada escritura. El orden importa:
 *
 * 1. Una cookie de **dispositivo** válida manda sobre la sesión personal (§3.3), y solo vale para SU
 *    restaurante: la misma tablet pidiendo el de otro es «sin acceso».
 * 2. Después, la persona con cuenta: Propietario o Encargado.
 * 3. Por último, el **soporte** con una sesión de Reservas abierta (§3.4). Sin sesión, quien está marcado
 *    como soporte vuelve a la ficha del espacio; cualquier otro, «sin acceso».
 */
export const loadAgentsRestaurant = cache(async (establishmentId: string): Promise<AgentsRestaurant> => {
  if (!UUID.test(establishmentId)) return { state: "no_access" };

  const device = await loadDevice();
  if (device.kind === "active") {
    if (device.establishmentId !== establishmentId) return { state: "no_access" };
    // Acotado por el restaurante de la tablet; la clave de servicio no mira por sí sola de quién es cada fila.
    const admin = createAdminClient();
    const [{ data: establishment, error: estError }, { data: settings, error: setError }, elevation] = await Promise.all([
      admin.from("establishments").select("id, name, city").eq("id", establishmentId).maybeSingle(),
      admin.from("reservation_settings").select("service_status").eq("establishment_id", establishmentId).maybeSingle(),
      loadElevation(),
    ]);
    if (estError !== null || setError !== null) return { state: "failed" };
    if (!establishment) return { state: "no_access" };
    if (!settings || !isReservationServiceStatus(settings.service_status)) return { state: "not_contracted" };
    const actor: ReservationsActor = elevation ? { kind: "device", pin: elevation.role } : { kind: "device" };
    return {
      state: "ok",
      mode: "device",
      nav: {
        establishmentId,
        name: establishment.name,
        locality: establishment.city,
        actor,
        serviceStatus: settings.service_status,
        // La tablet no enseña importes: ni sin PIN ni con él (el saldo se mira desde una cuenta).
        balanceLabel: null,
        deviceName: device.name,
        elevation: elevation ? { name: elevation.name, secondsLeft: elevation.secondsLeft } : null,
      },
    };
  }

  const supabase = await createClient();
  const [{ data: establishment, error: estError }, { data: role, error: roleError }, { data: settings, error: setError }] =
    await Promise.all([
      supabase.from("establishments").select("id, name, city").eq("id", establishmentId).maybeSingle(),
      supabase.rpc("reservations_my_role", { p_establishment_id: establishmentId }),
      supabase
        .from("reservation_settings")
        .select("service_status")
        .eq("establishment_id", establishmentId)
        .maybeSingle(),
    ]);

  if (roleError !== null) return { state: "failed" };

  // El soporte: no es Propietario ni Encargado, pero tiene una sesión de Reservas abierta.
  if (role !== "owner" && role !== "manager") {
    const { data: sessions, error: sessionError } = await supabase.rpc("my_reservation_support_session", {
      p_establishment_id: establishmentId,
    });
    if (sessionError !== null) return { state: "failed" };
    const session = sessions?.[0];
    if (!session) {
      // Marcado como soporte de este restaurante y sin sesión: vuelve a la ficha del espacio (PRD §3.4).
      const { data: candidates } = await supabase.rpc("reservation_support_candidates", { p_query: null });
      const mine = candidates?.find((c) => c.establishment_id === establishmentId);
      return mine ? { state: "support_expired", spaceSlug: mine.space_slug } : { state: "no_access" };
    }
    // La sesión es de quien mira (la comprobó su propia sesión); el nombre y el estado se leen con la clave de
    // servicio porque una persona de la plataforma que no es miembro del espacio no los lee por RLS.
    const admin = createAdminClient();
    const [{ data: est }, { data: set }, { data: aal }] = await Promise.all([
      admin.from("establishments").select("id, name, city").eq("id", establishmentId).maybeSingle(),
      admin.from("reservation_settings").select("service_status").eq("establishment_id", establishmentId).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (!est) return { state: "no_access" };
    if (!set || !isReservationServiceStatus(set.service_status)) return { state: "not_contracted" };
    return {
      state: "ok",
      mode: "support",
      nav: {
        establishmentId,
        name: est.name,
        locality: est.city,
        actor: { kind: "support", twoFactor: aal?.currentLevel === "aal2" },
        serviceStatus: set.service_status,
        balanceLabel: null,
        supportSession: { id: session.session_id, expiresAt: session.expires_at },
      },
    };
  }

  if (estError !== null || setError !== null) return { state: "failed" };
  if (!establishment) return { state: "no_access" };
  if (!settings || !isReservationServiceStatus(settings.service_status)) return { state: "not_contracted" };

  const actor: ReservationsActor = { kind: role };
  const serviceStatus = settings.service_status;

  // El saldo del menú es un importe: solo a quien se le enseñan importes (RN-APP-05).
  let balanceLabel: string | null = null;
  if (canSeeAmounts(actor, { serviceStatus })) {
    const { data: cents } = await supabase.rpc("agent_balance_cents", { p_establishment_id: establishmentId });
    // Si no se ha podido leer, no se pinta un cero: se omite la cifra (CLAUDE.md, no inventar).
    if (typeof cents === "number") balanceLabel = formatCentsAsEuros(cents);
  }

  return {
    state: "ok",
    mode: "user",
    nav: {
      establishmentId,
      name: establishment.name,
      locality: establishment.city,
      actor,
      serviceStatus,
      balanceLabel,
    },
  };
});

export type AgentsPageAccess =
  | { readonly kind: "ok"; readonly nav: AgentsNavContext; readonly mode: AgentsMode }
  | { readonly kind: "denied"; readonly nav: AgentsNavContext; readonly mode: AgentsMode };

/**
 * La puerta de cada pantalla de `/agents/[id]`: se abre en este estado y para esta
 * persona, o se le lleva a la que le toca (aprobada y sin pagar, cerrada…), o se le dice
 * que no puede. Cada página la llama la primera.
 */
export async function requireAgentsPage(establishmentId: string, page: AgentsPage): Promise<AgentsPageAccess> {
  const restaurant = await loadAgentsRestaurant(establishmentId);
  // El layout ya enseñó el motivo; una página que llegue aquí sin restaurante no existe.
  if (restaurant.state === "support_expired") redirect(`/espacios/${restaurant.spaceSlug}/reservas`);
  if (restaurant.state !== "ok") notFound();

  const guard = guardAgentsPage(establishmentId, restaurant.nav.actor, restaurant.nav.serviceStatus, page);
  if (guard.kind === "redirect") redirect(guard.href);
  // En la tablet, lo que pide el PIN de un Encargado o Propietario (Ajustes, Equipo, Historial…) lleva a la puerta del PIN
  // en vez de a un «sin permiso»: con ese PIN sí se abriría (PRD §3.3).
  if (
    guard.kind === "denied" &&
    restaurant.mode === "device" &&
    page !== "unlock" &&
    guardAgentsPage(establishmentId, { kind: "device", pin: "manager" }, restaurant.nav.serviceStatus, page).kind === "allow"
  ) {
    redirect(agentsPageHref(establishmentId, "unlock"));
  }
  return { kind: guard.kind === "allow" ? "ok" : "denied", nav: restaurant.nav, mode: restaurant.mode };
}

/** La dirección de una pantalla del restaurante; atajo para quien ya tiene su contexto. */
export function hrefOf(nav: AgentsNavContext, page: AgentsPage): string {
  return agentsPageHref(nav.establishmentId, page);
}
