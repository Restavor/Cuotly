import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
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
import { AUDIT_FAMILIES, auditChanges, auditDayWindow } from "@/core/audit";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

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

type Fila = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
};

function cuando(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(instant));
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
    mias?: string;
    pagina?: string;
  }>;
}) {
  const { slug } = await params;
  const { familia, desde, hasta, mias, pagina } = await searchParams;
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
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.settings.auditTitle}</h1>
        <NoPermissionState
          title={es.settings.noAccessTitle}
          description={es.settings.noAccessReason}
        />
      </div>
    );
  }

  const paginaActual = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);
  const ventana = auditDayWindow(desde ?? null, hasta ?? null, space.timezone);
  const familiaValida = familia && AUDIT_FAMILIES.includes(familia) ? familia : null;

  let consulta = supabase
    .from("audit_log")
    .select(
      "id, created_at, actor_id, action, entity_type, entity_id, old_value, new_value, reason",
      { count: "exact" },
    )
    .eq("space_id", space.id)
    .order("created_at", { ascending: false })
    .range((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA - 1);

  if (familiaValida !== null) consulta = consulta.like("action", `${familiaValida}.%`);
  if (ventana.from !== null) consulta = consulta.gte("created_at", ventana.from);
  if (ventana.to !== null) consulta = consulta.lt("created_at", ventana.to);
  if (mias === "1") consulta = consulta.eq("actor_id", user.id);

  const { data, count } = await consulta;
  const filas = (data ?? []) as Fila[];

  const actorIds = [...new Set(filas.map((f) => f.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };

  const nombrePersona = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const),
  );

  const total = count ?? filas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const explicacion =
    membership.role === "owner"
      ? es.settings.auditWhatYouSee.owner
      : membership.role === "admin"
        ? es.settings.auditWhatYouSee.admin
        : es.settings.auditWhatYouSee.worker;

  function enlacePagina(destino: number): string {
    const query = new URLSearchParams();
    if (familiaValida !== null) query.set("familia", familiaValida);
    if (desde) query.set("desde", desde);
    if (hasta) query.set("hasta", hasta);
    if (mias === "1") query.set("mias", "1");
    query.set("pagina", String(destino));
    return `/espacios/${slug}/ajustes/auditoria?${query.toString()}`;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <header>
        <p className="text-sm">
          <Link href={`/espacios/${slug}/ajustes`} className="text-cuotly-green underline">
            {es.settings.auditBack}
          </Link>
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.settings.auditTitle}</h1>
        <p className="text-sm text-text-secondary">{es.settings.auditSubtitle}</p>
        {/* §21.2 · quién ve qué se dice en claro, para que nadie crea que
            está viendo el espacio entero cuando está viendo su parte. */}
        <p className="mt-1 text-sm text-text-secondary">{explicacion}</p>
      </header>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-text">
              {es.settings.auditFilterFamily}
            </span>
            <select
              name="familia"
              defaultValue={familiaValida ?? ""}
              className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text"
            >
              <option value="">{es.settings.auditFilterAll}</option>
              {AUDIT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {(es.settings.auditFamilies as Readonly<Record<string, string>>)[f] ?? f}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-text">
              {es.settings.auditFilterFrom}
            </span>
            <input
              type="date"
              name="desde"
              defaultValue={desde ?? ""}
              className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1.5 block font-semibold text-text">
              {es.settings.auditFilterTo}
            </span>
            <input
              type="date"
              name="hasta"
              defaultValue={hasta ?? ""}
              className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text"
            />
          </label>

          <label className="flex items-center gap-2 py-2.5 text-sm text-text">
            <input type="checkbox" name="mias" value="1" defaultChecked={mias === "1"} />
            {es.settings.auditFilterMineOnly}
          </label>

          <button
            type="submit"
            className="rounded-[10px] bg-cuotly-green px-4 py-2.5 text-[15px] font-semibold text-white"
          >
            {es.settings.auditFilterSubmit}
          </button>
        </form>
      </Card>

      <Card>
        {filas.length === 0 ? (
          <EmptyState
            title={es.settings.auditEmptyTitle}
            description={es.settings.auditEmptyReason}
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-text-secondary">
              {total} {es.settings.auditTotalLabel} · {es.settings.auditPageLabel} {paginaActual}/
              {paginas}
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{es.settings.auditWhenColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditActorColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditActionColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditEntityColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditChangeColumn}</TableHeaderCell>
                    <TableHeaderCell>{es.settings.auditReasonColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filas.map((fila) => {
                    const cambios = auditChanges(fila.old_value, fila.new_value);
                    const enlace = enlaceDelElemento(slug, fila.entity_type, fila.entity_id);

                    return (
                      <TableRow key={fila.id}>
                        <TableCell>{cuando(fila.created_at, space.timezone)}</TableCell>
                        <TableCell>
                          {fila.actor_id === null
                            ? // Un apunte sin actor lo escribió un barrido
                              // automático, no una persona (P6).
                              es.settings.auditNoActor
                            : (nombrePersona.get(fila.actor_id) ?? es.settings.auditNoActor)}
                        </TableCell>
                        <TableCell>{nombreDeAccion(fila.action)}</TableCell>
                        <TableCell>
                          {enlace === null ? (
                            nombreDeEntidad(fila.entity_type)
                          ) : (
                            <Link href={enlace} className="text-cuotly-green underline">
                              {nombreDeEntidad(fila.entity_type)}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>
                          {cambios.length === 0 ? (
                            <span className="text-text-secondary">
                              {es.settings.auditNoChange}
                            </span>
                          ) : (
                            <ul className="space-y-0.5">
                              {cambios.map((cambio) => (
                                <li key={cambio.field} className="text-sm">
                                  <span className="font-semibold">{cambio.field}</span>:{" "}
                                  {cambio.before ?? "—"} {es.settings.auditChangeArrow}{" "}
                                  {cambio.after ?? "—"}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell>{fila.reason ?? es.settings.auditNoReason}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <nav className="mt-4 flex gap-4 text-sm">
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
            </nav>
          </>
        )}
      </Card>
    </div>
  );
}
