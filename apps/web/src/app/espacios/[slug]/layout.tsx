import { notFound, redirect } from "next/navigation";

import { AccessRemoved } from "@/components/access/AccessStates";
import {
  AppShell,
  type PanelEstablishment,
  type ShellContext,
  type ShellNotification,
} from "@/components/shell/AppShell";
import { isClientRole, isStaffRole } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { avatarLink } from "@/services/avatar-storage";

import { searchEverything } from "./shell-actions";

/**
 * El armazón de §20.2, §20.3 y §20.5 envolviendo las pantallas de verdad.
 *
 * Hasta ahora existía y se probaba contra `/armazon`, una página de
 * demostración sin datos: los cuatro criterios de experiencia (CA-19 a
 * CA-22) estaban comprobados sobre un maniquí. Esto los pone sobre el
 * producto.
 *
 * El rol que se le pasa al armazón sale de la membresía real del espacio,
 * no de nada que mande el navegador. Y no autoriza nada: decide qué
 * destinos se pintan, mientras que quién puede entrar en cada uno lo
 * siguen decidiendo RLS y las funciones del servidor (CLAUDE.md: ocultar
 * un botón no es un control de acceso).
 */
export const dynamic = "force-dynamic";

type EventKey = keyof typeof es.notifications.events;

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  // El rol y el restaurante salen de `resolveShellViewer()`, compartido con
  // la pantalla "Más": las dos tienen que responder lo mismo o la barra de
  // móvil y su desbordamiento acabarían discrepando.
  const { role, establishmentId, supportSession } = await resolveShellViewer(supabase, user.id, slug);

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, event_type, deep_link, read_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Nombre, inicial y foto de quien mira, para el avatar de la cabecera.
  // Salen de `profiles`, no del token: el nombre lo edita la persona y el
  // correo es el respaldo cuando todavía no lo ha puesto.
  //
  // RN-GLO-09 · la foto es la propia, así que aquí no hay ninguna frontera
  // que cuidar: `profiles_select` deja leer la fila de uno siempre. El
  // enlace se firma en el servidor y dura una hora; si el almacenamiento
  // no contesta, `avatarLink` devuelve `null` y se pinta la inicial.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  const userLabel = profile?.full_name?.trim() || profile?.email || user.email || "";
  const userInitial = (userLabel.trim()[0] ?? "·").toUpperCase();
  const userAvatarUrl = await avatarLink(supabase.storage, profile?.avatar_path ?? null);

  /*
   * RN-PAN-03 y RN-PAN-04 · lo que el panel del restaurante necesita para
   * su cabecera: el nombre de SU local y la lista de los suyos.
   *
   * Sale de `my_contexts()` (§36, migración 98) y no de una consulta
   * nueva: esa función ya devuelve los paneles a los que esta persona
   * tiene acceso, con la RLS de siempre, y el contexto global la usa para
   * lo mismo. Preguntarlo aquí de otra manera sería un segundo criterio de
   * "mis restaurantes" que un día diría otra cosa (RN-PAN-02: el panel no
   * estrena ninguna capacidad).
   */
  let establishments: readonly PanelEstablishment[] = [];
  let establishmentName: string | null = null;

  /*
   * Móvil · la tarjeta de contexto despliega TODOS los espacios y paneles
   * de quien mira, para saltar entre ellos. Es la misma `my_contexts()`, y
   * ahora se pregunta para todos. Si falla, la lista queda vacía y la
   * tarjeta se pinta sin desplegable: la vuelta al Inicio global sigue ahí.
   */
  const { data: contextos } = await supabase.rpc("my_contexts");
  const contexts: ShellContext[] = (contextos ?? []).flatMap((c): ShellContext[] => {
    if (c.kind === "space") {
      return [
        {
          key: `space:${c.space_id}`,
          kind: "space",
          name: c.space_name ?? "",
          detail: c.role ? es.roles[c.role as keyof typeof es.roles] : "",
          href: `/espacios/${c.space_slug ?? ""}`,
        },
      ];
    }
    if (c.kind === "establishment" && c.establishment_id !== null) {
      return [
        {
          key: `panel:${c.establishment_id}`,
          kind: "panel",
          name: c.establishment_name ?? "",
          detail: es.restaurantPanel.label,
          href: `/espacios/${c.space_slug ?? slug}/restaurantes/${c.establishment_id}`,
        },
      ];
    }
    return [];
  });

  if (isClientRole(role)) {
    establishments = (contextos ?? [])
      .filter((c) => c.kind === "establishment" && c.establishment_id !== null)
      .map((c) => ({
        id: c.establishment_id as string,
        name: c.establishment_name ?? "",
        spaceSlug: c.space_slug ?? slug,
      }));
    establishmentName =
      establishments.find((e) => e.id === establishmentId)?.name ?? null;
  }

  const notifications: ShellNotification[] = (rows ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type as EventKey,
    deepLink: row.deep_link,
    readAt: row.read_at,
  }));

  // Un restaurante no es miembro del espacio y no puede leer `spaces`
  // (`spaces_select`), así que llegar aquí sin espacio es lo normal para
  // él y no un 404. Para el equipo sí lo es: si no lee su propio espacio,
  // el slug no existe o no es suyo.
  if (!space && isStaffRole(role)) notFound();

  // A06 · quien no lee el espacio, no tiene sesión de soporte en él y no
  // tiene ningún restaurante en ningún panel no tiene nada que ver aquí:
  // "Ya no tienes acceso a este espacio", en vez de un armazón vacío. La
  // pantalla es la misma exista el espacio o no —no lo puede leer—, así
  // que no le cuenta a nadie qué espacios existen.
  if (!space && !supportSession && isClientRole(role) && establishments.length === 0) {
    return <AccessRemoved />;
  }

  return (
    <AppShell
      spaceSlug={slug}
      spaceName={space?.name ?? slug}
      role={role}
      roleLabel={es.roles[role]}
      userInitial={userInitial}
      userAvatarUrl={userAvatarUrl}
      userLabel={userLabel}
      notifications={notifications}
      onSearch={searchEverything}
      establishmentId={establishmentId}
      establishmentName={establishmentName}
      establishments={establishments}
      contexts={contexts}
      supportSession={
        supportSession
          ? {
              id: supportSession.id,
              accessLevel: supportSession.access_level,
              reason: supportSession.reason,
              expiresAt: supportSession.expires_at,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
