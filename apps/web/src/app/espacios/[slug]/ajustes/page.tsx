import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ButtonLink,
  Card,
  NoPermissionState,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon } from "@/components/ui/Icon";
import { formatMoment, loadSpaceIntegrations, type SpaceIntegrationRow } from "@/components/establishment/integrations-load";
import { ProviderMark } from "@/components/establishment/ProviderMark";
import { todayInTimeZone } from "@/core/finance";
import { INTEGRATION_PROVIDERS, integrationTone, isIntegrationProvider, isIntegrationState } from "@/core/integrations";
import {
  MANDATORY_EVENTS,
  digestHourLabel,
  staffPreferenceEvents,
  type NotificationEvent,
} from "@/core/notifications";
import { contractualWeek, menuDiarioWeek, upcomingHolidays, weeklyHours, type DayWindow } from "@/core/settings-schedule";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { vaultIsConfigured } from "@/services/credential-vault";
import { googleOAuthIsConfigured } from "@/services/google-oauth";
import { ChangePasswordForm } from "@/app/(global)/cuenta/ChangePasswordForm";
import { RevokeSessionButton } from "@/app/(global)/cuenta/sesiones/RevokeSessionButton";
import { SessionTime } from "@/app/(global)/cuenta/sesiones/SessionTime";

import { AddHolidayForm } from "../calendario/CalendarForms";
import { SettingsHeader } from "./SettingsHeader";
import {
  NotificationFrequencyForm,
  NotificationPreferencesForm,
  PaymentTermForm,
  SpaceDetailsForm,
  SpaceLogoForm,
  SpaceNameForm,
  TaxRateForm,
  TimezoneForm,
  type NotificationPreference,
} from "./SettingsForms";
import { parseSettingsTab } from "./tabs";

/**
 * HU-36 · Ajustes del espacio, con las pestañas del diseño (M23, M57,
 * M58, M59, M61 y M63; Suscripción y Auditoría son páginas propias, M60 y
 * M62, y Propiedad y Exportación, M64).
 *
 * Cada pestaña pinta lo que el espacio tiene de verdad. Lo que el dibujo
 * trae y Cuotly no —el horario editable por día, la vista previa "de
 * ejemplo" del IVA, el correo de contacto del espacio, los "últimos
 * accesos"— no se imita: está dicho en `docs/diseno/PLAN-ESCRITORIO.md`.
 *
 * Lo que decide qué se puede tocar es el servidor, no esta pantalla:
 * `set_space_*()` piden `manage_space`, `holidays` pide `manage_holidays`
 * y `spaces` no tiene política de UPDATE desde la migración 49, para que
 * no haya una segunda puerta sin auditoría. Aquí las capacidades se
 * preguntan solo para no pintar formularios condenados a fallar.
 */
export const dynamic = "force-dynamic";

/**
 * Las zonas horarias que ofrece el selector. No es una lista escrita a
 * mano: sale de la base de datos ICU del propio Node. El servidor la
 * vuelve a validar contra `pg_timezone_names`, así que enviar una que no
 * exista falla igual.
 */
