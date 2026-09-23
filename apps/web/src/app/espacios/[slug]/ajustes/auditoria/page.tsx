import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ButtonLink,
  Card,
  EmptyState,
  NoPermissionState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon } from "@/components/ui/Icon";
import { AUDIT_FAMILIES, auditChanges } from "@/core/audit";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { SettingsHeader } from "../SettingsHeader";
import { auditQueryString, loadActorNames, loadAuditRows, readAuditFilters } from "./audit-query";

/**
 * HU-36 · "Como propietario, quiero consultar la auditoría de mi espacio".
 *
 * Lo que se ve aquí NO lo decide esta pantalla: lo decide la política de
 * `audit_log` (§21.2, migración 49). El propietario ve su espacio entero;
 * un administrador, la operativa; un trabajador, sus propias acciones y las
 * filas que ya puede ver; y un cliente no llega —no es miembro del espacio.
 * Por eso no hay aquí ni una comprobación de rol que filtre filas: filtrar
 * en la pantalla lo que el servidor deja pasar sería justo la forma de
 * creerse protegido sin estarlo.
 *
 * Los filtros (familia, periodo, solo lo mío) se aplican en la consulta, no
 * en memoria: la tabla crece para siempre y §20.7 pide paginación en toda
 * lista que pueda crecer.
 */
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;


function cuando(instant: string, timeZone: string): string {
  return enZona(instant, timeZone, { dateStyle: "short", timeStyle: "short" });
}

function nombreDeAccion(action: string): string {
  const nombres = es.settings.auditActions as Readonly<Record<string, string>>;
  // Una acción sin nombre se enseña cruda en vez de esconderse: el barrido
  // de `audit.test.ts` impide que llegue ninguna, y si llegara, verla es
  // mejor que perder la fila.
  return nombres[action] ?? action;
}

function nombreDeEntidad(entityType: string): string {
  const nombres = es.settings.auditEntities as Readonly<Record<string, string>>;
  return nombres[entityType] ?? entityType;
}

/**
 * El enlace al elemento exacto, cuando existe una pantalla que lo enseñe.
 * Solo trabajos y solicitudes tienen ruta propia del lado del equipo; el
 * resto se queda sin enlace en vez de llevar a un 404.
 */
