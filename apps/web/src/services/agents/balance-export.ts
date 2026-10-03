/**
 * `src/services/agents/balance-export.ts` · el Excel con todos los movimientos del saldo (Fase E2; PRD de
 * agents §5.2: «descargar en Excel»). Una fila por apunte, de más antiguo a más reciente, con el saldo que
 * quedaba después de cada uno. Los importes van en euros con las millonésimas del libro (un WhatsApp son
 * 0,016 €), no redondeados: el libro es exacto y el Excel también.
 *
 * No lleva datos personales: ni quién hizo un apunte (privilegio de columna, P7) ni nada de comensales.
 */
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

import type { Movement } from "./balance-gateway";
import { movementLabel } from "./movement-label";
import { buildXlsx, type XlsxCell } from "./xlsx";

export function movementsBook(movements: readonly Movement[], timeZone: string): Uint8Array {
  const t = es.agents.balance.export;
  let running = 0;
  return buildXlsx({
    sheetName: t.sheetName,
    columns: [
      { header: t.columns.date, width: 18 },
      { header: t.columns.type, width: 38 },
      { header: t.columns.amount, width: 14 },
      { header: t.columns.balance, width: 14 },
      { header: t.columns.note, width: 40 },
    ],
    rows: movements.map((m): XlsxCell[] => {
      running += m.amountMicros;
      return [
        enZona(m.createdAt, timeZone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }),
        movementLabel(m.kind, m.sourceType),
        m.amountMicros / 1_000_000,
        running / 1_000_000,
        m.note,
      ];
    }),
  });
}
