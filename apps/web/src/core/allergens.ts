/**
 * `src/core/allergens.ts` — los catorce alérgenos y lo que hay que decidir
 * sobre ellos (§39, RN-ALE). Lógica de dominio pura: sin Supabase, sin
 * Next, sin React (CLAUDE.md).
 *
 * **La lista es cerrada y vive aquí una sola vez.** Son los catorce del
 * Reglamento UE 1169/2011, ni uno más ni uno menos: no se añade ninguno
 * desde la aplicación y el servidor rechaza cualquier código que no esté
 * aquí (RN-ALE-02). El servidor repite la lista porque tiene que validar
 * sin preguntarle al navegador, y `listas-compartidas.test.ts` compara las
 * dos y se pone rojo si discrepan.
 *
 * Los identificadores van en inglés, como todo lo demás del proyecto; el
 * nombre que se lee está en `src/i18n/es.ts` una sola vez (CA-21).
 */

/**
 * Anexo II del Reglamento UE 1169/2011, en el orden del reglamento.
 *
 * El orden importa y no es alfabético a propósito: es el del texto legal,
 * que es el que usan las cartas y las tablas de alérgenos que la gente ya
 * ha visto. Ordenarlos alfabéticamente en español los dejaría en un orden
 * que no coincide con ninguna carta impresa.
 */
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export function isAllergen(value: string): value is Allergen {
  return (ALLERGENS as readonly string[]).includes(value);
}

/** Las tres listas de platos que se declaran. La bebida va aparte. */
export const ALLERGEN_COURSES = ["starters", "mains", "desserts"] as const;
export type AllergenCourse = (typeof ALLERGEN_COURSES)[number];

/**
 * Lo declarado de UN plato.
 *
 * Que este objeto EXISTA es lo que significa "declarado" (RN-ALE-06). Un
 * plato con `allergens: []` y sin nota es un plato del que alguien ha dicho
 * que no lleva ninguno de los catorce; un plato sin objeto es un plato del
 * que nadie ha dicho nada. No son lo mismo y no se pintan igual.
 */
export interface DishAllergens {
  readonly allergens: readonly Allergen[];
  readonly note: string | null;
}

/**
 * Lo declarado de una versión entera, plato a plato y por posición dentro
 * de su categoría (RN-ALE-09).
 *
 * Por posición y no por nombre del plato porque dos platos pueden llamarse
 * igual —"Ensalada" de primero y de segundo— y porque una versión de menú
 * es inmutable: se escribe entera de una vez y no se edita nunca
 * (RN-MEN-03), así que las posiciones no pueden moverse por debajo.
 *
 * `null` en una posición es un plato sin declarar. La lista tiene siempre
 * tantas entradas como platos: el servidor lo comprueba y rechaza la
 * versión si no cuadran, porque una correspondencia torcida no la notaría
 * nadie hasta que alguien leyera el menú.
 */
export interface MenuAllergens {
  readonly starters: readonly (DishAllergens | null)[];
  readonly mains: readonly (DishAllergens | null)[];
  readonly desserts: readonly (DishAllergens | null)[];
  readonly drink: DishAllergens | null;
}

export const EMPTY_MENU_ALLERGENS: MenuAllergens = {
  starters: [],
  mains: [],
  desserts: [],
  drink: null,
};

/**
 * Cuántos platos de la versión no tienen declaración (RN-ALE-05).
 *
 * Se cuenta para avisar, no para bloquear: la publicación sale igual. Lo
 * que el aviso necesita es un número honesto, y "honesto" aquí es contar
 * los huecos y no los que declararon "ninguno".
 *
 * La bebida cuenta como un plato más cuando la hay: un vino con sulfitos es
 * exactamente el caso que esta pantalla existe para no esconder.
 */
export function undeclaredCount(
  content: { readonly starters: readonly string[]; readonly mains: readonly string[]; readonly desserts: readonly string[]; readonly drink: string | null },
  declared: MenuAllergens,
): number {
  let sin = 0;

  for (const course of ALLERGEN_COURSES) {
    const platos = content[course];
    const lista = declared[course];
    for (let i = 0; i < platos.length; i += 1) {
      if ((lista[i] ?? null) === null) sin += 1;
    }
  }

  if ((content.drink ?? "").trim() !== "" && declared.drink === null) sin += 1;

  return sin;
}

/**
 * RN-ALE-08 · el resumen del menú entero, DERIVADO de los platos.
 *
 * Nunca se escribe a mano: un segundo sitio donde decir lo mismo acaba
 * diciendo otra cosa. Sale en el orden del reglamento, no en el orden en
 * que aparecieron, para que dos menús con los mismos alérgenos se lean
 * igual.
 */
export function menuAllergenSummary(declared: MenuAllergens): readonly Allergen[] {
  const encontrados = new Set<Allergen>();

  for (const course of ALLERGEN_COURSES) {
    for (const plato of declared[course]) {
      for (const alergeno of plato?.allergens ?? []) encontrados.add(alergeno);
    }
  }
  for (const alergeno of declared.drink?.allergens ?? []) encontrados.add(alergeno);

  return ALLERGENS.filter((alergeno) => encontrados.has(alergeno));
}

