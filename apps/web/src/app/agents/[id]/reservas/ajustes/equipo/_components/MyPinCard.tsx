"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card } from "@/components/ui";
import { es } from "@/i18n/es";

import { setMyPinAction } from "../actions";
import { PinFields } from "./PinFields";

/**
 * «Mi PIN para la tablet» (`AjustesEquipo`, PRD de agents §3.3): un Propietario o un Encargado pone su propio PIN y
 * con él actúa en la tablet del local con sus permisos. Solo desde su cuenta: el PIN de una persona con cuenta no lo
 * cambia nadie más ni se cambia desde una tablet.
 */
export function MyPinCard({ establishmentId, hasPin }: { establishmentId: string; hasPin: boolean }) {
  const t = es.agents.team.myPin;
  const router = useRouter();
  const [fields, setFields] = useState({ pin: "", pinRepeat: "" });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <Card title={t.title}>
      <p className="mb-3 text-sm text-text-secondary">{t.body}</p>
      <p className="mb-4 text-sm font-medium" data-testid="my-pin-state">
        {hasPin || notice ? t.set : t.unset}
      </p>
      {notice ? (
        <p role="status" className="mb-3 rounded-field bg-success/10 px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {error && !error.field ? (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <form
        noValidate
        className="max-w-xs"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setNotice(null);
          startTransition(async () => {
            const result = await setMyPinAction({ establishmentId, ...fields });
            if (!result.ok) {
              setError({ message: result.message, ...(result.field ? { field: result.field } : {}) });
              return;
            }
            setNotice(result.message);
            setFields({ pin: "", pinRepeat: "" });
            router.refresh();
          });
        }}
      >
        <PinFields
          {...fields}
          onChange={setFields}
          pinLabel={es.agents.team.newPinLabel}
          errors={{
            pin: error?.field === "pin" ? error.message : undefined,
            pinRepeat: error?.field === "pinRepeat" ? error.message : undefined,
          }}
        />
        <Button type="submit" className="min-h-11" pending={busy}>
          {t.button}
        </Button>
      </form>
    </Card>
  );
}
