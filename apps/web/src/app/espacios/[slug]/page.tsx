import { notFound, redirect } from "next/navigation";

import { ActivityChart } from "@/components/home/ActivityChart";
import { ActivityFeed } from "@/components/home/ActivityFeed";
import { AttentionList } from "@/components/home/AttentionList";
import { FinanceSummary } from "@/components/home/FinanceSummary";
import { KpiCard } from "@/components/home/KpiCard";
import { PanelLink } from "@/components/home/PanelLink";
import { TeamLoad } from "@/components/home/TeamLoad";
import { UpcomingTasks } from "@/components/home/UpcomingTasks";
import {
  Card,
  EmptyState,
  ErrorState,
  NoPermissionState,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import Link from "next/link";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { eventHref, kindLabel } from "./calendario/page";
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
      <div className="space-y-6">
        <PageHeader title={es.spaceHome.title} />
        <NoPermissionState />
      </div>
    );
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const nombre = (perfil?.full_name ?? "").trim().split(" ")[0] ?? "";

  const now = new Date();
  const home = await loadSpaceHome(supabase, space.id, space.slug, now);
  const base = `/espacios/${space.slug}`;

  // §9 · cuántos pasos quedan. La función comprueba el permiso por su
  // cuenta (RN-CIC-03) y devuelve error a quien no es el propietario, así
  // que un fallo aquí significa "no es para ti" y se trata como tal: no
  // se pinta el aviso.
  const { data: pasos } = await supabase.rpc("space_onboarding_progress", {
    p_space_id: space.id,
  });
  const onboardingPendiente = pasos === null ? null : pasos.filter((p) => !p.done).length;

  // §20.4, RN-SOP-15 · las incidencias a Cuotly que esperan algo del
  // espacio: contestar a "necesita información" o dar por buena una
  // resolución. La RLS de `incidents` decide quién las ve: un trabajador
  // recibe cero y no ve la tarjeta, sin ninguna regla de permiso aquí.
  const { count: incidenciasEsperan } = await supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .eq("space_id", space.id)
    .in("status", ["needs_information", "resolved"]);

  return (
    <div className="space-y-6">
      {/*
        Página 22 del diseño (M01) · el saludo con el nombre de quien entra
        y una frase que dice de qué va la pantalla. El título "Inicio" ya
        está en la miga de pan del armazón: repetirlo aquí gastaba la línea
        más visible de la pantalla en decir dónde estás en vez de qué hay.

        A la derecha el diseño dibuja un selector de mes ("Marzo 2025").
        No va: todo lo de esta pantalla es del mes en curso y no hay otro
        periodo que elegir. Un desplegable con una sola opción promete
        algo que no existe.
      */}
      <PageHeader title={es.spaceHome.greeting(nombre)} subtitle={es.spaceHome.greetingSubtitle}>
        <p className="mt-1 text-sm font-medium text-text">
          {home.attention.length > 0
            ? es.spaceHome.subtitleAttention
            : es.spaceHome.subtitleClear}
        </p>
      </PageHeader>

      {/*
        §9 · RN-CIC-01 · el asistente de puesta en marcha, mientras quede
        algo por hacer. Es un aviso, no una puerta: §9 dice "completa
        progresivamente" y el espacio funciona entero desde el primer
        minuto. Se pregunta a la misma función que pinta el asistente, así
        que quien no sea el propietario no ve nada — la función contesta
        que no, y aquí no hay ninguna regla de permiso escrita aparte.
      */}
      {onboardingPendiente !== null && onboardingPendiente > 0 ? (
        <Card>
          <p className="text-sm text-text">
            <strong>{es.onboarding.pendingCount(onboardingPendiente)}</strong>{" "}
            <PanelLink href={`${base}/puesta-en-marcha`}>{es.onboarding.title}</PanelLink>
          </p>
        </Card>
      ) : null}

      {incidenciasEsperan !== null && incidenciasEsperan > 0 ? (
        <Card>
          <p className="text-sm text-text">
            <strong>{es.spaceHome.incidentsAwaiting(incidenciasEsperan)}</strong>{" "}
            <PanelLink href={`${base}/ayuda/incidencias`}>{es.help.incidents.title}</PanelLink>
          </p>
        </Card>
      ) : null}

      {/*
        M01 · **cinco** recuadros en una sola fila en escritorio. En un
        teléfono se reparten en dos columnas y en una tableta en tres,
        como los dibuja la página 22 del diseño definitivo móvil.
      */}
      <section
        aria-label={es.spaceHome.title}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 xl:gap-4"
      >
        <KpiCard
          icon="building"
          tone="green"
          value={home.activeEstablishments}
          label={es.spaceHome.kpi.establishments}
          hint={es.spaceHome.kpi.establishmentsHint(
            home.activeEstablishments,
            home.establishmentsTotal,
          )}
          href={`${base}/restaurantes`}
        />
        <KpiCard
          icon="request"
          tone="danger"
          value={home.pendingRequests}
          label={es.spaceHome.kpi.requests}
          hint={es.spaceHome.kpi.requestsHint}
          href={`${base}/solicitudes`}
        />
        <KpiCard
          icon="job"
          tone="green"
          value={home.jobsInProgress}
          label={es.spaceHome.kpi.inProgress}
          hint={es.spaceHome.kpi.inProgressHint(home.jobsOnTime)}
          href={`${base}/trabajos`}
        />
        {/*
          Decisión 18 · las publicaciones que el equipo tiene entre manos,
          de `team_menu_queue()` (RLS y garantía en el servidor). CA-20:
          sin servicio o sin poder calcularlo, lo que va es el motivo, no
          un cero. Con las garantizadas pasadas de hora, se dice aquí
          mismo: es lo más urgente que puede pasar en Menú Diario.
        */}
        <KpiCard
          icon="dailyMenu"
          tone="green"
          value={
            !home.dailyMenu.offered && (home.dailyMenu.pending ?? 0) === 0
              ? 0
              : home.dailyMenu.pending
          }
          label={es.spaceHome.kpi.menu}
          hint={
            !home.dailyMenu.offered && (home.dailyMenu.pending ?? 0) === 0
              ? es.spaceHome.kpi.menuNotOffered
              : home.dailyMenu.overdue > 0
                ? `${es.spaceHome.kpi.menuHint(home.dailyMenu.unassigned)} · ${es.spaceHome.dailyMenu.overdue(home.dailyMenu.overdue)}`
                : es.spaceHome.kpi.menuHint(home.dailyMenu.unassigned)
          }
          href={`${base}/menu-diario`}
        />
        <KpiCard
          icon="clock"
          tone="warning"
          value={home.jobsAtDeadlineRisk}
          label={es.spaceHome.kpi.jobs}
          hint={es.spaceHome.kpi.jobsHint}
          href={`${base}/trabajos`}
        />
      </section>

      {/*
        M01 · la rejilla de dos columnas del diseño: a la izquierda, más
        ancha, la gráfica de actividad y "Necesita atención"; a la
        derecha "Estado por restaurante" y "Próximas tareas". En un
        teléfono se apilan en ese mismo orden.

        `min-w-0` en cada tarjeta, y no es cosmético: CA-19 se rompía por
        aquí. Un elemento de grid tiene `min-width: auto` y se niega a
        encoger por debajo de su contenido; sin esto, en 390 px una tabla
        sacaba la página entera fuera de la pantalla.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/*
          Página 22 · "Actividad de mantenimiento": las solicitudes creadas
          y los trabajos completados, día a día del mes en curso. El "Este
          mes" del diseño es ahí un desplegable de periodo; aquí va
          escrito, porque el periodo es el mes en curso y no hay otro.
        */}
        <Card
          className="min-w-0"
          title={es.spaceHome.activityChart.title}
          action={
            <span className="text-sm text-text-secondary">
              {es.spaceHome.activityChart.thisMonth}
            </span>
          }
        >
          <ActivityChart days={home.activityChart.days} failed={home.activityChart.failed} />
        </Card>

        {/*
          Página 22 · "Estado por restaurante", con la barra que Bosco
          definió el 20/09/2026: lo que lleva gastado de su bolsa de
          cambios en el ciclo vigente. Donde no hay bolsa que medir no hay
          barra, porque un porcentaje ahí afirmaría algo falso (CLAUDE.md
          MUST NOT).
        */}
        <Card
          className="min-w-0"
          title={es.spaceHome.byRestaurant.title}
          action={
            <PanelLink href={`${base}/restaurantes`}>{es.spaceHome.byRestaurant.seeAll}</PanelLink>
          }
        >
          {home.restaurants.length === 0 ? (
            <p className="text-sm text-text-secondary">{es.spaceHome.byRestaurant.empty}</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {home.restaurants.map((restaurante) => (
                <li key={restaurante.id}>
                  <Link
                    href={`${base}/restaurantes/${restaurante.id}`}
                    className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                  >
                    {/*
                      RN-EST-18 · la foto del local. Sin ella se pinta el
                      mismo icono de siempre, así que la lista no da
                      saltos mientras cargan las imágenes.
                    */}
                    <EstablishmentPhoto photoUrl={restaurante.photoUrl} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">
                        {restaurante.name}
                      </span>
                      <span className="mt-1 block">
                        <StatusBadge tone={restaurante.status === "active" ? "success" : "neutral"}>
                          {restaurante.status in es.space.statuses
                            ? es.space.statuses[restaurante.status as keyof typeof es.space.statuses]
                            : restaurante.status}
                        </StatusBadge>
                      </span>
                    </span>
                    {/*
                      La barra del diseño, con lo que Bosco dijo que mide:
                      lo gastado de su bolsa en el ciclo vigente. Los
                      otros dos casos **no llevan barra**, porque un 0 %
                      en un plan sin cambios incluidos diría algo falso.
                    */}
                    {restaurante.usage.kind === "measured" ? (
                      <span className="flex w-36 shrink-0 items-center gap-2">
                        <ProgressBar
                          percent={restaurante.usage.percent}
                          label={`${es.spaceHome.byRestaurant.usageLabel}: ${es.spaceHome.byRestaurant.usage(
                            restaurante.usage.used,
                            restaurante.usage.included,
                          )}`}
                        />
                        <span className="w-9 shrink-0 text-right text-xs font-semibold text-text">
                          {restaurante.usage.percent} %
                        </span>
                      </span>
                    ) : (
                      <span className="w-36 shrink-0 text-right text-xs leading-snug text-text-secondary">
                        {restaurante.usage.kind === "nothing_included"
                          ? es.spaceHome.byRestaurant.nothingIncluded
                          : es.spaceHome.byRestaurant.noCycle}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          className="min-w-0"
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

        {/*
          Página 22 · "Próximas tareas", del calendario del espacio: de hoy
          al mismo día del mes que viene, las cinco primeras.

          El diseño dibuja un asa de arrastre (⋮) a la izquierda de cada
          fila para reordenarlas. No va: estas filas no son una lista que
          alguien ordena, son eventos **derivados** de su propia fecha
          (RN-DAT-05). Un asa que no puede mover nada es un botón que
          miente, y moverlas de verdad exigiría inventar un orden que no
          existe.
        */}
        <Card
          className="min-w-0"
          title={es.spaceHome.upcoming.title}
          action={
            <PanelLink href={`${base}/calendario`}>{es.spaceHome.upcoming.seeAll}</PanelLink>
          }
        >
          {home.upcoming.failed ? (
            <ErrorState title={es.spaceHome.upcoming.failed} />
          ) : home.upcoming.items.length === 0 ? (
            <EmptyState
              title={es.spaceHome.upcoming.emptyTitle}
              description={es.spaceHome.upcoming.emptyReason}
            />
          ) : (
            <UpcomingTasks
              today={home.today}
              kindLabel={kindLabel}
              tasks={home.upcoming.items.map((tarea) => ({
                key: tarea.key,
                day: tarea.day,
                title: tarea.title,
                kind: tarea.kind,
                establishmentName: tarea.establishmentName,
                href: eventHref(base, {
                  entity_type: tarea.entityType,
                  entity_id: tarea.entityId,
                  establishment_id: tarea.establishmentId,
                }),
              }))}
            />
          )}
        </Card>
      </div>

      {/*
        M01 · la fila de abajo, en tres columnas: "Resumen financiero",
        "Carga de trabajo del equipo" y "Actividad reciente". El "Este
        mes" del diseño es ahí un desplegable de periodo; aquí va escrito.
      */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          className="min-w-0"
          title={es.spaceHome.finance.title}
          subtitle={es.spaceHome.finance.thisMonth}
          action={<PanelLink href={`${base}/finanzas`}>{es.spaceHome.finance.seeAll}</PanelLink>}
        >
          {home.finance.kind === "no_permission" ? (
            // §20.7 · "no puedes verlo" y "no se ha podido leer" son cosas
            // distintas, y decirle la primera a quien sí puede le manda a
            // pedir un permiso que ya tiene.
            <NoPermissionState
              title={es.spaceHome.finance.noPermissionTitle}
              description={es.spaceHome.finance.noPermissionReason}
            />
          ) : home.finance.kind === "failed" ? (
            <ErrorState title={es.spaceHome.finance.failed} />
          ) : (
            <FinanceSummary
              collectedCents={home.finance.collectedCents}
              pendingCents={home.finance.pendingCents}
            />
          )}
        </Card>

        <Card
          className="min-w-0"
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
          className="min-w-0 md:col-span-2 xl:col-span-1"
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
    </div>
  );
}
