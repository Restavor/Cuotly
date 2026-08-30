import type { ReactNode } from "react";
import { es } from "@/i18n/es";

type StateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

/**
 * Los cuatro estados obligatorios de cualquier pantalla con datos (PRD
 * §20.7): cargando, sin datos, error, sin permisos. Ninguna pantalla debe
 * mostrar una lista vacía en blanco o un hueco sin explicación.
 */

function StateShell({ icon, title, description, action }: StateProps & { icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-border px-6 py-12 text-center">
      <div aria-hidden="true" className="text-2xl">
        {icon}
      </div>
      <p className="font-semibold text-text">{title}</p>
      {description ? <p className="max-w-sm text-sm text-text-secondary">{description}</p> : null}
      {action}
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
}: StateProps) {
  return <StateShell icon="🗂️" title={title} description={description} action={action} />;
}

export function ErrorState({
  title = es.states.errorTitle,
  description = es.states.errorDescription,
  action,
}: StateProps) {
  return (
    <div role="alert">
      <StateShell icon="⚠️" title={title} description={description} action={action} />
    </div>
  );
}

export function NoPermissionState({
  title = es.states.noPermissionTitle,
  description = es.states.noPermissionDescription,
  action,
}: StateProps) {
  return <StateShell icon="🔒" title={title} description={description} action={action} />;
}
