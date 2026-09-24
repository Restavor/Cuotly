import Link from "next/link";

import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { helpFaq, helpTopicCounts, type HelpParams } from "@/core/global-help";
import type { HelpTopic } from "@/core/support";
import { es } from "@/i18n/es";
import type { HelpArticleHit } from "@/services/support-gateway";

const t = es.globalContext.help;

const ICONO: Record<HelpTopic, IconName> = {
  first_steps: "home",
  requests: "request",
  jobs: "job",
  menus: "dailyMenu",
  payments: "finance",
  users: "team",
  integrations: "database",
  security: "lock",
};

/** Dónde abrir una consulta: los espacios en los que quien mira puede. */
export type HelpContact =
  | { readonly kind: "spaces"; readonly spaces: readonly { slug: string; name: string }[] }
  | { readonly kind: "cannot" }
  | { readonly kind: "client" };

/**
 * G06 · lo que se pinta de la Ayuda global, con los datos ya leídos. El
 * porqué de cada bloque está en `page.tsx`.
 */
export function HelpView({
  params,
  hits,
  failed,
  contact,
  supportOpen,
}: {
  params: HelpParams;
  hits: readonly HelpArticleHit[];
  /** Si el buscador no contestó: se dice, no se enseña una ayuda vacía. */
  failed: boolean;
  contact: HelpContact;
  supportOpen: boolean | null;
}) {
  const temas = helpTopicCounts(hits);
  const faq = helpFaq(hits, params);
  const tituloFaq =
    params.q !== ""
      ? t.faqResults(params.q)
      : params.topic !== null
        ? t.faqTopicTitle(es.help.topics[params.topic])
        : t.faqTitle;

  return (
    <div className="space-y-4">
      <PageHeader title={t.title} subtitle={t.subtitle} />

      <form action="/ayuda" method="get" role="search" className="relative">
        {params.topic ? <input type="hidden" name="tema" value={params.topic} /> : null}
        <label htmlFor="buscar-ayuda" className="sr-only">
          {t.searchLabel}
        </label>
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
        />
        <input
          id="buscar-ayuda"
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-card border border-border bg-surface py-3 pl-12 pr-4 text-[15px] text-text shadow-sm outline-none focus:border-cuotly-green focus:ring-3 focus:ring-cuotly-green/15"
        />
      </form>

      {temas.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {temas.map(({ topic, count }) => {
            const activo = params.topic === topic;
            return (
              <Card key={topic} className={`p-4! ${activo ? "border-cuotly-green!" : ""}`}>
                <div className="flex gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cuotly-green/15 text-primary-dark">
                    <Icon name={ICONO[topic]} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-text">{es.help.topics[topic]}</h2>
                    <p className="text-xs text-text-secondary">{t.topicHints[topic]}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">{t.articleCount(count)}</p>
                    <Link
                      href={activo ? "/ayuda" : `/ayuda?tema=${topic}`}
                      aria-current={activo ? "true" : undefined}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-cuotly-green"
                    >
                      {activo ? t.allTopics : t.seeArticles}
                      <Icon name="chevronRight" className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-3 text-base font-semibold text-primary-dark">{tituloFaq}</h2>
          {failed ? (
            <EmptyState title={t.failedTitle} description={t.failedReason} />
          ) : faq.length === 0 ? (
            params.q !== "" ? (
              <EmptyState title={t.faqEmptyTitle} description={t.faqEmptyReason} />
            ) : (
              <EmptyState title={t.faqNone} />
            )
          ) : (
            <ul className="space-y-2">
              {faq.map((a, i) => (
                <li key={a.id}>
                  <details
                    open={i === 0}
                    className="group rounded-[10px] border border-border open:border-cuotly-green/30 open:bg-cuotly-green/5"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full border-2 border-cuotly-green group-open:bg-cuotly-green"
                      />
                      <span className="flex-1 text-sm font-semibold text-text">{a.title}</span>
                      <Icon
                        name="chevronDown"
                        className="h-4 w-4 shrink-0 text-text-secondary transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="px-4 pb-3 pl-10">
                      <p className="text-sm text-text-secondary">{a.excerpt}…</p>
                      <Link
                        href={`/ayuda/guias/${a.slug}`}
                        className="mt-1 inline-block text-sm font-semibold text-cuotly-green underline"
                      >
                        {t.readGuide}
                      </Link>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-primary-dark">{t.contactTitle}</h2>
          <p className="mb-4 text-sm text-text-secondary">{t.contactSubtitle}</p>
          {contact.kind === "spaces" ? (
            <>
              <p className="mb-3 text-sm text-text">{t.contactFromSpace}</p>
              <div className="flex flex-col gap-2">
                {contact.spaces.map((s) => (
                  <ButtonLink key={s.slug} href={`/espacios/${s.slug}/ayuda/incidencias/nueva`}>
                    {t.contactOpenIn(s.name)}
                  </ButtonLink>
                ))}
              </div>
            </>
          ) : contact.kind === "cannot" ? (
            <p className="text-sm text-text">{t.contactCannot}</p>
          ) : (
            <>
              <p className="text-sm text-text">{t.contactClient}</p>
              <ButtonLink href="/mensajes?lado=restaurantes" variant="secondary" className="mt-3">
                {t.contactClientLink}
              </ButtonLink>
            </>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm font-semibold text-text">{es.help.hoursTitle}</p>
            <p className="mt-1 text-xs text-text-secondary">{es.help.hoursBody}</p>
            {supportOpen !== null ? (
              <p className="mt-2 text-sm font-medium text-text">
                {supportOpen ? es.help.supportOpenNow : es.help.supportClosedNow}
              </p>
            ) : null}
            <Link href="/estado" className="mt-2 inline-block text-sm text-cuotly-green underline">
              {es.help.statusLink}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
