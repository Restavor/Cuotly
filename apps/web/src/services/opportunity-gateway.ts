/**
 * `src/services/opportunity-gateway.ts` — la mitad de Supabase del barrido
 * de oportunidades (Fase 3, Hito 15). Separado del runner por lo mismo que
 * `integration-gateway.ts` lo está de `integration-sync.ts`: el runner
 * decide y se prueba entero con una interfaz falsa; aquí solo se traduce.
 *
 * Lo que hay aquí son dos funciones reservadas a `service_role` (migración
 * 84) y dos lecturas de tablas que solo el proceso hace enteras.
 */

import type { MetricPoint } from "@/core/integrations";

import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any --
   Las funciones del barrido son SECURITY DEFINER reservadas a service_role y
   no están en `Database` (los tipos generados describen lo que puede tocar
   una sesión de usuario). El `any` se aísla en esta frontera. */
type AnyClient = SupabaseClient<any, any, any>;

async function rpc<T>(client: AnyClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export interface EstablishmentToScan {
  readonly establishment_id: string;
  readonly space_id: string;
  readonly timezone: string;
}

/** El estado de una fuente, que es lo que decide si puede disparar una regla. */
export interface ProviderState {
  readonly provider: string;
  readonly status: string;
  readonly lastSuccessAt: string | null;
}

export interface DetectionToStore {
  readonly establishmentId: string;
  readonly rule: string;
  readonly subject: string;
  readonly impact: string;
  readonly severity: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly evidence: unknown;
}

export interface OpportunityGateway {
  establishmentsToScan(limit: number): Promise<readonly EstablishmentToScan[]>;
  providerStates(establishmentId: string): Promise<readonly ProviderState[]>;
  metricPoints(
    establishmentId: string,
    from: string,
    to: string,
  ): Promise<ReadonlyMap<string, readonly MetricPoint[]>>;
  store(detection: DetectionToStore): Promise<string>;
}

/**
 * Los puntos se piden por páginas de 1000 porque PostgREST corta ahí
 * (`max_rows`), y 56 días de cinco fuentes con desgloses pasan de sobra:
 * sin paginar, el barrido leería una ventana recortada sin enterarse y
 * dejaría de detectar sin decir nada. Mismo motivo y mismo tamaño que
 * `integrations-load.ts`.
 */
const PAGE = 1000;

export function createSupabaseOpportunityGateway(client: AnyClient): OpportunityGateway {
  return {
    establishmentsToScan: (limit) =>
      rpc<readonly EstablishmentToScan[]>(client, "establishments_for_opportunity_detection", {
        p_limit: limit,
      }),

    async providerStates(establishmentId) {
      const { data, error } = await client
        .from("integrations")
        .select("provider, status, last_success_at")
        .eq("establishment_id", establishmentId);
      if (error) throw new Error(`integrations: ${error.message}`);
      return (data ?? []).map((row: { provider: string; status: string; last_success_at: string | null }) => ({
        provider: row.provider,
        status: row.status,
        lastSuccessAt: row.last_success_at,
      }));
    },

    async metricPoints(establishmentId, from, to) {
      const porFuente = new Map<string, MetricPoint[]>();
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await client
          .from("metric_points")
          .select("provider, metric, dimension, period_start, period_end, value, unit")
          .eq("establishment_id", establishmentId)
          .gte("period_start", from)
          .lte("period_end", to)
          .order("provider", { ascending: true })
          .order("metric", { ascending: true })
          .order("dimension", { ascending: true })
          .order("period_start", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error(`metric_points: ${error.message}`);
        for (const p of data ?? []) {
          const lista = porFuente.get(p.provider) ?? [];
          lista.push({
            metric: p.metric,
            dimension: p.dimension,
            period_start: p.period_start,
            period_end: p.period_end,
            value: Number(p.value),
            unit: p.unit,
          });
          porFuente.set(p.provider, lista);
        }
        if ((data ?? []).length < PAGE) break;
      }
      return porFuente;
    },

    store: (detection) =>
      rpc<string>(client, "upsert_detected_opportunity", {
        p_establishment_id: detection.establishmentId,
        p_rule: detection.rule,
        p_subject: detection.subject,
        p_impact: detection.impact,
        p_severity: detection.severity,
        p_period_start: detection.periodStart,
        p_period_end: detection.periodEnd,
        p_evidence: detection.evidence,
      }),
  };
}
