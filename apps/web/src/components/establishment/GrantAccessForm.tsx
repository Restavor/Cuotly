"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import {
  grantClientAccess,
  type GrantAccessState,
} from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const INITIAL: GrantAccessState = { error: null, granted: 0 };

/**
 * Maqueta 15 · "Añadir usuario existente" (RN-EST-04).
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
        <label className="flex items-start gap-2">
          <input type="checkbox" name="allCurrent" className="mt-0.5" />
          <span>{t.grantAllCurrentLabel}</span>
        </label>
      </div>

      {/*
        RN-EST-04 tiene cuatro casos y aquí hay tres. El cuarto —"y todos
        los futuros"— no es una lista de restaurantes sino una regla
        permanente sobre restaurantes que aún no existen, y eso necesita un
        modelo que nadie ha decidido. Se dice, en vez de dejar que alguien
        marque "todos" y dé por hecho que incluye los de mañana.
      */}
      <p className="text-xs text-text-secondary">{t.grantFuturePending}</p>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.granted > 0 ? (
        <p className="text-sm text-cuotly-green">{t.grantDone(state.granted)}</p>
      ) : null}
    </form>
  );
}
