import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * CA-20 · "Ninguna pantalla muestra números ficticios: sin datos se indica
 * el **motivo** (no conectado, sin datos todavía, error, periodo
 * insuficiente)."
 *
 * El motivo es obligatorio en el tipo, no opcional: una pantalla que no
 * sabe por qué no tiene datos no compila. Es la diferencia entre cumplir
 * el criterio y acordarse de cumplirlo.
 *
 * Los cuatro motivos no son el mismo hueco, y ahora se distinguen a la
 * vista: "no conectado" pide una acción de alguien, "sin datos todavía" es
 * el curso normal de las cosas, "error" ha fallado y "periodo
 * insuficiente" solo necesita que pase el tiempo. Pintarlos los cuatro
 * igual —como estaban, con un borde discontinuo y sin icono— obligaba a
 * leer el párrafo entero para saber cuál de las cuatro cosas pasaba.
 */
export type EmptyReasonKind = keyof typeof es.emptyReasons;

const MOTIVO: Readonly<
  Record<EmptyReasonKind, { readonly icon: IconName; readonly clase: string }>
> = {
  // Falta enlazar el servicio: alguien tiene que ir a hacerlo. En `info` y
  // no en ámbar porque el ámbar sobre su tinte da 2,15:1 y AA pide 3:1
  // para un icono; y porque esto no ha fallado, solo está sin conectar.
  not_connected: { icon: "switchSpace", clase: "bg-info/10 text-info" },
  // El curso normal: todavía no ha pasado nada. En neutro, sin alarma.
  no_data_yet: { icon: "document", clase: "bg-soft-surface text-text-secondary" },
  error: { icon: "alert", clase: "bg-danger/10 text-danger" },
  // Hace falta más historial: es cuestión de tiempo, y el reloj lo dice
  // mejor que cualquier frase.
  insufficient_period: { icon: "clock", clase: "bg-info/10 text-info" },
};

export function EmptyReason({
  reason,
  title,
  testId,
}: {
  reason: EmptyReasonKind;
  title: string;
  testId?: string;
}) {
  const { icon, clase } = MOTIVO[reason];

  return (
    <div
      data-testid={testId}
      data-empty-reason={reason}
      // `role="status"` solo en el error: los otros tres son el contenido
      // normal de la pantalla, y anunciarlos como avisos convertiría en
      // alarma lo que es "todavía no hay nada".
      role={reason === "error" ? "status" : undefined}
      className="flex flex-col items-center gap-3 rounded-card bg-soft-surface/60 px-6 py-8 text-center"
    >
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 items-center justify-center rounded-full ${clase}`}
      >
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="max-w-sm">
        <span className="block font-semibold text-text">{title}</span>
        <span className="mt-1 block text-sm text-text-secondary">{es.emptyReasons[reason]}</span>
      </span>
    </div>
  );
}
