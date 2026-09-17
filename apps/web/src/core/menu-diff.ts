/**
 * `src/core/menu-diff.ts` — qué cambió entre dos versiones de un menú
 * (R18, y el aviso de edición simultánea de A17). Lógica de dominio pura:
 * sin Supabase, sin Next, sin React (CLAUDE.md).
 *
 * Existe porque comparar dos menús **no es comparar dos textos**. Un menú
 * es cuatro listas y tres campos sueltos, y lo que una persona necesita
 * leer es "han quitado la crema de calabaza y han subido el precio", no un
 * bloque de rojo y verde. Eso hay que calcularlo, y se calcula aquí una
 * sola vez para las dos pantallas que lo piden: la comparación de
 * versiones (R18) y el aviso de que alguien guardó mientras escribías
 * (A17), que enseña exactamente la misma comparación.
 *
 * Dos decisiones que se leen mejor aquí que en el código:
 *
 *   · **Los platos se comparan como conjunto, no por posición.** Mover un
 *     plato de primero a segundo de la lista no es un cambio del menú: es
 *     el mismo menú ordenado de otra manera, y marcarlo como "quitado y
 *     añadido" haría ruido en la única pantalla que existe para leer la
 *     señal. El orden sí se conserva al pintarlos, porque el menú se lee
 *     en su orden.
 *   · **Comparar ignora espacios de sobra y mayúsculas.** "Crema de
 *     calabaza" y "crema de calabaza " son el mismo plato escrito dos
 *     veces, y decir que uno sustituye al otro sería un cambio inventado.
 *     Lo que se ENSEÑA es el texto tal cual se escribió.
 */

import {
  dishAllergenState,
  type Allergen,
  type DishAllergens,
  type MenuAllergens,
} from "./allergens";

/** Lo que una versión de menú tiene, en lo que a comparar importa. */
export interface MenuVersionContent {
  readonly starters: readonly string[];
  readonly mains: readonly string[];
  readonly desserts: readonly string[];
  readonly drink: string | null;
  readonly priceCents: number | null;
  readonly note: string | null;
  /** §39 · lo declarado, o `null` en una versión anterior a los alérgenos. */
  readonly allergens?: MenuAllergens | null;
}

/** Las tres listas de platos. El orden es el que se lee en el menú. */
export const MENU_COURSES = ["starters", "mains", "desserts"] as const;
export type MenuCourse = (typeof MENU_COURSES)[number];

export interface CourseDiff {
  readonly course: MenuCourse;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** `true` cuando los platos son los mismos y solo cambió el orden. */
  readonly reordered: boolean;
}

export interface FieldDiff<T> {
  readonly before: T;
  readonly after: T;
}

/**
 * RN-ALE-07 · un alérgeno que cambia entre dos versiones.
 *
 * Se dice con el NOMBRE del plato y no con su posición: "en Merluza se ha
 * quitado leche" es lo que alguien quiere poder rastrear después, y
 * "posición 1 de segundos" no lo es. Cuando el plato cambió de nombre a la
 * vez, se dan los dos.
 */
export interface DishAllergenDiff {
  readonly course: MenuCourse | "drink";
  readonly dishBefore: string | null;
  readonly dishAfter: string | null;
  readonly added: readonly Allergen[];
  readonly removed: readonly Allergen[];
  readonly noteChanged: boolean;
  /** Pasó de no tener declaración a tenerla, o al revés (RN-ALE-06). */
  readonly declarationChanged: "declared" | "undeclared" | null;
}

export interface MenuDiff {
  readonly courses: readonly CourseDiff[];
  readonly allergens: readonly DishAllergenDiff[];
  readonly drink: FieldDiff<string | null> | null;
  readonly price: FieldDiff<number | null> | null;
  readonly note: FieldDiff<string | null> | null;
  /** `true` cuando las dos versiones dicen lo mismo. */
  readonly identical: boolean;
}

/**
 * RN-ALE-07 · qué cambió en la declaración de alérgenos, plato a plato.
 *
 * Se compara **por posición**, que es como está guardada (RN-ALE-09), y se
 * cuenta **por nombre**, que es como se lee. Un menú sin declaración en
 * ninguna de las dos versiones no aporta nada; uno que la gana o la pierde
 * entera aporta un cambio por plato, que es exactamente lo que pasó.
 */
