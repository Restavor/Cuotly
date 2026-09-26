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

import { type ReportPeriodKind, isReportPeriodKind } from "./reports";

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
  /** Decisión 72 · `?accion=crear` o `?accion=editar` abre el formulario (solo el propietario lo ve). */
  readonly action: "crear" | "editar" | null;
  /** En "Versiones", qué versión del precio y las cuotas (`?rev=`). */
  readonly revision: number | null;
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
  const accion = first(query.accion);
  const rev = first(query.rev);
  const r = rev !== null && /^\d+$/.test(rev) ? Number(rev) : null;
  return {
    tab: tab !== null && (PLANS_TABS as readonly string[]).includes(tab) ? (tab as PlansTab) : "planes",
    plan: uuidOrNull(first(query.plan)),
    service: uuidOrNull(first(query.servicio)),
    subject,
    version: n !== null && n > 0 ? n : null,
    action: accion === "crear" || accion === "editar" ? accion : null,
    revision: r !== null && r > 0 ? r : null,
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
  /** RN-REP-32 · cada cuánto llega el informe. Sin él, mensual. */
  readonly reportPeriod?: ReportPeriodKind;
}

export type ComparisonKey =
  | "price"
  | "small"
  | "photo"
  | "medium"
  | "large"
  | "startSla"
  | "ordering"
  | "report"
  | "reportPeriod";

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
    // RN-REP-32 · un informe cada mes es mejor que uno cada trimestre.
    row(
      "reportPeriod",
      Number((current.reportPeriod ?? "month") === "month"),
      Number((target.reportPeriod ?? "month") === "month"),
      true,
    ),
  ];
}

// ---------------------------------------------------------------------
// Crear y editar planes y servicios (decisión 72, RN-COM-19 a 21)
// ---------------------------------------------------------------------

export const REPORT_LEVELS = ["basic", "standard", "standard_plus", "advanced", "complete"] as const;
export type PlanReportLevel = (typeof REPORT_LEVELS)[number];

/** Los términos de un plan tal como los recibe `create_plan()` / `revise_plan()`. */
export interface PlanTerms {
  readonly priceCents: number;
  readonly includedSmall: number;
  readonly includedPhoto: number;
  readonly includedMedium: number;
  readonly includedLarge: number;
  readonly startSlaHours: number;
  readonly executionSlaSmall: number;
  readonly executionSlaPhoto: number;
  readonly executionSlaMedium: number;
  readonly executionSlaLarge: number;
  readonly canOrderRequests: boolean;
  readonly grantsPriority: boolean;
  readonly queueRank: number;
  readonly reportLevel: PlanReportLevel;
  /** RN-REP-32 (decisión 83) · informe mensual o trimestral. */
  readonly reportPeriod: ReportPeriodKind;
  readonly watchesReviews: boolean;
}

export interface ServiceTerms {
  readonly priceCents: number;
  readonly pricePremiumCents: number | null;
  readonly includedUpdates: number;
}

/** Qué campo no se entiende. La pantalla lo dice con su nombre. */
export type TermsFormError =
  | "price"
  | "pricePremium"
  | "included"
  | "startSla"
  | "executionSla"
  | "queueRank"
  | "reportLevel"
  | "reportPeriod"
  | "updates";

export type TermsFormResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: TermsFormError };

type FormLike = { get(name: string): unknown };

