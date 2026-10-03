/**
 * `src/core/reservations/sms-text.ts` · el texto de un SMS de aviso (Fase F; PRD de agents §6.11, AVI-04).
 *
 * Un SMS de aviso va **sin tildes ni eñes** (se transliteran: «sabado», «Espana»), con solo caracteres del alfabeto
 * básico GSM-7, y en **un solo mensaje de 160 caracteres como máximo**. Si no cabe, se acorta el nombre del
 * restaurante (palabra a palabra por el final, y como último recurso, a trozos); nunca se parte en dos mensajes,
 * que costarían el doble.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */

/** Lo que cabe en un SMS de un solo segmento GSM-7. */
export const SMS_MAX_LENGTH = 160;

/** Un nombre de restaurante acortado nunca baja de aquí: por debajo ya no se reconoce. */
export const SMS_MIN_NAME_LENGTH = 3;

// Alfabeto básico GSM-7 sin letras acentuadas ni símbolos de extensión (`^ { } \ [ ] ~ | €` cuentan doble).
const ALLOWED = /^[A-Za-z0-9 @$!"#%&'()*+,\-./:;<=>?_]$/;

const REPLACEMENTS: Readonly<Record<string, string>> = {
  "·": "-",
  "•": "-",
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "‚": ",",
  "“": '"',
  "”": '"',
  "«": '"',
  "»": '"',
  "¡": "",
  "¿": "",
  "…": "...",
  "€": "EUR",
  "ß": "ss",
  "æ": "ae",
  "Æ": "AE",
  "œ": "oe",
  "Œ": "OE",
  "ø": "o",
  "Ø": "O",
  "đ": "d",
  "Đ": "D",
  "ł": "l",
  "Ł": "L",
  "\n": " ",
  "\r": " ",
  "\t": " ",
};

/** El texto sin tildes ni eñes y solo con caracteres GSM-7 básicos: lo que no se puede transliterar se quita. */
export function toSmsSafe(text: string): string {
  let out = "";
  for (const raw of text.normalize("NFC")) {
    const replaced = REPLACEMENTS[raw];
    if (replaced !== undefined) {
      out += replaced;
      continue;
    }
    if (ALLOWED.test(raw)) {
      out += raw;
      continue;
    }
    // Quitar las marcas de acento: «á» → «a», «ñ» → «n», «ç» → «c».
    const base = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += [...base].every((c) => ALLOWED.test(c)) ? base : "";
  }
  return out.replace(/ {2,}/g, " ").trim();
}

/** ¿Solo lleva caracteres del alfabeto básico GSM-7 sin acentos? */
export function isSmsSafe(text: string): boolean {
  return [...text].every((c) => ALLOWED.test(c));
}

export type SmsFit = { readonly ok: true; readonly text: string; readonly shortened: boolean } | { readonly ok: false; readonly reason: "too_long" };

/**
 * Compone el SMS con `build(nombre)` y, si pasa de 160, acorta el nombre del restaurante hasta que quepa. El nombre
 * se transliteran antes de medir: lo que se mide es lo que se envía.
 */
export function fitSms(build: (restaurantName: string) => string, restaurantName: string): SmsFit {
  const name = toSmsSafe(restaurantName);
  const full = toSmsSafe(build(name));
  if (full.length <= SMS_MAX_LENGTH) return { ok: true, text: full, shortened: false };

  // Palabra a palabra por el final: «Restaurante La Casa de Pepe» → «Restaurante La Casa de».
  const words = name.split(" ").filter((w) => w !== "");
  for (let keep = words.length - 1; keep >= 1; keep -= 1) {
    const candidate = words.slice(0, keep).join(" ");
    if (candidate.length < SMS_MIN_NAME_LENGTH) break;
    const text = toSmsSafe(build(candidate));
    if (text.length <= SMS_MAX_LENGTH) return { ok: true, text, shortened: true };
  }
  // Una sola palabra larga: a trozos.
  const first = words[0] ?? name;
  for (let length = Math.min(first.length, name.length) - 1; length >= SMS_MIN_NAME_LENGTH; length -= 1) {
    const text = toSmsSafe(build(first.slice(0, length)));
    if (text.length <= SMS_MAX_LENGTH) return { ok: true, text, shortened: true };
  }
  return { ok: false, reason: "too_long" };
}
