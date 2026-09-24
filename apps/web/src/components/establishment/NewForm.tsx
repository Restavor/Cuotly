"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, Card, Field, Select } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

import { INITIAL_NEW_ESTABLISHMENT } from "@/app/espacios/[slug]/restaurantes/nuevo/action-state";
import { createEstablishmentWithData } from "@/app/espacios/[slug]/restaurantes/nuevo/actions";

const t = es.newEstablishmentPage;

export interface NewFormOption {
  readonly id: string;
  readonly name: string;
}

/**
 * M73 · "Crear establecimiento": una tarjeta con los datos básicos en dos
 * columnas, el aviso de que el panel del cliente viene después y el botón
 * de crear.
 *
 * Lo que el dibujo pide y NO se copia, cada cosa con su motivo:
 *
 * 1. **"Código" escrito a mano.** RN-EST-06: el código es automático y
 *    correlativo por espacio. Se pinta el campo, bloqueado, diciendo que
 *    llega solo; un código tecleado podría repetirse o saltarse la serie.
 * 2. **"Guardar borrador".** Un alta no tiene borrador: o existe el
 *    restaurante o no existe, y uno a medias ya es "Configurando"
 *    (migración 3), que es exactamente un borrador con nombre propio.
 *    Lo que hay en su lugar es "Cancelar".
 * 3. **El asterisco de "Plan contratado".** El servidor deja dar de alta
 *    sin plan —se contrata después desde Gestión · Plan y servicios—, y
 *    exigirlo aquí obligaría a inventarse uno para un restaurante que
 *    todavía no ha firmado.
 * 4. **Los ejemplos dentro de los campos** ("Ej. La Trattoria", "Ej. 600
 *    123 456"). Son datos de ejemplo; M40 tampoco los lleva.
 *
 * Lo que la maqueta anterior (la 02) pedía aquí —NIF, razón social,
 * código postal, redes— sale del alta: RN-EST-06 da de alta con el nombre
 * y la ficha se completa después en Gestión · Datos (M40). La ciudad se
 * queda, al lado del plan, porque es lo que la cabecera y el listado
 * enseñan para distinguir dos restaurantes que se llaman parecido.
 *
 * El asterisco de nombre y contacto es del formulario, no del servidor:
 * `create_establishment_with_data()` solo exige el nombre y el grupo.
 *
 * La clave de idempotencia llega de fuera: la genera la página en el
 * servidor y viaja en un campo oculto. Generarla aquí con `useState` daría
 * una en el HTML del servidor y otra al hidratar.
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

  // "" es "crear un grupo nuevo", que sigue haciendo falta para el primer
  // cliente de un espacio recién creado, cuando no hay grupo que elegir.
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");

  return (
    <form action={formAction}>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <Card>
        <div className="grid gap-x-6 lg:grid-cols-2">
          <Field label={t.nameLabel} name="name" required maxLength={120} />
          <Field
            label={t.codeLabel}
            name="codeDisplay"
            value={t.codeAuto}
            readOnly
            disabled
            hint={t.codeHint}
          />

          <div>
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
          </div>
          <Field
            label={t.contactNameLabel}
            name="contactName"
            required
            maxLength={120}
            hint={t.contactNameHint}
          />

          <Field label={t.contactEmailLabel} name="contactEmail" type="email" maxLength={200} />
          <Field label={t.phonePrimaryLabel} name="phonePrimary" type="tel" maxLength={40} />

          <Field
            label={t.websiteLabel}
            name="websiteUrl"
            maxLength={300}
            hint={es.establishmentSheet.dataWebsiteHint}
          />
          <Field label={t.addressLabel} name="address" maxLength={200} />

          {plans.length > 0 ? (
            <Select
              label={t.planLabel}
              name="planId"
              hint={t.planHint}
              options={[
                { value: "", label: t.planNoneOption },
                ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
              ]}
            />
          ) : (
            <div className="mb-4">
              <p className="mb-1.5 text-sm font-semibold text-text">{t.planLabel}</p>
              <p className="text-sm text-text-secondary">{t.planNoneAvailable}</p>
            </div>
          )}
          <Field label={t.cityLabel} name="city" maxLength={100} />
        </div>

        {/* RN-PAN-10 · el aviso azul del dibujo, con su icono. */}
        <div className="mt-2 flex items-start gap-3 rounded-[10px] bg-info/10 p-4 text-sm">
          <Icon name="info" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
          <div className="space-y-1">
            <p className="font-medium text-text">{t.panelNotice}</p>
            <p className="text-text-secondary">{t.laterNotice}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {state.error ? (
            <p role="alert" className="mr-auto text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          <Link
            href={`/espacios/${spaceSlug}/restaurantes`}
            className="inline-flex items-center justify-center rounded-[10px] border border-cuotly-green bg-surface px-5 py-2.5 text-sm font-semibold text-cuotly-green transition-colors hover:bg-cuotly-green/10"
          >
            {t.cancel}
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? t.submitPending : t.submit}
          </Button>
        </div>
      </Card>
    </form>
  );
}
