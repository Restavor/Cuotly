"use client";

import { useActionState, useState } from "react";

import { Button, Card, Field, Select } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_NEW_ESTABLISHMENT } from "@/app/espacios/[slug]/restaurantes/nuevo/action-state";
import { createEstablishmentWithData } from "@/app/espacios/[slug]/restaurantes/nuevo/actions";

const t = es.newEstablishmentPage;

export interface NewFormOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Maqueta 02 · el alta de un restaurante, en cuatro bloques: datos
 * generales, datos fiscales, contacto principal y web y redes.
 *
 * Tres cosas que conviene no confundir al leerlo:
 *
 * 1. **El asterisco es del formulario, no del servidor.** El navegador
 *    pide el NIF y la dirección porque un alta a medias es una ficha que
 *    nadie vuelve a terminar, pero `create_establishment_with_data()` solo
 *    exige el nombre comercial y el grupo: RN-EST-06 dice que un
 *    restaurante se da de alta con su nombre y la ficha se rellena
 *    después, y los que ya existen la tienen a medias. Si esto fuera un
 *    control de acceso estaría en el servidor (CLAUDE.md); es una ayuda
 *    para escribirla entera de una vez.
 * 2. **El estado no se elige.** Un restaurante nace "Configurando"
 *    (migración 3) y se mueve con `set_establishment_status()`, que tiene
 *    sus propias reglas y su propio apunte. La maqueta lo enseña porque
 *    hay que saberlo, así que se pinta bloqueado con su motivo debajo.
 * 3. **La clave de idempotencia llega de fuera.** La genera la página en
 *    el servidor y viaja en un campo oculto: generarla aquí con
 *    `useState` daría una en el HTML del servidor y otra al hidratar, y
 *    React avisaría de la discrepancia en cada carga.
 */
export function NewEstablishmentForm({
  spaceId,
  spaceSlug,
  groups,
  plans,
  idempotencyKey,
}: {
  spaceId: string;
  spaceSlug: string;
  groups: readonly NewFormOption[];
  plans: readonly NewFormOption[];
  idempotencyKey: string;
}) {
  const action = createEstablishmentWithData.bind(null, spaceId, spaceSlug);
  const [state, formAction, pending] = useActionState(action, INITIAL_NEW_ESTABLISHMENT);

  // "" es "crear un grupo nuevo", que es lo único que había antes de la
  // maqueta 02 y sigue haciendo falta para el primer cliente de un espacio
  // recién creado, cuando no hay ni un grupo que elegir.
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t.generalTitle}>
          <Field label={t.nameLabel} name="name" required maxLength={120} hint={t.nameHint} />

          <Select
            label={t.groupLabel}
            name="groupId"
            value={groupId}
            onChange={(evento) => setGroupId(evento.target.value)}
            options={[
              ...groups.map((group) => ({ value: group.id, label: group.name })),
              { value: "", label: t.groupNewOption },
            ]}
          />
          {groupId === "" ? (
            <Field
              label={t.groupNameLabel}
              name="groupName"
              required
              maxLength={200}
              hint={t.groupNameHint}
            />
          ) : null}

          {plans.length > 0 ? (
            <Select
              label={t.planLabel}
              name="planId"
              options={[
                { value: "", label: t.planNoneOption },
                ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
              ]}
            />
          ) : (
            <p className="mb-4 text-sm text-text-secondary">{t.planNoneAvailable}</p>
          )}

          <Field
            label={t.statusLabel}
            name="statusDisplay"
            value={es.naming.states.establishment.configuring}
            readOnly
            disabled
            hint={t.statusHint}
          />
        </Card>

        <Card title={t.fiscalTitle}>
          <Field label={t.taxIdLabel} name="taxId" required maxLength={30} />
          <Field label={t.legalNameLabel} name="legalName" required maxLength={200} />
          <Field label={t.addressLabel} name="address" required maxLength={200} />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label={t.postalCodeLabel} name="postalCode" required maxLength={20} />
            <Field label={t.cityLabel} name="city" required maxLength={100} />
          </div>
        </Card>

        <Card title={t.contactTitle}>
          <Field
            label={t.contactNameLabel}
            name="contactName"
            required
            maxLength={120}
            hint={t.contactNameHint}
          />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field
              label={t.contactEmailLabel}
              name="contactEmail"
              type="email"
              required
              maxLength={200}
            />
            <Field
              label={t.phonePrimaryLabel}
              name="phonePrimary"
              type="tel"
              required
              maxLength={40}
            />
          </div>
        </Card>

        <Card title={t.webTitle}>
          <Field
            label={t.websiteLabel}
            name="websiteUrl"
            maxLength={300}
            hint={es.establishmentSheet.dataWebsiteHint}
          />
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field
              label={t.instagramLabel}
              name="instagram"
              maxLength={120}
              hint={es.establishmentSheet.dataInstagramHint}
            />
            <Field label={t.facebookLabel} name="facebookUrl" maxLength={300} />
          </div>
          <p className="text-sm text-text-secondary">{t.webNotice}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.submitPending : t.submit}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
