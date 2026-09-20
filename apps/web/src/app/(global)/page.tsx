import Link from "next/link";

import { redirect } from "next/navigation";

import { Card, EmptyState, ErrorState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { CreateRestavorCard } from "@/components/CreateRestavorCard";
import { isPlatformPerson, platformNeedsTwoFactor } from "@/core/platform-admin";
import { myPlatformAccess } from "@/services/platform-gateway";

import { loadGlobalHome } from "./global-load";
import { AttentionBoard } from "./AttentionBoard";

/**
 * G01 · el Inicio del contexto global, y **la portada de Cuotly** (PRD §36,
 * RN-GLO-02 y RN-GLO-03).
 *
 * "Necesita tu atención" con lo pendiente de **todos** los contextos a la
 * vez, debajo los contextos, y al lado lo sin leer y las solicitudes de
 * alta. Todo llega calculado desde el servidor por `loadGlobalHome()`: el
 * navegador solo esconde filas con el filtro, nunca decide qué está
 * vencido (CLAUDE.md).
 *
 * **Aquí entra todo el mundo, siempre** (decisión 42, 16/09/2026). Hasta
 * ese día la raíz redirigía sola a tu único contexto —§20.1, "con un solo
 * contexto accesible se entra directamente"—, y eso dejaba sin ver el
 * Inicio global precisamente a quien tiene un solo espacio. Bosco lo
 * decidió al revés: se entra siempre aquí, y desde aquí a lo tuyo. El
 * selector de contexto de HU-02 no desaparece: es la parte de abajo de
 * esta pantalla (RN-GLO-03).
 *
 * Lo que la portada anterior traía y aquí sigue: la entrada a
 * Administración de Cuotly con su aviso de 2FA, y la tarjeta de crear el
 * espacio de Restavor para el Propietario de Cuotly.
 */
export const dynamic = "force-dynamic";

export default async function GlobalHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Hito 19 (§8, RN-ADM-01) · quien es de Cuotly ve SIEMPRE su entrada, la
  // primera. Se pregunta por la identidad sin la cerradura de la 2FA: si le
  // falta, se le dice aquí. Si la consulta falla no se bloquea a nadie: se
  // sigue como un usuario normal.
  const [home, platform] = await Promise.all([
    loadGlobalHome(supabase),
    myPlatformAccess(supabase).catch(() => null),
  ]);
  const esPlataforma = platform !== null && isPlatformPerson(platform);
  const t = es.globalContext.home;

  const contextos = [...new Set(home.attention.map((i) => i.contextName))].filter(
    (nombre) => nombre !== "",
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card title={t.attentionTitle}>
        {home.failed.attention ? (
          <p className="mb-4 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-text">
            {t.attentionFailedReason}
          </p>
        ) : null}

        {home.attention.length === 0 ? (
          <EmptyState
            title={home.failed.attention ? t.attentionFailed : t.attentionEmpty}
            description={
              home.failed.attention ? t.attentionFailedReason : t.attentionEmptyReason
            }
          />
        ) : (
          <AttentionBoard items={home.attention} contexts={contextos} />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t.unreadTitle}>
          {home.failed.conversations ? (
            <p className="text-sm text-text-secondary">
              {es.globalContext.messages.failedReason}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-text">
                {home.unread === 0 ? t.unreadNone : `${home.unread}`}
              </p>
              <Link href="/mensajes" className="text-sm font-semibold text-cuotly-green underline">
                {t.openMessages}
              </Link>
            </>
          )}
        </Card>

        <Card title={t.requestsTitle}>
          {home.requests.length === 0 ? (
            <p className="mb-3 text-sm text-text-secondary">
              {es.globalContext.requests.emptyReason}
            </p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm text-text">
              {home.requests.slice(0, 3).map((solicitud) => (
                <li key={solicitud.id}>
                  {solicitud.business_name} ·{" "}
                  {es.spaceRequestForm.states[solicitud.status]}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/mis-solicitudes"
            className="text-sm font-semibold text-cuotly-green underline"
          >
            {t.openRequests}
          </Link>
        </Card>
      </div>

      {esPlataforma && platform ? (
        <Card title={es.globalContext.home.platformTitle}>
          <p className="mb-3 text-sm text-text-secondary">
            {es.globalContext.home.platformSubtitle}
          </p>
          {platformNeedsTwoFactor(platform) ? (
            <p className="mb-3 text-sm text-danger">
              {es.globalContext.home.platformNeedsTwoFactor}
            </p>
          ) : null}
          <Link
            href="/administracion"
            className="font-semibold text-cuotly-green underline"
          >
            {es.platformAdmin.nav.overview}
          </Link>
        </Card>
      ) : null}

      {home.failed.contexts ? (
        <ErrorState title={t.contextsFailed} description={t.contextsFailedReason} />
      ) : home.shape === "none" ? (
        platform?.isOwner ? (
          <CreateRestavorCard />
        ) : (
          <Card title={t.noneTitle}>
            <p className="mb-3 text-sm text-text-secondary">{t.noneReason}</p>
            <Link
              href="/solicitar-espacio"
              className="inline-flex items-center justify-center rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {t.requestSpace}
            </Link>
          </Card>
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {home.spaces.length > 0 ? (
            <Card title={t.spacesTitle}>
              <ul className="space-y-2">
                {home.spaces.map((espacio) => (
                  <li key={espacio.space_id}>
                    <Link
                      href={`/espacios/${espacio.space_slug ?? ""}`}
                      className="font-semibold text-cuotly-green underline"
                    >
                      {espacio.space_name}
                    </Link>
                    <span className="ml-2 text-sm text-text-secondary">
                      {espacio.role ? es.roles[espacio.role as keyof typeof es.roles] : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {/*
            RN-GLO-03 · "Mis paneles de restaurante" es un bloque de esta
            pantalla, y la barra de móvil lo nombra "Restaurantes" con un
            ancla (`GLOBAL_PANELS_ANCHOR`). La sección se pinta SIEMPRE,
            tenga o no paneles dentro: si solo existiera cuando hay alguno,
            el enlace de la barra no llevaría a ninguna parte justo para
            quien todavía no tiene ninguno. `contents` la deja fuera del
            reparto del espacio, así que no cambia nada de la maqueta.
          */}
          <section id="mis-paneles" className="contents">
          {home.restaurants.length > 0 ? (
            <Card title={t.restaurantsTitle}>
              <ul className="space-y-2">
                {home.restaurants.map((restaurante) => (
                  <li key={restaurante.establishment_id}>
                    <Link
                      href={`/espacios/${restaurante.space_slug ?? ""}/restaurantes/${restaurante.establishment_id}`}
                      className="font-semibold text-cuotly-green underline"
                    >
                      {restaurante.establishment_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          </section>
        </div>
      )}

      <p className="text-sm text-text-secondary">{t.requestsElsewhere}</p>
    </div>
  );
}
