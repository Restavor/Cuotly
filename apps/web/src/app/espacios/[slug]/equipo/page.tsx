import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { isSupervisionCurrent } from "@/core/team-calendar";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import {
  PrincipalSupervisorForm,
  SubstituteSupervisorForm,
  SupervisionRowActions,
} from "./SupervisionForms";

/**
 * HU-29 · "asignar un administrador principal a cada trabajador y un
 * sustituto con fechas". Es el destino "Equipo" del menú (§20.2), que
 * hasta ahora devolvía 404, y la casa de la lista del equipo y de las
 * invitaciones (HU-03, HU-04), que vivían sueltas en el inicio del
 * espacio.
 *
 * "Supervisor" NO es un rol: es una relación Administrador–Trabajador
 * (RN-SUP-01, y CLAUDE.md lo enumera entre las decisiones que no deben
 * reaparecer). Por eso esta pantalla no tiene ninguna columna "supervisor"
 * en la tabla de roles: la supervisión se enseña aparte, como lo que es.
 *
 * Quién puede cambiarlas lo decide `has_capability(space,'manage_space')`
 * dentro de cada función del servidor (RN-SUP-05). La capacidad se
 * consulta también aquí, y solo para decidir qué formularios se pintan:
 * quien llegue por URL sin ella ve la pantalla en modo lectura y, si
 * enviara el formulario de todos modos, el servidor lo rechaza.
 *
 * Qué filas se ven lo decide RLS (`is_space_member`), no esta página. Un
 * cliente no es miembro del espacio: `space_memberships` y `supervisions`
 * le devuelven cero filas.
 */
export const dynamic = "force-dynamic";

type RoleKey = keyof typeof es.teamPage.roles;
type StatusKey = keyof typeof es.space.statuses;

function roleLabel(role: string): string {
  return role in es.teamPage.roles ? es.teamPage.roles[role as RoleKey] : role;
}

function statusLabel(status: string): string {
  return status in es.space.statuses ? es.space.statuses[status as StatusKey] : status;
}

function personName(profile: { full_name: string | null; email: string | null } | null): string {
  return profile?.full_name ?? profile?.email ?? "—";
}

