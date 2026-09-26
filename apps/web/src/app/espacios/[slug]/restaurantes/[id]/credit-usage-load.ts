import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreditBalanceView, CreditDetailView } from "@/components/credits/CreditUsage";
import { enZona } from "@/i18n/dates";
import type { Database } from "@/lib/supabase/database.types";

/**
 * RN-CRE-16 · la barra del ciclo y su detalle, leídos del servidor con la
 * sesión de quien mira: `establishment_credit_balance()` y
 * `establishment_credit_detail()` comprueban por su cuenta que puede leer
 * el restaurante. `balance` es `null` si el plan no incluye créditos (o no
 * hay plan): la pantalla lo dice en vez de pintar una barra vacía.
 */
export async function loadCreditUsage(
  supabase: SupabaseClient<Database>,
  establishmentId: string,
  options: { timeZone: string; requestHref: (requestId: string) => string },
): Promise<{ balance: CreditBalanceView | null; lines: CreditDetailView[] }> {
  const [{ data: saldo }, { data: detalle }] = await Promise.all([
    supabase.rpc("establishment_credit_balance", { p_establishment_id: establishmentId }),
    supabase.rpc("establishment_credit_detail", { p_establishment_id: establishmentId }),
  ]);

  const fila = saldo?.[0] ?? null;
  const balance: CreditBalanceView | null =
    fila === null
      ? null
      : {
          includedHalf: fila.included_half,
          usedHalf: fila.used_half,
          percentUsed: fila.percent_used,
          renewsLabel: fila.renews_at
            ? enZona(fila.renews_at, options.timeZone, { day: "numeric", month: "long", year: "numeric" })
            : null,
        };

  const lines: CreditDetailView[] = (detalle ?? []).map((d, i) => ({
    key: d.request_id ?? `ajuste-${i}`,
    kind: d.kind === "adjustment" ? "adjustment" : "request",
    code: d.request_code,
    description: d.request_description,
    usedHalf: d.used_half,
    percent: d.percent_of_plan,
    href: d.request_id ? options.requestHref(d.request_id) : null,
  }));

  return { balance, lines };
}
