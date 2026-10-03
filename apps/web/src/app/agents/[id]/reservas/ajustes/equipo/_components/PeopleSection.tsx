"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card, Field, Modal } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { es } from "@/i18n/es";
import type { Person } from "@/services/agents/team-gateway";

import { addStaffAction, removeManagerAction, removeStaffAction, setStaffPinAction } from "../actions";
import type { TeamFeedback } from "../action-state";
import { PinFields } from "./PinFields";

type Dialog =
  | { readonly kind: "add" }
  | { readonly kind: "pin"; readonly person: Person }
  | { readonly kind: "remove"; readonly person: Person }
  | null;

/**
 * Las personas de Reservas (`AjustesEquipo`): Propietarios y Encargados, que entran con su email, y el Equipo, que
 * entra con su PIN en la tablet. Cada botón llama a una acción que vuelve a comprobar el permiso en la base de datos;
 * esto solo los pinta y enseña por qué una orden no se hizo.
 */
export function PeopleSection({
  establishmentId,
  people,
  myUserId,
  canRemoveManagers,
  idempotencyKey,
}: {
  establishmentId: string;
  people: readonly Person[];
  /** Quien mira, si es una persona con cuenta (para el «Tú»). `null` en la tablet. */
  myUserId: string | null;
  /** Quitar a un Encargado de Reservas: solo el propietario del restaurante y el equipo del espacio (decisión 110). */
  canRemoveManagers: boolean;
  /** Una clave nueva por pantalla: pulsar dos veces «Añadir» no crea dos personas. */
  idempotencyKey: string;
}) {
  const t = es.agents.team;
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [fields, setFields] = useState({ pin: "", pinRepeat: "" });
  const [error, setError] = useState<{ message: string; field?: "name" | "pin" | "pinRepeat" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setDialog(null);
    setName("");
    setFields({ pin: "", pinRepeat: "" });
    setError(null);
  }

  function run(task: () => Promise<TeamFeedback>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError({ message: result.message, ...(result.field === "name" || result.field === "pin" || result.field === "pinRepeat" ? { field: result.field } : {}) });
        return;
      }
      setNotice(result.message);
      close();
      router.refresh();
    });
  }

  const fieldError = (field: "name" | "pin" | "pinRepeat") => (error?.field === field ? error.message : undefined);
  const generalError = error && !error.field ? error.message : null;

  return (
    <Card title={t.peopleTitle} subtitle={t.peopleCount(people.length)}>
      {notice ? (
        <p role="status" className="mb-3 rounded-field bg-success/10 px-3 py-2 text-sm text-text">
          {notice}
        </p>
      ) : null}

      <ul className="divide-y divide-border">
        {people.map((person) => {
          const mine = person.kind === "member" && person.id === myUserId;
          return (
            <li key={`${person.kind}-${person.id}`} className="flex flex-wrap items-center gap-3 py-3" data-testid="person-row">
              <Avatar name={person.name} size={40} />
              <span className="min-w-[11rem] flex-1">
                <span className="block truncate text-[15px] font-semibold text-text">
                  {person.name}
                  {mine ? <span className="font-normal text-text-secondary"> · {t.you}</span> : null}
                </span>
                <span className="block text-xs text-text-secondary">
                  {t.roles[person.role]} · {person.kind === "member" ? t.entry.member : t.entry.staff}
                  {person.kind === "member" ? ` · ${person.hasPin ? t.pinSet : t.pinMissing}` : ""}
                </span>
              </span>
              {person.kind === "staff" ? (
                <>
                  <Button type="button" variant="secondary" className="min-h-11" onClick={() => setDialog({ kind: "pin", person })}>
                    {t.changePin}
                  </Button>
                  <Button type="button" variant="secondary" className="min-h-11" onClick={() => setDialog({ kind: "remove", person })}>
                    {t.remove}
                  </Button>
                </>
              ) : person.role === "manager" && canRemoveManagers ? (
                <Button type="button" variant="secondary" className="min-h-11" onClick={() => setDialog({ kind: "remove", person })}>
                  {t.removeManager}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setDialog({ kind: "add" })}>
          + {t.addTitle}
        </Button>
        <p className="text-sm text-text-secondary">{t.addHint}</p>
      </div>

      <Modal open={dialog?.kind === "add"} title={t.addTitle} onClose={close}>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            run(() => addStaffAction({ establishmentId, name, ...fields, idempotencyKey }));
          }}
        >
          {generalError ? (
            <p role="alert" className="mb-3 text-sm text-danger">
              {generalError}
            </p>
          ) : null}
          <Field label={t.nameLabel} value={name} maxLength={80} autoComplete="off" required error={fieldError("name")} onChange={(e) => setName(e.target.value)} />
          <PinFields {...fields} onChange={setFields} errors={{ pin: fieldError("pin"), pinRepeat: fieldError("pinRepeat") }} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="min-h-11" onClick={close}>
              {t.cancel}
            </Button>
            <Button type="submit" className="min-h-11" pending={busy}>
              {t.add}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog?.kind === "pin"} title={dialog?.kind === "pin" ? `${t.changePin} · ${dialog.person.name}` : t.changePin} onClose={close}>
        {dialog?.kind === "pin" ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              run(() => setStaffPinAction({ establishmentId, staffId: dialog.person.id, ...fields }));
            }}
          >
            {generalError ? (
              <p role="alert" className="mb-3 text-sm text-danger">
                {generalError}
              </p>
            ) : null}
            <PinFields {...fields} onChange={setFields} pinLabel={t.newPinLabel} errors={{ pin: fieldError("pin"), pinRepeat: fieldError("pinRepeat") }} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="min-h-11" onClick={close}>
                {t.cancel}
              </Button>
              <Button type="submit" className="min-h-11" pending={busy}>
                {t.save}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={dialog?.kind === "remove"} title={dialog?.kind === "remove" ? dialog.person.name : t.remove} onClose={close}>
        {dialog?.kind === "remove" ? (
          <div className="space-y-4">
            <p className="text-sm">
              {dialog.person.kind === "staff" ? t.confirmRemove(dialog.person.name) : t.confirmRemoveManager(dialog.person.name)}
            </p>
            {generalError ? (
              <p role="alert" className="text-sm text-danger">
                {generalError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="min-h-11" onClick={close}>
                {t.cancel}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="min-h-11"
                pending={busy}
                onClick={() =>
                  run(() =>
                    dialog.person.kind === "staff"
                      ? removeStaffAction({ establishmentId, staffId: dialog.person.id })
                      : removeManagerAction({ establishmentId, userId: dialog.person.id }),
                  )
                }
              >
                {dialog.person.kind === "staff" ? t.remove : t.removeManager}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}
