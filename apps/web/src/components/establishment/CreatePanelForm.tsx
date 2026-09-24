"use client";

import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import {
  grantClientAccess,
  type GrantAccessState,
} from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const INITIAL: GrantAccessState = { error: null, granted: 0, future: false, invited: false };

/**
 * M81 (página 56 del diseño) · "Crear panel del restaurante" (RN-PAN-10).
 *
 * El "Cancelar" del dibujo no está: aquí el formulario va dentro del
 * bloque de Usuarios, no en una pantalla propia, y no hay nada de lo que
 * salir. El "Se enviará una invitación" tampoco: Cuotly no envía correos,
 * y la ayuda del campo dice lo que pasa de verdad.
 *
 * **No hay acción nueva detrás.** Crear el panel es dar el primer acceso,
 * así que esto llama a `grantClientAccess()` como el formulario de
 * usuarios — con el rol fijo en propietario local y el alcance en este
 * restaurante—. Una acción propia sería una segunda puerta que comprueba
 * los mismos permisos, y dos puertas acaban discrepando.
 *
 * El rol y el alcance van en campos ocultos y **el servidor los vuelve a
 * leer**: quien mande el formulario a mano puede cambiarlos, y lo que
 * pasará es lo que `grant_establishment_access()` permita, no lo que diga
 * este HTML (CLAUDE.md: ocultar no es controlar).
 */
export function CreatePanelForm({
  establishmentId,
  groupId,
  establishmentName,
  code,
  groupName,
}: {
  establishmentId: string;
  groupId: string;
  establishmentName: string;
  code: string;
  groupName: string | null;
}) {
  const [state, action, pending] = useActionState(grantClientAccess, INITIAL);
  const t = es.establishmentSheet;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="role" value="local_owner" />
      <input type="hidden" name="scope" value="this" />

      {/*
        RN-PAN-11 · lo que crear el panel NO hace, dicho antes de crearlo.
        Es el aviso azul de M81, y está ahí porque es la pregunta que se
        hace quien va a pulsar: "¿esto le abre un espacio de
        mantenimiento? ¿le cobra algo?".
      */}
      <div className="flex items-start gap-3 rounded-[10px] bg-info/10 p-4 text-sm">
        <Icon name="info" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <div>
          <p className="font-semibold text-text">{t.panelBelongsTitle}</p>
          <p className="text-text-secondary">{t.panelBelongsHint}</p>
        </div>
      </div>

      {/*
        M81 · dos columnas: a la izquierda el restaurante, para leer (los
        campos bloqueados del dibujo); a la derecha quién va a ser su
        propietario y lo que ese rol le abre.
      */}
      <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
        <div>
          <Field label={t.panelRestaurantLabel} name="panelRestaurant" value={establishmentName} readOnly disabled />
          <Field label={t.panelCodeLabel} name="panelCode" value={code} readOnly disabled />
          <Field label={t.panelGroupLabel} name="panelGroup" value={groupName ?? t.panelNoGroup} readOnly disabled />
        </div>

        <div>
          <Field
            label={t.panelOwnerLabel}
            name="email"
            type="email"
            placeholder={t.grantEmailPlaceholder}
            hint={t.panelOwnerHint}
            required
          />

          {/*
            "Revisar accesos del cliente" del dibujo. Son lo que HOY concede
            el rol de propietario local, no casillas que se elijan aquí: los
            permisos finos del diseño (siete por rol) siguen sin decidirse,
            y pintar casillas que no hacen nada sería justo lo que CLAUDE.md
            prohíbe.
          */}
          <p className="mb-1.5 text-sm font-semibold text-text">{t.panelAccessTitle}</p>
          <ul className="space-y-1.5 rounded-[10px] border border-border bg-soft-surface/60 p-3 text-sm text-text-secondary">
            {t.panelAccessItems.map((linea) => (
              <li key={linea} className="flex items-start gap-2">
                <Icon name="check" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cuotly-green" />
                {linea}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t.panelCreatePending : t.panelCreateSubmit}
        </Button>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.granted > 0 ? <p className="text-sm text-cuotly-green">{t.panelCreated}</p> : null}
    </form>
  );
}
