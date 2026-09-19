"use client";

import { useActionState } from "react";

import { Button, Field } from "@/components/ui";
import { es } from "@/i18n/es";

import {
  grantClientAccess,
  type GrantAccessState,
} from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const INITIAL: GrantAccessState = { error: null, granted: 0, future: false };

/**
 * Página 56 del diseño · "Crear panel del restaurante" (RN-PAN-10).
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
        Es la frase de la página 56 del diseño, y está ahí porque es la
        pregunta que se hace quien va a pulsar: "¿esto le abre un espacio
        de mantenimiento? ¿le cobra algo?".
      */}
      <p className="rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
        <span className="font-semibold text-text">{t.panelBelongsTitle}</span> {t.panelBelongsHint}
      </p>

      {/* Los tres datos del restaurante, para leer, como en el diseño. */}
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t.panelRestaurantLabel}
          </dt>
          <dd className="text-text">{establishmentName}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t.panelCodeLabel}
          </dt>
          <dd className="text-text">{code}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t.panelGroupLabel}
          </dt>
          <dd className="text-text">{groupName ?? t.panelNoGroup}</dd>
        </div>
      </dl>

      <div className="w-full sm:w-80">
        <Field
          label={t.panelOwnerLabel}
          name="email"
          type="email"
          placeholder={t.grantEmailPlaceholder}
          hint={t.panelOwnerHint}
          required
        />
      </div>

      {/*
        "Revisar accesos del cliente" del diseño. Son lo que HOY concede el
        rol de propietario local, no casillas que se elijan aquí: los
        permisos finos del diseño (siete por rol) siguen sin decidirse, y
        pintar casillas que no hacen nada sería justo lo que CLAUDE.md
        prohíbe.
      */}
      <div className="rounded-[10px] border border-border p-3">
        <p className="mb-2 text-sm font-medium text-text">{t.panelAccessTitle}</p>
        <ul className="space-y-1 text-sm text-text-secondary">
          {t.panelAccessItems.map((linea) => (
            <li key={linea}>· {linea}</li>
          ))}
        </ul>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t.panelCreatePending : t.panelCreateSubmit}
      </Button>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.granted > 0 ? <p className="text-sm text-cuotly-green">{t.panelCreated}</p> : null}
    </form>
  );
}
