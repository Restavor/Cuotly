import { Card, StatusBadge } from "@/components/ui";
import { isIncidentOutcome } from "@/core/incidents";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";

const ti = es.requestIncidents;

/**
 * RN-REQ-09 a 11 · que una solicitud es una incidencia, que no gasta del
 * plan y lo que decidió el equipo al diagnosticarla, con su explicación.
 *
 * La misma tarjeta para los dos lados; cambia cómo se dice la salida: al
 * equipo, lo que eligió; al restaurante, lo que significa para él. Nunca
 * dice quién la diagnosticó (P7): esa columna no existe en la fila.
 *
 * No se pinta para un cambio que nunca fue incidencia. Sí para la que
 * resultó ser un cambio: el restaurante tiene que poder leer por qué.
 */
export function IncidentCard({
  kind,
  outcome,
  note,
  resolvedAt,
  audience,
  timeZone,
}: {
  kind: string;
  outcome: string | null;
  note: string | null;
  resolvedAt: string | null;
  audience: "team" | "client";
  timeZone: string;
}) {
  if (kind !== "incident" && outcome === null) return null;

  const salida = isIncidentOutcome(outcome) ? outcome : null;

  return (
    <Card title={salida === null ? ti.badge : ti.resolvedTitle}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">{ti.badge}</StatusBadge>
        {kind === "incident" ? <span className="text-sm text-text-secondary">{ti.noPlanSpend}</span> : null}
      </div>
      {salida === null ? null : (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold text-text">
            {audience === "team" ? ti.outcomes[salida] : ti.clientOutcomes[salida]}
          </p>
          {note ? <p className="whitespace-pre-wrap text-sm text-text">{note}</p> : null}
          {resolvedAt ? (
            <p className="text-xs text-text-secondary">
              {ti.resolvedOn(enZona(resolvedAt, timeZone, { dateStyle: "medium" }))}
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
