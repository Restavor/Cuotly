import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import type { TimelineStepStatus } from "@/core/client-requests";
import { es } from "@/i18n/es";

/**
 * Las piezas que repiten R07 a R12: la fila de datos del resumen, la
 * lista de adjuntos, el camino de la solicitud y la caja azul de aviso.
 * Todas reciben el texto ya formateado: aquí no se consulta nada ni se
 * decide nada.
 */

/** Una casilla del resumen: rótulo pequeño en gris y el dato debajo. */
export function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-secondary">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-text">{children}</div>
    </div>
  );
}

/** La cabecera del resumen: el icono de la solicitud y sus casillas en fila. */
export function SummaryRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-[10px] border border-border p-3">
      <span className="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-soft-surface text-cuotly-green">
        <Icon name="request" className="h-6 w-6" />
      </span>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-4 sm:grid-cols-4 sm:divide-x sm:divide-border [&>*]:sm:pl-4 [&>*:first-child]:sm:pl-0">
        {children}
      </div>
    </div>
  );
}

/** La caja azul de "Importante" y "El equipo revisará…". */
export function InfoNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-[10px] border border-info/30 bg-info/10 p-4">
      <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0 text-primary-dark" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary-dark">{title}</p>
        <div className="text-sm text-text">{children}</div>
      </div>
    </div>
  );
}

/**
 * Un adjunto. El enlace no apunta al objeto del bucket, que es privado,
 * sino a la ruta que comprueba `can_read_file()` y firma una URL de
 * minutos (RN-ARC-08).
 */
export function AttachmentRow({
  fileId,
  name,
  action,
}: {
  fileId: string;
  name: string;
  /** Lo de la derecha: descargar, o "Quitar" en un borrador. */
  action?: ReactNode;
}) {
  const esPdf = name.toLowerCase().endsWith(".pdf");
  return (
    <li className="flex items-center gap-3 rounded-[10px] border border-border bg-surface p-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          esPdf ? "bg-danger text-surface" : "bg-soft-surface text-cuotly-green"
        }`}
      >
        <Icon name={esPdf ? "document" : "image"} className="h-5 w-5" />
      </span>
      <a href={`/api/archivos/${fileId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-text hover:underline">
        {name}
      </a>
      {action ?? (
        <a href={`/api/archivos/${fileId}`} aria-label={name} className="text-text-secondary hover:text-cuotly-green">
          <Icon name="download" className="h-5 w-5" />
        </a>
      )}
    </li>
  );
}

export type TimelineView = {
  readonly key: string;
  readonly status: TimelineStepStatus;
  readonly label: string;
  readonly dateLabel: string | null;
  readonly note?: string | null;
};

const ICONO: Record<TimelineStepStatus, IconName | null> = {
  done: "tick",
  current: "clock",
  waiting: "alert",
  pending: null,
  stopped: "close",
};

function Marca({ status }: { status: TimelineStepStatus }) {
  const icono = ICONO[status];
  const estilo =
    status === "done"
      ? "bg-cuotly-green text-surface"
      : status === "current"
        ? "border-2 border-cuotly-green bg-surface text-cuotly-green"
        : status === "waiting"
          ? // Ámbar como fondo con el trazo oscuro: el texto en ámbar no
            // pasa el contraste AA (contrast.test.ts).
            "border-2 border-warning bg-warning/25 text-primary-dark"
          : status === "stopped"
            ? "bg-danger text-surface"
            : "border-2 border-border bg-surface";
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${estilo}`}>
      {icono ? <Icon name={icono} className="h-4 w-4" /> : null}
    </span>
  );
}

/**
 * R08 (vertical, a la derecha) y R11 (horizontal, a lo ancho). Un paso sin
 * fecha dice "Sin fecha" solo si ya pasó: los que faltan no llevan nada.
 */
export function RequestTimeline({
  steps,
  orientation,
  showDates = true,
}: {
  steps: readonly TimelineView[];
  orientation: "vertical" | "horizontal";
  /** `false` para un camino que no tiene fechas que enseñar (R17). */
  showDates?: boolean;
}) {
  if (orientation === "horizontal") {
    return (
      <ol className="flex flex-wrap items-start justify-between gap-y-4">
        {steps.map((paso, i) => (
          <li key={paso.key} className="relative flex min-w-[110px] flex-1 flex-col items-center text-center">
            {i > 0 ? (
              <span
                aria-hidden="true"
                className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${
                  paso.status === "pending" ? "bg-border" : "bg-cuotly-green"
                }`}
              />
            ) : null}
            <span className="relative">
              <Marca status={paso.status} />
            </span>
            <span className="mt-2 text-sm font-semibold text-text">{paso.label}</span>
            {paso.status === "pending" || !showDates ? null : (
              <span className="text-xs text-text-secondary">{paso.dateLabel ?? es.panelRequests.noDate}</span>
            )}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="space-y-4">
      {steps.map((paso) => (
        <li key={paso.key} className="flex items-start gap-3">
          <Marca status={paso.status} />
          <div className="min-w-0 pt-1">
            <p
              className={`text-sm font-semibold ${
                paso.status === "pending" ? "text-text-secondary" : "text-text"
              }`}
            >
              {paso.label}
            </p>
            {paso.note ? <p className="text-sm text-text-secondary">{paso.note}</p> : null}
            {paso.status === "pending" || paso.status === "waiting" || !showDates ? null : (
              <p className="text-xs text-text-secondary">{paso.dateLabel ?? es.panelRequests.noDate}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
