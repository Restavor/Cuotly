"use client";

import { useActionState } from "react";

import { Button, Field, Select, TextArea } from "@/components/ui";
import { es } from "@/i18n/es";

import { INITIAL_ESTABLISHMENT_DATA } from "@/app/espacios/[slug]/restaurantes/[id]/datos/action-state";
import { saveEstablishmentData } from "@/app/espacios/[slug]/restaurantes/[id]/datos/actions";
import type { SheetIdentity } from "@/app/espacios/[slug]/restaurantes/[id]/sheet-load";

const t = es.establishmentSheet;

/**
 * §15.2 · el formulario de la ficha del restaurante, en Gestión · Datos.
 *
 * Se pinta solo a quien puede editar, y eso es cortesía:
 * `set_establishment_data()` comprueba RN-EST-11 por su cuenta y desde la
 * migración 57 es la única puerta —`establishments` se quedó sin política
 * de UPDATE y un disparador rechaza el resto—, así que enviar esto con
 * otra sesión falla igual (CLAUDE.md: ocultar un botón no es un control de
 * acceso).
 *
 * Los dieciséis campos van en un único formulario con un solo botón, como en
 * la maqueta, y se envían siempre todos: la función recibe la ficha
 * completa y un campo vacío vacía el dato. Guardar sin cambiar nada no
 * escribe ni fila ni auditoría, y la pantalla lo dice en vez de fingir un
 * cambio (CA-17).
 *
 * RN-EST-12 va arriba y no abajo: "esto no cambia la web" hay que leerlo
 * ANTES de escribir el teléfono nuevo, no después de guardarlo.
 */
export function EstablishmentDataForm({
  establishmentId,
  name,
  identity,
}: {
  establishmentId: string;
  name: string;
  identity: SheetIdentity;
}) {
  const [state, action, pending] = useActionState(
    saveEstablishmentData,
    INITIAL_ESTABLISHMENT_DATA,
  );

  return (
    <form action={action}>
      <input type="hidden" name="establishmentId" value={establishmentId} />

      <p className="mb-5 rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
        {t.dataNotPublicNotice}
      </p>

      {/*
        Dos columnas en pantalla ancha y una en móvil, con el horario a lo
        largo porque es el único campo multilínea.
      */}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field
          label={t.dataNameLabel}
          name="name"
          defaultValue={name}
          required
          maxLength={120}
          hint={t.dataNameHint}
        />
        <Field
          label={t.dataLegalNameLabel}
          name="legalName"
          defaultValue={identity.legalName ?? ""}
          maxLength={200}
        />
        <Field
          label={t.dataTaxIdLabel}
          name="taxId"
          defaultValue={identity.taxId ?? ""}
          maxLength={30}
          hint={t.dataTaxIdHint}
        />
        <Field
          label={t.dataContactNameLabel}
          name="contactName"
          defaultValue={identity.contactName ?? ""}
          maxLength={120}
          hint={t.dataContactNameHint}
        />
        <Field
          label={t.dataContactEmailLabel}
          name="contactEmail"
          /*
            `type="email"` para que el teclado del móvil sea el correcto y
            el navegador avise antes de enviar. La comprobación que vale es
            la del servidor, que rechaza un correo sin arroba: esta solo
            ahorra el viaje.
          */
          type="email"
          defaultValue={identity.contactEmail ?? ""}
          maxLength={200}
        />
        <Field
          label={t.dataAddressLabel}
          name="address"
          defaultValue={identity.address ?? ""}
          maxLength={200}
        />
        <Field
          label={t.dataCityLabel}
          name="city"
          defaultValue={identity.city ?? ""}
          maxLength={100}
        />
        <Field
          label={t.dataPostalCodeLabel}
          name="postalCode"
          defaultValue={identity.postalCode ?? ""}
          maxLength={20}
        />
        <Field
          label={t.dataPhonePrimaryLabel}
          name="phonePrimary"
          type="tel"
          defaultValue={identity.phonePrimary ?? ""}
          maxLength={40}
        />
        <Field
          label={t.dataPhoneSecondaryLabel}
          name="phoneSecondary"
          type="tel"
          defaultValue={identity.phoneSecondary ?? ""}
          maxLength={40}
        />
        <Field
          label={t.dataWebsiteLabel}
          name="websiteUrl"
          defaultValue={identity.websiteUrl ?? ""}
          maxLength={300}
          hint={t.dataWebsiteHint}
        />
        <Field
          label={t.dataInstagramLabel}
          name="instagram"
          defaultValue={identity.instagram ?? ""}
          maxLength={120}
          hint={t.dataInstagramHint}
        />
        <Field
          label={t.dataFacebookLabel}
          name="facebookUrl"
          defaultValue={identity.facebookUrl ?? ""}
          maxLength={300}
        />
        <Field
          label={t.dataDomainLabel}
          name="domain"
          defaultValue={identity.domain ?? ""}
          maxLength={200}
        />
        <Select
          label={t.dataWebPlatformLabel}
          name="webPlatform"
          defaultValue={identity.webPlatform ?? ""}
          options={[
            { value: "", label: t.dataWebPlatforms.unset },
            { value: "landing_site", label: t.dataWebPlatforms.landing_site },
            { value: "other", label: t.dataWebPlatforms.other },
          ]}
        />
      </div>

      <TextArea
        label={t.dataOpeningHoursLabel}
        name="openingHours"
        defaultValue={identity.openingHours ?? ""}
        rows={4}
        maxLength={500}
        hint={t.dataOpeningHoursHint}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t.dataPending : t.dataSubmit}
        </Button>

        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        {state.done ? (
          <p role="status" className="text-sm text-text-secondary">
            {t.dataDone}
          </p>
        ) : null}
        {state.unchanged ? (
          <p role="status" className="text-sm text-text-secondary">
            {t.dataUnchanged}
          </p>
        ) : null}
      </div>
    </form>
  );
}
