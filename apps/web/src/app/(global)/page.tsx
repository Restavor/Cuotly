import Link from "next/link";

import { redirect } from "next/navigation";

import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, StatusBadge } from "@/components/ui";
import { fechaCorta } from "@/i18n/dates";
import type { SpaceRequestState } from "@/core/space-requests";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { CreateRestavorCard } from "@/components/CreateRestavorCard";
import { isPlatformPerson, platformNeedsTwoFactor } from "@/core/platform-admin";
import { myPlatformAccess } from "@/services/platform-gateway";

import { Icon } from "@/components/ui/Icon";

import { loadGlobalHome } from "./global-load";
import { AttentionBoard } from "./AttentionBoard";
import { InicioBuscador } from "./InicioBuscador";

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
    loadGlobalHome(supabase, user.id),
    myPlatformAccess(supabase).catch(() => null),
  ]);
  const esPlataforma = platform !== null && isPlatformPerson(platform);
  const t = es.globalContext.home;

  /*
    El saludo del diseño lleva el nombre de quien entra. Si el perfil no
    tiene nombre, se saluda sin él: escribir uno sacado del correo sería
    llamar "Info" a Bosco.
  */
  const { data: perfil } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const nombre = (perfil?.full_name ?? "").trim().split(" ")[0] ?? "";

  const contextos = [...new Set(home.attention.map((i) => i.contextName))].filter(
    (nombre) => nombre !== "",
  );

  return (
    <div className="space-y-6">
      {/* Página 1 del diseño definitivo móvil · el buscador ancho. En
          escritorio ya está en la cabecera del armazón (G01), así que se
          esconde: dos cajas que buscan lo mismo en la misma pantalla. */}
      <div className="lg:hidden">
        <InicioBuscador />
      </div>

      {/*
        G01 · el título, el saludo con el nombre de quien entra y, a la
        derecha, la acción principal. El destino del botón NO es crear: es
        **pedir** un espacio (RN-PLA), y por eso conserva su texto. Un botón
        que dijera "crear" y abriera una solicitud sería prometer algo que
        la regla no da. Para el Propietario de Cuotly no se pinta: él tiene
        su propia tarjeta más abajo, que sí crea.
      */}
      <PageHeader
        title={t.title}
        actions={
          platform?.isOwner ? null : (
            <ButtonLink href="/solicitar-espacio" icon="plus">
              {t.requestSpace}
            </ButtonLink>
          )
        }
      >
        <p className="mt-1 text-lg font-bold text-text">{t.greeting(nombre)}</p>
        <p className="text-sm text-text-secondary">{t.chooseContext}</p>
      </PageHeader>

      <Card
        title={t.attentionTitle}
        tone={home.attention.length > 0 ? "danger" : undefined}
        subtitle={
          home.attention.length > 0 ? t.attentionCount(home.attention.length) : undefined
        }
      >
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
          <ButtonLink href="/administracion" variant="outline" trailingIcon="chevronRight">
            {es.platformAdmin.nav.overview}
          </ButtonLink>
        </Card>
      ) : null}

      {/*
        G01 · "Mis espacios de mantenimiento" y "Mis paneles de restaurante",
        uno al lado del otro, cada uno con sus tarjetas en dos columnas:
        icono o foto, nombre, rol, cuántos restaurantes, y el botón de
        entrar a ancho completo.
      */}
      {home.failed.contexts ? (
        <ErrorState title={t.contextsFailed} description={t.contextsFailedReason} />
      ) : home.shape === "none" ? (
        platform?.isOwner ? (
          <CreateRestavorCard />
        ) : (
          <Card title={t.noneTitle}>
            <p className="mb-3 text-sm text-text-secondary">{t.noneReason}</p>
            <ButtonLink href="/solicitar-espacio" variant="secondary">
              {t.requestSpace}
            </ButtonLink>
          </Card>
        )
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {home.spaces.length > 0 ? (
            <Card className="min-w-0" title={t.spacesTitle}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {home.spaces.map((espacio) => {
                  const cuantos = home.restaurantCount.get(espacio.space_id);
                  return (
                    <li
                      key={espacio.space_id}
                      className="flex min-w-0 flex-col rounded-[14px] border border-border bg-surface p-3.5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green">
                          <Icon name="building" className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-text">
                            {espacio.space_name}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
                            <Icon name="person" className="h-3.5 w-3.5" />
                            {espacio.role
                              ? es.roles[espacio.role as keyof typeof es.roles]
                              : null}
                          </p>
                          {/* Un espacio que no se ha podido contar NO sale
                              con un cero: se dice que no se contó. */}
                          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                            <Icon name="building" className="h-3.5 w-3.5" />
                            {cuantos === undefined
                              ? t.spaceRestaurantsUnknown
                              : t.spaceRestaurants(cuantos)}
                          </p>
                        </div>
                      </div>
                      <ButtonLink
                        href={`/espacios/${espacio.space_slug ?? ""}`}
                        trailingIcon="chevronRight"
                        className="mt-3 w-full"
                      >
                        {t.enterSpace}
                      </ButtonLink>
                    </li>
                  );
                })}
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
              <Card className="min-w-0" title={t.restaurantsTitle}>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {home.restaurants.map((restaurante) => (
                    <li
                      key={restaurante.establishment_id}
                      className="flex min-w-0 flex-col rounded-[14px] border border-border bg-surface p-3.5"
                    >
                      <div className="flex items-start gap-3">
                        {/*
                          El diseño enseña aquí una foto del local. Esta
                          lista no la trae todavía, así que va el icono:
                          una foto de archivo sería un dato de adorno que
                          no es del restaurante (CLAUDE.md MUST NOT).
                        */}
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-soft-surface text-primary-dark">
                          <Icon name="building" className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-text">
                            {restaurante.establishment_name}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
                            <Icon name="person" className="h-3.5 w-3.5" />
                            {restaurante.role
                              ? es.roles[restaurante.role as keyof typeof es.roles]
                              : null}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {t.panelMaintenance(restaurante.space_name)}
                          </p>
                        </div>
                      </div>
                      <ButtonLink
                        href={`/espacios/${restaurante.space_slug ?? ""}/restaurantes/${restaurante.establishment_id}`}
                        variant="outline"
                        trailingIcon="chevronRight"
                        className="mt-3 w-full"
                      >
                        {t.enterPanel}
                      </ButtonLink>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </section>
        </div>
      )}

      {/*
        G01 · la fila de abajo: lo sin leer a la izquierda y las
        solicitudes de espacio a la derecha, cada una con su icono, su
        frase y su botón.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="min-w-0" title={t.unreadTitle}>
          {home.failed.conversations ? (
            <p className="text-sm text-text-secondary">
              {es.globalContext.messages.failedReason}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green">
                <Icon name="messages" className="h-5 w-5" />
                {home.unread > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-surface">
                    {home.unread}
                  </span>
                ) : null}
              </span>
              <p className="min-w-0 flex-1 text-sm text-text">
                {home.unread === 0 ? t.unreadNone : t.unreadCount(home.unread)}
              </p>
              <ButtonLink href="/mensajes" variant="secondary">
                {t.viewMessages}
              </ButtonLink>
            </div>
          )}
        </Card>

        <Card
          className="min-w-0"
          title={t.requestsTitle}
          action={
            home.requests.length > 0 ? (
              <Link
                href="/mis-solicitudes"
                className="text-sm font-medium text-cuotly-green hover:underline"
              >
                {t.openRequests}
              </Link>
            ) : undefined
          }
        >
          {home.requests.length === 0 ? (
            <p className="text-sm text-text-secondary">
              {es.globalContext.requests.emptyReason}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {home.requests.slice(0, 3).map((solicitud) => (
                <li
                  key={solicitud.id}
                  className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary-dark">
                    <Icon name="request" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-text">
                        {solicitud.business_name}
                      </span>
                      <StatusBadge tone={spaceRequestTone(solicitud.status)}>
                        {es.spaceRequestForm.states[solicitud.status]}
                      </StatusBadge>
                    </span>
                    <span className="block truncate text-xs text-text-secondary">
                      {t.requestSentOn(fechaCorta(solicitud.created_at))}
                    </span>
                  </span>
                  <ButtonLink href="/mis-solicitudes" variant="secondary" size="sm">
                    {t.viewRequest}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-sm text-text-secondary">{t.requestsElsewhere}</p>
    </div>
  );
}

/**
 * El tono de cada estado de una solicitud de espacio: lo que espera algo
 * del solicitante, en aviso; lo cerrado, en su color; lo demás, neutro.
 */
function spaceRequestTone(
  status: SpaceRequestState,
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "needs_information") return "warning";
  if (status === "in_review") return "info";
  return "neutral";
}
