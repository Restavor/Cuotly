import { notFound, redirect } from "next/navigation";

import { ActivityFeed } from "@/components/home/ActivityFeed";
import { AttentionList } from "@/components/home/AttentionList";
import { KpiCard } from "@/components/home/KpiCard";
import { PanelLink } from "@/components/home/PanelLink";
import { TeamLoad } from "@/components/home/TeamLoad";
import { Card, EmptyState, ErrorState, NoPermissionState, StatusBadge } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
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
    <div className="mx-auto max-w-6xl space-y-6">
      {/*
        Página 22 del diseño · el saludo con el nombre de quien entra y una
        frase que dice de qué va la pantalla. El título "Inicio" ya está en
        la miga de pan del armazón: repetirlo aquí gastaba la línea más
        visible de la pantalla en decir dónde estás en vez de qué hay.
      */}
      <header>
        <h1 className="text-3xl font-bold text-primary-dark">
          {es.spaceHome.greeting(nombre)}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {es.spaceHome.greetingSubtitle}
        </p>
        <p className="mt-1 text-sm font-medium text-text">
          {home.attention.length > 0
            ? es.spaceHome.subtitleAttention
            : es.spaceHome.subtitleClear}
        </p>
      </header>

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
        Página 22 del diseño definitivo móvil · **cinco** recuadros en dos
        filas, tres arriba y dos abajo, también en un teléfono. La rejilla
        es de seis columnas para poder repartirlos así: 2+2+2 y 3+3. Con
        `sm:grid-cols-2` los cinco salían apilados a ancho completo, que es
        lo que se veía en el móvil.
      */}
      <section
        aria-label={es.spaceHome.title}
        className="grid grid-cols-6 gap-2.5 sm:gap-4"
      >
        <div className="col-span-2">
          <KpiCard
            icon="building"
            tone="info"
            value={home.activeEstablishments}
            label={es.spaceHome.kpi.establishments}
            hint={es.spaceHome.kpi.establishmentsHint(
              home.activeEstablishments,
              home.establishmentsTotal,
            )}
            href={`${base}/restaurantes`}
          />
        </div>
        <div className="col-span-2">
          <KpiCard
            icon="request"
            tone="warning"
            value={home.pendingRequests}
            label={es.spaceHome.kpi.requests}
            hint={es.spaceHome.kpi.requestsHint}
            href={`${base}/solicitudes`}
          />
        </div>
        <div className="col-span-2">
          <KpiCard
            icon="job"
            tone="info"
            value={home.jobsInProgress}
            label={es.spaceHome.kpi.inProgress}
            hint={es.spaceHome.kpi.inProgressHint(home.jobsOnTime)}
            href={`${base}/trabajos`}
          />
        </div>
        <div className="col-span-3">
          <KpiCard
            icon="dailyMenu"
            tone="info"
            value={home.dailyMenu.offered ? home.dailyMenu.pending : 0}
            label={es.spaceHome.kpi.menu}
            hint={
              home.dailyMenu.offered
                ? es.spaceHome.kpi.menuHint(home.dailyMenu.unassigned)
                : es.spaceHome.kpi.menuNotOffered
            }
            href={`${base}/menu-diario`}
          />
        </div>
        <div className="col-span-3">
          <KpiCard
            icon="clock"
            tone="danger"
            value={home.jobsAtDeadlineRisk}
            label={es.spaceHome.kpi.jobs}
            hint={es.spaceHome.kpi.jobsHint}
            href={`${base}/trabajos`}
          />
        </div>
      </section>

      {/*
        Página 22 · "Estado por restaurante". Va **sin la barra de
        porcentaje** que dibuja el diseño: no está definido qué mide, y una
        barra sin regla detrás se lee como un dato aunque no lo sea
        (CLAUDE.md MUST NOT). El resto del bloque —quién es y cómo está— sí
        es cierto y sí lleva a su ficha.
      */}
      <Card
        title={es.spaceHome.byRestaurant.title}
        action={
          <PanelLink href={`${base}/restaurantes`}>
            {es.spaceHome.byRestaurant.seeAll}
          </PanelLink>
        }
      >
        {home.restaurants.length === 0 ? (
          <p className="text-sm text-text-secondary">{es.spaceHome.byRestaurant.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {home.restaurants.map((restaurante) => (
              <li key={restaurante.id}>
                <Link
                  href={`${base}/restaurantes/${restaurante.id}`}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface">
                    <Icon name="building" className="h-5 w-5 text-primary-dark" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-text">
                    {restaurante.name}
                  </span>
                  <StatusBadge tone={restaurante.status === "active" ? "success" : "neutral"}>
                    {restaurante.status in es.space.statuses
                      ? es.space.statuses[restaurante.status as keyof typeof es.space.statuses]
                      : restaurante.status}
                  </StatusBadge>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-text-secondary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/*
        `min-w-0` en los dos hijos, y no es cosmético: CA-19 se rompía por
        aquí. Un elemento de grid tiene `min-width: auto`, así que se niega
        a encoger por debajo del ancho mínimo de su contenido; en un
        teléfono de 390 px estos dos medían **931 px** y sacaban la página
        entera fuera de la pantalla. Con `min-w-0` el elemento sí encoge y
        los `truncate` de dentro (AttentionList, TeamLoad, ActivityFeed)
        pueden hacer su trabajo, que hasta ahora no servía de nada.
        Lo encontró el job `e2e-datos` la primera vez que CI lo ejecutó.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card
          className="min-w-0 lg:col-span-2"
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

        <div className="min-w-0 space-y-4">
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
