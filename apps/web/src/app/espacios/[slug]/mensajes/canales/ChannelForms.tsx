"use client";

import { useActionState } from "react";

import { Button, Card, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_CHANNEL } from "./action-state";
import {
  addChannelMember,
  createChannel,
  removeChannelMember,
  setChannelArchived,
} from "./actions";

const t = es.teamArea.channels;

function Feedback({ state }: { state: { error: string | null; done: boolean } }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.done) {
    return (
      <p role="status" className="text-sm text-success">
        {t.done}
      </p>
    );
  }
  return null;
}

export function CreateChannelForm({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState(createChannel, INITIAL_CHANNEL);

  return (
    <Card title={t.createTitle}>
      <form action={action} className="space-y-3">
        <input type="hidden" name="spaceId" value={spaceId} />
        <p className="text-sm text-text-secondary">{t.createHint}</p>
        <Field label={t.nameLabel} name="name" required />
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t.pending : t.createSubmit}
        </Button>
      </form>
    </Card>
  );
}

/**
 * RN-CAN-04 · quien administra el espacio elige quién entra.
 *
 * El desplegable solo enseña gente del equipo, que es lo que
 * `add_channel_member()` acepta: RN-CAN-02 dice que el cliente no entra en
 * un canal, nunca, y ofrecerlo en la lista para que el servidor lo rechace
 * sería enseñar una puerta que se abre en un error.
 */
export function ChannelMembersForm({
  conversationId,
  candidates,
  members,
}: {
  conversationId: string;
  candidates: readonly { id: string; name: string }[];
  members: readonly { userId: string; name: string }[];
}) {
  const [addState, addAction, adding] = useActionState(addChannelMember, INITIAL_CHANNEL);
  const [removeState, removeAction, removing] = useActionState(
    removeChannelMember,
    INITIAL_CHANNEL,
  );

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.membersEmpty}</p>
      ) : (
        <ul className="space-y-1">
          {members.map((miembro) => (
            <li key={miembro.userId} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text">{miembro.name}</span>
              <form action={removeAction}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <input type="hidden" name="userId" value={miembro.userId} />
                <button
                  type="submit"
                  disabled={removing}
                  className="text-sm text-danger underline disabled:opacity-60"
                >
                  {t.remove}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Feedback state={removeState} />

      {candidates.length === 0 ? (
        <p className="text-sm text-text-secondary">{t.noCandidates}</p>
      ) : (
        <form action={addAction} className="space-y-2">
          <input type="hidden" name="conversationId" value={conversationId} />
          <Select
            label={t.addLabel}
            name="userId"
            defaultValue=""
            options={[
              { value: "", label: t.addChoose },
              ...candidates.map((persona) => ({ value: persona.id, label: persona.name })),
            ]}
          />
          <Feedback state={addState} />
          <Button type="submit" variant="secondary" disabled={adding}>
            {adding ? t.pending : t.add}
          </Button>
        </form>
      )}
    </div>
  );
}

export function ArchiveChannelButton({
  conversationId,
  archived,
}: {
  conversationId: string;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState(setChannelArchived, INITIAL_CHANNEL);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <Feedback state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.pending : archived ? t.unarchive : t.archive}
      </Button>
    </form>
  );
}
