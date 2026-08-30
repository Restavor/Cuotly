/**
 * `src/core/classification-rules.ts` — motor de reglas por palabras clave
 * al que Cuotly cae automáticamente cuando la IA falla, tarda demasiado o
 * no hay clave configurada (RN-CLS-02). Lógica de dominio pura: sin
 * Supabase, sin Next.js, sin React, sin llamada de red (CLAUDE.md).
 *
 * Las categorías y sus definiciones son las de PRD §10.1, literal — esto
 * no inventa umbrales nuevos, traduce esa lista a coincidencias de texto.
 * Como cualquier motor de reglas es un instrumento burdo comparado con la
 * IA, su salida es, igual que la de la IA, siempre una **propuesta**:
 * RN-CLS-03 exige validación humana antes de que el cliente vea nada, sin
 * excepción para el origen de la propuesta.
 */

export const CHANGE_CATEGORIES = ["small", "photo", "medium", "large"] as const;
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export function isChangeCategory(value: string): value is ChangeCategory {
  return (CHANGE_CATEGORIES as readonly string[]).includes(value);
}

export type RuleClassification = {
  readonly category: ChangeCategory;
  readonly matchedKeywords: readonly string[];
};

// PRD §10.1, una lista por categoría. Se comprueba primero "large" y se
// termina en "small": una solicitud que menciona a la vez un ajuste
// pequeño y una carta completa es, en conjunto, un cambio grande — el
// motor de reglas debe errar hacia la categoría más amplia porque
// siempre hay una persona validándola después (RN-CLS-03), y es peor
// proponer de menos que de más.
const KEYWORDS: Record<ChangeCategory, readonly string[]> = {
  large: [
    "carta completa",
    "menu completo",
    "menú completo",
    "contenido amplio",
    "menu especial",
    "menú especial",
    "seccion nueva",
    "sección nueva",
    "nueva sección",
    "nueva seccion",
    "eventos",
    "modificacion amplia de reseñas",
    "modificación amplia de reseñas",
  ],
  medium: [
    "seccion de la carta",
    "sección de la carta",
    "cinco platos",
    "5 platos",
    "unos platos",
    "platos nuevos",
    "texto largo",
    "historia",
    "horario completo",
    "reseña destacada",
    "resena destacada",
    "boton de delivery",
    "botón de delivery",
    "delivery",
  ],
  photo: ["foto", "fotografia", "fotografía", "imagen", "imágenes", "imagenes"],
  small: [
    "nombre",
    "frase",
    "precio",
    "titulo",
    "título",
    "contacto",
    "enlace",
    "un dia de horario",
    "un día de horario",
    "media de reseñas",
    "media de resenas",
    "numero de reseñas",
    "número de reseñas",
    "logo",
    "texto ya redactado",
  ],
};

/** Quita acentos y pasa a minúsculas, para comparar sin depender de cómo escriba el cliente. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * RN-CLS-02: clasificación por reglas, siempre determinista y sin red.
 * Si el texto no coincide con ninguna palabra clave, la categoría por
 * defecto es "small" — la mínima, con `matchedKeywords` vacío, para que
 * quien valide (RN-CLS-03) vea claramente que fue una propuesta sin
 * ninguna coincidencia, no una detectada con confianza.
 */
export function classifyByRules(text: string): RuleClassification {
  const normalized = normalize(text);

  for (const category of ["large", "medium", "photo", "small"] as const) {
    const matched = KEYWORDS[category].filter((keyword) => normalized.includes(normalize(keyword)));
    if (matched.length > 0) {
      return { category, matchedKeywords: matched };
    }
  }

  return { category: "small", matchedKeywords: [] };
}
