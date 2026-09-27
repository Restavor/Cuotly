"use client";

import { useActionState } from "react";

import { Button, Card, Field, Select } from "@/components/ui";
import { MENU_KINDS } from "@/core/daily-menu";
import { es } from "@/i18n/es";

import { INITIAL_MENU_ACTION } from "./action-state";
import { createMenu } from "./actions";

const t = es.dailyMenuClient;

/**
 * RN-MEN-01 · nombre, tipo y fecha objetivo. El contenido se guarda
 * después, por versiones. La plantilla no se elige (RN-CRE-23): la pone el
 * servidor.
 */
export function NewMenuForm({
  slug,
  establishmentId,
  defaultDate,
}: {
  slug: string;
  establishmentId: string;
  defaultDate: string;
}) {
  const action = createMenu.bind(null, slug, establishmentId);
  const [state, formAction, pending] = useActionState(action, INITIAL_MENU_ACTION);

  return (
    <Card title={t.newTitle}>
      <form action={formAction} className="space-y-4">
        <Field label={t.newNameLabel} name="name" required hint={t.newNameHint} />
        <Select
          label={t.newKindLabel}
          name="kind"
          options={MENU_KINDS.map((kind) => ({ value: kind, label: es.naming.menuKinds[kind] }))}
        />
        <Field label={t.newDateLabel} name="targetDate" type="date" required defaultValue={defaultDate} hint={t.newDateHint} />
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? t.newSubmitPending : t.newSubmit}
        </Button>
      </form>
    </Card>
  );
}
