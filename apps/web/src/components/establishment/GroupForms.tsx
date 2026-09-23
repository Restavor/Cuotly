"use client";

import { useActionState } from "react";

import {
  createGroup,
  moveEstablishmentToGroup,
  updateGroup,
} from "@/app/espacios/[slug]/restaurantes/grupos/actions";
import {
  INITIAL_GROUP_ACTION,
  PREVIOUS_ACCESS_CHOICES,
  type GroupActionState,
} from "@/app/espacios/[slug]/restaurantes/grupos/group-action-state";
import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

const t = es.teamArea.groups;

function Feedback({ state }: { state: GroupActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (!state.done) return null;
  if (state.moved === false) {
    return (
      <p role="status" className="text-sm text-text-secondary">
        {t.moveAlreadyThere}
      </p>
    );
  }
  if (state.moved === true) {
    return (
      <p role="status" className="text-sm text-cuotly-green">
        {t.moveDone(state.keptAsEditor ?? 0, state.lostAccess ?? 0)}
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-cuotly-green">
      {t.saved}
    </p>
  );
}

/**
 * RN-EST-20 · crear un grupo vacío, con nombre y descripción. La clave de
 * idempotencia llega del servidor, una por carga de la página: pulsar dos
 * veces "Crear grupo" crea uno (CLAUDE.md).
 */
export function CreateGroupForm({
  spaceId,
  slug,
  idempotencyKey,
}: {
  spaceId: string;
  slug: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(createGroup, INITIAL_GROUP_ACTION);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Field label={t.nameLabel} name="name" required maxLength={120} />
      <TextArea label={t.descriptionLabel} name="description" rows={3} hint={t.descriptionHint} />
      <p className="pb-2 text-sm text-text-secondary">{t.createHint}</p>
      <Feedback state={state} />
      <Button type="submit" disabled={pending}>
        {pending ? t.pending : t.createSubmit}
      </Button>
    </form>
  );
}

/** RN-EST-20 · renombrar un grupo y cambiar su descripción. */
export function EditGroupForm({
  groupId,
  name,
  description,
}: {
  groupId: string;
  name: string;
  description: string | null;
}) {
  const [state, action, pending] = useActionState(updateGroup, INITIAL_GROUP_ACTION);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="groupId" value={groupId} />
      <Field label={t.nameLabel} name="name" required maxLength={120} defaultValue={name} />
      <TextArea
        label={t.descriptionLabel}
        name="description"
        rows={3}
        defaultValue={description ?? ""}
        hint={t.descriptionHint}
      />
      <Feedback state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.pending : t.editSubmit}
      </Button>
    </form>
  );
}

/**
 * RN-EST-20 · qué pasa con quien entraba por el grupo de origen. **No hay
 * opción marcada por defecto**: lo decide quien mueve, no un valor que se
 * cuela sin leerlo, y la acción rechaza el envío sin elegir.
 */
function PreviousAccessChoice() {
  return (
    <fieldset className="mb-4 space-y-2 text-sm">
      <legend className="mb-1 text-sm font-semibold text-text">{t.previousAccessLegend}</legend>
      <p className="text-text-secondary">{t.previousAccessHint}</p>
      {PREVIOUS_ACCESS_CHOICES.map((choice) => (
        <label key={choice} className="flex items-start gap-2">
          <input type="radio" name="previousAccess" value={choice} required className="mt-0.5" />
          <span>
            <span className="block font-medium text-text">{t.previousAccess[choice].title}</span>
            <span className="block text-text-secondary">{t.previousAccess[choice].hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * M82 · "Asignar establecimiento": traer a ESTE grupo un restaurante que
 * está en otro. Lo usa el equipo desde la pantalla de Grupos.
 */
export function AssignEstablishmentForm({
  groupId,
  establishments,
}: {
  groupId: string;
  establishments: readonly { readonly id: string; readonly label: string }[];
}) {
  const [state, action, pending] = useActionState(moveEstablishmentToGroup, INITIAL_GROUP_ACTION);
  return (
    <form action={action}>
      <input type="hidden" name="groupId" value={groupId} />
      <Select
        label={t.assignEstablishmentLabel}
        name="establishmentId"
        required
        defaultValue=""
        options={[
          { value: "", label: t.assignEstablishmentPlaceholder },
          ...establishments.map((row) => ({ value: row.id, label: row.label })),
        ]}
      />
      <PreviousAccessChoice />
      <div className="space-y-2">
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t.pending : t.assignSubmit}
        </Button>
      </div>
    </form>
  );
}

/**
 * RN-EST-20 · "Cambiar de grupo": llevar ESTE restaurante a otro grupo.
 * Los destinos son los de `establishment_move_targets()`: al equipo, todos
 * los del espacio; al propietario del restaurante, los suyos.
 */
export function MoveToGroupForm({
  establishmentId,
  targets,
}: {
  establishmentId: string;
  targets: readonly { readonly id: string; readonly name: string }[];
}) {
  const [state, action, pending] = useActionState(moveEstablishmentToGroup, INITIAL_GROUP_ACTION);
  return (
    <form action={action}>
      <input type="hidden" name="establishmentId" value={establishmentId} />
      <Select
        label={t.moveTargetLabel}
        name="groupId"
        required
        defaultValue=""
        options={[
          { value: "", label: t.moveTargetPlaceholder },
          ...targets.map((group) => ({ value: group.id, label: group.name })),
        ]}
      />
      <PreviousAccessChoice />
      <div className="space-y-2">
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t.pending : t.moveSubmit}
        </Button>
      </div>
    </form>
  );
}