/**
 * Lo que la pantalla necesita saber de un plato para pintarlo, en una sola
 * pregunta y con los tres casos separados (RN-ALE-06).
 */
export type DishAllergenState =
  | { readonly kind: "undeclared" }
  | { readonly kind: "none" }
  | { readonly kind: "some"; readonly allergens: readonly Allergen[]; readonly note: string | null };

export function dishAllergenState(dish: DishAllergens | null | undefined): DishAllergenState {
  if (dish === null || dish === undefined) return { kind: "undeclared" };
  if (dish.allergens.length === 0 && (dish.note ?? "").trim() === "") return { kind: "none" };
  return { kind: "some", allergens: dish.allergens, note: dish.note };
}

/**
 * Normaliza lo que llega de un formulario antes de mandarlo al servidor:
 * ordena por el reglamento, quita repetidos y tira lo que no sea uno de los
 * catorce.
 *
 * Tirar lo desconocido en vez de fallar es deliberado **aquí y solo aquí**:
 * esto es la comodidad del navegador. Quien decide de verdad es el
 * servidor, que rechaza la versión entera si le llega un código que no
 * conoce — si esta función "arreglara" silenciosamente un error del
 * servidor, lo estaría escondiendo.
 */
export function normalizeDishAllergens(
  codes: readonly string[],
  note: string | null,
): DishAllergens {
  const validos = new Set(codes.filter(isAllergen));
  const limpia = (note ?? "").trim();
  return {
    allergens: ALLERGENS.filter((alergeno) => validos.has(alergeno)),
    note: limpia === "" ? null : limpia,
  };
}

/**
 * Ajusta la lista de declaraciones al número de platos que hay ahora.
 *
 * El editor escribe los platos como líneas de texto, así que la lista
 * crece y mengua mientras alguien escribe. Las declaraciones se conservan
 * **por posición**, que es la misma atadura de RN-ALE-09: la primera sigue
 * siendo del primer plato.
 *
 * Y de ahí sale el riesgo que la pantalla tiene que enseñar, no esconder:
 * si alguien **reordena** las líneas, las declaraciones NO se mueven con
 * ellas. No hay manera de que se muevan —un plato es una línea de texto, no
 * tiene identidad— así que lo que hace la pantalla es enseñar siempre el
 * nombre del plato al lado de su declaración: quien mueva "Merluza" al
 * primer puesto verá que ahora pone "leche" debajo, y lo arreglará. Una
 * declaración escondida detrás de un número de posición no la habría visto
 * nadie.
 */
export function resizeDeclarations(
  previous: readonly (DishAllergens | null)[],
  count: number,
): readonly (DishAllergens | null)[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => previous[i] ?? null);
}

/**
 * Las líneas de texto de un cuadro del editor convertidas en platos: sin
 * espacios de sobra y sin líneas en blanco.
 *
 * Devuelve los NOMBRES y no solo cuántos son porque la pantalla necesita
 * enseñar cada declaración al lado de su plato (ver `resizeDeclarations`).
 *
 * Es la MISMA cuenta que hace `linesToItems()` en `daily-menu.ts` al
 * guardar, y tiene que serlo: si la pantalla contara siete platos y el
 * servidor recibiera seis, la declaración no cuadraría y el guardado
 * fallaría con un mensaje que nadie entendería.
 */
export function dishNames(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
}

/**
 * Lo que vuelve de la base convertido en `MenuAllergens`, o `null` si la
 * versión es anterior a §39.
 *
 * Es falso-cerrado y silencioso a la vez, que suena a contradicción y no lo
 * es: lo que no se entiende se descarta —una declaración rota es "sin
 * declarar", que es un estado legítimo (RN-ALE-05)— y nunca revienta la
 * pantalla. La validación de verdad está en el servidor, que rechaza al
 * ESCRIBIR; para entonces, lo que hay guardado ya cuadra.
 */
export function parseMenuAllergens(raw: unknown): MenuAllergens | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const objeto = raw as Record<string, unknown>;

  const plato = (valor: unknown): DishAllergens | null => {
    if (valor === null || valor === undefined || typeof valor !== "object") return null;
    const d = valor as Record<string, unknown>;
    const codigos = Array.isArray(d.allergens) ? d.allergens.filter((c): c is string => typeof c === "string") : [];
    const nota = typeof d.note === "string" ? d.note : null;
    return normalizeDishAllergens(codigos, nota);
  };

  const lista = (valor: unknown): readonly (DishAllergens | null)[] =>
    Array.isArray(valor) ? valor.map(plato) : [];

  return {
    starters: lista(objeto.starters),
    mains: lista(objeto.mains),
    desserts: lista(objeto.desserts),
    drink: plato(objeto.drink),
  };
}
