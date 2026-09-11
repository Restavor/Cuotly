import type { ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";
import { statusEffects } from "@/core/establishment-status";
import { es } from "@/i18n/es";

/**
 * Maqueta 20 · el aviso de estado, arriba del todo.
 *
 * **Por qué va en la cabecera y no dentro de una pestaña.** Un restaurante
 * pausado está pausado se mire la pestaña que se mire, y quien entra a
 * Gestión a cambiar un dato necesita saberlo antes de escribirlo, no
 * después de que el servidor se lo rechace.
 *
 * **RN-EST-08 · el motivo concreto va junto al estado.** Esa regla lleva
 * escrita desde el Hito 7 y la función que la sirve —
 * `establishment_status_reason()`, el `cause` del último cambio de
 * estado— no la llamaba ninguna pantalla: lo que se enseñaba era una
 * frase genérica igual para las cuatro maneras de tener el servicio
 * detenido. Ahora sale el motivo que alguien escribió al pausar.
 *
 * Cuando no hay motivo guardado NO se inventa uno: se dice lo que el
 * estado significa y ya está. "Pausado por impago" cuando nadie ha
 * escrito que sea por impago es exactamente el dato inventado que
 * CLAUDE.md prohíbe.
 */
export function StatusNotice({
  status,
  reason,
  action,
}: {
  status: string;
  /** El `cause` del último cambio de estado, o `null` si no hay ninguno. */
  reason: string | null;
  /** La acción que corresponda, cuando la pantalla tiene una que ofrecer. */
  action?: ReactNode;
}) {
  const efectos = statusEffects(status);
  if (!efectos.needsNotice) return null;

  const textos = es.establishmentStatus.notices as Readonly<
    Record<string, { readonly title: string; readonly meaning: string }>
  >;
  const texto = textos[status] ?? textos.unknown;

  /*
   * El ámbar no llega a 3:1 sobre su propio tinte y AA lo pide para lo que
   * no es texto (la misma medición que hay en `States.tsx`), así que
   * `warning` toma prestado el tinte de `info`: sigue avisando y se ve.
   */
  const marco =
    efectos.tone === "danger"
      ? "border-danger/30 bg-danger/10"
      : efectos.tone === "success"
        ? "border-cuotly-green/30 bg-cuotly-green/10"
        : efectos.tone === "neutral"
          ? "border-border bg-soft-surface"
          : "border-info/30 bg-info/10";

  const tinta =
    efectos.tone === "danger"
      ? "text-danger"
      : efectos.tone === "neutral"
        ? "text-text-secondary"
        : "text-info";

  return (
    <div className={`flex flex-wrap items-start gap-4 rounded-[14px] border p-4 ${marco}`}>
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface ${tinta}`}
      >
        <Icon name={efectos.serviceRunning ? "alert" : "clock"} className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${tinta}`}>{texto.title}</p>
        <p className="mt-0.5 text-sm text-text">{texto.meaning}</p>

        {/*
          El motivo concreto (RN-EST-08). Va en su propia línea y entre
          comillas: es algo que escribió una persona, no una frase de la
          aplicación, y mezclarlas haría dudar de cuál es cuál.
        */}
        {reason === null ? null : (
          <p className="mt-2 text-sm text-text-secondary">
            {es.establishmentStatus.reasonLabel} «{reason}»
          </p>
        )}

        {/*
          Lo que el servicio detenido implica de verdad, dicho una vez:
          RN-FIN-12 detiene trabajos, publicaciones y contadores, y quien
          lo lee necesita saber que el reloj no corre en su contra.
        */}
        {efectos.serviceRunning ? null : (
          <p className="mt-2 text-xs text-text-secondary">
            {es.establishmentStatus.serviceStoppedHint}
          </p>
        )}
      </div>

      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  );
}
