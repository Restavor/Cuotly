"use client";

import { useActionState } from "react";

import { Button, Card, Field, TextArea } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { CUOTLY_PLAN_TERMS } from "@/core/cuotly-subscription";
import { CUOTLY_PLANS } from "@/core/space-requests";
import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";

import { saveSpaceRequest } from "./actions";
import {
  INITIAL_SPACE_REQUEST_STATE,
  type SpaceRequestValues,
} from "./form-state";

const t = es.spaceRequestForm;

/**
 * G02 · los nueve campos de §10 (RN-PLA-01) en las cuatro tarjetas del
 * dibujo, "¿Qué pasa después?" a la derecha y abajo el aviso y los dos
 * botones: guardar el borrador, que es suyo y nadie de Cuotly ve
 * (RN-PLA-02), y enviar. El servidor vuelve a comprobar qué se puede
 * enviar y desde qué estado (RN-PLA-03).
 *
 * Los precios de las dos tarjetas de plan salen de `CUOTLY_PLAN_TERMS`,
 * el mismo espejo de §4.1 que usa la suscripción: no se escriben aquí.
 */
export function SpaceRequestForm({ initial }: { initial: SpaceRequestValues }) {
  const [state, action, pending] = useActionState(
    saveSpaceRequest,
    INITIAL_SPACE_REQUEST_STATE,
  );
  const v = state.values ?? initial;
  const plan = v.plan ?? "pro";

  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_304px]"
    >
      <Card className="lg:col-start-1 lg:row-start-1">
        <h2 className="mb-3 text-base font-semibold text-primary-dark">
          {t.businessTitle}
        </h2>
        <div className="grid grid-cols-1 items-end gap-x-4 sm:grid-cols-2">
          <Field
            name="businessName"
            label={t.businessName}
            placeholder={t.businessNamePlaceholder}
            defaultValue={v.businessName ?? ""}
            required
          />
          <Field
            name="contactName"
            label={t.contactName}
            placeholder={t.contactNamePlaceholder}
            defaultValue={v.contactName ?? ""}
            required
          />
          <Field
            name="email"
            label={t.email}
            type="email"
            placeholder={t.emailPlaceholder}
            defaultValue={v.email ?? ""}
            required
          />
          <Field
            name="phone"
            label={t.phone}
            type="tel"
            placeholder={t.phonePlaceholder}
            defaultValue={v.phone ?? ""}
          />
        </div>
      </Card>

      <Card className="lg:col-start-2 lg:row-start-1">
        <h2 className="mb-3 text-base font-semibold text-primary-dark">
          {t.usageTitle}
        </h2>
        <div className="grid grid-cols-2 items-end gap-x-3 sm:gap-x-4">
          <Field
            name="estimatedEstablishments"
            label={t.estimatedEstablishments}
            type="number"
            min={0}
            placeholder={t.estimateHint}
            defaultValue={v.estimatedEstablishments ?? ""}
          />
          <Field
            name="estimatedUsers"
            label={t.estimatedUsers}
            type="number"
            min={0}
            placeholder={t.estimateHint}
            defaultValue={v.estimatedUsers ?? ""}
          />
        </div>
        <TextArea
          name="intendedUse"
          label={t.intendedUse}
          placeholder={t.intendedUsePlaceholder}
          defaultValue={v.intendedUse ?? ""}
          rows={2}
        />
      </Card>

      <Card className="lg:col-start-1 lg:row-start-2">
        <fieldset>
          <legend className="mb-3 text-base font-semibold text-primary-dark">
            {t.planTitle}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CUOTLY_PLANS.map((clave) => {
              const terms = CUOTLY_PLAN_TERMS[clave];
              return (
                <label
                  key={clave}
                  className="flex cursor-pointer gap-3 rounded-[10px] border-2 border-border p-3 transition-colors has-checked:border-cuotly-green has-checked:bg-cuotly-green/5"
                >
                  <input
                    type="radio"
                    name="plan"
                    value={clave}
                    defaultChecked={plan === clave}
                    className="mt-1 h-4 w-4 shrink-0 accent-cuotly-green"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text">
                      {es.cuotlySubscription.plans[clave]}
                    </span>
                    <span className="block text-lg font-bold text-primary-dark">
                      {euros(terms.priceCents)}{" "}
                      <span className="whitespace-nowrap text-xs font-medium text-text-secondary">
                        {t.planPriceUnit}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-text-secondary">
                      {clave === "pro" &&
                      terms.includedEstablishments !== null &&
                      terms.includedUsers !== null
                        ? t.planIncludes.pro(
                            terms.includedEstablishments,
                            terms.includedUsers,
                          )
                        : t.planIncludes.agency}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </Card>

      <Card className="lg:col-start-2 lg:row-start-2">
        <h2 className="mb-1 text-base font-semibold text-primary-dark">
          {t.taxTitle}
        </h2>
        <p className="mb-3 text-xs text-text-secondary">{t.taxHint}</p>
        <div className="grid grid-cols-1 items-end gap-x-4 sm:grid-cols-2">
          <Field
            name="taxName"
            label={t.taxName}
            defaultValue={v.taxName ?? ""}
          />
          <Field name="taxId" label={t.taxId} defaultValue={v.taxId ?? ""} />
        </div>
        <Field
          name="taxAddress"
          label={t.taxAddress}
          defaultValue={v.taxAddress ?? ""}
        />
      </Card>

      <Card className="lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-span-2 xl:row-start-1">
        <h2 className="mb-4 text-base font-semibold text-primary-dark">
          {t.nextTitle}
        </h2>
        <ol className="space-y-6">
          {t.nextSteps.map((paso, i) => (
            <li key={paso.title} className="relative flex gap-3">
              {i < t.nextSteps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-4 top-9 h-[calc(100%-0.75rem)] border-l-2 border-dashed border-border"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  i === 0
                    ? "bg-cuotly-green text-surface"
                    : "bg-soft-surface text-primary-dark"
                }`}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text">
                  {paso.title}
                </h3>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {paso.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-3 xl:flex-row">
        <div className="flex flex-1 gap-3 rounded-card border border-warning/40 bg-warning/10 p-4">
          {/* Ámbar de fondo con el trazo oscuro: el texto ámbar no pasa AA (contrast.test.ts). */}
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/25 text-primary-dark"
          >
            <Icon name="alert" className="h-4 w-4" />
          </span>
          <div className="text-sm text-text">
            <p>{t.onlySpacesNotice}</p>
            <p>{t.noChargeNotice}</p>
          </div>
        </div>

        <Card className="flex flex-col justify-center p-4! xl:shrink-0">
          {state.error ? (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-text"
            >
              {state.error}
            </p>
          ) : state.saved && !state.submitted ? (
            <p role="status" className="mb-3 text-sm text-text-secondary">
              {t.savedDraft}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="secondary"
              pending={pending}
            >
              {pending ? t.pending : t.saveDraft}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="submit"
              pending={pending}
            >
              {pending ? t.pending : t.submit}
            </Button>
          </div>
        </Card>
      </div>
    </form>
  );
}
