import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, ErrorState } from "@/components/ui";
import { MANDATORY_EVENTS, NOTIFICATION_EVENTS } from "@/core/notifications";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myNotificationPreferences } from "@/services/global-gateway";

import { NotificationPreferences, type PreferenceRow } from "./NotificationPreferences";
import { ProfileForm } from "./ProfileForm";

/**
 * G05 · Mi cuenta (RN-GLO-06): es de la **persona**, no del espacio.
 *
 * Tres bloques: el perfil, la seguridad —que ya existía y aquí solo se
 * reúne— y los avisos, que valen en todos los contextos de esta persona y
 * también en el que entre mañana.
 *
 * La foto de G05 no está, y se dice por qué en vez de dejar un hueco: el
 * almacenamiento de archivos de Cuotly es por espacio (`files.space_id NOT
 * NULL`) y una foto de perfil no es de ningún espacio.
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: perfil, error }, preferencias] = await Promise.all([
    supabase
      .from("profiles")
      .select("given_name, family_name, full_name, email, phone, display_timezone")
      .eq("id", user.id)
      .maybeSingle(),
    myNotificationPreferences(supabase).catch(() => null),
  ]);

  const t = es.globalContext.account;

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
      mandatory:
        guardada?.mandatory ?? (MANDATORY_EVENTS as readonly string[]).includes(evento),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card title={t.profileTitle}>
        <ProfileForm
          givenName={perfil?.given_name ?? perfil?.full_name ?? ""}
          familyName={perfil?.family_name ?? ""}
          email={perfil?.email ?? user.email ?? ""}
          phone={perfil?.phone ?? ""}
          timezone={perfil?.display_timezone ?? ""}
        />
      </Card>

      <Card title={t.photoTitle}>
        <p className="text-sm text-text-secondary">{t.photoReason}</p>
      </Card>

      <Card title={t.securityTitle}>
        <p className="mb-3 text-sm text-text-secondary">{t.securityBody}</p>
        <ul className="space-y-1.5 text-sm">
          <li>
            <Link href="/cuenta/seguridad" className="font-semibold text-cuotly-green underline">
              {t.securityLink}
            </Link>
          </li>
          <li>
            <Link href="/cuenta/sesiones" className="font-semibold text-cuotly-green underline">
              {t.sessionsLink}
            </Link>
          </li>
          <li>
            <Link href="/cuenta/verificar" className="font-semibold text-cuotly-green underline">
              {t.verifyLink}
            </Link>
          </li>
          <li>
            <Link href="/cuenta/cerrar" className="font-semibold text-cuotly-green underline">
              {t.closeLink}
            </Link>
          </li>
        </ul>
      </Card>

      <Card title={t.notificationsTitle}>
        {preferencias === null ? (
          <ErrorState title={t.notificationsFailed} description={t.notificationsFailedReason} />
        ) : (
          <NotificationPreferences rows={filas} />
        )}
      </Card>
    </div>
  );
}
