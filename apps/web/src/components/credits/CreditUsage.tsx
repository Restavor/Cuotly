import Link from "next/link";

import { ProgressBar } from "@/components/ui";
import { formatCredits } from "@/core/credits";
import { requestHeadline } from "@/core/requests";
import { es } from "@/i18n/es";

/**
 * RN-CRE-16 y RN-CRE-17 · el consumo de créditos del ciclo: la barra y,
 * debajo, en qué se ha usado. Los números salen del servidor
 * (`establishment_credit_balance()` y `establishment_credit_detail()`,
 * migraciones 149 y 151); aquí no se calcula ningún porcentaje.
 *
 * El restaurante ve porcentajes; el equipo, además, los créditos exactos
 * (RN-CRE-16).
 */
export type CreditBalanceView = {
  readonly includedHalf: number;
  readonly usedHalf: number;
  readonly percentUsed: number;
  readonly renewsLabel: string | null;
};

export type CreditDetailView = {
  readonly key: string;
  readonly kind: "request" | "adjustment";
  readonly code: string | null;
  readonly description: string | null;
  readonly usedHalf: number;
  readonly percent: number;
  readonly href: string | null;
};

type Audience = "client" | "team";

export function CreditUsageBar({ balance, audience }: { balance: CreditBalanceView; audience: Audience }) {
  const t = es.credits;
  const lleno = balance.percentUsed >= 100;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-text">{t.usagePercent(balance.percentUsed)}</span>
        {audience === "team" ? (
          <span className="text-text-secondary">
            {t.usageTeam(formatCredits(Math.max(0, balance.usedHalf)), formatCredits(balance.includedHalf))}
          </span>
        ) : null}
      </div>
      <ProgressBar percent={balance.percentUsed} label={`${t.usageTitle}: ${t.usagePercent(balance.percentUsed)}`} />
      {lleno ? (
        <p className="text-sm font-semibold text-text">{audience === "team" ? t.usageFullTeam : t.usageFull}</p>
      ) : null}
      {balance.renewsLabel ? <p className="text-xs text-text-secondary">{t.usageRenews(balance.renewsLabel)}</p> : null}
    </div>
  );
}

export function CreditUsageDetail({ lines, audience }: { lines: readonly CreditDetailView[]; audience: Audience }) {
  const t = es.credits;
  if (lines.length === 0) {
    return <p className="text-sm text-text-secondary">{t.detailEmpty}</p>;
  }
  return (
    <div>
      <ul className="divide-y divide-border">
        {lines.map((line) => {
          const titulo =
            line.kind === "adjustment"
              ? t.detailAdjustment
              : [line.code, line.description ? requestHeadline(line.description, 70) : null].filter(Boolean).join(" · ");
          const cifra =
            line.kind === "adjustment"
              ? audience === "team"
                ? t.detailAdjustmentTeam(formatCredits(-line.usedHalf), -line.percent)
                : t.detailAdjustmentPercent(-line.percent)
              : line.usedHalf < 0
                ? audience === "team"
                  ? t.detailReturnedTeam(formatCredits(-line.usedHalf))
                  : t.detailReturned(-line.percent)
                : audience === "team"
                  ? t.detailTeam(formatCredits(line.usedHalf), line.percent)
                  : t.detailPercent(line.percent);
          return (
            <li key={line.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              {line.href ? (
                <Link href={line.href} className="min-w-0 text-cuotly-green underline">
                  {titulo}
                </Link>
              ) : (
                <span className="min-w-0 text-text">{titulo}</span>
              )}
              <span className="shrink-0 font-semibold text-text">{cifra}</span>
            </li>
          );
        })}
      </ul>
      {lines.length > 1 ? <p className="mt-2 text-xs text-text-secondary">{t.detailNote}</p> : null}
    </div>
  );
}
