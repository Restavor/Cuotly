import { enZona } from "@/i18n/dates";
import { euros } from "@/i18n/money";

/**
 * Las fechas se pintan en la zona del espacio (CLAUDE.md), con los mismos
 * formateadores que la web (`@/i18n/dates`): un día suelto se ancla en
 * UTC y un instante se convierte a la zona.
 */
export function whenAt(value: string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  return enZona(value, timeZone, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function dayOf(value: string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  return enZona(value, timeZone, { day: "numeric", month: "short", year: "numeric" });
}

export { euros };

/** "14,50" → 1450; vacío o inválido → null. */
export function parseEurosToCents(text: string): number | null {
  const limpio = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
}

/** Una línea por elemento, sin vacíos. */
export function linesToItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
