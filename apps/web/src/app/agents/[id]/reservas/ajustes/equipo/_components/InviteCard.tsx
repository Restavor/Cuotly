"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Card, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { inviteAction } from "../actions";

/**
 * Invitar a un Propietario o a un Encargado por email (`AjustesEquipo`, EQU-01): la invitación de siempre del panel.
 * Si ya tiene cuenta, entra al momento; si no, el equipo del espacio la aprueba antes. Un Encargado es un Editor con
 * «Gestionar Reservas». Lo decide la base de datos (`invite_to_establishment_panel()`).
 */
export function InviteCard({ establishmentId, idempotencyKey }: { establishmentId: string; idempotencyKey: string }) {
  const t = es.agents.team.invite;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "owner">("manager");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <Card title={t.title}>
      <p className="mb-3 text-sm text-text-secondary">{t.hint}</p>
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
        className="max-w-md"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setNotice(null);
          startTransition(async () => {
            const result = await inviteAction({ establishmentId, email, role, idempotencyKey: `${idempotencyKey}-${email.trim().toLowerCase()}-${role}` });
            if (!result.ok) {
              setError({ message: result.message, ...(result.field ? { field: result.field } : {}) });
              return;
            }
            setNotice(result.message);
            setEmail("");
            router.refresh();
          });
        }}
      >
        <Field
          label={t.emailLabel}
          type="email"
          autoComplete="off"
          value={email}
          required
          error={error?.field === "email" ? error.message : undefined}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Select
          label={t.roleLabel}
          value={role}
          options={[
            { value: "manager", label: t.manager },
            { value: "owner", label: t.owner },
          ]}
          onChange={(e) => setRole(e.target.value === "owner" ? "owner" : "manager")}
        />
        <Button type="submit" className="min-h-11" pending={busy}>
          {t.send}
        </Button>
      </form>
    </Card>
  );
}
