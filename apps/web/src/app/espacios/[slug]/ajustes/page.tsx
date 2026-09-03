import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  NoPermissionState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { MANDATORY_EVENTS, NOTIFICATION_EVENTS, type NotificationEvent } from "@/core/notifications";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import {
  NotificationPreferencesForm,
  SpaceNameForm,
  TimezoneForm,
  type NotificationPreference,
} from "./SettingsForms";

/**
 * HU-36 · Ajustes del espacio. Es el destino `/ajustes` de §20.2, que
 * llevaba a un 404 desde el Hito 8.
 *
 * §123 enumera once secciones. Esta pantalla trae las que la Fase 1 puede
 * sostener de verdad —identidad del espacio, configuración contractual,
 * horario y calendario, notificaciones, mi cuenta y auditoría— y ENUMERA
 * las que faltan con su motivo, en vez de pintar una lista de enlaces que
 * no llevan a ningún sitio (P6, CA-20).
 *
 * Lo que decide qué se puede tocar es `manage_space`, y no esta pantalla:
 * `set_space_name()` y `set_space_timezone()` lo comprueban, y `spaces`
 * dejó de tener política de UPDATE en la migración 49 para que no haya una
 * segunda puerta sin auditoría.
 */
export const dynamic = "force-dynamic";

/**
 * Las zonas horarias que ofrece el selector. No es una lista escrita a
 * mano: sale de la base de datos ICU del propio Node. El servidor la
 * vuelve a validar contra `pg_timezone_names`, así que enviar una que no
 * exista falla igual.
 */
function zonasHorarias(actual: string): readonly string[] {
  const soportadas =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const todas = new Set<string>([actual, ...soportadas]);
  return [...todas].sort();
}

function dia(instant: string | null): string {
  return instant === null ? "—" : instant.slice(0, 10);
}

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.settings.title}</h1>
        <NoPermissionState
          title={es.settings.noAccessTitle}
          description={es.settings.noAccessReason}
        />
      </div>
    );
  }

  const [{ data: canManageSpace }, { data: calendars }, { data: prefRows }] = await Promise.all([
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_space" }),
    supabase
      .from("space_working_hours")
      .select("calendar_kind, timezone, effective_from")
      .eq("space_id", space.id)
      .order("effective_from", { ascending: false }),
    supabase
      .from("notification_preferences")
      .select("event_type, in_app, email")
      .eq("space_id", space.id)
      .eq("profile_id", user.id),
  ]);

  // La versión vigente de cada calendario es la más reciente: la tabla es
  // un libro de versiones (RN-CLK-10), no una fila que se actualiza.
  const vigentes = new Map<string, { timezone: string; effective_from: string }>();
  for (const fila of calendars ?? []) {
    if (!vigentes.has(fila.calendar_kind)) {
      vigentes.set(fila.calendar_kind, {
        timezone: fila.timezone,
        effective_from: fila.effective_from,
      });
    }
  }

  const guardadas = new Map((prefRows ?? []).map((p) => [p.event_type, p]));
  const obligatorios = new Set<string>(MANDATORY_EVENTS);

  // Sin fila guardada, el aviso llega: son los valores por defecto de la
  // tabla (`in_app` y `email` a true), no una suposición de la pantalla.
  const preferences: readonly NotificationPreference[] = NOTIFICATION_EVENTS.map(
    (event: NotificationEvent) => {
      const guardada = guardadas.get(event);
      return {
        eventType: event,
        inApp: guardada ? guardada.in_app : true,
        email: guardada ? guardada.email : true,
        mandatory: obligatorios.has(event),
      };
    },
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.settings.title}</h1>
        <p className="text-sm text-text-secondary">{es.settings.subtitle}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">
          {es.settings.identityTitle}
        </h2>

        {canManageSpace ? (
          <SpaceNameForm spaceId={space.id} name={space.name} />
        ) : (
          <p className="mb-4 text-sm text-text">
            <span className="font-semibold">{es.settings.nameLabel}:</span> {space.name}
          </p>
        )}

        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold text-text">{es.settings.slugLabel}</dt>
            <dd className="text-text-secondary">
              /espacios/{space.slug} · {es.settings.slugHint}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">{es.settings.brandLabel}</dt>
            <dd className="text-text-secondary">
              {es.settings.brandValue} · {es.settings.brandHint}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text">{es.settings.logoLabel}</dt>
            {/* P6 · un botón que no guardaría nada es peor que decir por qué no está. */}
            <dd className="text-text-secondary">{es.settings.logoPending}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">
          {es.settings.contractTitle}
        </h2>
        <p className="mb-3 text-sm text-text-secondary">{es.settings.contractHint}</p>

        {canManageSpace ? (
          <TimezoneForm
            spaceId={space.id}
            timezone={space.timezone}
            zones={zonasHorarias(space.timezone)}
          />
        ) : (
          <p className="mb-4 text-sm text-text">
            <span className="font-semibold">{es.settings.timezoneLabel}:</span> {space.timezone}
          </p>
        )}

        <h3 className="mt-4 mb-2 text-sm font-semibold text-text">
          {es.settings.fixedRulesTitle}
        </h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
          {es.settings.fixedRules.map((regla) => (
            <li key={regla}>{regla}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">
          {es.settings.calendarTitle}
        </h2>
        <p className="mb-3 text-sm text-text-secondary">{es.settings.calendarHint}</p>

        {vigentes.size === 0 ? (
          <p className="text-sm text-text-secondary">{es.settings.calendarEmpty}</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.settings.calendarKindColumn}</TableHeaderCell>
                <TableHeaderCell>{es.settings.calendarZoneColumn}</TableHeaderCell>
                <TableHeaderCell>{es.settings.calendarSinceColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(["contractual", "menu_diario", "support"] as const).map((kind) => {
                const vigente = vigentes.get(kind);
                if (!vigente) return null;
                return (
                  <TableRow key={kind}>
                    <TableCell>{es.settings.calendarKinds[kind]}</TableCell>
                    <TableCell>{vigente.timezone}</TableCell>
                    <TableCell>{dia(vigente.effective_from)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <p className="mt-3 text-sm">
          <Link href={`/espacios/${slug}/calendario`} className="text-cuotly-green underline">
            {es.settings.calendarLink}
          </Link>
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">
          {es.settings.notificationsTitle}
        </h2>
        <NotificationPreferencesForm spaceId={space.id} preferences={preferences} />
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">{es.settings.auditTitle}</h2>
        <p className="mb-3 text-sm text-text-secondary">{es.settings.auditSubtitle}</p>
        <p className="text-sm">
          <Link href={`/espacios/${slug}/ajustes/auditoria`} className="text-cuotly-green underline">
            {es.settings.auditLink}
          </Link>
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">
          {es.settings.accountTitle}
        </h2>
        <p className="mb-3 text-sm text-text-secondary">{es.settings.accountHint}</p>
        <p className="text-sm">
          <Link href="/cuenta/sesiones" className="text-cuotly-green underline">
            {es.settings.sessionsLink}
          </Link>
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-primary-dark">{es.settings.pendingTitle}</h2>
        <p className="mb-3 text-sm text-text-secondary">{es.settings.pendingHint}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
          {es.settings.pending.map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
