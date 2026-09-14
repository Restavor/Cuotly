import { notFound, redirect } from "next/navigation";

import { ActivityFeed } from "@/components/home/ActivityFeed";
import { AttentionList } from "@/components/home/AttentionList";
import { KpiCard } from "@/components/home/KpiCard";
import { PanelLink } from "@/components/home/PanelLink";
import { TeamLoad } from "@/components/home/TeamLoad";
import { Card, EmptyState, ErrorState, NoPermissionState } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { loadSpaceHome } from "./home-load";

/**
 * §20.4 · el Inicio del espacio: "resumen general, restaurantes y estados,
 * solicitudes y trabajos críticos, carga del equipo, ingresos y
 * pendientes, incidencias, actividad reciente".
 *
 * Todo lo que se pinta aquí está calculado en el servidor y sale de datos
 * reales. Los tres números del resumen se cuentan sobre las filas que RLS
 * deja ver a quien mira, y "trabajos próximos a vencer" se recalcula desde
 * `timer_events` con el reloj laboral de `src/core` — no hay ninguna
 * columna con el plazo guardado, y no la habrá (CA-10).
 *
 * La tarjeta de Menú Diario (decisión 18) cuenta desde el Hito 11 las
 * publicaciones que el equipo tiene entre manos, con `team_menu_queue()`.
 * Si el espacio no ofrece el servicio o la consulta falla, dice el motivo
 * en vez de enseñar un cero que parecería un dato (CLAUDE.md MUST NOT,
 * CA-20).
 */
export const dynamic = "force-dynamic";

export default async function SpacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();

  // RLS ya impide ver espacios ajenos: si no aparece nada, es que no
  // existe o no pertenece a este usuario — en los dos casos, 404. No hay
  // forma de distinguir "no existe" de "no tienes acceso" desde fuera, y
  // es intencional (CA-02): no se confirma ni se niega la existencia de
  // espacios ajenos.
  if (!space) {
    notFound();
  }

  // Sin pertenecer al espacio no hay resumen que enseñar. La comprobación
  // de verdad la hace RLS —las consultas volverían vacías igual—, pero
  // decir "sin acceso" es más honesto que enseñar ceros como si no hubiera
  // trabajo (CA-20).
  const { data: membership } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("space_id", space.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-3xl font-bold text-primary-dark">{es.spaceHome.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  const now = new Date();
  const home = await loadSpaceHome(supabase, space.id, space.slug, now);
  const base = `/espacios/${space.slug}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-primary-dark">{es.spaceHome.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {home.attention.length > 0
            ? es.spaceHome.subtitleAttention
            : es.spaceHome.subtitleClear}
        </p>
      </header>

      <section aria-label={es.spaceHome.title} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          icon="building"
          tone="info"
          value={home.activeEstablishments}
          label={es.spaceHome.kpi.establishments}
          href={`${base}/restaurantes`}
        />
        <KpiCard
          icon="request"
          tone="warning"
          value={home.pendingRequests}
          label={es.spaceHome.kpi.requests}
          href={`${base}/solicitudes`}
        />
        <KpiCard
          icon="job"
          tone="danger"
          value={home.jobsAtDeadlineRisk}
          label={es.spaceHome.kpi.jobs}
          hint={es.spaceHome.kpi.jobsHint}
          href={`${base}/trabajos`}
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title={es.spaceHome.attention.title}
          action={<PanelLink href={`${base}/solicitudes`}>{es.spaceHome.attention.seeAll}</PanelLink>}
        >
          {home.attention.length === 0 ? (
            // Esto NO es un "sin datos": es una respuesta, y buena. Por eso
            // no lleva uno de los cuatro motivos de CA-20 —ninguno
            // encaja— sino la explicación de qué llegaría a aparecer aquí.
            <EmptyState
              title={es.spaceHome.attention.emptyTitle}
              description={es.spaceHome.attention.emptyReason}
            />
          ) : (
            <AttentionList timeZone={space.timezone} items={home.attention} />
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title={es.spaceHome.teamLoad.title}
            action={<PanelLink href={`${base}/equipo`}>{es.spaceHome.teamLoad.seeAll}</PanelLink>}
          >
            {home.teamLoadFailed ? (
              <ErrorState />
            ) : !home.teamLoadAvailable ? (
              // RN-ASG-17 y §20.7: sin permiso para ver la carga ajena se
              // dice eso, no una lista vacía que parecería "no hay nadie".
              <NoPermissionState
                title={es.spaceHome.teamLoad.noPermissionTitle}
                description={es.spaceHome.teamLoad.noPermissionReason}
              />
            ) : home.team.length === 0 ? (
              <EmptyReason
                testId="inicio-sin-equipo"
                reason="no_data_yet"
                title={es.spaceHome.teamLoad.emptyTitle}
              />
            ) : (
              <TeamLoad members={home.team} />
            )}
          </Card>

          <Card
            title={es.spaceHome.dailyMenu.title}
            action={
              <PanelLink href={`${base}/menu-diario`}>{es.spaceHome.dailyMenu.openLink}</PanelLink>
            }
          >
            {/*
              Decisión 18 · el contador entra en la tarjeta que ya estaba
              en su sitio. Sale de `team_menu_queue()` (RLS y garantía en el
              servidor). CA-20: sin servicio o sin poder calcularlo, lo que
              va es el motivo, no un cero.
            */}
            {!home.dailyMenu.offered && (home.dailyMenu.pending ?? 0) === 0 ? (
              <EmptyState
                title={es.spaceHome.dailyMenu.noServiceTitle}
                description={es.spaceHome.dailyMenu.noServiceReason}
              />
            ) : home.dailyMenu.pending === null ? (
              <ErrorState title={es.spaceHome.dailyMenu.unavailable} />
            ) : (
              <div data-testid="inicio-menu-diario">
                <p className="text-2xl font-bold text-primary-dark">
                  {es.spaceHome.dailyMenu.pending(home.dailyMenu.pending)}
                </p>
                <p className="text-sm text-text-secondary">{es.spaceHome.dailyMenu.pendingHint}</p>
                {home.dailyMenu.unassigned > 0 || home.dailyMenu.overdue > 0 ? (
                  <p className="mt-2 text-sm text-text">
                    {[
                      home.dailyMenu.unassigned > 0 ? es.spaceHome.dailyMenu.unassigned(home.dailyMenu.unassigned) : null,
                      home.dailyMenu.overdue > 0 ? es.spaceHome.dailyMenu.overdue(home.dailyMenu.overdue) : null,
                    ]
                      .filter((x) => x !== null)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card
        title={es.spaceHome.activity.title}
        action={
          <PanelLink href={`${base}/ajustes/auditoria`}>{es.spaceHome.activity.seeAll}</PanelLink>
        }
      >
        {home.activity.length === 0 ? (
          <EmptyReason
            testId="inicio-sin-actividad"
            reason="no_data_yet"
            title={es.spaceHome.activity.emptyTitle}
          />
        ) : (
          <ActivityFeed entries={home.activity} timeZone={space.timezone} now={now} />
        )}
      </Card>
    </div>
  );
}