function zonasHorarias(actual: string): readonly string[] {
  const soportadas = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set<string>([actual, ...soportadas])].sort();
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const uno = (k: string) => {
    const v = query[k];
    return Array.isArray(v) ? v[0] : v;
  };
  // Una vista desconocida cae en General, no en un hueco.
  const vista = parseSettingsTab(uno("vista"));
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone, payment_term_days, tax_rate_percent, legal_name, tax_id, address, logo_storage_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.settings.title} />
        <NoPermissionState title={es.settings.noAccessTitle} description={es.settings.noAccessReason} />
      </div>
    );
  }

  const { data: canManageSpace } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_space",
  });
  const gestiona = canManageSpace === true;
  const tv = es.settings.view;
  const hoy = todayInTimeZone(new Date(), space.timezone);

  return (
    <div className="space-y-6">
      {/*
        La vista viaja en la dirección y no en un estado del navegador: así
        se comparte el enlace de "los horarios de Restavor", el botón de
        volver deshace el cambio de pestaña, y la pantalla entera sigue
        siendo de servidor (CA-22). Suscripción y Auditoría son enlaces a
        sus páginas, que conservan su dirección: hay avisos emitidos que
        apuntan ahí (RN-NOT-04).
      */}
      <SettingsHeader slug={slug} active={vista.key} />

      {vista.key === "general" ? (
        <GeneralTab
          space={space}
          gestiona={gestiona}
          integraciones={await loadSpaceIntegrations(supabase, space.id).catch(() => null)}
          totalRestaurantes={
            (await supabase.from("establishments").select("id", { count: "exact", head: true }).eq("space_id", space.id))
              .count ?? 0
          }
        />
      ) : null}

      {vista.key === "schedule" ? await ScheduleTab({ supabase, space, gestiona, hoy }) : null}

      {vista.key === "taxes" ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card title={tv.fiscalTitle} subtitle={tv.fiscalHint} className="min-w-0">
            {gestiona ? (
              <SpaceDetailsForm
                spaceId={space.id}
                legalName={space.legal_name}
                taxId={space.tax_id}
                address={space.address}
              />
            ) : (
              <dl className="space-y-2 text-sm">
                {[
                  [es.settings.legalNameLabel, space.legal_name],
                  [es.settings.taxIdLabel, space.tax_id],
                  [es.settings.addressLabel, space.address],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-semibold text-text">{k}</dt>
                    <dd className="text-text-secondary">{v ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-4 border-t border-border pt-4 text-sm">
              <p className="font-semibold text-text">{es.settings.currencyLabel}</p>
              <p className="text-text">{es.settings.currencyValue}</p>
              <p className="text-text-secondary">{es.settings.currencyReason}</p>
            </div>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card title={tv.taxConfigTitle}>
              {gestiona ? (
                <>
                  {/* M58 · RN-FIN-08 congela el tipo dentro de cada cobro
                      ya emitido: cambiarlo aquí solo mira hacia delante. */}
                  <TaxRateForm spaceId={space.id} percent={space.tax_rate_percent} />
                  {/* RN-FIN-01b · el plazo de pago, que el PRD no fija. */}
                  <PaymentTermForm spaceId={space.id} days={space.payment_term_days} />
                </>
              ) : (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="font-semibold text-text">{es.settings.taxRateLabel}</dt>
                    <dd className="text-text">{space.tax_rate_percent} %</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-text">{es.settings.paymentTermLabel}</dt>
                    <dd className="text-text">{space.payment_term_days}</dd>
                  </div>
                  <dd className="text-xs text-text-secondary">{tv.readOnlyValue}</dd>
                </dl>
              )}
              <div className="mt-2 rounded-[10px] bg-soft-surface p-3 text-sm">
                <p className="font-semibold text-text">{tv.pricesShownLabel}</p>
                <p className="text-text">{tv.pricesShownValue}</p>
                <p className="text-xs text-text-secondary">{tv.pricesShownReason}</p>
              </div>
            </Card>

            <Card title={tv.paymentMethodsTitle}>
              <ul className="space-y-2 text-sm text-text">
                {[tv.methodTransfer, tv.methodBizum].map((m) => (
                  <li key={m} className="flex items-center gap-2">
                    <Icon name="tick" className="h-4 w-4 text-cuotly-green" />
                    {m}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-text-secondary">{es.settings.paymentMethodsReason}</p>
            </Card>

            <Card title={es.settings.fixedRulesTitle}>
              <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
                {es.settings.fixedRules.map((regla) => (
                  <li key={regla}>{regla}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : null}

      {vista.key === "integrations" ? (
        <IntegrationsTab
          slug={slug}
          timeZone={space.timezone}
          gestiona={gestiona}
          integraciones={await loadSpaceIntegrations(supabase, space.id).catch((fallo: unknown) => {
            console.error("[ajustes] no se pudieron leer las integraciones", { message: String(fallo) });
            return null;
          })}
          establishments={
            (await supabase.from("establishments").select("id, name").eq("space_id", space.id).order("name")).data ?? []
          }
          fuente={uno("fuente") ?? null}
          estado={uno("estado") ?? null}
          restaurante={uno("restaurante") ?? null}
        />
      ) : null}

      {vista.key === "security" ? await SecurityTab({ supabase }) : null}

      {vista.key === "notifications" ? await NotificationsTab({ supabase, spaceId: space.id, userId: user.id, timeZone: space.timezone }) : null}
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type SpaceRow = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  payment_term_days: number;
  tax_rate_percent: number;
  legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  logo_storage_path: string | null;
};

function horario(d: DayWindow): string {
  return d.ranges.map((r) => `${r.from} – ${r.to}`).join(", ");
}

/* ----------------------------------------------------------------------- */
/* M23 · General                                                            */
/* ----------------------------------------------------------------------- */

function GeneralTab({
  space,
  gestiona,
  integraciones,
  totalRestaurantes,
}: {
  space: SpaceRow;
  gestiona: boolean;
  integraciones: readonly SpaceIntegrationRow[] | null;
  totalRestaurantes: number;
}) {
  const tv = es.settings.view;
  const base = `/espacios/${space.slug}`;
  const semana = contractualWeek();
  const conectadas = (provider: string) =>
    new Set((integraciones ?? []).filter((i) => i.provider === provider && i.status === "connected").map((i) => i.establishmentId))
      .size;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-3">
      <Card title={tv.generalTitle} className="min-w-0">
        {gestiona ? (
          <SpaceNameForm spaceId={space.id} name={space.name} />
        ) : (
          <p className="mb-4 text-sm text-text">
            <span className="font-semibold">{es.settings.nameLabel}:</span> {space.name}
          </p>
        )}
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold text-text">{tv.languageLabel}</p>
            <p className="text-text">{tv.languageValue}</p>
            <p className="text-xs text-text-secondary">{tv.languageReason}</p>
          </div>
          <div>
            <p className="font-semibold text-text">{tv.timezoneLabel}</p>
            <p className="text-text">{space.timezone}</p>
            <p className="text-xs text-text-secondary">
              <Link href={`${base}/ajustes?vista=horarios`} className="text-cuotly-green underline">
                {tv.timezoneChangeIn}
              </Link>
            </p>
          </div>
          <div>
            <p className="font-semibold text-text">{es.settings.slugLabel}</p>
            <p className="text-text-secondary">
              /espacios/{space.slug} · {es.settings.slugHint}
            </p>
          </div>
          <div>
            <p className="font-semibold text-text">{es.settings.brandLabel}</p>
            <p className="text-text-secondary">
              {es.settings.brandValue} · {es.settings.brandHint}
            </p>
          </div>
        </div>
        {gestiona ? (
          <>
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-sm font-semibold text-text">{tv.logoTitle}</p>
              <SpaceLogoForm spaceId={space.id} hasLogo={space.logo_storage_path !== null} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <ButtonLink href={`${base}/ajustes/propiedad`} variant="secondary" size="sm" icon="person">
                {tv.ownershipAction}
              </ButtonLink>
              <ButtonLink href={`${base}/ajustes/propiedad#archivar`} variant="secondary" size="sm" icon="lock">
                {tv.archiveAction}
              </ButtonLink>
            </div>
          </>
        ) : null}
      </Card>

      <div className="min-w-0 space-y-4">
        <Card title={tv.scheduleSummaryTitle} subtitle={tv.scheduleSummaryHint}>
          <dl className="divide-y divide-border text-sm">
            {semana.map((d) => (
              <div key={d.day} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-text">{tv.weekdays[d.day - 1]}</dt>
                <dd className="text-text-secondary">{d.ranges.length === 0 ? tv.closed : horario(d)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex justify-end">
            <ButtonLink href={`${base}/ajustes?vista=horarios`} variant="outline" size="sm">
              {tv.seeSchedule}
            </ButtonLink>
          </div>
        </Card>
        <Card title={tv.taxesSummaryTitle}>
          <p className="text-lg font-bold text-primary-dark">{tv.taxesSummaryValue(space.tax_rate_percent)}</p>
          <p className="text-xs text-text-secondary">{tv.taxesSummaryHint}</p>
          <p className="mt-2 text-sm">
            <Link href={`${base}/ajustes?vista=impuestos`} className="text-cuotly-green underline">
              {tv.seeTaxes}
            </Link>
          </p>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card title={tv.integrationsSummaryTitle} subtitle={tv.integrationsSummaryHint}>
          {integraciones === null ? (
            <p className="text-sm text-danger">{tv.integrationsFailed}</p>
          ) : (
            <ul className="divide-y divide-border">
              {INTEGRATION_PROVIDERS.map((p) => (
                <li key={p} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-text">
                    <ProviderMark provider={p} size="sm" />
                    {es.integrations.providers[p].name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-text">
                    {tv.integrationsCount(conectadas(p), totalRestaurantes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex justify-end">
            <ButtonLink href={`${base}/ajustes?vista=integraciones`} variant="outline" size="sm">
              {tv.configure}
            </ButtonLink>
          </div>
        </Card>
        {gestiona ? (
          <Card title={es.settings.spaceSectionsTitle}>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href={`${base}/puesta-en-marcha`} className="font-medium text-primary underline">
                  {es.settings.onboardingLink}
                </Link>
                <p className="text-text-secondary">{es.settings.onboardingHint}</p>
              </li>
              <li>
                <Link href={`${base}/ajustes/propiedad`} className="font-medium text-primary underline">
                  {es.settings.ownershipLink}
                </Link>
                <p className="text-text-secondary">{es.settings.ownershipHint}</p>
              </li>
              <li>
                <Link href={`${base}/ajustes/exportacion`} className="font-medium text-primary underline">
                  {es.settings.exportLink}
                </Link>
                <p className="text-text-secondary">{es.settings.exportHint}</p>
              </li>
            </ul>
          </Card>
        ) : null}
        <Card title={es.settings.pendingTitle}>
          <p className="mb-2 text-sm text-text-secondary">{es.settings.pendingHint}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
            {es.settings.pending.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M57 · Horarios                                                           */
/* ----------------------------------------------------------------------- */

function WeekTable({ title, hint, week }: { title: string; hint: string; week: readonly DayWindow[] }) {
  const tv = es.settings.view;
  return (
    <Card title={title} subtitle={hint} className="min-w-0">
      <div className="relative overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>{tv.dayColumn}</TableHeaderCell>
              <TableHeaderCell>{tv.hoursColumn}</TableHeaderCell>
              <TableHeaderCell>{tv.stateColumn}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {week.map((d) => (
              <TableRow key={d.day}>
                <TableCell>{tv.weekdays[d.day - 1]}</TableCell>
                <TableCell>
                  <span className="whitespace-nowrap text-sm text-text-secondary">
                    {d.ranges.length === 0 ? "—" : horario(d)}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={d.ranges.length === 0 ? "danger" : "success"}>
                    {d.ranges.length === 0 ? tv.closed : tv.open}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        {tv.weeklyTotal(String(weeklyHours(week)).replace(".", ","))}
      </p>
    </Card>
  );
}

async function ScheduleTab({
  supabase,
  space,
  gestiona,
  hoy,
}: {
  supabase: Supabase;
  space: SpaceRow;
  gestiona: boolean;
  hoy: string;
}) {
  const tv = es.settings.view;
  const [{ data: calendars }, holidays, { data: puedeFestivos }] = await Promise.all([
    supabase
      .from("space_working_hours")
      .select("calendar_kind, timezone, effective_from")
      .eq("space_id", space.id)
      .order("effective_from", { ascending: false }),
    supabase.from("holidays").select("id, holiday_date, name").eq("space_id", space.id).gte("holiday_date", hoy),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_holidays" }),
  ]);

  // La versión vigente de cada calendario es la más reciente: la tabla es
  // un libro de versiones (RN-CLK-10), no una fila que se actualiza.
  const vigentes = new Map<string, { timezone: string; effective_from: string }>();
  for (const fila of calendars ?? []) {
    if (!vigentes.has(fila.calendar_kind)) vigentes.set(fila.calendar_kind, fila);
  }
  const festivos =
    holidays.error === null
      ? upcomingHolidays(
          (holidays.data ?? []).map((h) => ({ id: h.id, date: h.holiday_date, name: h.name })),
          hoy,
        )
      : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Card title={tv.timezoneTitle} subtitle={tv.timezoneShownIn}>
          {gestiona ? (
            <TimezoneForm spaceId={space.id} timezone={space.timezone} zones={zonasHorarias(space.timezone)} />
          ) : (
            <p className="text-sm text-text">{space.timezone}</p>
          )}
        </Card>
        <WeekTable title={tv.contractualTitle} hint={tv.contractualHint} week={contractualWeek()} />
        <WeekTable title={tv.menuTitle} hint={tv.menuHint} week={menuDiarioWeek()} />
      </div>

      <div className="min-w-0 space-y-4">
        <Card title={tv.holidaysTitle} subtitle={tv.holidaysHint}>
          {festivos === null ? (
            <EmptyReason reason="error" title={tv.holidaysFailed} />
          ) : festivos.length === 0 ? (
            <p className="text-sm text-text-secondary">{tv.holidaysEmpty}</p>
          ) : (
            <div className="relative overflow-x-auto" data-testid="ajustes-festivos">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{tv.holidayDate}</TableHeaderCell>
                    <TableHeaderCell>{tv.holidayName}</TableHeaderCell>
                    <TableHeaderCell>{tv.hoursColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {festivos.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <span className="whitespace-nowrap text-sm">
                          {enZona(h.date, "UTC", { dateStyle: "short" })}
                        </span>
                      </TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>
                        <StatusBadge tone="danger">{tv.holidayClosed}</StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4 border-t border-border pt-4">
            {puedeFestivos === true ? (
              <>
                <p className="mb-2 text-sm font-semibold text-text">{tv.addHolidayTitle}</p>
                <AddHolidayForm spaceId={space.id} defaultDay={hoy} />
              </>
            ) : (
              <p className="text-sm text-text-secondary">{tv.holidaysReadOnly}</p>
            )}
          </div>
        </Card>

        <div role="note" className="flex items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm text-text">
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <span>{tv.supportNote}</span>
        </div>

        <Card title={tv.versionsTitle}>
          {vigentes.size === 0 ? (
            <p className="text-sm text-text-secondary">{es.settings.calendarEmpty}</p>
          ) : (
            <dl className="divide-y divide-border text-sm">
              {(["contractual", "menu_diario", "support"] as const).map((kind) => {
                const v = vigentes.get(kind);
                if (!v) return null;
                return (
                  <div key={kind} className="py-2">
                    <dt className="font-semibold text-text">{es.settings.calendarKinds[kind]}</dt>
                    <dd className="text-text-secondary">
                      {v.timezone} · {es.settings.calendarSinceColumn}{" "}
                      {enZona(v.effective_from, space.timezone, { dateStyle: "short" })}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          <p className="mt-3 text-sm">
            <Link href={`/espacios/${space.slug}/calendario`} className="text-cuotly-green underline">
              {es.settings.calendarLink}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M59 · Integraciones                                                      */
/* ----------------------------------------------------------------------- */

function IntegrationsTab({
  slug,
  timeZone,
  gestiona,
  integraciones,
  establishments,
  fuente,
  estado,
  restaurante,
}: {
  slug: string;
  timeZone: string;
  gestiona: boolean;
  integraciones: readonly SpaceIntegrationRow[] | null;
  establishments: readonly { id: string; name: string }[];
  fuente: string | null;
  estado: string | null;
  restaurante: string | null;
}) {
  const tv = es.settings.view;
  const base = `/espacios/${slug}/ajustes`;
  const proveedores = fuente !== null && isIntegrationProvider(fuente) ? [fuente] : [...INTEGRATION_PROVIDERS];
  const porCelda = new Map((integraciones ?? []).map((i) => [`${i.establishmentId}:${i.provider}`, i]));

  // "Estado" filtra restaurantes: se quedan los que tienen alguna fuente
  // (de las mostradas) en ese estado; "sin conectar" es no tener fila.
  const filas = establishments.filter((e) => {
    if (estado === null) return true;
    return proveedores.some((p) => {
      const celda = porCelda.get(`${e.id}:${p}`);
      return estado === "none" ? celda === undefined : celda?.status === estado;
    });
  });
  const elegido = establishments.find((e) => e.id === restaurante) ?? establishments[0] ?? null;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={tv.sourcesTitle} subtitle={tv.sourcesHint} className="min-w-0">
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="vista" value="integraciones" />
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            {tv.filterSource}
            <select
              name="fuente"
              defaultValue={fuente ?? ""}
              className="min-w-44 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-normal"
            >
              <option value="">{tv.filterAllSources}</option>
              {INTEGRATION_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {es.integrations.providers[p].name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-text">
            {tv.filterState}
            <select
              name="estado"
              defaultValue={estado ?? ""}
              className="min-w-44 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-normal"
            >
              <option value="">{tv.filterAllStates}</option>
              {(Object.keys(es.integrations.states) as (keyof typeof es.integrations.states)[]).map((s) => (
                <option key={s} value={s}>
                  {es.integrations.states[s]}
                </option>
              ))}
              <option value="none">{tv.filterNotConnected}</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-soft-surface"
          >
            {tv.filterSubmit}
          </button>
        </form>

        {integraciones === null ? (
          <EmptyReason reason="error" title={es.emptyReasons.error} />
        ) : establishments.length === 0 ? (
          <p className="text-sm text-text-secondary">{tv.noRestaurants}</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-text-secondary">{tv.noMatches}</p>
        ) : (
          <div className="relative overflow-x-auto" data-testid="ajustes-integraciones">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{tv.restaurantColumn}</TableHeaderCell>
                  {proveedores.map((p) => (
                    <TableHeaderCell key={p}>{es.integrations.providers[p].name}</TableHeaderCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link
                        href={`${base}?vista=integraciones&restaurante=${e.id}`}
                        className="whitespace-nowrap text-sm font-semibold text-text hover:text-cuotly-green"
                      >
                        {e.name}
                      </Link>
                    </TableCell>
                    {proveedores.map((p) => {
                      const celda = porCelda.get(`${e.id}:${p}`);
                      return (
                        <TableCell key={p}>
                          {celda && isIntegrationState(celda.status) ? (
                            <StatusBadge tone={integrationTone(celda.status)} wrap>
                              {es.integrations.states[celda.status]}
                            </StatusBadge>
                          ) : (
                            <span className="whitespace-nowrap text-sm text-text-secondary">{tv.notConnected}</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <div className="min-w-0 space-y-4">
        <Card title={tv.restaurantTitle} subtitle={tv.restaurantHint}>
          {elegido === null ? (
            <p className="text-sm text-text-secondary">{tv.noRestaurants}</p>
          ) : (
            <>
              <form method="get" className="mb-3 flex items-end gap-2">
                <input type="hidden" name="vista" value="integraciones" />
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold text-text">
                  {tv.restaurantLabel}
                  <select
                    name="restaurante"
                    defaultValue={elegido.id}
                    className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm font-normal"
                  >
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-soft-surface"
                >
                  {tv.restaurantSubmit}
                </button>
              </form>
              <ul className="divide-y divide-border" data-testid="ajustes-fuentes-restaurante">
                {INTEGRATION_PROVIDERS.map((p) => {
                  const celda = porCelda.get(`${elegido.id}:${p}`);
                  return (
                    <li key={p} className="flex items-start justify-between gap-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-text">
                        <ProviderMark provider={p} size="sm" />
                        <span className="min-w-0">
                          {es.integrations.providers[p].name}
                          {celda?.lastSyncAt ? (
                            <span className="block text-xs text-text-secondary">
                              {tv.lastSync}: {formatMoment(celda.lastSyncAt, timeZone)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      {celda && isIntegrationState(celda.status) ? (
                        <StatusBadge tone={integrationTone(celda.status)} wrap>
                          {es.integrations.states[celda.status]}
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-text-secondary">{tv.notConnected}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3">
                <ButtonLink
                  href={`/espacios/${slug}/restaurantes/${elegido.id}?vista=gestion&bloque=integraciones`}
                  className="w-full"
                >
                  {tv.openRestaurant}
                </ButtonLink>
              </div>
            </>
          )}
        </Card>

        <Card title={tv.permissionsTitle} subtitle={es.integrations.settingsHint}>
          {gestiona ? (
            <div className="space-y-1 text-sm">
              <p className={vaultIsConfigured() ? "text-text" : "text-danger"}>
                {vaultIsConfigured() ? es.integrations.settingsVaultOk : es.integrations.settingsVaultMissing}
              </p>
              <p className={googleOAuthIsConfigured() ? "text-text" : "text-danger"}>
                {googleOAuthIsConfigured() ? es.integrations.settingsOAuthOk : es.integrations.settingsOAuthMissing}
              </p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M61 · Seguridad                                                          */
/* ----------------------------------------------------------------------- */

async function SecurityTab({ supabase }: { supabase: Supabase }) {
  const tv = es.settings.view;
  const [aal, sessions] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("my_active_sessions"),
  ]);
  // `nextLevel` es aal2 cuando la cuenta tiene un segundo factor verificado.
  const dosPasos = aal.error ? null : aal.data.nextLevel === "aal2";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <Card title={tv.twoFactorTitle}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  dosPasos ? "bg-success text-surface" : "bg-soft-surface text-text-secondary"
                }`}
              >
                <Icon name={dosPasos ? "check" : "lock"} className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-text">
                  {dosPasos === null ? tv.twoFactorUnknown : dosPasos ? tv.twoFactorOn : tv.twoFactorOff}
                </span>
                <span className="block text-xs text-text-secondary">
                  {dosPasos ? tv.twoFactorOnHint : tv.twoFactorOffHint}
                </span>
              </span>
            </div>
            <ButtonLink href="/cuenta/seguridad">{tv.configureTwoFactor}</ButtonLink>
          </div>
        </Card>

        <Card title={tv.passwordTitle} subtitle={tv.passwordHint}>
          <ChangePasswordForm />
        </Card>

        <Card title={tv.sessionsTitle} subtitle={tv.sessionsHint}>
          {sessions.error ? (
            <EmptyReason reason="error" title={tv.sessionsFailed} />
          ) : (
            <ul className="divide-y divide-border rounded-[10px] border border-border" data-testid="ajustes-sesiones">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text [overflow-wrap:anywhere]">
                      {s.user_agent ?? es.sessions.unknownDevice}
                    </span>
                    <span className="block text-xs text-text-secondary">
                      {s.ip ?? "—"} · <SessionTime value={s.refreshed_at ?? s.created_at} />
                    </span>
                  </span>
                  {s.is_current ? (
                    <StatusBadge tone="success">{es.sessions.current}</StatusBadge>
                  ) : (
                    <RevokeSessionButton sessionId={s.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <div role="note" className="flex items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm text-text">
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <span>{tv.accountNote}</span>
        </div>
        <div role="note" className="flex items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm text-text">
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <span>{tv.teamNote}</span>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* M63 · Notificaciones                                                     */
/* ----------------------------------------------------------------------- */

async function NotificationsTab({
  supabase,
  spaceId,
  userId,
  timeZone,
}: {
  supabase: Supabase;
  spaceId: string;
  userId: string;
  timeZone: string;
}) {
  const tv = es.settings.view;
  const [{ data: prefRows }, { data: frecuencia }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("event_type, in_app, email")
      .eq("space_id", spaceId)
      .eq("profile_id", userId),
    /*
      RN-NOT-06 · la frecuencia de esta persona en este espacio. Se PREGUNTA
      al servidor en vez de leer la tabla: `my_notification_frequency()` es
      la que sabe que "sin fila" significa "al momento".
    */
    supabase.rpc("my_notification_frequency", { p_space_id: spaceId }),
  ]);

  const guardadas = new Map((prefRows ?? []).map((p) => [p.event_type, p]));
  const obligatorios = new Set<string>(MANDATORY_EVENTS);
  // Sin fila guardada, el aviso llega: son los valores por defecto de la
  // tabla (`in_app` y `email` a true). Solo los eventos que alguien del
  // equipo puede recibir.
  const preferences: readonly NotificationPreference[] = staffPreferenceEvents().map((event: NotificationEvent) => {
    const guardada = guardadas.get(event);
    return {
      eventType: event,
      inApp: guardada ? guardada.in_app : true,
      email: guardada ? guardada.email : true,
      mandatory: obligatorios.has(event),
    };
  });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={es.settings.notificationsTitle} className="min-w-0">
        <NotificationPreferencesForm spaceId={spaceId} preferences={preferences} />
      </Card>
      {/*
        RN-NOT-06 · CUÁNDO llegan, en su propia tarjeta. La de al lado dice
        QUÉ avisos quieres; esta, si salen al momento o en un resumen.
      */}
      <Card title={tv.whenTitle} className="min-w-0">
        <p className="mb-3 text-xs text-text-secondary">{tv.whenTimezone(timeZone)}</p>
        <NotificationFrequencyForm
          spaceId={spaceId}
          frequency={frecuencia ?? "instant"}
          digestHour={digestHourLabel()}
          timeZone={timeZone}
        />
      </Card>
    </div>
  );
}
