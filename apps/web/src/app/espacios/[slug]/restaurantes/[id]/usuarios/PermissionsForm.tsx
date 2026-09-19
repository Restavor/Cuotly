"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui";
import { es } from "@/i18n/es";

import { saveClientPermissions, type SavePermissionsState } from "./actions";
import { CLIENT_PERMISSIONS, type ClientPermission } from "./users-load";

const INITIAL: SavePermissionsState = { error: null, saved: false };

/**
 * Página 153 del diseño · las siete casillas de un Editor, con el nombre
 * y la explicación que el diseño les da.
 *
 * Es un formulario de servidor, sin estado de navegador: funciona sin que
 * hidrate JavaScript (CA-22), y lo que decide es
 * `set_establishment_permissions()`. Que este formulario se pinte no
 * autoriza nada — a quien no tenga "Usuarios y accesos" el servidor le
 * contesta que no aunque llame a la acción a mano (CLAUDE.md).
 *
 * Las siete se mandan siempre, marcadas o no: desmarcar una casilla es
 * guardarla en `false`, y un formulario solo envía las marcadas. Por eso
 * la acción recorre la lista entera en vez de fiarse de lo que llega.
 */
export function PermissionsForm({
  establishmentId,
  userId,
  personName,
  current,
}: {
  establishmentId: string;
  userId: string;
  personName: string;
  current: Readonly<Record<ClientPermission, boolean>>;
}) {
  const [state, action, pending] = useActionState(saveClientPermissions, INITIAL);
  const t = es.panelUsers;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="userId" value={userId} />

      {/*
        La explicación va en `aria-describedby` y NO dentro del `<label>`:
        metida ahí, el nombre accesible de la casilla pasa a ser "Crear
        solicitudes Puede enviar solicitudes al equipo de mantenimiento",
        que es lo que lee un lector de pantalla en voz alta cada vez. El
        nombre es el nombre; la explicación se describe aparte.
      */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-text">{t.editTitle(personName)}</legend>
        {CLIENT_PERMISSIONS.map((name) => (
          <div key={name} className="flex items-start gap-3">
            <input
              id={`${userId}-${name}`}
              type="checkbox"
              name={name}
              defaultChecked={current[name]}
              aria-describedby={`${userId}-${name}-hint`}
              className="mt-1"
            />
            <div>
              <label
                htmlFor={`${userId}-${name}`}
                className="block text-sm font-medium text-text"
              >
                {t.permissions[name]}
              </label>
              <p id={`${userId}-${name}-hint`} className="text-xs text-text-secondary">
                {t.permissionHints[name]}
              </p>
            </div>
          </div>
        ))}
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? t.saving : t.save}
      </Button>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.saved ? <p className="text-sm text-cuotly-green">{t.saved}</p> : null}
    </form>
  );
}
