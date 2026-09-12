"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import {
  grantClientAccess,
  type GrantAccessState,
} from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const INITIAL: GrantAccessState = { error: null, granted: 0, future: false };

/**
 * Maqueta 15 · "Añadir usuario existente" (RN-EST-04).
 *
 * Los cuatro casos de la regla, en un solo alcance: este restaurante,
 * todos los que el grupo tiene ahora, o todos incluidos los futuros. Los
 * dos primeros escriben filas por restaurante; el tercero es una
 * membresía de grupo (migración 74) y por eso no lleva permisos finos ni
 * admite más rol que Editor — la función lo rechaza con su mensaje, no
 * este formulario.
 *
 * Las casillas de permisos finos se ofrecen siempre, y el servidor las
 * normaliza según el rol: marcarlas para un Consulta no le da nada
 * (RN-FIN-07). Se podría ocultar la casilla cuando el rol no es Editor,
 * pero eso exigiría JavaScript para reaccionar al desplegable y esta
 * pantalla funciona sin él (CA-22) — y ocultar no es controlar: quien
 * manda es la función.
 */
export function GrantAccessForm({
  establishmentId,
  groupId,
}: {
  establishmentId: string;
  groupId: string;
}) {
  const [state, action, pending] = useActionState(grantClientAccess, INITIAL);
  const t = es.establishmentSheet;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="groupId" value={groupId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Field
            label={t.grantEmailLabel}
            name="email"
            type="email"
            placeholder={t.grantEmailPlaceholder}
            required
          />
        </div>
        <div className="w-48">
          <Select
            label={t.grantRoleLabel}
            name="role"
            required
            options={[
              { value: "editor", label: t.clientRoles.editor },
              { value: "consulta", label: t.clientRoles.consulta },
              { value: "local_owner", label: t.clientRoles.local_owner },
            ]}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t.grantPending : t.grantSubmit}
        </Button>
      </div>

      <div className="space-y-1 text-sm text-text-secondary">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="editData" className="mt-0.5" />
          <span>{t.grantEditDataLabel}</span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="viewBilling" className="mt-0.5" />
          <span>{t.grantViewBillingLabel}</span>
        </label>
      </div>

      <fieldset className="space-y-1 text-sm text-text-secondary">
        <legend className="text-sm font-medium text-text">{t.grantScopeLabel}</legend>
        {(["this", "allCurrent", "allFuture"] as const).map((scope) => (
          <label key={scope} className="flex items-start gap-2">
            <input
              type="radio"
              name="scope"
              value={scope}
              defaultChecked={scope === "this"}
              className="mt-0.5"
            />
            <span>{t.grantScopes[scope]}</span>
          </label>
        ))}
      </fieldset>

      <p className="text-xs text-text-secondary">{t.grantFutureHint}</p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.future ? (
        <p className="text-sm text-cuotly-green">{t.grantDoneFuture}</p>
      ) : state.granted > 0 ? (
        <p className="text-sm text-cuotly-green">{t.grantDone(state.granted)}</p>
      ) : null}
    </form>
  );
}
