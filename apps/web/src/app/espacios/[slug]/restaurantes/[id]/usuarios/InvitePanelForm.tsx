"use client";

import { useActionState } from "react";

import { Button, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import {
  grantClientAccess,
  type GrantAccessState,
} from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const INITIAL: GrantAccessState = { error: null, granted: 0, future: false, invited: false };

/**
 * Página 153 del diseño móvil · "Invitar usuario" (RN-ACC-13, RN-PAN-14).
 *
 * Un solo formulario para los dos casos, porque **quien lo rellena no
 * tiene por qué saber cuál le toca**: escribe el correo y el servidor
 * decide. Si esa persona ya tiene cuenta de Cuotly, entra en el momento;
 * si no, se crea una invitación —y, si la manda el restaurante, el equipo
 * de mantenimiento tiene que aprobarla antes de que llegue el enlace—.
 *
 * Es la versión de dentro del panel de `GrantAccessForm`, que es la del
 * equipo. Esta no ofrece alcance de grupo: un grupo es organización del
 * equipo y desde aquí solo se invita a ESTE restaurante.
 *
 * Los permisos finos se ofrecen siempre y el servidor los normaliza según
 * el rol (RN-EST-11): marcarlos para un Propietario no cambia nada,
 * porque ya los tiene. Ocultarlos según el desplegable exigiría
 * JavaScript, y esta pantalla funciona sin él (CA-22).
 */
export function InvitePanelForm({ establishmentId }: { establishmentId: string }) {
  const [state, action, pending] = useActionState(grantClientAccess, INITIAL);
  const t = es.establishmentSheet;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      {/* Desde el panel solo se invita a este restaurante. El campo va
          fijo y no como una opción que el servidor tendría que rechazar. */}
      <input type="hidden" name="scope" value="this" />

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

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.invited ? (
        <p className="text-sm text-cuotly-green">{t.grantDoneInvited}</p>
      ) : state.granted > 0 ? (
        <p className="text-sm text-cuotly-green">{t.grantDone(state.granted)}</p>
      ) : null}
    </form>
  );
}