/** Solo la fecha, sin hora: la ventana se elige por días (RN-SUP-03). */
function dayOf(instant: string): string {
  return instant.slice(0, 10);
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
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

  const [{ data: memberships }, { data: supervisiones }, { data: puedeCambiar }, { data: puedeInvitar }] =
    await Promise.all([
      supabase
        .from("space_memberships")
        .select("user_id, role, status, profiles (full_name, email)")
        .eq("space_id", space.id)
        .order("role"),
      // Dos claves ajenas a `profiles` —el trabajador y el administrador—,
      // así que la unión se nombra por la constraint en las dos.
      supabase
        .from("supervisions")
        .select(
          "id, worker_id, admin_id, kind, starts_at, ends_at, revoked_at, profiles!supervisions_admin_id_fkey (full_name, email)",
        )
        .eq("space_id", space.id)
        .order("kind"),
      supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_space" }),
      supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "invite_member" }),
    ]);

  const activos = (memberships ?? []).filter((m) => m.status === "active");
  const trabajadores = activos
    .filter((m) => m.role === "worker")
    .map((m) => ({ id: m.user_id, name: personName(m.profiles) }));
  // RN-SUP-01: el supervisor —principal o sustituto— es un Administrador.
  // El propietario entra porque el servidor lo acepta ('admin', 'owner').
  const administradores = activos
    .filter((m) => m.role === "admin" || m.role === "owner")
    .map((m) => ({ id: m.user_id, name: personName(m.profiles) }));

  // La vigencia se calcula con el mismo criterio que RN-SUP-04 —empezada,
  // no terminada y no retirada— en `src/core/`, no aquí ni en SQL.
  const ahora = new Date();
  const vigentes = (supervisiones ?? []).filter((s) =>
    isSupervisionCurrent(ahora, {
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      revokedAt: s.revoked_at,
    }),
  );

  const principalDe = new Map(vigentes.filter((s) => s.kind === "principal").map((s) => [s.worker_id, s]));
  const sustitutoDe = new Map(
    vigentes.filter((s) => s.kind === "substitute").map((s) => [s.worker_id, s]),
  );

  const hoy = todayInTimeZone(ahora, space.timezone);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary-dark">{es.nav.team}</h1>
        <p className="text-sm text-text-secondary">{es.teamPage.intro}</p>
      </header>

      <Card title={es.teamPage.membersTitle} className="space-y-4">
        {puedeInvitar === true ? (
          <Link
            href={`/espacios/${space.slug}/equipo/invitar`}
            className="text-sm text-cuotly-green underline"
          >
            {es.teamPage.inviteLink}
          </Link>
        ) : null}

        {activos.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableHeaderCell>{es.teamPage.nameColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamPage.roleColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamPage.statusColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamPage.principalColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamPage.substituteColumn}</TableHeaderCell>
              </TableHead>
              <TableBody>
                {activos.map((miembro) => {
                  const principal = principalDe.get(miembro.user_id);
                  const sustituto = sustitutoDe.get(miembro.user_id);
                  const esTrabajador = miembro.role === "worker";
                  return (
                    <TableRow key={miembro.user_id}>
                      <TableCell>{personName(miembro.profiles)}</TableCell>
                      <TableCell>{roleLabel(miembro.role)}</TableCell>
                      <TableCell>
                        <StatusBadge tone={miembro.status === "active" ? "success" : "neutral"}>
                          {statusLabel(miembro.status)}
                        </StatusBadge>
                      </TableCell>
                      {/*
                        La supervisión es de los trabajadores. A un
                        administrador no se le pinta "Sin asignar", que
                        sonaría a que le falta algo: RN-SUP-06 dice que
                        puede existir sin supervisados.
                      */}
                      <TableCell>
                        {esTrabajador
                          ? principal
                            ? personName(principal.profiles)
                            : es.teamPage.noPrincipal
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {esTrabajador
                          ? sustituto
                            ? `${personName(sustituto.profiles)} · ${es.teamPage.substituteUntil(
                                sustituto.ends_at ? dayOf(sustituto.ends_at) : "—",
                              )}`
                            : es.teamPage.noSubstitute
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState title={es.space.team.title} description={es.space.team.empty} />
        )}
        <p className="text-sm text-text-secondary">{es.teamPage.withoutWorkerHint}</p>
      </Card>

      <Card title={es.teamPage.supervisionTitle} className="space-y-6">
        <p className="text-sm text-text-secondary">{es.teamPage.supervisionIntro}</p>

        {puedeCambiar !== true ? (
          <p className="text-sm text-text-secondary">{es.teamPage.onlyOwner}</p>
        ) : trabajadores.length === 0 ? (
          <EmptyState title={es.teamPage.supervisionTitle} description={es.teamPage.noWorkers} />
        ) : administradores.length === 0 ? (
          <EmptyState title={es.teamPage.supervisionTitle} description={es.teamPage.noAdmins} />
        ) : (
          <>
            <PrincipalSupervisorForm
              spaceId={space.id}
              workers={trabajadores}
              admins={administradores}
            />
            <div className="border-t border-border pt-6">
              <p className="mb-2 font-semibold text-text">{es.teamPage.substituteTitle}</p>
              <SubstituteSupervisorForm
                spaceId={space.id}
                workers={trabajadores}
                admins={administradores}
                defaultDay={hoy}
              />
            </div>

            {vigentes.length > 0 ? (
              <div className="space-y-6 border-t border-border pt-6">
                {vigentes.map((supervision) => (
                  <div key={supervision.id} className="space-y-2">
                    <p className="text-sm font-semibold text-text">
                      {personName(supervision.profiles)} ·{" "}
                      {supervision.kind === "principal"
                        ? es.teamPage.principalColumn
                        : es.teamPage.substituteColumn}
                    </p>
                    <SupervisionRowActions
                      supervisionId={supervision.id}
                      canReschedule={supervision.kind === "substitute"}
                      defaultDay={supervision.ends_at ? dayOf(supervision.ends_at) : hoy}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
