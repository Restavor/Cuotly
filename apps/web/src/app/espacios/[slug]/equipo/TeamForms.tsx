"use client";

import { useActionState, useState, type ReactNode } from "react";

import { Button, ButtonLink, Card, Field, TextArea } from "@/components/ui";
import { SPECIALTIES } from "@/core/assignment";
import type { MemberRemoval } from "@/core/team-roster";
import { es } from "@/i18n/es";

import { INITIAL_REMOVE_MEMBER, INITIAL_TEAM } from "./action-state";
import { cancelInvitation, removeMember, saveMemberPermissions } from "./actions";

const t = es.teamPage.permissions;

/**
 * M70 · los permisos de una persona, en un único formulario con un único
 * "Guardar cambios", como el dibujo. Cada bloque se manda solo si quien
 * mira puede cambiarlo (`edit*` en el formulario); los demás se pintan
 * deshabilitados. Es cortesía: `saveMemberPermissions()` llama a funciones
 * del servidor que comprueban la capacidad por su cuenta.
 */
export function PermissionsForm({
  spaceId,
  userId,
  establishments,
  selectedEstablishments,
  editEstablishments,
  byRole,
  selectedSpecialties,
  editSpecialties,
  specialtiesApply,
  adminFlags,
  editAdminFlags,
  general,
  history,
}: {
  spaceId: string;
  userId: string;
  establishments: readonly { id: string; name: string; archived: boolean }[];
  selectedEstablishments: readonly string[];
  editEstablishments: boolean;
  /** Propietario o administrador: gestiona todos los restaurantes por su rol. */
  byRole: boolean;
  selectedSpecialties: readonly string[];
  editSpecialties: boolean;
  /** Si realiza trabajos; si no, las especialidades no se le aplican. */
  specialtiesApply: boolean;
  /** Solo para un administrador. */
  adminFlags: { performJobs: boolean; approveReports: boolean } | null;
  editAdminFlags: boolean;
  general: ReactNode;
  history: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveMemberPermissions, INITIAL_TEAM);
  const algoEditable = editEstablishments || editSpecialties || editAdminFlags;

  return (
    <form action={action} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="userId" value={userId} />
      {editEstablishments ? <input type="hidden" name="editEstablishments" value="1" /> : null}
      {editSpecialties ? <input type="hidden" name="editSpecialties" value="1" /> : null}
      {editAdminFlags ? <input type="hidden" name="editAdminFlags" value="1" /> : null}

      <div className="min-w-0">{general}</div>

      <div className="min-w-0 space-y-4">
        <Card title={t.establishmentsTitle}>
          {byRole ? (
            <p className="text-sm text-text-secondary">{t.establishmentsByRole}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-text-secondary">{t.establishmentsIntro}</p>
              {establishments.length === 0 ? (
                <p className="text-sm text-text-secondary">{t.noEstablishmentsInSpace}</p>
              ) : (
                <ul className="divide-y divide-border rounded-[10px] border border-border">
                  {establishments.map((e) => (
                    <li key={e.id}>
                      <label className="flex items-center gap-3 px-3 py-2.5 text-sm text-text">
                        <input
                          type="checkbox"
                          name="establishment"
                          value={e.id}
                          defaultChecked={selectedEstablishments.includes(e.id)}
                          disabled={!editEstablishments}
                          className="h-4 w-4 accent-cuotly-green"
                        />
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {e.name}
                          {e.archived ? <span className="text-text-secondary"> · {t.archived}</span> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        {adminFlags ? (
          <Card title={t.adminTitle}>
            <div className="space-y-4">
              <Interruptor
                name="performJobs"
                label={t.performJobs}
                hint={t.performJobsHint}
                checked={adminFlags.performJobs}
                disabled={!editAdminFlags}
              />
              <Interruptor
                name="approveReports"
                label={t.approveReports}
                hint={t.approveReportsHint}
                checked={adminFlags.approveReports}
                disabled={!editAdminFlags}
              />
            </div>
          </Card>
        ) : null}
      </div>

      <div className="min-w-0 space-y-4">
        <Card title={t.specialtiesTitle}>
          {specialtiesApply ? (
            <>
              <p className="mb-3 text-sm text-text-secondary">{t.specialtiesIntro}</p>
              <ul className="divide-y divide-border rounded-[10px] border border-border">
                {SPECIALTIES.map((key) => (
                  <li key={key}>
                    <label className="flex items-center gap-3 px-3 py-2.5 text-sm text-text">
                      <input
                        type="checkbox"
                        name="specialty"
                        value={key}
                        defaultChecked={selectedSpecialties.includes(key)}
                        disabled={!editSpecialties}
                        className="h-4 w-4 accent-cuotly-green"
                      />
                      {es.naming.specialties[key]}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">{t.specialtiesNotApplicable}</p>
              {/* Las que tenga se conservan: el bloque no se manda si no se aplica. */}
            </>
          )}
        </Card>

        {history}

        {algoEditable ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <Button type="submit" pending={pending}>
                {pending ? t.saving : t.save}
              </Button>
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-danger">
                {state.error}
              </p>
            ) : null}
            {state.done && !pending ? (
              <p role="status" className="text-right text-sm text-text-secondary">
                {t.saved}
              </p>
            ) : null}
            <p className="text-xs text-text-secondary">{t.auditNote}</p>
          </div>
        ) : null}
      </div>
    </form>
  );
}

function Interruptor({
  name,
  label,
  hint,
  checked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 has-disabled:cursor-not-allowed">
      <span className="relative mt-0.5 inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          name={name}
          defaultChecked={checked}
          disabled={disabled}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-cuotly-green peer-disabled:opacity-60 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cuotly-green" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text">{label}</span>
        <span className="block text-xs text-text-secondary">{hint}</span>
      </span>
    </label>
  );
}

/** M71 · cancelar una invitación pendiente. */
export function CancelInvitationButton({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(cancelInvitation, INITIAL_TEAM);
  const ti = es.teamPage.invitations;
  return (
    <form action={action} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      <Button type="submit" variant="danger" className="px-3! py-1.5!" pending={pending}>
        {pending ? ti.cancelling : ti.cancel}
      </Button>
      {state.error ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * M71 · "Reenviar" en el dibujo. Cuotly todavía no envía correos, así que
 * reenviar sería una promesa falsa: lo que sí se puede es volver a copiar
 * el enlace de la invitación para mandarlo uno mismo.
 */
export function CopyInviteLinkButton({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);
  const ti = es.teamPage.invitations;
  return (
    <Button
      type="button"
      variant="secondary"
      className="px-3! py-1.5!"
      onClick={() => {
        const enlace = `${window.location.origin}/invitaciones/${token}`;
        void navigator.clipboard?.writeText(enlace).then(() => setCopiado(true));
      }}
    >
      {copiado ? ti.copied : ti.copyLink}
    </Button>
  );
}

/**
 * Decisión 80 · "Retirar del equipo", al pie de la ficha de una persona
 * (M70). Solo lo ve el propietario (RN-MIE-01); qué enseña lo decide
 * `memberRemoval()`. El servidor vuelve a comprobarlo todo.
 *
 * La tarjeta se queda montada después de retirar: al refrescarse la
 * página la persona ya sale como retirada, y el resumen de lo que ha
 * quedado para reasignar tiene que seguir a la vista —es lo siguiente
 * que hay que hacer—.
 */
export function RemoveMemberCard({
  spaceId,
  slug,
  userId,
  name,
  mode,
}: {
  spaceId: string;
  slug: string;
  userId: string;
  name: string;
  mode: Exclude<MemberRemoval, null>;
}) {
  const [state, action, pending] = useActionState(removeMember, INITIAL_REMOVE_MEMBER);
  const base = `/espacios/${slug}`;

  if (state.done && state.summary) {
    const s = state.summary;
    const pendientes = [
      s.jobs > 0 ? t.removedJobs(s.jobs) : null,
      s.tasks > 0 ? t.removedTasks(s.tasks) : null,
      s.menus > 0 ? t.removedMenus(s.menus) : null,
      s.corrections > 0 ? t.removedCorrections(s.corrections) : null,
    ].filter((linea): linea is string => linea !== null);
    return (
      <Card title={t.removedTitle}>
        <p role="status" className="mb-3 text-sm font-semibold text-success">
          {t.removedDone(name)}
        </p>
        {pendientes.length === 0 ? (
          <p className="text-sm text-text-secondary">{t.removedNothingPending}</p>
        ) : (
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-text">
            {pendientes.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        )}
        {s.jobs > 0 || s.tasks > 0 ? (
          <ButtonLink href={`${base}/equipo?tab=supervision`} variant="secondary" size="sm">
            {t.reassignmentsLink}
          </ButtonLink>
        ) : null}
      </Card>
    );
  }

  if (mode === "removed") {
    return (
      <Card title={t.removedTitle}>
        <p className="text-sm text-text-secondary">{t.removedReason}</p>
      </Card>
    );
  }

  if (mode === "owner") {
    return (
      <Card title={t.removeTitle}>
        <p className="mb-1 text-sm font-semibold text-text">{t.removeOwnerTitle}</p>
        <p className="mb-3 text-sm text-text-secondary">{t.removeOwnerReason}</p>
        <ButtonLink href={`${base}/ajustes/propiedad`} variant="secondary" size="sm">
          {t.removeOwnerLink}
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card title={t.removeTitle}>
      <form action={action}>
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="userId" value={userId} />
        <p className="mb-3 text-sm text-text-secondary">{t.removeIntro}</p>
        <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-text">
          {t.removeConsequences.map((linea) => (
            <li key={linea}>{linea}</li>
          ))}
        </ul>
        <TextArea name="reason" label={t.removeReasonLabel} hint={t.removeReasonHint} rows={2} required />
        <Field name="confirmation" label={t.removeConfirmationLabel(name)} required autoComplete="off" />
        {state.error ? (
          <p role="alert" className="mb-3 text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? t.removing : t.removeSubmit}
        </Button>
      </form>
    </Card>
  );
}
