/**
 * `src/core/reservations/phone.ts` · teléfonos en E.164 (PRD de agents §9 y §6.7).
 *
 * De salida, siempre E.164 ("+34612345678"). De entrada se aceptan con espacios,
 * puntos, guiones o paréntesis, con "+", con "00" delante o sin prefijo: España por
 * defecto. La comparación de posibles duplicadas (RN-RES-06) usa este formato, así que
 * "612 345 678" y "+34 612-345-678" son el mismo teléfono.
 *
 * Lógica de dominio pura: sin Supabase, sin Next.js, sin React.
 */
import { err, ok, type Result } from "../result";

export type PhoneError = "empty" | "invalid_characters" | "invalid_length" | "invalid_number";

/** Forma E.164 genérica: "+", un dígito 1-9 y de 6 a 14 más (15 como mucho en total). */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

/** Un número nacional español: 9 cifras que empiezan por 6, 7, 8 o 9. */
function isSpanishNational(digits: string): boolean {
  return /^[6-9]\d{8}$/.test(digits);
}

/**
 * Normaliza un teléfono a E.164. Un número con prefijo +34 se exige además válido en
 * España (9 cifras, empezando por 6 a 9); otro país se acepta si tiene forma E.164.
 */
export function normalizePhoneE164(input: string): Result<string, PhoneError> {
  const trimmed = input.trim();
  if (trimmed === "") return err("empty");
  // Solo cifras y los separadores habituales; un "+" solo al principio.
  if (!/^\+?[\d\s.\-()]+$/.test(trimmed)) return err("invalid_characters");

  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  let international = hasPlus;
  if (!hasPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }

  if (!international) {
    // Sin prefijo: un número nacional español, o el mismo con el 34 delante (11 cifras,
    // inequívoco porque ningún número español empieza por 3).
    if (isSpanishNational(digits)) return ok(`+34${digits}`);
    if (digits.length === 11 && digits.startsWith("34") && isSpanishNational(digits.slice(2))) {
      return ok(`+${digits}`);
    }
    return err(digits.length === 9 ? "invalid_number" : "invalid_length");
  }

  if (digits.startsWith("34")) {
    if (digits.length !== 11) return err("invalid_length");
    return isSpanishNational(digits.slice(2)) ? ok(`+${digits}`) : err("invalid_number");
  }
  const e164 = `+${digits}`;
  if (digits.length < 7 || digits.length > 15) return err("invalid_length");
  return isE164(e164) ? ok(e164) : err("invalid_number");
}

/** Dos teléfonos son el mismo si normalizan al mismo E.164 (RN-RES-06). */
export function samePhone(a: string, b: string): boolean {
  const na = normalizePhoneE164(a);
  const nb = normalizePhoneE164(b);
  return na.ok && nb.ok && na.value === nb.value;
}

/** Los tres últimos números bastan para buscar (PRD §11.1, Buscar): ¿terminan así? */
export function phoneEndsWith(phone: string, suffix: string): boolean {
  const digits = suffix.replace(/\D/g, "");
  return digits.length >= 3 && phone.replace(/\D/g, "").endsWith(digits);
}
