"use client";

import { useActionState } from "react";

import { setEstablishmentManager } from "@/app/espacios/[slug]/restaurantes/[id]/actions";
import { Button, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_SERVICE_STATUS } from "./service-status-action-state";

const t = es.teamArea.establishments;

/**
 * RN-EST-19 · quién del equipo lleva este restaurante (decisión 63).
 *
 * **Lo que más decide la forma de esta pantalla es que sea opcional.** La
 * primera opción del desplegable es "Sin responsable", y no está al final
 * ni escondida detrás de un botón de quitar: dejarlo sin nadie es una
 * respuesta tan válida como cualquier otra, y tiene que costar lo mismo
 * que las demás.
 *
 * **Que se vea no autoriza nada.** `set_establishment_manager()` comprueba
 * `manage_clients` por su cuenta y vuelve a validar que la persona elegida
 * tenga pertenencia activa al espacio, así que un `select` manipulado en
 * el navegador no cuela a nadie (CLAUDE.md: ocultar un control no es un
 * control de acceso). Aquí solo se decide a quién se le ofrece el
 * formulario.
 *
 * Es un `<form>` con acción de servidor: sin JavaScript se envía igual.
 */
export function ManagerForm({
  establishmentId,
  current,
  team,
}: {
  readonly establishmentId: string;
  /** El responsable de ahora, o `null` si no lo lleva nadie. */
  readonly current: string | null;
  /** El equipo del espacio con pertenencia activa, que es quien puede serlo. */
  readonly team: readonly { readonly id: string; readonly name: string }[];
}) {
  const [state, action, pending] = useActionState(
    setEstablishmentManager,
    INITIAL_SERVICE_STATUS,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="establishmentId" value={establishmentId} />

      {/*
        "Sin responsable" va **primera**, no la última: es una respuesta
        normal, no la que se elige cuando se renuncia a las otras.
      */}
      <Select
        name="managerId"
        label={t.manager}
        defaultValue={current ?? ""}
        hint={t.managerHint}
        options={[
          { value: "", label: t.noManager },
          ...team.map((persona) => ({ value: persona.id, label: persona.name })),
        ]}
      />

      <Button type="submit" disabled={pending}>
        {t.managerSave}
      </Button>

      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.done ? (
        <p role="status" className="text-sm text-success">
          {t.managerSaved}
        </p>
      ) : null}
    </form>
  );
}
