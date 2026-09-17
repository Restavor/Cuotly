"use client";

import { useActionState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";

import { INITIAL_MENU_ACTION } from "./action-state";
import { copyMenu } from "./actions";

const t = es.dailyMenuClient;

/**
 * R13 · copiar el menú anterior sin tener que abrirlo.
 *
 * La operación ya existía dentro de la ficha de un menú ("Copiar para otro
 * día"); lo que faltaba es poder hacerlo desde el listado, que es donde
 * está quien va a preparar el de mañana. Es la **misma** acción y la misma
 * función del servidor: `copy_menu()` comprueba `can_write_menus()` y crea
 * un borrador. No hay una segunda manera de copiar un menú.
 *
 * Cuál es "el anterior" lo decide la pantalla y se **dice con su nombre y
 * su fecha**: copiar a ciegas el que el programa crea que toca es la manera
 * de publicar el menú del martes pasado sin enterarse.
 */
export function CopyPreviousMenuForm({
  slug,
  establishmentId,
  previous,
  defaultDate,
}: {
  slug: string;
  establishmentId: string;
  previous: { id: string; name: string; target_date: string } | null;
  defaultDate: string;
}) {
  return (
    <Card title={t.copyPreviousTitle}>
      {previous === null ? (
        <p className="text-sm text-text-secondary">{t.copyPreviousNoneReason}</p>
      ) : (
        <CopyForm
          slug={slug}
          establishmentId={establishmentId}
          previous={previous}
          defaultDate={defaultDate}
        />
      )}
    </Card>
  );
}

function CopyForm({
  slug,
  establishmentId,
  previous,
  defaultDate,
}: {
  slug: string;
  establishmentId: string;
  previous: { id: string; name: string; target_date: string };
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(
    copyMenu.bind(null, slug, establishmentId, previous.id),
    INITIAL_MENU_ACTION,
  );

  return (
    <form action={action} className="space-y-2">
      <p className="text-sm text-text-secondary">
        {t.copyPreviousHint(previous.name, fechaCorta(previous.target_date))}
      </p>
      <Field
        label={t.copyDateLabel}
        name="targetDate"
        type="date"
        required
        defaultValue={defaultDate}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t.pending : t.copyPreviousSubmit}
      </Button>
    </form>
  );
}
