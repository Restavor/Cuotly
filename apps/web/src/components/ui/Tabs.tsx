import Link from "next/link";

/**
 * Las pestañas subrayadas del diseño: "Lista · Tablero" en Trabajos (M09),
 * "Todas · Mis tareas" en Tareas (M11), "Clientes · Internos" en Mensajes
 * (M14), "Resumen · Cobros · Presupuestos" en Finanzas (M16), las siete de
 * Ajustes (M23). La activa lleva el texto en verde y una raya debajo; las
 * demás en gris.
 *
 * Son **enlaces**, no botones con estado: cada pestaña es una dirección,
 * así que se comparte, el botón de volver la deshace y funciona sin
 * JavaScript. Quien las pinta decide cuál está activa comparando con la
 * ruta o con el parámetro de la dirección, y lo dice con `aria-current`.
 *
 * El contador opcional es el círculo del diseño ("Pendientes 3"): rojo
 * cuando lo que cuenta pide atención, gris cuando solo informa.
 */
export type Tab = {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly count?: number;
  readonly countTone?: "danger" | "neutral";
};

export function Tabs({
  tabs,
  active,
  label,
  className = "",
}: {
  readonly tabs: readonly Tab[];
  /** La `key` de la pestaña activa. */
  readonly active: string;
  /** Qué agrupan estas pestañas, para el lector de pantalla. */
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <nav aria-label={label} className={`border-b border-border ${className}`}>
      {/*
        Diseño móvil (P4 de docs/diseno/PLAN-MOVIL.md) · en el teléfono las
        pestañas se **reparten en filas** y se ven todas, como en las
        páginas 26, 27 y 100 del PDF. Antes iban en una fila que se
        desplazaba de lado, y las del final ("Integraciones", "Notas
        internas") no se veían sin saber que había que arrastrar. Desde
        `sm` vuelven a ser una fila.
      */}
      <ul className="-mb-px flex flex-wrap gap-x-5 gap-y-1 sm:flex-nowrap sm:gap-6 sm:overflow-x-auto">
        {tabs.map((tab) => {
          const activa = tab.key === active;
          return (
            <li key={tab.key} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={activa ? "page" : undefined}
                className={`flex items-center gap-2 border-b-2 px-1 pb-2 pt-1 text-sm transition-colors sm:pb-3 focus:outline focus:outline-2 focus:outline-cuotly-green ${
                  activa
                    ? "border-cuotly-green font-semibold text-cuotly-green"
                    : "border-transparent font-medium text-text-secondary hover:text-text"
                }`}
              >
                {tab.label}
                {tab.count === undefined ? null : (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                      tab.countTone === "danger"
                        ? "bg-danger text-surface"
                        : "bg-soft-surface text-text"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
