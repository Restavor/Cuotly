"use client";

import { useActionState } from "react";

import { Button, Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { FileUploadField } from "@/components/FileUploadField";
import { instanteRelativo } from "@/i18n/dates";
import { es } from "@/i18n/es";

import { INITIAL_JOB_ACTION } from "./action-state";
import { attachJobEvidence } from "./actions";

const t = es.teamArea.jobs;

export interface EvidenceFile {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly mimeType: string | null;
  readonly attachedAt: string;
}

function tamaño(bytes: number | null): string | null {
  if (bytes === null) return null;
  const mb = bytes / (1024 * 1024);
  // Con la coma del español: `toFixed()` escribe siempre un punto y "1.8
  // MB" se cuela en una pantalla que está entera en español.
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * "Hoy, 10:24" o la fecha corta con su hora, en la zona del espacio.
 *
 * Este componente corre en el NAVEGADOR, así que sin zona pintaba la de
 * quien mira: dos personas del mismo equipo en husos distintos veían horas
 * distintas para la misma publicación. La zona llega por propiedad desde
 * la pantalla, que la lee del espacio.
 */
function momento(value: string, timeZone: string): string {
  return instanteRelativo(value, timeZone, new Date(), es.establishmentSheet.today);
}

/**
 * Maqueta 06 · la evidencia de lo publicado (RN-JOB-10, RN-ARC-02).
 *
 * Quién puede adjuntar lo decide `attach_job_evidence()` (migración 60):
 * el responsable o alguien con `assign_jobs`, con un archivo que pueda ver
 * y que sea del mismo restaurante. Aquí no se comprueba ninguna de las
 * tres, y ofrecer o no el formulario **no autoriza nada** — es no enseñar
 * una puerta que el servidor va a cerrar (CLAUDE.md).
 *
 * La descarga va por `/api/archivos/<id>`, que comprueba `can_read_file()`
 * y contesta 404 —no 403— a quien no puede: un 403 confirma que el archivo
 * existe.
 */
export function JobEvidence({
  jobId,
  establishmentId,
  files,
  canAttach,
  publicado,
  timeZone,
}: {
  jobId: string;
  establishmentId: string;
  files: readonly EvidenceFile[];
  canAttach: boolean;
  /** La zona del espacio: las fechas de esta pantalla se pintan en ella. */
  timeZone: string;
  /** Antes de publicar el hueco dice otra cosa: todavía no toca. */
  publicado: boolean;
}) {
  const [state, action, pending] = useActionState(attachJobEvidence, INITIAL_JOB_ACTION);

  return (
    <Card title={t.evidenceTitle}>
      <p className="mb-3 text-sm text-text-secondary">{t.evidenceHint}</p>

      {files.length === 0 ? (
        <EmptyState
          icon="image"
          title={t.evidenceEmptyTitle}
          description={publicado ? t.evidenceEmptyReason : t.evidenceEmptyBeforePublishing}
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
              >
                <Icon
                  name={file.mimeType?.startsWith("image/") ? "image" : "document"}
                  className="h-[18px] w-[18px]"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{file.name}</span>
                <span className="block text-xs text-text-secondary">
                  {[tamaño(file.sizeBytes), momento(file.attachedAt, timeZone)]
                    .filter((parte) => parte !== null)
                    .join(" · ")}
                </span>
              </span>

              <a
                href={`/api/archivos/${file.id}`}
                aria-label={`${t.evidenceDownload}: ${file.name}`}
                title={t.evidenceDownload}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border text-text-secondary transition-colors hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <Icon name="download" aria-hidden="true" className="h-[18px] w-[18px]" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {canAttach ? (
        <form action={action} className="mt-4">
          <input type="hidden" name="jobId" value={jobId} />
          <FileUploadField
            establishmentId={establishmentId}
            /*
              RN-ARC-01 · la evidencia de un trabajo es del catálogo de
              "solicitudes y trabajos", no de "otros": así aparece donde le
              toca en los archivos del restaurante y no en un cajón de
              sastre.
            */
            category="requests_and_jobs"
            name="fileId"
            label={t.evidenceAddLabel}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? t.evidenceAddPending : t.evidenceAddSubmit}
            </Button>
            {state.error ? (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </Card>
  );
}