function text(form: FormLike, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** "499", "499,00" o "499.5" → céntimos. Lo demás, `undefined`. */
export function eurosToCents(raw: string): number | undefined {
  const match = /^(\d{1,6})(?:[,.](\d{1,2}))?$/.exec(raw.replace(/\s*€$/, "").trim());
  if (!match) return undefined;
  return Number(match[1]) * 100 + (match[2] === undefined ? 0 : Number(match[2].padEnd(2, "0")));
}

function wholeNumber(raw: string, min: number): number | undefined {
  if (!/^-?\d{1,4}$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= min ? n : undefined;
}

/**
 * Lee el formulario de un plan. Solo comprueba la forma —números donde van
 * números, horas de al menos una—; si el cambio crea versión, si perjudica
 * o si quien lo pide puede hacerlo lo decide el servidor.
 */
export function readPlanTermsForm(form: FormLike): TermsFormResult<PlanTerms> {
  const price = eurosToCents(text(form, "price"));
  if (price === undefined) return { ok: false, error: "price" };

  const included = ["includedSmall", "includedPhoto", "includedMedium", "includedLarge"].map((k) =>
    wholeNumber(text(form, k), 0),
  );
  if (included.some((n) => n === undefined)) return { ok: false, error: "included" };

  const start = wholeNumber(text(form, "startSlaHours"), 1);
  if (start === undefined) return { ok: false, error: "startSla" };

  const execution = ["executionSlaSmall", "executionSlaPhoto", "executionSlaMedium", "executionSlaLarge"].map((k) =>
    wholeNumber(text(form, k), 1),
  );
  if (execution.some((n) => n === undefined)) return { ok: false, error: "executionSla" };

  const rank = wholeNumber(text(form, "queueRank") || "0", -99);
  if (rank === undefined) return { ok: false, error: "queueRank" };

  const level = text(form, "reportLevel");
  if (!(REPORT_LEVELS as readonly string[]).includes(level)) return { ok: false, error: "reportLevel" };

  // Sin el campo, mensual: es lo que tenían todos los planes antes de la
  // migración 145.
  const period = text(form, "reportPeriod") || "month";
  if (!isReportPeriodKind(period)) return { ok: false, error: "reportPeriod" };

  const [small, photo, medium, large] = included as number[];
  const [eSmall, ePhoto, eMedium, eLarge] = execution as number[];
  const on = (k: string) => form.get(k) === "on";
  return {
    ok: true,
    value: {
      priceCents: price,
      includedSmall: small,
      includedPhoto: photo,
      includedMedium: medium,
      includedLarge: large,
      startSlaHours: start,
      executionSlaSmall: eSmall,
      executionSlaPhoto: ePhoto,
      executionSlaMedium: eMedium,
      executionSlaLarge: eLarge,
      canOrderRequests: on("canOrderRequests"),
      grantsPriority: on("grantsPriority"),
      queueRank: rank,
      reportLevel: level as PlanReportLevel,
      reportPeriod: period,
      watchesReviews: on("watchesReviews"),
    },
  };
}

/** Lee el formulario de un servicio. El precio con Premium+ vacío es "no tiene" (RN-COM-08). */
export function readServiceTermsForm(form: FormLike): TermsFormResult<ServiceTerms> {
  const price = eurosToCents(text(form, "price"));
  if (price === undefined) return { ok: false, error: "price" };
  const premiumRaw = text(form, "pricePremium");
  const premium = premiumRaw === "" ? null : eurosToCents(premiumRaw);
  if (premium === undefined) return { ok: false, error: "pricePremium" };
  const updates = wholeNumber(text(form, "includedUpdates") || "0", 0);
  if (updates === undefined) return { ok: false, error: "updates" };
  return { ok: true, value: { priceCents: price, pricePremiumCents: premium, includedUpdates: updates } };
}

/**
 * Los estados de un restaurante frente a la versión vigente de lo suyo
 * (`space_revision_status()`): pasa sola, falta su aceptación, o sigue en
 * la anterior porque no aceptó (RN-COM-24).
 */
export const REVISION_STATES = ["scheduled", "awaiting_acceptance", "held_back"] as const;
export type RevisionState = (typeof REVISION_STATES)[number];

export function isRevisionState(value: string): value is RevisionState {
  return (REVISION_STATES as readonly string[]).includes(value);
}

export function revisionTone(state: RevisionState): "info" | "warning" | "danger" {
  return state === "scheduled" ? "info" : state === "awaiting_acceptance" ? "warning" : "danger";
}
