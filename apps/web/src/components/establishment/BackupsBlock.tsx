"use client";

import { useActionState } from "react";

import { Button, Card, EmptyState } from "@/components/ui";
import { es } from "@/i18n/es";
import { enZona } from "@/i18n/dates";

import { INITIAL_SERVICE_STATUS } from "./service-status-action-state";
import { createEstablishmentBackup } from "./service-status-actions";

const t = es.establishmentSheet;

export interface BackupRow {
  readonly id: string;
  readonly takenAt: string;
  readonly sizeBytes: number;
  readonly counts: {
    readonly requests?: number;
    readonly menus?: number;
    readonly files?: number;
    readonly conversations?: number;
  };
}

/**
 * RN-BCK · el historial de copias, con su descarga.
 *
 * Lo que esta pantalla dice y la maqueta no decía: **restaurar es descargar,
 * y lo aplica el equipo a mano** (RN-BCK-04). Va arriba y con todas las
 * letras, no escondido en una nota al pie, porque es lo que separa esta
 * pantalla de la que cualquiera espera: no hay botón de deshacer. La razón
 * también está escrita — reponer los datos de una fecha anterior machacaría
 * apuntes de auditoría, consumos y cobros posteriores, y este producto
 * entero está construido sobre libros que no se reescriben.
 *
 * Y lo segundo que dice: la copia lleva el **inventario** de los archivos,
 * no los archivos (RN-BCK-09). Llamar "copia de seguridad completa" a algo
 * que no guarda los bytes sería prometer de más justo en la pantalla donde
 * más caro sale.
 */
export function BackupsBlock({
  establishmentId,
  backups,
  timezone,
  canManage,
}: {
  establishmentId: string;
  backups: readonly BackupRow[];
  timezone: string;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(
    createEstablishmentBackup,
    INITIAL_SERVICE_STATUS,
  );

  return (
    <Card title={t.backupsTitle}>
      <p className="mb-2 text-sm text-text-secondary">{t.backupsHint}</p>
      <p className="mb-4 rounded-[10px] bg-soft-surface p-3 text-sm text-text">
        {t.backupsNoRestore}
      </p>
      <p className="mb-4 text-sm text-text-secondary">{t.backupsInventory}</p>

      {backups.length === 0 ? (
        <EmptyState title={t.backupsEmptyTitle} description={t.backupsEmptyReason} />
      ) : (
        <ul className="mb-4 space-y-2">
          {backups.map((copia) => (
            <li
              key={copia.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border p-3 text-sm"
            >
              <div>
                <p className="font-medium text-text">
                  {enZona(copia.takenAt, timezone, { dateStyle: "long", timeStyle: "short" })}
                </p>
                <p className="text-text-secondary">
                  {t.backupsContents(
                    copia.counts.requests ?? 0,
                    copia.counts.menus ?? 0,
                    copia.counts.files ?? 0,
                  )}
                </p>
              </div>
              {/* RN-BCK-05 · la descarga pasa por una ruta que comprueba el
                  permiso y deja el apunte de RN-BCK-06; nunca por una
                  dirección pública. */}
              <a
                href={`/api/copias/${copia.id}`}
                className="text-cuotly-green underline"
                download
              >
                {t.backupsDownload}
              </a>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="establishmentId" value={establishmentId} />
          {state.error ? (
            <p role="alert" className="text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.done ? (
            <p role="status" className="text-sm text-success">
              {t.backupsDone}
            </p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t.servicePending : t.backupsCreate}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
