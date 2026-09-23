/**
 * Lógica pura de Planes y servicios (M21, M54, M55, M56): qué pestaña y
 * qué elemento se piden, cuántos restaurantes tiene cada plan o servicio,
 * qué cambió entre dos versiones de unas condiciones y cómo se comparan
 * dos planes.
 *
 * Sin Supabase, sin Next y sin React (CLAUDE.md). Nada de aquí decide si
 * un cambio de plan se puede hacer: eso es `plans.ts` (RN-COM-15 a 17), y
 * el servidor lo vuelve a comprobar.
 */

export const PLANS_TABS = ["planes", "servicios", "versiones", "restaurantes"] as const;
export type PlansTab = (typeof PLANS_TABS)[number];

export interface PlansParams {
  readonly tab: PlansTab;
  /** El plan elegido en "Planes" o el filtro de "Restaurantes". */
  readonly plan: string | null;
  readonly service: string | null;
  /** En "Versiones", de qué plan o servicio (`plan:<id>` o `service:<id>`). */
  readonly subject: { readonly type: "plan" | "service"; readonly id: string } | null;
  readonly version: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v !== "" ? v : null;
}

function uuidOrNull(value: string | null): string | null {
  return value !== null && UUID.test(value) ? value : null;
}

/** Lee la dirección. Lo que no se entiende cae en el valor por defecto. */
export function readPlansParams(query: Record<string, string | string[] | undefined>): PlansParams {
  const tab = first(query.tab);
  const tema = first(query.tema);
  const version = first(query.version);
  let subject: PlansParams["subject"] = null;
  if (tema !== null) {
    const [type, id] = tema.split(":");
    if ((type === "plan" || type === "service") && uuidOrNull(id ?? null) !== null) {
      subject = { type, id };
    }
  }
  const n = version !== null && /^\d+$/.test(version) ? Number(version) : null;
  return {
    tab: tab !== null && (PLANS_TABS as readonly string[]).includes(tab) ? (tab as PlansTab) : "planes",
    plan: uuidOrNull(first(query.plan)),
    service: uuidOrNull(first(query.servicio)),
    subject,
    version: n !== null && n > 0 ? n : null,
  };
}

/**
 * Cuántos restaurantes tienen **ahora** cada plan o servicio: una
 * suscripción activa por restaurante (RN-COM-13 para el plan; un servicio
 * contratado dos veces en el mismo restaurante sigue siendo un restaurante).
 */
export function restaurantsBySubject(
  subscriptions: readonly {
    readonly establishmentId: string;
    readonly planId: string | null;
    readonly serviceId: string | null;
  }[],
): ReadonlyMap<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const s of subscriptions) {
    const key = s.planId ?? s.serviceId;
    if (key === null) continue;
    const set = sets.get(key) ?? new Set<string>();
    set.add(s.establishmentId);
    sets.set(key, set);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

/**
 * La versión que se enseña en "Versiones": la pedida si existe, y si no
 * la vigente (la de número más alto). Las versiones no se editan ni se
 * borran (RN-DAT-07), así que la más alta es siempre la vigente.
 */
export function pickVersion<T extends { readonly version: number }>(
  versions: readonly T[],
  requested: number | null,
): T | null {
  if (versions.length === 0) return null;
  const ordered = [...versions].sort((a, b) => b.version - a.version);
  return ordered.find((v) => v.version === requested) ?? ordered[0];
}

export interface ConditionsDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

function norm(line: string): string {
  return line.replace(/\s+/g, " ").toLowerCase();
}

/**
 * M55 · "Resumen de cambios" entre dos versiones de unas condiciones: las
 * líneas que aparecen y las que desaparecen. Como en `menu-diff.ts`, se
 * comparan como conjunto e ignorando espacios de sobra y mayúsculas —
 * mover un párrafo o corregir un doble espacio no es un cambio de
 * condiciones—, y se enseñan tal cual se escribieron.
 */
export function diffConditions(previous: string, next: string): ConditionsDiff {
  const antes = lines(previous);
  const despues = lines(next);
  const setAntes = new Set(antes.map(norm));
  const setDespues = new Set(despues.map(norm));
  return {
    added: despues.filter((l) => !setAntes.has(norm(l))),
    removed: antes.filter((l) => !setDespues.has(norm(l))),
  };
}

export interface ComparablePlan {
  readonly priceCents: number;
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
  readonly startSlaHours: number;
  readonly canOrderRequests: boolean;
  readonly reportLevelRank: number;
}

export type ComparisonKey =
  | "price"
  | "small"
  | "photo"
  | "medium"
  | "large"
  | "startSla"
  | "ordering"
  | "report";

export interface ComparisonRow {
  readonly key: ComparisonKey;
  /** Si el destino da más que el actual en esta fila (para resaltarla). */
  readonly better: boolean;
  readonly changed: boolean;
}

/**
 * M56 · la comparativa entre el plan actual y el destino, fila a fila.
 * "Mejor" es más cuota, menos horas de plazo, poder ordenar las propias
 * solicitudes y más nivel de informe. El precio no es "mejor" ni "peor":
 * solo se marca si cambia.
 */
export function comparePlans(current: ComparablePlan, target: ComparablePlan): readonly ComparisonRow[] {
  const row = (key: ComparisonKey, a: number, b: number, higherIsBetter: boolean | null): ComparisonRow => ({
    key,
    changed: a !== b,
    better: higherIsBetter === null ? false : higherIsBetter ? b > a : b < a,
  });
  return [
    row("price", current.priceCents, target.priceCents, null),
    row("small", current.includedSmall, target.includedSmall, true),
    row("photo", current.includedPhoto, target.includedPhoto, true),
    row("medium", current.includedMedium, target.includedMedium, true),
    row("large", current.includedLarge, target.includedLarge, true),
    row("startSla", current.startSlaHours, target.startSlaHours, false),
    row("ordering", Number(current.canOrderRequests), Number(target.canOrderRequests), true),
    row("report", current.reportLevelRank, target.reportLevelRank, true),
  ];
}
