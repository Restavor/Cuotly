import { type TermsStatus, termsStatusOf } from "@/core/terms";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Maqueta 13 · las condiciones de una suscripción, leídas de
 * `subscription_terms()`: la versión vigente, la aceptada y el estado que
 * el servidor deriva de las dos. Lo usan la ficha de planes del equipo, la
 * tarjeta de la ficha del restaurante y la pantalla del propio
 * restaurante, para que las tres digan lo mismo del mismo dato (CA-10).
 *
 * `null` cuando la función no devuelve fila: la suscripción no existe o
 * quien pregunta no puede verla. Las pantallas lo distinguen de "sin
 * condiciones", que sí es una fila con estado `no_terms`.
 */
export interface SubscriptionTerms {
  readonly subjectName: string | null;
  readonly current: {
    readonly versionId: string;
    readonly version: number;
    readonly publishedAt: string;
    readonly conditions: string;
  } | null;
  readonly accepted: {
    readonly version: number;
    readonly acceptedAt: string;
    readonly channel: "in_app" | "external";
    readonly evidenceFileId: string | null;
  } | null;
  readonly status: TermsStatus;
}

export async function loadSubscriptionTerms(
  supabase: Supabase,
  subscriptionId: string,
): Promise<SubscriptionTerms | null> {
  const { data } = await supabase.rpc("subscription_terms", { p_subscription_id: subscriptionId });
  const fila = data?.[0];
  if (!fila) return null;

  return {
    subjectName: fila.subject_name,
    current:
      fila.current_version_id !== null &&
      fila.current_version !== null &&
      fila.current_published_at !== null &&
      fila.current_conditions !== null
        ? {
            versionId: fila.current_version_id,
            version: fila.current_version,
            publishedAt: fila.current_published_at,
            conditions: fila.current_conditions,
          }
        : null,
    accepted:
      fila.accepted_version !== null && fila.accepted_at !== null
        ? {
            version: fila.accepted_version,
            acceptedAt: fila.accepted_at,
            channel: fila.accepted_channel === "external" ? "external" : "in_app",
            evidenceFileId: fila.evidence_file_id,
          }
        : null,
    status: termsStatusOf(fila.status),
  };
}
