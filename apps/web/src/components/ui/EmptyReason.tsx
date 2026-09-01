import { es } from "@/i18n/es";

/**
 * CA-20 · "Ninguna pantalla muestra números ficticios: sin datos se indica
 * el **motivo** (no conectado, sin datos todavía, error, periodo
 * insuficiente)."
 *
 * El motivo es obligatorio en el tipo, no opcional: una pantalla que no
 * sabe por qué no tiene datos no compila. Es la diferencia entre cumplir
 * el criterio y acordarse de cumplirlo.
 */
export type EmptyReasonKind = keyof typeof es.emptyReasons;

export function EmptyReason({
  reason,
  title,
  testId,
}: {
  reason: EmptyReasonKind;
  title: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-empty-reason={reason}
      className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border px-6 py-10 text-center"
    >
      <p className="font-semibold text-text">{title}</p>
      <p className="max-w-sm text-sm text-text-secondary">{es.emptyReasons[reason]}</p>
    </div>
  );
}
