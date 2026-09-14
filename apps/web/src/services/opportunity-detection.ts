/**
 * `src/services/opportunity-detection.ts` — el barrido que aplica las
 * nueve reglas de §96 a los datos importados (Fase 3, Hito 15, RN-OPP-02).
 *
 * Lo llama la misma tanda que el resto de la cola (`/api/cola`), con
 * `service_role`, y va DESPUÉS de las sincronizaciones: las reglas se
 * aplican sobre lo que esa misma tanda acaba de traer.
 *
 * El reparto de trabajo, que es lo que conviene entender antes de tocar
 * esto:
 *
 *   · **Los umbrales** son de `src/core/opportunities.ts`: lógica pura,
 *     sin base y sin red, con los números de la decisión 26.
 *   · **La ventana** son los 28 últimos días completos del restaurante,
 *     comparados con los 28 anteriores, y "hoy" es hoy **en la zona
 *     horaria de su espacio** (CLAUDE.md), no la del servidor. En Vercel
 *     el servidor está en UTC, y un restaurante en Canarias o en América
 *     tendría la ventana corrida un día sin que nada fallara.
 *   · **Qué fuentes pueden disparar** lo decide `noDataReason()`: una
 *     desconectada, sin autorizar, con error o con el dato desactualizado
 *     no dispara nada (P6, RN-INT-07). Que un restaurante se quede sin
 *     oportunidades porque su GA4 lleva una semana caída es correcto: lo
 *     que no sería correcto es inventarlas con datos viejos.
 *   · **Qué se hace con cada detección** lo decide la base
 *     (`upsert_detected_opportunity()`): crear, actualizar la que ya
 *     existe (§99) o reabrir una descartada que empeora.
 *
 * Todo lo externo entra por `DetectionDeps`, así que el barrido se prueba
 * entero sin base de datos y sin red. Un restaurante que falle no tumba a
 * los demás: se cuenta y se sigue, como en `integration-sync.ts`.
 */

import {
  type IntegrationProvider,
  type MetricPoint,
  INTEGRATION_PROVIDERS,
  isIntegrationProvider,
  isIntegrationState,
  noDataReason,
  previousWindow,
  summaryWindow,
} from "@/core/integrations";
import { detectOpportunities } from "@/core/opportunities";
import { todayInTimeZone } from "@/core/finance";

import type { OpportunityGateway, ProviderState } from "./opportunity-gateway";

export interface DetectionDeps {
  readonly gateway: OpportunityGateway;
  readonly now: () => Date;
}

export interface OpportunityDetectionResult {
  readonly scanned: number;
  readonly detections: number;
  readonly failed: number;
}

/**
 * Cuántos restaurantes por tanda. Cada uno son dos lecturas y hasta unas
 * pocas escrituras; la tanda entera tiene un minuto (`maxDuration` de
 * `/api/cola`) y las sincronizaciones van antes. Con la cola diaria, veinte
 * por tanda recorren una cartera grande en pocas horas.
 */
export const ESTABLISHMENTS_PER_BATCH = 20;

/** Las fuentes con dato actual: las demás no disparan nada (P6). */
export function liveProviders(
  states: readonly ProviderState[],
  now: Date,
): readonly IntegrationProvider[] {
  const porFuente = new Map<IntegrationProvider, ProviderState>();
  for (const state of states) {
    if (isIntegrationProvider(state.provider)) porFuente.set(state.provider, state);
  }

  return INTEGRATION_PROVIDERS.filter((provider) => {
    const state = porFuente.get(provider);
    if (state === undefined || !isIntegrationState(state.status)) return false;
    // Desconectada NO es lo mismo que sin dato: los puntos ya importados
    // se conservan (RN-INT-07, §94), así que "Informes y datos" sigue
    // enseñándolos y `noDataReason()` no la descarta. Para una REGLA sí
    // es distinto: la decisión 26 dice que nada salta si su integración
    // está desconectada, y detectar sobre una fuente que el restaurante
    // ya no autoriza sería generar trabajo sobre un dato congelado.
    if (state.status === "disconnected") return false;
    const lastSuccessAt = state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt);
    return noDataReason(provider, state.status, lastSuccessAt, now) === null;
  });
}

function porFuente(
  puntos: ReadonlyMap<string, readonly MetricPoint[]>,
): Partial<Record<IntegrationProvider, readonly MetricPoint[]>> {
  const salida: Partial<Record<IntegrationProvider, readonly MetricPoint[]>> = {};
  for (const [provider, lista] of puntos) {
    if (isIntegrationProvider(provider)) salida[provider] = lista;
  }
  return salida;
}

export async function runOpportunityDetection(
  deps: DetectionDeps,
  limit: number = ESTABLISHMENTS_PER_BATCH,
): Promise<OpportunityDetectionResult> {
  const now = deps.now();
  const establecimientos = await deps.gateway.establishmentsToScan(limit);

  let detections = 0;
  let failed = 0;
  let scanned = 0;

  for (const establecimiento of establecimientos) {
    try {
      const todayIso = todayInTimeZone(now, establecimiento.timezone);
      const window = summaryWindow(todayIso);
      const anterior = previousWindow(window);

      const estados = await deps.gateway.providerStates(establecimiento.establishment_id);
      const vivas = liveProviders(estados, now);
      scanned += 1;
      // Sin ninguna fuente con dato actual no hay nada que calcular, y
      // leer 56 días de puntos para no mirarlos es trabajo de más.
      if (vivas.length === 0) continue;

      const puntos = await deps.gateway.metricPoints(
        establecimiento.establishment_id,
        anterior.from,
        window.to,
      );

      const detecciones = detectOpportunities({
        window,
        previousWindow: anterior,
        points: porFuente(puntos),
        liveProviders: vivas,
      });

      for (const deteccion of detecciones) {
        await deps.gateway.store({
          establishmentId: establecimiento.establishment_id,
          rule: deteccion.rule,
          subject: deteccion.subject,
          impact: deteccion.impact,
          severity: deteccion.severity,
          periodStart: deteccion.periodStart,
          periodEnd: deteccion.periodEnd,
          evidence: deteccion.measurements,
        });
        detections += 1;
      }
    } catch {
      // Un restaurante que falla no tumba la tanda ni a los demás. El
      // detalle no se guarda en ningún sitio a propósito: no es un error
      // de la fuente (eso ya lo cuenta `sync_runs`), es un error del
      // barrido, y lo que importa aquí es que la tanda siga.
      failed += 1;
    }
  }

  return { scanned, detections, failed };
}
