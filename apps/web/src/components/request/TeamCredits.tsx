import { formatCredits, percentOfPlan, type CreditItem } from "@/core/credits";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

/**
 * PRD §41 · la valoración en créditos, como la lee el equipo: la cifra
 * exacta, qué porcentaje es del plan del restaurante, las partidas, de
 * dónde salió (la IA o el equipo) y qué eligió el restaurante si no le
 * llegaba (RN-CRE-14). Sin botones: los pone la pantalla, que sabe quién
 * mira.
 */
export function TeamCreditSummary({
  creditsHalf,
  items,
  byAi,
  fallbackReason,
  includedHalf,
  deferredUntil,
  quoteRequestedAt,
  timeZone,
}: {
  creditsHalf: number | null;
  items: readonly CreditItem[];
  byAi: boolean;
  fallbackReason: string | null;
  includedHalf: number | null;
  deferredUntil: string | null;
  quoteRequestedAt: string | null;
  timeZone: string;
}) {
  const t = es.credits;
  const fecha = (iso: string) => enZona(iso, timeZone, { day: "numeric", month: "short", year: "numeric" });
  const porcentaje =
    creditsHalf === null || includedHalf === null ? null : percentOfPlan(creditsHalf, includedHalf);

  return (
    <div className="mt-4 space-y-2 rounded-[14px] bg-soft-surface p-4 text-sm">
      <p className="font-semibold text-text">{t.teamTitle}</p>
      {creditsHalf === null ? (
        <p className="text-text-secondary">{t.teamPending}</p>
      ) : (
        <>
          <p className="text-base font-semibold text-text">
            {porcentaje === null
              ? t.teamValuedNoPlan(formatCredits(creditsHalf))
              : t.teamValued(formatCredits(creditsHalf), `${porcentaje} %`)}
          </p>
          {items.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-text">
              {items.map((item, i) => (
                <li key={`${i}-${item.description}`}>
                  {item.description} · {formatCredits(item.creditsHalf)}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-text-secondary">{byAi ? t.teamByAi : t.teamByTeam}</p>
        </>
      )}
      {fallbackReason ? <p className="text-xs text-text-secondary">{t.teamFallbackReason(fallbackReason)}</p> : null}
      {quoteRequestedAt ? <p className="font-semibold text-text">{t.teamQuoteRequested(fecha(quoteRequestedAt))}</p> : null}
      {deferredUntil ? <p className="text-text">{t.teamDeferred(fecha(deferredUntil))}</p> : null}
    </div>
  );
}
