import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShellRole } from "@/components/shell/navigation";
import { Button, Card, Field } from "@/components/ui";
import { HELP_TOPICS, type HelpTopic, helpAudienceFor } from "@/core/support";
import { es } from "@/i18n/es";
import type { Database } from "@/lib/supabase/database.types";
import { type HelpArticleHit, searchHelpArticles, supportIsOpenNow } from "@/services/support-gateway";

/**
 * El centro de ayuda (§133, RN-SOP-10/11): buscador y guías por rol. Es un
 * componente y no una página porque tiene dos puertas: la del equipo,
 * colgada del espacio, y la del restaurante, colgada de su restaurante
 * (`navigation.ts`: a un cliente no se le ofrece ninguna ruta del equipo).
 * Las dos enseñan lo mismo con `base` distinta.
 *
 * Quién puede abrir una incidencia lo dice `has_capability(…,
 * 'contact_cuotly')`, no el rol: el rol solo decide qué guías van primero.
 */
export async function HelpCenter({
  supabase,
  role,
  base,
  spaceId,
  consulta,
}: {
  supabase: SupabaseClient<Database>;
  role: ShellRole;
  base: string;
  spaceId: string | null;
  consulta: string;
}) {
  const audience = helpAudienceFor(role);
  const t = es.help;

  // Un restaurante no es miembro del espacio: `spaces` le devuelve nada, y
  // aquí no le hace falta —busca y lee guías igual—.
  let puedeAbrir = false;
  if (spaceId !== null) {
    const { data } = await supabase.rpc("has_capability", { p_space_id: spaceId, p_capability: "contact_cuotly" });
    puedeAbrir = data === true;
  }

  let resultados: readonly HelpArticleHit[] = [];
  let abierto: boolean | null = null;
  try {
    resultados = await searchHelpArticles(supabase, consulta, audience, 60);
    abierto = await supportIsOpenNow(supabase);
  } catch {
    resultados = [];
  }

  const porTema = (lista: readonly HelpArticleHit[]) => {
    const grupos = new Map<HelpTopic, HelpArticleHit[]>();
    for (const topic of HELP_TOPICS) grupos.set(topic, []);
    for (const a of lista) grupos.get(a.topic as HelpTopic)?.push(a);
    return [...grupos.entries()].filter(([, items]) => items.length > 0);
  };
  const mias = resultados.filter((a) => a.for_my_role);
  const otras = resultados.filter((a) => !a.for_my_role);

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <form action={base} method="get" className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <Field name="q" label={t.searchLabel} placeholder={t.searchPlaceholder} defaultValue={consulta} />
        </div>
        <Button type="submit">{t.searchSubmit}</Button>
      </form>

      {consulta !== "" && resultados.length === 0 ? (
        <Card title={t.noResultsTitle}>
          {puedeAbrir ? (
            <>
              <p className="mb-3 text-sm text-text-secondary">{t.noResultsCanOpen}</p>
              <Link
                href={`${base}/incidencias/nueva?q=${encodeURIComponent(consulta)}`}
                className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
              >
                {t.openFromSearch}
              </Link>
            </>
          ) : (
            <p className="text-sm text-text-secondary">
              {audience === "client" ? t.noResultsClient : t.noResultsCannotOpen(es.roles[role].toLowerCase())}
            </p>
          )}
        </Card>
      ) : null}

      {resultados.length > 0 ? (
        <>
          {consulta !== "" ? <h2 className="text-lg font-semibold text-primary-dark">{t.resultsTitle(consulta)}</h2> : null}
          {mias.length > 0 ? (
            <Card title={t.guidesTitle}>
              <Guias grupos={porTema(mias)} base={base} />
            </Card>
          ) : null}
          {otras.length > 0 ? (
            <Card title={t.otherGuidesTitle}>
              <Guias grupos={porTema(otras)} base={base} />
            </Card>
          ) : null}
        </>
      ) : null}

      <Card title={t.hoursTitle}>
        <p className="text-sm text-text">{t.hoursBody}</p>
        {abierto !== null ? (
          <p className="mt-2 text-sm font-semibold text-text">{abierto ? t.supportOpenNow : t.supportClosedNow}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/estado" className="text-cuotly-green underline">
            {t.statusLink}
          </Link>
          {puedeAbrir ? (
            <>
              <Link href={`${base}/incidencias`} className="text-cuotly-green underline">
                {t.incidentsLink}
              </Link>
              <Link href={`${base}/incidencias/nueva`} className="text-cuotly-green underline">
                {t.newIncidentLink}
              </Link>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function Guias({ grupos, base }: { grupos: readonly (readonly [HelpTopic, HelpArticleHit[]])[]; base: string }) {
  return (
    <div className="space-y-4">
      {grupos.map(([topic, items]) => (
        <section key={topic}>
          <h3 className="text-sm font-semibold text-text-secondary">{es.help.topics[topic]}</h3>
          <ul className="mt-1 space-y-2">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={`${base}/guias/${a.slug}`} className="font-semibold text-primary-dark underline">
                  {a.title}
                </Link>
                <p className="text-sm text-text-secondary">{a.excerpt}…</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
