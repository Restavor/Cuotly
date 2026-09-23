/**
 * G06 · la Ayuda global (RN-GLO-07): los temas con artículos, el tema
 * elegido y la lista de preguntas frecuentes.
 *
 * Los artículos llegan de `search_help_articles()` (los mismos de RN-SOP,
 * ordenados por relevancia y marcados con `for_my_role`); aquí solo se
 * cuentan y se ordenan. Nada de esto decide quién puede abrir una
 * incidencia: eso lo pregunta la pantalla al servidor, espacio a espacio.
 */
import { HELP_TOPICS, type HelpTopic } from "./support";

export type HelpParams = {
  readonly q: string;
  readonly topic: HelpTopic | null;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function uno(valor: string | string[] | undefined): string {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (v ?? "").trim();
}

export function readHelpParams(params: Params): HelpParams {
  const tema = uno(params.tema);
  return {
    q: uno(params.q),
    topic: (HELP_TOPICS as readonly string[]).includes(tema) ? (tema as HelpTopic) : null,
  };
}

type Hit = { readonly topic: string; readonly for_my_role: boolean };

/** Los temas que tienen algún artículo, en el orden del catálogo, con cuántos. */
export function helpTopicCounts(hits: readonly Hit[]): { topic: HelpTopic; count: number }[] {
  return HELP_TOPICS.map((topic) => ({ topic, count: hits.filter((h) => h.topic === topic).length })).filter(
    (t) => t.count > 0,
  );
}

/**
 * Las preguntas frecuentes: las del tema elegido, o todas si no hay tema;
 * primero las del rol de quien mira y luego las demás, cada grupo en el
 * orden de relevancia en que llegan. Sin búsqueda ni tema, un máximo de
 * `limit`: la portada no es el catálogo entero.
 */
export function helpFaq<T extends Hit>(hits: readonly T[], params: HelpParams, limit = 6): T[] {
  const delTema = params.topic === null ? [...hits] : hits.filter((h) => h.topic === params.topic);
  const ordenadas = [...delTema.filter((h) => h.for_my_role), ...delTema.filter((h) => !h.for_my_role)];
  return params.q === "" && params.topic === null ? ordenadas.slice(0, limit) : ordenadas;
}
