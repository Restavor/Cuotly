import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AgentsCard,
  AgentsOfferCard,
  RejectedCard,
  RequestedCard,
  WebCard,
  WebCardEmpty,
} from "@/components/app/ProductCards";
import { ButtonLink, Card, ErrorState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { homeBehavior, summarizeProducts, type ProductRow } from "@/core/app/products";
import { isPlatformPerson } from "@/core/platform-admin";
import { totalUnread } from "@/core/global-home";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myProducts } from "@/services/app-gateway";
import { myConversations } from "@/services/global-gateway";
import { myPlatformAccess } from "@/services/platform-gateway";

import { AttentionBoard } from "./AttentionBoard";
import { loadGlobalHome } from "./global-load";

/**
 * El Inicio de Restavor app, la puerta común (PRD de agents §4; decisión 88;
 * `diseno/final/AppInicio`, `AppInicioSoloWeb`, `AppInicioEstados`).
 *
 * `/` ya no es el Inicio global de Restavor web —ese es ahora `/web`, sin otros
 * cambios—: reparte entre los productos de quien entra. Qué productos tiene lo
 * calcula el servidor con `my_products()` (RN-APP-01) y cuándo se enseña esta
 * pantalla y cuándo se salta, `homeBehavior()` (RN-APP-02): con un único
 * producto y nada que contratar se entra directo en él.
 *
 * Nada de lo que se enseña es de relleno: lo de Restavor web llega de las
 * mismas lecturas que el Inicio de Restavor web, y lo de Restavor agents que
 * todavía no existe (reservas de hoy, llamadas, saldo) se dice con su motivo.
 */
export const dynamic = "force-dynamic";

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = es.app.home;
  const [rows, platform] = await Promise.all([
    myProducts(supabase).catch(() => null),
    myPlatformAccess(supabase).catch(() => null),
  ]);

  // Sin saber qué productos tiene no se decide nada por ella: se dice, y se le
  // deja una salida a Restavor web, que es donde estaba antes de esta pantalla.
  if (rows === null) {
    return (
      <div className="space-y-6">
        <ErrorState title={t.failedTitle} description={t.failedReason} />
        <ButtonLink href="/web" variant="secondary">
          {t.web.enter}
        </ButtonLink>
      </div>
    );
  }

  const summary = summarizeProducts(rows);
  const isPlatform = platform !== null && isPlatformPerson(platform);
  const decision = homeBehavior(summary, { isPlatform, isPlatformOwner: platform?.isOwner === true });
  if (decision.kind === "redirect") redirect(decision.to);

  const showWeb = summary.hasWeb || isPlatform;
  const [home, conversations, perfil] = await Promise.all([
    showWeb ? loadGlobalHome(supabase, user.id).catch(() => null) : Promise.resolve(null),
    showWeb ? Promise.resolve(undefined) : myConversations(supabase).catch(() => null),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  const nombre = (perfil.data?.full_name ?? "").trim().split(" ")[0] ?? "";

  // Una solicitud por restaurante (la última, que es la que devuelve el servidor).
  const requested = summary.requests.filter((r) => r.detail === "requested");
  const rejected = summary.requests.filter((r) => r.detail === "rejected");
  const rejectedIds = new Set(rejected.map((r) => r.establishmentId));
  const offers = summary.offers.flatMap((row) =>
    row.establishmentId === null
      ? []
      : [{ establishmentId: row.establishmentId, name: row.establishmentName ?? "" }],
  );
  const freeOffers = offers.filter((offer) => !rejectedIds.has(offer.establishmentId));

  const hasAnyProduct = showWeb || summary.hasAgents;
  const subtitle = hasAnyProduct
    ? t.subtitle
    : requested.length > 0
      ? t.subtitleRequested
      : rejected.length > 0
        ? t.subtitleRejected
        : t.subtitleNothing;
  const footer = hasAnyProduct
    ? null
    : requested.length > 0
      ? t.footerRequested
      : rejected.length > 0
        ? t.footerRejected
        : t.footerNothing;

  const attention = home?.attention ?? [];
  const attentionKnown = home !== null && !home.failed.attention;
  const contexts = [...new Set(attention.map((i) => i.contextName))].filter((n) => n !== "");

  const unread = home !== null ? home.unread : conversations ? totalUnread(conversations) : null;
  const unreadFailed = home !== null ? home.failed.conversations : conversations === null;

  const restaurantCount =
    home === null || home.failed.contexts
      ? null
      : home.restaurants.length +
        [...home.restaurantCount.values()].reduce((suma, n) => suma + n, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t.greeting(nombre)}>
        <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
      </PageHeader>

      {attention.length > 0 ? (
        <Card title={t.attentionTitle} tone="danger">
          <AttentionBoard items={attention} contexts={contexts} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {showWeb ? (
          <WebCard
            attentionCount={attentionKnown ? attention.length : null}
            restaurantCount={restaurantCount}
          />
        ) : (
          <WebCardEmpty />
        )}

        <div className="flex min-w-0 flex-col gap-5">
          {summary.agentsRows.length > 0 ? <AgentsCard rows={summary.agentsRows} /> : null}
          {requested.map((row: ProductRow) => (
            <RequestedCard key={row.establishmentId} row={row} />
          ))}
          {rejected.map((row) => (
            <RejectedCard
              key={row.establishmentId}
              row={row}
              offer={offers.find((offer) => offer.establishmentId === row.establishmentId) ?? null}
            />
          ))}
          {freeOffers.length > 0 ? <AgentsOfferCard offers={freeOffers} /> : null}
        </div>
      </div>

      <Card className="max-w-[560px]">
        <div className="flex items-center gap-3.5">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-surface text-primary-dark">
            <Icon name="messages" className="h-5 w-5" />
            {unread !== null && unread > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-surface">
                {unread}
              </span>
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-primary-dark">{t.unread.title}</h2>
            <p className="text-sm text-text-secondary">
              {unreadFailed || unread === null
                ? t.unread.failed
                : unread === 0
                  ? t.unread.none
                  : t.unread.count(unread)}
            </p>
          </div>
          <ButtonLink href="/mensajes" variant="secondary" className="shrink-0">
            {t.unread.view}
          </ButtonLink>
        </div>
      </Card>

      <p className="text-sm text-text-secondary">{footer ?? t.footerMore}</p>

      {isPlatform ? (
        <p className="text-sm">
          <Link href="/administracion" className="font-medium text-cuotly-green hover:underline">
            {es.platformAdmin.nav.overview}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
