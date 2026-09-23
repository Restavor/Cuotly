import {
  ButtonLink,
  Card,
  EmptyState,
  EntityCell,
  FilterBar,
  FilterSearch,
  FilterSelect,
  PageHeader,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { CUOTLY_PLAN_TERMS } from "@/core/cuotly-subscription";
import {
  approvedDetail,
  filterMyRequests,
  myRequestAction,
  myRequestDate,
  type MyRequestAction,
  type MyRequestFilters,
} from "@/core/my-space-requests";
import { SPACE_REQUEST_STATES, isCuotlyPlan, type SpaceRequestState } from "@/core/space-requests";
import { CUOTLY_TIMEZONE, enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { requestTone } from "../../administracion/solicitudes/request-tone";

const t = es.globalContext.requests;

export type MyRequestRow = {
  readonly id: string;
  readonly business_name: string;
  readonly contact_name: string;
  readonly tax_name: string | null;
  readonly plan: string;
  readonly status: string;
  readonly status_reason: string | null;
  readonly submitted_at: string | null;
  readonly created_at: string;
  /** El espacio que creó al aprobarse, si quien mira lo puede leer. */
  readonly space: { readonly slug: string; readonly cuotly_status: string | null } | null;
};

function destino(action: MyRequestAction, row: MyRequestRow): string {
  if (action === "payment" && row.space) return `/espacios/${row.space.slug}/ajustes/suscripcion`;
  if (action === "enter" && row.space) return `/espacios/${row.space.slug}`;
  return `/solicitar-espacio?solicitud=${row.id}`;
}

/**
 * G04 · la tabla de Mis solicitudes con su barra de filtros, la franja de la
 * que espera información y la nota de que las de trabajo viven en cada
 * espacio o panel (RN-GLO-04). Recibe las filas ya leídas.
 */
export function MyRequestsView({ rows, filters }: { rows: readonly MyRequestRow[]; filters: MyRequestFilters }) {
  const filtradas = filterMyRequests(rows, filters);
  const esperando = rows.find((r) => r.status === "needs_information") ?? null;
  const hayFiltros = filters.q !== null || filters.state !== null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        actions={
          <ButtonLink href="/solicitar-espacio?nueva=1" icon="plus">
            {t.newRequest}
          </ButtonLink>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        </Card>
      ) : (
        <>
          <FilterBar action="/mis-solicitudes" hasFilters={hayFiltros}>
            <FilterSearch id="buscar-solicitud" name="q" defaultValue={filters.q ?? ""} placeholder={t.searchPlaceholder} />
            <FilterSelect
              id="filtro-estado"
              name="estado"
              label={t.filterState}
              allLabel={t.filterStateAll}
              defaultValue={filters.state}
              options={SPACE_REQUEST_STATES.map((e) => ({ value: e, label: es.spaceRequestForm.states[e] }))}
            />
          </FilterBar>

          {filtradas.length === 0 ? (
            <Card>
              <EmptyState title={t.filteredEmptyTitle} description={t.filteredEmptyReason} />
            </Card>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t.space}</TableHeaderCell>
                  <TableHeaderCell>{t.plan}</TableHeaderCell>
                  <TableHeaderCell>{t.date}</TableHeaderCell>
                  <TableHeaderCell>{t.status}</TableHeaderCell>
                  <TableHeaderCell>{t.action}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtradas.map((fila) => {
                  const estado = fila.status as SpaceRequestState;
                  const { action, primary } = myRequestAction(estado, fila.space?.cuotly_status ?? null);
                  const detalle = estado === "approved" ? approvedDetail(fila.space?.cuotly_status ?? null) : null;
                  return (
                    <TableRow key={fila.id} highlight={primary}>
                      <TableCell>
                        <EntityCell
                          media={
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
                              <Icon name="building" className="h-5 w-5" />
                            </span>
                          }
                          title={fila.business_name}
                          subtitle={fila.tax_name ?? undefined}
                        />
                      </TableCell>
                      <TableCell>
                        {isCuotlyPlan(fila.plan) ? (
                          <>
                            <span className="block font-semibold">{es.cuotlySubscription.plans[fila.plan]}</span>
                            <span className="block text-xs text-text-secondary">
                              {t.planPrice(euros(CUOTLY_PLAN_TERMS[fila.plan].priceCents))}
                            </span>
                          </>
                        ) : (
                          fila.plan
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="whitespace-nowrap">
                          {enZona(myRequestDate(fila), CUOTLY_TIMEZONE, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={requestTone(estado)}>
                          {es.spaceRequestForm.states[estado]}
                          {detalle ? ` · ${t.approvedDetail[detalle]}` : ""}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <ButtonLink
                          href={destino(action, fila)}
                          variant={primary ? "primary" : "secondary"}
                          size="sm"
                          className="w-full justify-between!"
                        >
                          {t.actions[action]}
                          <Icon name="chevronRight" className="h-4 w-4" />
                        </ButtonLink>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {esperando ? (
        <Card className="p-4!">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4 lg:w-64">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-warning/25 text-primary-dark">
                <Icon name="building" className="h-8 w-8" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-text">{esperando.business_name}</p>
                {esperando.tax_name ? <p className="text-sm text-text-secondary">{esperando.tax_name}</p> : null}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3 rounded-[10px] border border-danger/20 bg-danger/5 p-4 sm:flex-row sm:items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger text-surface">
                <Icon name="alert" className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-text">{t.infoRequestedTitle}</p>
                {esperando.status_reason ? (
                  <p className="text-sm text-text-secondary">{esperando.status_reason}</p>
                ) : null}
              </div>
              <ButtonLink href={`/solicitar-espacio?solicitud=${esperando.id}`}>
                {t.provideInfo}
                <Icon name="chevronRight" className="h-4 w-4" />
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-4!">
        <p className="flex items-start gap-3 text-sm text-text-secondary">
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
          <span>
            {t.elsewhere} {t.reviewerHidden}
          </span>
        </p>
      </Card>
    </div>
  );
}
