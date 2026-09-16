"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { saveSpaceRequest } from "./actions";
import { INITIAL_SPACE_REQUEST_STATE } from "./form-state";

export interface SpaceRequestInitial {
  readonly businessName?: string;
  readonly contactName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly estimatedEstablishments?: number | null;
  readonly estimatedUsers?: number | null;
  readonly intendedUse?: string;
  readonly plan?: string;
  readonly taxName?: string;
  readonly taxId?: string;
  readonly taxAddress?: string;
}

/**
 * Los nueve campos de §10 (RN-PLA-01). Dos botones: guardar el borrador,
 * que es suyo y nadie de Cuotly ve (RN-PLA-02), y enviar. El servidor
 * vuelve a comprobar qué se puede enviar y desde qué estado (RN-PLA-03).
 */
export function SpaceRequestForm({ initial }: { initial: SpaceRequestInitial }) {
  const [state, action, pending] = useActionState(saveSpaceRequest, INITIAL_SPACE_REQUEST_STATE);
  const t = es.spaceRequestForm;

  return (
    <form action={action}>
      <Field name="businessName" label={t.businessName} defaultValue={initial.businessName ?? ""} required />
      <Field name="contactName" label={t.contactName} defaultValue={initial.contactName ?? ""} required />
      <Field name="email" label={t.email} type="email" defaultValue={initial.email ?? ""} required />
      <Field name="phone" label={t.phone} type="tel" defaultValue={initial.phone ?? ""} />
      <Field
        name="estimatedEstablishments"
        label={t.estimatedEstablishments}
        type="number"
        min={0}
        defaultValue={initial.estimatedEstablishments ?? ""}
      />
      <Field
        name="estimatedUsers"
        label={t.estimatedUsers}
        type="number"
        min={0}
        defaultValue={initial.estimatedUsers ?? ""}
      />
      <TextArea name="intendedUse" label={t.intendedUse} defaultValue={initial.intendedUse ?? ""} rows={3} />
      <Select
        name="plan"
        label={t.plan}
        defaultValue={initial.plan ?? "pro"}
        options={[
          { value: "pro", label: t.planPro },
          { value: "agency", label: t.planAgency },
        ]}
      />

      <h3 className="mb-1 mt-6 text-base font-semibold text-primary-dark">{t.taxTitle}</h3>
      <p className="mb-3 text-sm text-text-secondary">{t.taxHint}</p>
      <Field name="taxName" label={t.taxName} defaultValue={initial.taxName ?? ""} />
      <Field name="taxId" label={t.taxId} defaultValue={initial.taxId ?? ""} />
      <Field name="taxAddress" label={t.taxAddress} defaultValue={initial.taxAddress ?? ""} />

      {state.error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2.5 text-sm text-text">
          {state.error}
        </p>
      ) : null}
      {state.submitted ? (
        <p role="status" className="mb-4 text-sm text-text-secondary">
          {t.submitted}
        </p>
      ) : state.saved ? (
        <p role="status" className="mb-4 text-sm text-text-secondary">
          {t.savedDraft}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="draft" variant="secondary" pending={pending}>
          {pending ? t.pending : t.saveDraft}
        </Button>
        <Button type="submit" name="intent" value="submit" pending={pending}>
          {pending ? t.pending : t.submit}
        </Button>
      </div>
    </form>
  );
}
