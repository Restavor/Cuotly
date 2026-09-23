import Link from "next/link";

import { Button, Card, ErrorState, PageHeader, Tabs } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { signOut } from "../../(auth)/actions";

import { AvatarForm } from "./AvatarForm";
import { NotificationPreferences, type PreferenceRow } from "./NotificationPreferences";
import { ProfileForm } from "./ProfileForm";

export type AccountSection = "perfil" | "seguridad" | "notificaciones";

const t = es.globalContext.account;

/**
 * G05 · lo que se pinta de Mi cuenta, con los datos ya leídos. La carga y
 * el porqué de cada pestaña están en `page.tsx`.
 */
export function AccountView({
  section,
  profile,
  timezones,
  avatar,
  preferences,
}: {
  section: AccountSection;
  profile: { givenName: string; familyName: string; email: string; phone: string; timezone: string };
  timezones: readonly string[];
  avatar: { url: string | null; initial: string; personName: string };
  /** `null` si no se han podido leer: se dice, no se enseña todo encendido. */
  preferences: readonly PreferenceRow[] | null;
}) {
  const seguridad = (
    <Card className="h-full">
      <CardHead icon="lock" title={t.securityTitle} subtitle={t.securitySubtitle} />
      <ul className="space-y-3">
        <FilaEnlace href="/cuenta/seguridad" label={t.twoFactorLink} />
        <FilaEnlace href="/cuenta/sesiones" label={t.sessionsLink} />
        {section === "seguridad" ? <FilaEnlace href="/cuenta/cerrar" label={t.closeLink} /> : null}
      </ul>
      <p className="mt-4 flex items-start gap-3 rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
        {t.rolesNote}
      </p>
      {/*
        Salir de Cuotly vive aquí desde el 20/09/2026: el menú del contexto
        global son los cinco destinos de G01, y cerrar la sesión es de la
        cuenta, como las sesiones abiertas.
      */}
      <form action={signOut} className="mt-4 border-t border-border pt-4">
        <Button type="submit" variant="secondary">
          {es.home.signOut}
        </Button>
      </form>
    </Card>
  );

  const avisos = (compacto: boolean) => (
    <Card className="h-full">
      <CardHead icon="bell" title={t.notificationsTitle} subtitle={t.notificationsSubtitle} />
      {preferences === null ? (
        <ErrorState title={t.notificationsFailed} description={t.notificationsFailedReason} />
      ) : (
        <>
          {compacto ? null : <p className="mb-3 text-sm text-text-secondary">{t.notificationsBody}</p>}
          <NotificationPreferences rows={preferences} compact={compacto} />
          {compacto ? (
            <Link
              href="/cuenta?seccion=notificaciones"
              className="mt-3 inline-block text-sm font-semibold text-cuotly-green underline"
            >
              {t.notificationsAll}
            </Link>
          ) : null}
        </>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <Tabs
        label={t.tabsLabel}
        active={section}
        tabs={[
          { key: "perfil", label: t.tabs.profile, href: "/cuenta" },
          { key: "seguridad", label: t.tabs.security, href: "/cuenta?seccion=seguridad" },
          { key: "notificaciones", label: t.tabs.notifications, href: "/cuenta?seccion=notificaciones" },
        ]}
      />

      {section === "perfil" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
          <Card className="h-full">
            <h2 className="mb-3 text-base font-semibold text-primary-dark">{t.personalTitle}</h2>
            <AvatarForm avatarUrl={avatar.url} initial={avatar.initial} personName={avatar.personName} />
            <ProfileForm {...profile} timezones={timezones} />
          </Card>
          {seguridad}
          {avisos(true)}
        </div>
      ) : section === "seguridad" ? (
        <div className="max-w-2xl">{seguridad}</div>
      ) : (
        avisos(false)
      )}
    </div>
  );
}

function CardHead({ icon, title, subtitle }: { icon: IconName; title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 h-6 w-6 shrink-0 text-primary-dark" />
      <div>
        <h2 className="text-base font-semibold text-primary-dark">{title}</h2>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
    </div>
  );
}

function FilaEnlace({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between rounded-[10px] border border-border px-4 py-3 text-sm font-medium text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {label}
        <Icon name="chevronRight" className="h-4 w-4 text-text-secondary" />
      </Link>
    </li>
  );
}
