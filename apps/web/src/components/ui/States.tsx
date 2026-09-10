import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * Los cuatro estados obligatorios de cualquier pantalla con datos (PRD
 * §20.7): cargando, sin datos, error, sin permisos. Ninguna pantalla debe
 * mostrar una lista vacía en blanco o un hueco sin explicación.
 *
 * **Un estado vacío tiene que apetecer, no solo ser honesto.** Los cuatro
 * se pintaban con un emoji dentro de una caja de borde discontinuo, y eso
 * fallaba por dos motivos que no son de gusto:
 *
 * 1. **El emoji no es del sistema.** Emerald Control tiene su juego de
 *    iconos, de trazo y grosor únicos; un 🗂️ lo dibuja cada sistema
 *    operativo a su manera —en Windows es de otro color y de otra
 *    proporción— y aparecía junto a iconos de trazo fino, desafinando.
 *    CLAUDE.md pide tipografía y color por los tokens del sistema; un
 *    emoji es ambas cosas fuera de él.
 * 2. **El borde discontinuo se lee como "roto".** Es la convención de "aquí
 *    falta algo / esto está sin terminar", y estos huecos no están sin
 *    terminar: son la respuesta correcta cuando no hay datos.
 *
 * Ahora los cuatro comparten una figura: icono del juego dentro de un
 * círculo con el tinte de su tono, título, motivo y —lo que más importa—
 * un sitio para la acción. Un hueco que ofrece el siguiente paso invita;
 * uno que solo se disculpa, no.
 */

type StateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Un icono más concreto que el del tono, cuando la pantalla lo sabe. */
  icon?: IconName;
};

type Tone = "neutral" | "info" | "warning" | "danger";

/*
 * El icono va en el color del tono sobre su propio tinte, y eso se mide,
 * no se elige a ojo: AA pide 3:1 para lo que no es texto, y sobre un tinte
 * del 10 % dan 4,03:1 el neutro, 3,62:1 `info` y 3,69:1 `danger`.
 *
 * `warning` NO está: sobre su tinte da 2,15:1 y no hay manera de subirlo
 * sin inventarse un ámbar más oscuro, que sería un color de marca nuevo
 * (la paleta la fija el PRD §20.6). Donde hacía falta avisar sin alarmar
 * se usa `info`, que sí pasa y significa lo mismo aquí: "hay algo que
 * hacer", no "algo ha fallado".
 */
const TONO: Readonly<Record<Tone, { readonly icon: IconName; readonly clase: string }>> = {
  neutral: { icon: "document", clase: "bg-soft-surface text-text-secondary" },
  info: { icon: "search", clase: "bg-info/10 text-info" },
  warning: { icon: "alert", clase: "bg-info/10 text-info" },
  danger: { icon: "alert", clase: "bg-danger/10 text-danger" },
};

function StateShell({
  tone,
  icon,
  title,
  description,
  action,
}: StateProps & { tone: Tone }) {
  const { icon: iconoDelTono, clase } = TONO[tone];

  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-soft-surface/60 px-6 py-10 text-center">
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 items-center justify-center rounded-full ${clase}`}
      >
        <Icon name={icon ?? iconoDelTono} className="h-6 w-6" />
      </span>

      <span className="max-w-sm">
        <span className="block font-semibold text-text">{title}</span>
        {description ? (
          <span className="mt-1 block text-sm text-text-secondary">{description}</span>
        ) : null}
      </span>

      {/*
        La acción, cuando la hay, separada del texto: es el motivo por el
        que este hueco no es un callejón sin salida.
      */}
      {action ? <span className="mt-1">{action}</span> : null}
    </div>
  );
}

export function LoadingState({ title = es.states.loading }: { title?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-cuotly-green"
      />
      <p className="text-sm text-text-secondary">{title}</p>
    </div>
  );
}

export function EmptyState({
  title = es.states.emptyTitle,
  description = es.states.emptyDescription,
  action,
  icon,
}: StateProps) {
  return (
    <StateShell tone="neutral" icon={icon} title={title} description={description} action={action} />
  );
}

export function ErrorState({
  title = es.states.errorTitle,
  description = es.states.errorDescription,
  action,
  icon,
}: StateProps) {
  return (
    <div role="alert">
      <StateShell tone="danger" icon={icon} title={title} description={description} action={action} />
    </div>
  );
}

export function NoPermissionState({
  title = es.states.noPermissionTitle,
  description = es.states.noPermissionDescription,
  action,
  icon,
}: StateProps) {
  /*
    Con candado y en tono neutro, no en rojo: no poder ver algo no es un
    error de nadie ni un fallo de la pantalla. Pintarlo de alarma sugiere
    que hay que hacer algo, y no lo hay.
  */
  return (
    <StateShell tone="neutral" icon={icon ?? "lock"} title={title} description={description} action={action} />
  );
}
