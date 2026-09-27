/**
 * `src/core/daily-menu.ts` — reglas del servicio Menú Diario que no son la
 * máquina de estados (esa está en `menu-states.ts`): los tipos de menú, el
 * tope de plantillas incluidas y cómo se lee el editor.
 *
 * Desde la decisión 85 (PRD §41) no hay contador de actualizaciones
 * (RN-CRE-22), ni hora de corte, garantía de las 08:00, recordatorio de las
 * 20:00 ni corrección mínima (RN-CRE-24): las reglas que los calculaban se
 * fueron con ellas. El servidor es quien manda (migración 152).
 *
 * Lógica de dominio pura (CLAUDE.md).
 */

/** §57: "diario, Navidad, infantil, grupos o evento especial". Ni uno más. */
export const MENU_KINDS = ["daily", "christmas", "kids", "groups", "special_event"] as const;
export type MenuKind = (typeof MENU_KINDS)[number];

/**
 * RN-CRE-23 (decisión 85) · dos plantillas incluidas, una sola vez: una
 * para publicar y otra para imprimir en blanco y negro.
 */
export const INCLUDED_TEMPLATE_LIMIT = 2;

/**
 * RN-CRE-23 · "una sola vez": archivar una incluida no libera su plaza, así
 * que se cuentan todas las incluidas que hubo, archivadas o no.
 */
export function canCreateIncludedTemplate(includedEverCreated: number): boolean {
  return includedEverCreated < INCLUDED_TEMPLATE_LIMIT;
}

/** "14,50" o "14.50" o "14" → 1450. Vacío → null. Cualquier otra cosa → undefined (no se entiende). */
export function parsePriceToCents(raw: string): number | null | undefined {
  const text = raw.trim();
  if (text === "") return null;
  const match = /^(\d{1,5})(?:[,.](\d{1,2}))?\s*€?$/.exec(text);
  if (!match) return undefined;
  const euros = Number(match[1]);
  const cents = match[2] === undefined ? 0 : Number(match[2].padEnd(2, "0"));
  return euros * 100 + cents;
}

/** Un plato por línea (§58): se quitan las vacías y los espacios de los bordes. */
export function linesToItems(raw: string): readonly string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