function enlaceDelElemento(
  slug: string,
  entityType: string,
  entityId: string | null,
): string | null {
  if (entityId === null) return null;
  if (entityType === "job") return `/espacios/${slug}/trabajos/${entityId}`;
  if (entityType === "request") return `/espacios/${slug}/solicitudes/${entityId}`;
  return null;
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    familia?: string;
    desde?: string;
    hasta?: string;
    usuario?: string;
    mias?: string;
    pagina?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return (
      <div className="space-y-6">
        <SettingsHeader slug={slug} active="audit" />
        <NoPermissionState title={es.settings.noAccessTitle} description={es.settings.noAccessReason} />
      </div>
    );
  }

  const tm = es.settings.auditM62;
  const filtros = readAuditFilters(query, user.id);
  const paginaActual = Math.max(1, Number.parseInt(query.pagina ?? "1", 10) || 1);

  const [{ rows: filas, count, failed }, { data: miembros }] = await Promise.all([
    loadAuditRows(supabase, space.id, space.timezone, filtros, {
      from: (paginaActual - 1) * POR_PAGINA,
      to: paginaActual * POR_PAGINA - 1,
    }),
    // El desplegable de "Usuario": las personas del espacio.
    supabase
      .from("space_memberships")
      .select("user_id, profiles (full_name, email)")
      .eq("space_id", space.id),
  ]);

  const actorIds = [...new Set(filas.map((f) => f.actor_id).filter(Boolean))] as string[];
  const nombrePersona = await loadActorNames(supabase, actorIds);
  const personas = (miembros ?? [])
    .map((m) => ({ id: m.user_id, name: m.profiles?.full_name?.trim() || m.profiles?.email || m.user_id }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const total = count;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const explicacion =
    membership.role === "owner"
      ? es.settings.auditWhatYouSee.owner
      : membership.role === "admin"
        ? es.settings.auditWhatYouSee.admin
        : es.settings.auditWhatYouSee.worker;

  const base = `/espacios/${slug}/ajustes/auditoria`;
  const enlacePagina = (destino: number) => `${base}?${auditQueryString(filtros, { pagina: String(destino) })}`;
  const campo = "rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-text";

  return (
    <div className="space-y-6">
      <SettingsHeader slug={slug} active="audit" />

      <Card>
        <h2 className="text-base font-semibold text-primary-dark">{tm.registerTitle}</h2>
        <p className="text-sm text-text-secondary">{tm.registerHint}</p>
        {/* §21.2 · quién ve qué se dice en claro, para que nadie crea que
            está viendo el espacio entero cuando está viendo su parte. */}
        <p className="mt-1 text-xs text-text-secondary">{explicacion}</p>

        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-text">{es.settings.auditFilterFrom}</span>
            <input type="date" name="desde" defaultValue={filtros.from ?? ""} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-text">{es.settings.auditFilterTo}</span>
            <input type="date" name="hasta" defaultValue={filtros.to ?? ""} className={campo} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-text">{tm.filterUser}</span>
            <select name="usuario" defaultValue={filtros.actor ?? ""} className={`${campo} min-w-40`}>
              <option value="">{tm.filterAllUsers}</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-text">{es.settings.auditFilterFamily}</span>
            <select name="familia" defaultValue={filtros.family ?? ""} className={`${campo} min-w-40`}>
              <option value="">{tm.filterAllActions}</option>
              {AUDIT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {(es.settings.auditFamilies as Readonly<Record<string, string>>)[f] ?? f}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-[10px] border border-border bg-surface px-4 py-2 text-sm font-semibold text-text hover:bg-soft-surface"
          >
            {es.settings.auditFilterSubmit}
          </button>
          <span className="ml-auto">
            <ButtonLink href={`${base}/exportar?${auditQueryString(filtros)}`} icon="download">
              {tm.exportLabel}
            </ButtonLink>
          </span>
        </form>
      </Card>

      <Card className="p-0! overflow-hidden">
        {failed ? (
          <div className="p-6">
            <EmptyReason reason="error" title={tm.loadFailed} />
          </div>
        ) : filas.length === 0 ? (
          <div className="p-6">
            <EmptyState title={es.settings.auditEmptyTitle} description={es.settings.auditEmptyReason} />
          </div>
        ) : (
          <>
            <div className="relative overflow-x-auto" data-testid="auditoria-registro">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{es.settings.auditWhenColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditActorColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditActionColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditEntityColumn}</TableHeaderCell>
                    <TableHeaderCell>{tm.detailColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filas.map((fila) => {
                    const cambios = auditChanges(fila.old_value, fila.new_value);
                    const enlace = enlaceDelElemento(slug, fila.entity_type, fila.entity_id);
                    const actor =
                      fila.actor_id === null
                        ? // Un apunte sin actor lo escribió un barrido
                          // automático, no una persona (P6).
                          es.settings.auditNoActor
                        : (nombrePersona.get(fila.actor_id) ?? es.settings.auditNoActor);
                    return (
                      <TableRow key={fila.id}>
                        <TableCell>
                          <span className="whitespace-nowrap text-sm">{cuando(fila.created_at, space.timezone)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{actor}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{nombreDeAccion(fila.action)}</span>
                        </TableCell>
                        <TableCell>
                          {enlace === null ? (
                            <span className="text-sm">{nombreDeEntidad(fila.entity_type)}</span>
                          ) : (
                            <Link href={enlace} className="text-sm text-cuotly-green underline">
                              {nombreDeEntidad(fila.entity_type)}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* La fila desplegada del dibujo: registro, valores
                              anteriores y nuevos y el motivo, sin salir de
                              la tabla. */}
                          <details className="max-w-md text-sm">
                            <summary className="cursor-pointer text-text">
                              {cambios.length === 0
                                ? es.settings.auditNoChange
                                : `${cambios[0].field}: ${cambios[0].before ?? "—"} ${es.settings.auditChangeArrow} ${cambios[0].after ?? "—"}`}
                            </summary>
                            <dl className="mt-2 space-y-1 rounded-[10px] bg-soft-surface p-3 text-xs">
                              <div>
                                <dt className="inline font-semibold">{tm.recordId}: </dt>
                                <dd className="inline [overflow-wrap:anywhere]">{fila.id}</dd>
                              </div>
                              {cambios.map((c) => (
                                <div key={c.field}>
                                  <dt className="inline font-semibold">{c.field}: </dt>
                                  <dd className="inline [overflow-wrap:anywhere]">
                                    {c.before ?? "—"} {es.settings.auditChangeArrow} {c.after ?? "—"}
                                  </dd>
                                </div>
                              ))}
                              <div>
                                <dt className="inline font-semibold">{tm.reasonLabel}: </dt>
                                <dd className="inline">{fila.reason ?? es.settings.auditNoReason}</dd>
                              </div>
                            </dl>
                          </details>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-text-secondary">
              <span>
                {total} {es.settings.auditTotalLabel} · {es.settings.auditPageLabel} {paginaActual}/{paginas}
              </span>
              <span className="flex gap-4">
                {paginaActual > 1 ? (
                  <Link href={enlacePagina(paginaActual - 1)} className="text-cuotly-green underline">
                    {es.settings.auditPagePrevious}
                  </Link>
                ) : null}
                {paginaActual < paginas ? (
                  <Link href={enlacePagina(paginaActual + 1)} className="text-cuotly-green underline">
                    {es.settings.auditPageNext}
                  </Link>
                ) : null}
              </span>
            </nav>
          </>
        )}
      </Card>

      <div role="note" className="flex items-start gap-3 rounded-[10px] bg-info/10 px-4 py-3 text-sm text-text">
        <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <span>{tm.immutableNote}</span>
      </div>
    </div>
  );
}
