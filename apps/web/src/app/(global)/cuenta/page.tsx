import { redirect } from "next/navigation";

import { ErrorState } from "@/components/ui";
import { MANDATORY_EVENTS, NOTIFICATION_EVENTS } from "@/core/notifications";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { avatarInitial, avatarLink } from "@/services/avatar-storage";
import { myNotificationPreferences } from "@/services/global-gateway";

import { AccountView, type AccountSection } from "./AccountView";
import type { PreferenceRow } from "./NotificationPreferences";

/**
 * G05 · Mi cuenta (RN-GLO-06): es de la **persona**, no del espacio.
 *
 * Tres pestañas, como el dibujo, y cada una es una dirección
 * (`?seccion=`). **Perfil** es la vista del dibujo: los datos personales,
 * la tarjeta de seguridad y las preferencias de aviso en fila. **Seguridad**
 * y **Notificaciones** abren cada una su tarjeta a lo ancho; la segunda con
 * el tercer canal, el móvil, que la de Perfil no enseña.
 *
 * Lo que el dibujo pone y aquí NO está: "Cambiar contraseña" (la aplicación
 * no tiene esa operación) y el idioma (hoy hay uno y un selector de un
 * elemento es un adorno, RN-GLO-06). Lo que está aunque el dibujo no lo
 * pinte: cerrar sesión, que vive aquí desde el 20/09/2026 porque el menú de
 * G01 son cinco destinos sin un sexto, y cerrar la cuenta.
 *
 * La foto llegó el 19/09/2026 (RN-GLO-09, migración 109) con su propio
 * sitio: no cabía en `files` porque una cara no es de ningún espacio.
 */
export const dynamic = "force-dynamic";

const SECCIONES: readonly AccountSection[] = ["perfil", "seguridad", "notificaciones"];

function leerSeccion(valor: string | string[] | undefined): AccountSection {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return SECCIONES.includes(v as AccountSection) ? (v as AccountSection) : "perfil";
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const seccion = leerSeccion((await searchParams).seccion);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil, error }, preferencias] = await Promise.all([
    supabase
      .from("profiles")
      .select("given_name, family_name, full_name, email, phone, display_timezone, avatar_path")
      .eq("id", user.id)
      .maybeSingle(),
    myNotificationPreferences(supabase).catch(() => null),
  ]);

  if (error) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />;
  }

  // El catálogo de eventos lo pone `src/core/notifications.ts`, no la base:
  // la función solo devuelve lo que esta persona ha tocado alguna vez, y lo
  // que falta vale "todo encendido". Así no hay una tercera copia de la
  // lista de eventos (ver el comentario de `my_notification_preferences()`).
  const guardadas = new Map((preferencias ?? []).map((p) => [p.event_type, p]));
  const filas: readonly PreferenceRow[] = NOTIFICATION_EVENTS.map((evento) => {
    const guardada = guardadas.get(evento);
    return {
      event: evento,
      label: es.notifications.events[evento] ?? evento,
      inApp: guardada?.in_app ?? true,
      email: guardada?.email ?? true,
      push: guardada?.push ?? true,
      // RN-NOT-03 · para una fila que esta persona no ha tocado nunca —y que
      // por eso no viene de la base— la lista obligatoria es la de
      // `src/core/notifications.ts`. El servidor la vuelve a comprobar.
      mandatory: guardada?.mandatory ?? (MANDATORY_EVENTS as readonly string[]).includes(evento),
    };
  });

  // Las zonas que conoce el motor del servidor: el navegador puede traer
  // otra lista, y `set_my_profile()` vuelve a comprobarla contra PostgreSQL.
  const zonas = Intl.supportedValuesOf("timeZone");
  const zonaActual = perfil?.display_timezone ?? "";
  const opcionesZona = zonaActual !== "" && !zonas.includes(zonaActual) ? [zonaActual, ...zonas] : zonas;

  return (
    <AccountView
      section={seccion}
      profile={{
        givenName: perfil?.given_name ?? perfil?.full_name ?? "",
        familyName: perfil?.family_name ?? "",
        email: perfil?.email ?? user.email ?? "",
        phone: perfil?.phone ?? "",
        timezone: zonaActual,
      }}
      timezones={opcionesZona}
      avatar={{
        // El enlace se firma aquí, en el servidor, y dura lo que dura: el
        // bucket es privado y no hay URL pública de ninguna cara
        // (RN-GLO-09). Si el almacenamiento no contesta, `avatarLink`
        // devuelve `null` y se enseña la inicial.
        url: await avatarLink(supabase.storage, perfil?.avatar_path ?? null),
        initial: avatarInitial(perfil?.full_name ?? null, perfil?.email ?? ""),
        personName: perfil?.full_name ?? perfil?.email ?? "",
      }}
      preferences={preferencias === null ? null : filas}
    />
  );
}