function diffAllergens(
  antes: MenuVersionContent,
  despues: MenuVersionContent,
): readonly DishAllergenDiff[] {
  const a = antes.allergens ?? null;
  const b = despues.allergens ?? null;
  if (a === null && b === null) return [];

  const cambios: DishAllergenDiff[] = [];

  const comparar = (
    course: MenuCourse | "drink",
    dishBefore: string | null,
    dishAfter: string | null,
    dAntes: DishAllergens | null,
    dDespues: DishAllergens | null,
  ) => {
    const estadoAntes = dishAllergenState(dAntes);
    const estadoDespues = dishAllergenState(dDespues);

    const listaAntes = new Set(dAntes?.allergens ?? []);
    const listaDespues = new Set(dDespues?.allergens ?? []);
    const added = [...listaDespues].filter((x) => !listaAntes.has(x));
    const removed = [...listaAntes].filter((x) => !listaDespues.has(x));
    const noteChanged = (dAntes?.note ?? "") !== (dDespues?.note ?? "");

    const declarationChanged =
      estadoAntes.kind === "undeclared" && estadoDespues.kind !== "undeclared"
        ? ("declared" as const)
        : estadoAntes.kind !== "undeclared" && estadoDespues.kind === "undeclared"
          ? ("undeclared" as const)
          : null;

    if (added.length === 0 && removed.length === 0 && !noteChanged && declarationChanged === null) {
      return;
    }

    cambios.push({ course, dishBefore, dishAfter, added, removed, noteChanged, declarationChanged });
  };

  for (const course of MENU_COURSES) {
    const platosAntes = antes[course];
    const platosDespues = despues[course];
    const total = Math.max(platosAntes.length, platosDespues.length);
    for (let i = 0; i < total; i += 1) {
      comparar(
        course,
        platosAntes[i] ?? null,
        platosDespues[i] ?? null,
        a?.[course][i] ?? null,
        b?.[course][i] ?? null,
      );
    }
  }

  comparar("drink", antes.drink, despues.drink, a?.drink ?? null, b?.drink ?? null);

  return cambios;
}

/** La clave con la que se compara: sin espacios de sobra y sin mayúsculas. */
function clave(plato: string): string {
  return plato.trim().toLocaleLowerCase("es");
}

function mismoTexto(a: string | null, b: string | null): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function diffDeCurso(
  course: MenuCourse,
  antes: readonly string[],
  despues: readonly string[],
): CourseDiff {
  const clavesAntes = antes.map(clave);
  const clavesDespues = despues.map(clave);
  const setAntes = new Set(clavesAntes);
  const setDespues = new Set(clavesDespues);

  const added = despues.filter((plato) => !setAntes.has(clave(plato)));
  const removed = antes.filter((plato) => !setDespues.has(clave(plato)));

  // Mismos platos y distinto orden. Se dice, pero aparte: no es lo mismo
  // cambiar la carta que cambiar en qué orden se lee.
  const reordered =
    added.length === 0 &&
    removed.length === 0 &&
    clavesAntes.length === clavesDespues.length &&
    clavesAntes.some((valor, i) => valor !== clavesDespues[i]);

  return { course, added, removed, reordered };
}

export function diffMenuVersions(
  antes: MenuVersionContent,
  despues: MenuVersionContent,
): MenuDiff {
  const courses = [
    diffDeCurso("starters", antes.starters, despues.starters),
    diffDeCurso("mains", antes.mains, despues.mains),
    diffDeCurso("desserts", antes.desserts, despues.desserts),
  ];

  const drink = mismoTexto(antes.drink, despues.drink)
    ? null
    : { before: antes.drink, after: despues.drink };

  const price =
    antes.priceCents === despues.priceCents
      ? null
      : { before: antes.priceCents, after: despues.priceCents };

  const note = mismoTexto(antes.note, despues.note)
    ? null
    : { before: antes.note, after: despues.note };

  const allergens = diffAllergens(antes, despues);

  const identical =
    drink === null &&
    price === null &&
    note === null &&
    allergens.length === 0 &&
    courses.every((c) => c.added.length === 0 && c.removed.length === 0 && !c.reordered);

  return { courses, allergens, drink, price, note, identical };
}

/**
 * Cuántos cambios tiene la comparación. Sirve para el titular de A17 —"han
 * cambiado 3 cosas"— y para no pintar una lista de cambios vacía.
 *
 * Un reordenamiento cuenta como **uno**, no como tantos platos tenga: es un
 * solo hecho que contar.
 */
export function countMenuChanges(diff: MenuDiff): number {
  const enPlatos = diff.courses.reduce(
    (total, c) => total + c.added.length + c.removed.length + (c.reordered ? 1 : 0),
    0,
  );
  // Un plato con la declaración cambiada cuenta como UNO, aunque le hayan
  // movido tres casillas: es un solo hecho que contar, igual que el
  // reordenamiento.
  return (
    enPlatos +
    diff.allergens.length +
    (diff.drink ? 1 : 0) +
    (diff.price ? 1 : 0) +
    (diff.note ? 1 : 0)
  );
}

/**
 * A17 · el mensaje del servidor cuando alguien se adelantó lleva dentro el
 * número de versión real, para que la pantalla pueda ofrecer la comparación
 * sin volver a preguntar. Esto lo saca.
 *
 * Devuelve `null` cuando el error es cualquier otra cosa: no se interpreta
 * como conflicto lo que no lo es.
 */
export function parseSimultaneousEditVersion(message: string): number | null {
  if (!message.includes("EDICION_SIMULTANEA")) return null;
  const encontrado = /versión (\d+)/.exec(message);
  return encontrado ? Number(encontrado[1]) : null;
}
