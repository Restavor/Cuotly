import { notFound, redirect } from "next/navigation";

import { isClientRole } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";
import { ButtonLink, EmptyState, NoPermissionState, PageHeader } from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { readTeamParams } from "@/core/team-roster";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import {
  PrincipalSupervisorForm,
  SubstituteSupervisorForm,
  SupervisionRowActions,
} from "./SupervisionForms";
import {
  loadAbsences,
  loadMemberHistory,
  loadPendingInvitations,
  loadPendingReassignments,
  loadTeam,
  type TeamData,
} from "./team-load";
import { InvitationsTab, MembersTab, PermissionsTab, SupervisionTab, TeamTabs } from "./TeamView";

/**
 * Equipo · las cuatro pestañas del dibujo: Miembros y carga (M69),
 * Permisos (M70), Invitaciones (M71) y Supervisión y disponibilidad
 * (M72). M19 y M20 eran el mismo destino antes de tener pestañas.
 *
 * "Supervisor" NO es un rol: es una relación Administrador–Trabajador
 * (RN-SUP-01, y CLAUDE.md lo enumera entre las decisiones que no deben
 * reaparecer). Por eso vive en su pestaña y en la columna "Supervisor" de
 * los trabajadores, nunca como un rol más.
 *
 * Nada de esta página autoriza nada. Las filas las filtra RLS, y cada
 * cambio pasa por una función del servidor que comprueba la capacidad por
 * su cuenta: `manage_space` para la supervisión (RN-SUP-05) y para lo que
 * puede hacer un administrador; `assign_jobs` para restaurantes y
 * especialidades (migración 130); `invite_member` para invitar y cancelar.
 * Las capacidades se preguntan aquí solo para no pintar formularios
 * condenados a fallar. Un restaurante no es miembro del espacio: aquí no
 * tiene nada que ver, y se le dice (CA-20).
 */
export const dynamic = "force-dynamic";

function dayOf(instant: string): string {
  return instant.slice(0, 10);
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const viewer = await resolveShellViewer(supabase, user.id, slug);
  if (viewer.spaceId === null) redirect("/espacios");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("id", viewer.spaceId)
    .maybeSingle();
  if (!space) notFound();

  if (isClientRole(viewer.role)) {
    return (
      <div className="space-y-6">
        <PageHeader title={es.teamPage.titleOf(space.name)} />
        <NoPermissionState />
      </div>
    );
  }

  const now = new Date();
  const today = todayInTimeZone(now, space.timezone);
  const vista = readTeamParams(query, today);
  const team = await loadTeam(supabase, space.id, now);

  let contenido: React.ReactNode;
  if (vista.tab === "permisos") {
    const history =
      vista.person !== null && team.members.some((m) => m.userId === vista.person)
        ? await loadMemberHistory(supabase, space.id, vista.person)
        : [];
    contenido = (
      <PermissionsTab
        slug={space.slug}
        spaceId={space.id}
        data={team}
        personId={vista.person}
        history={history}
        timeZone={space.timezone}
      />
    );
  } else if (vista.tab === "invitaciones") {
    const invitations = team.caps.invite ? await loadPendingInvitations(supabase, space.id) : [];
    contenido = (
      <InvitationsTab
        spaceId={space.id}
        slug={space.slug}
        canInvite={team.caps.invite}
        invitations={invitations}
        timeZone={space.timezone}
        now={now}
      />
    );
  } else if (vista.tab === "supervision") {
    // Las ausencias que tocan la semana elegida o están por venir.
    const desde = vista.week < today ? vista.week : today;
    const [absences, reassignments] = await Promise.all([
      loadAbsences(supabase, space.id, desde),
      loadPendingReassignments(supabase, space.id, space.slug),
    ]);
    contenido = (
      <SupervisionTab
        slug={space.slug}
        data={team}
        week={vista.week}
        today={today}
        absences={absences}
        reassignments={reassignments}
        timeZone={space.timezone}
        supervisionForms={<SupervisionForms data={team} spaceId={space.id} today={today} />}
      />
    );
  } else {
    contenido = <MembersTab slug={space.slug} data={team} />;
  }

  return (
    <div className="space-y-6">
      {/*
        El botón de invitar solo se pinta a quien puede invitar: el
        servidor lo comprueba igual, pero un botón que va a ser rechazado
        es una promesa falsa.
      */}
      <PageHeader
        title={es.teamPage.titleOf(space.name)}
        subtitle={vista.tab === "invitaciones" ? es.teamPage.invitations.subtitle : es.teamPage.intro}
        actions={
          team.caps.invite && vista.tab !== "invitaciones" ? (
            <ButtonLink href={`/espacios/${space.slug}/equipo?tab=invitaciones`} icon="person">
              {es.teamPage.inviteLink}
            </ButtonLink>
          ) : null
        }
      />
      <TeamTabs slug={space.slug} active={vista.tab} />
      {contenido}
    </div>
  );
}

/**
 * HU-29 · los formularios de supervisión de siempre, dentro de la tarjeta
 * "Asignar cobertura de supervisión" de M72.
 */
function SupervisionForms({ data, spaceId, today }: { data: TeamData; spaceId: string; today: string }) {
  const activos = data.members.filter((m) => m.status === "active");
  const trabajadores = activos.filter((m) => m.role === "worker").map((m) => ({ id: m.userId, name: m.name }));
  // RN-SUP-01: el supervisor —principal o sustituto— es un Administrador.
  // El propietario entra porque el servidor lo acepta ('admin', 'owner').
  const administradores = activos
    .filter((m) => m.role === "admin" || m.role === "owner")
    .map((m) => ({ id: m.userId, name: m.name }));
  const names = new Map(data.members.map((m) => [m.userId, m.name]));

  if (!data.caps.manageSpace) {
    return <p className="text-sm text-text-secondary">{es.teamPage.onlyOwner}</p>;
  }
  if (trabajadores.length === 0) {
    return <EmptyState title={es.teamPage.supervisionTitle} description={es.teamPage.noWorkers} />;
  }
  if (administradores.length === 0) {
    return <EmptyState title={es.teamPage.supervisionTitle} description={es.teamPage.noAdmins} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">{es.teamPage.supervisionIntro}</p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 font-semibold text-text">{es.teamPage.principalColumn}</p>
          <PrincipalSupervisorForm spaceId={spaceId} workers={trabajadores} admins={administradores} />
        </div>
        <div className="min-w-0">
          <p className="mb-2 font-semibold text-text">{es.teamPage.substituteTitle}</p>
          <SubstituteSupervisorForm
            spaceId={spaceId}
            workers={trabajadores}
            admins={administradores}
            defaultDay={today}
          />
        </div>
      </div>

      {data.supervisions.length > 0 ? (
        <div className="border-t border-border pt-6">
          <p className="mb-3 font-semibold text-text">{es.teamPage.supervision.currentTitle}</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {data.supervisions.map((s) => (
              <div key={s.id} className="min-w-0 space-y-2 rounded-[10px] border border-border p-4">
                <p className="text-sm font-semibold text-text">
                  {names.get(s.workerId) ?? "—"} → {names.get(s.adminId) ?? "—"} ·{" "}
                  {s.kind === "principal" ? es.teamPage.principalColumn : es.teamPage.substituteColumn}
                </p>
                <SupervisionRowActions
                  supervisionId={s.id}
                  canReschedule={s.kind === "substitute"}
                  defaultDay={s.endsAt ? dayOf(s.endsAt) : today}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
