"use client";

import { useActionState, useState } from "react";

import { Button, Card, Field, Select, TextArea } from "@/components/ui";
import { MenuDiffView } from "@/components/menu/MenuDiffView";
import {
  dishNames,
  resizeDeclarations,
  undeclaredCount,
  EMPTY_MENU_ALLERGENS,
  type AllergenCourse,
  type DishAllergens,
  type MenuAllergens,
} from "@/core/allergens";
import { CourseAllergens, DishAllergenFields } from "./AllergenEditor";
import { MENU_KINDS } from "@/core/daily-menu";
import { diffMenuVersions } from "@/core/menu-diff";
import type { MenuState } from "@/core/menu-states";
import { es } from "@/i18n/es";

import { INITIAL_MENU_ACTION, type MenuActionState } from "../action-state";
import {
  cancelMenu,
  copyMenu,
  prepareMenu,
  provideMenuInformation,
  requestMenuCorrection,
  requestMenuPublication,
  saveMenuVersion,
  updateMenuDetails,
} from "../actions";
import type { MenuCorrectionAvailability } from "@/core/daily-menu";

const t = es.dailyMenuClient;

function Feedback({ state }: { state: MenuActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.done && state.notice) {
    return <p className="text-sm text-success">{state.notice}</p>;
  }
  return null;
}

export interface VersionContent {
  readonly version: number;
  readonly starters: readonly string[];
  readonly mains: readonly string[];
  readonly desserts: readonly string[];
  readonly drink: string | null;
  readonly priceCents: number | null;
  readonly note: string | null;
  /** §39 · lo declarado, o `null` en una versión anterior a los alérgenos. */
  readonly allergens: MenuAllergens | null;
}

/**
 * RN-MEN-03 · cada guardado es una versión nueva. Los campos son los de §58,
 * y desde §39 cada plato lleva además su declaración de alérgenos.
 *
 * Los tres cuadros de platos pasan a ser **controlados**, y no es un
 * capricho de React: las casillas de alérgenos van una por plato, así que
 * la pantalla tiene que saber cuántos platos hay escritos AHORA, no cuando
 * se cargó. Escribir una línea nueva hace aparecer su bloque de casillas.
 */
export function VersionEditor({
  menuId,
  current,
  editable,
}: {
  menuId: string;
  current: VersionContent | null;
  editable: boolean;
}) {
  const action = saveMenuVersion.bind(null, menuId);
  const [state, formAction, pending] = useActionState(action, INITIAL_MENU_ACTION);
  const precio =
    current?.priceCents === null || current?.priceCents === undefined
      ? ""
      : `${Math.trunc(current.priceCents / 100)},${String(current.priceCents % 100).padStart(2, "0")}`;

  const [textos, setTextos] = useState({
    starters: current?.starters.join("\n") ?? "",
    mains: current?.mains.join("\n") ?? "",
    desserts: current?.desserts.join("\n") ?? "",
    drink: current?.drink ?? "",
  });
  const [declarado, setDeclarado] = useState<MenuAllergens>(
    current?.allergens ?? EMPTY_MENU_ALLERGENS,
  );

  const platos = {
    starters: dishNames(textos.starters),
    mains: dishNames(textos.mains),
    desserts: dishNames(textos.desserts),
  };

  // Las declaraciones siguen a los platos por posición mientras se escribe.
  const ajustado: MenuAllergens = {
    starters: resizeDeclarations(declarado.starters, platos.starters.length),
    mains: resizeDeclarations(declarado.mains, platos.mains.length),
    desserts: resizeDeclarations(declarado.desserts, platos.desserts.length),
    drink: textos.drink.trim() === "" ? null : declarado.drink,
  };

  const sinDeclarar = undeclaredCount(
    { ...platos, drink: textos.drink.trim() === "" ? null : textos.drink },
    ajustado,
  );

  const cambiarCurso = (curso: AllergenCourse, indice: number, valor: DishAllergens | null) => {
    setDeclarado((previo) => {
      const lista = [...resizeDeclarations(previo[curso], platos[curso].length)];
      lista[indice] = valor;
      return { ...previo, [curso]: lista };
    });
  };

  return (
    <Card title={t.editorTitle(current?.version ?? null)}>
      {!editable ? (
        <p className="text-sm text-text-secondary">{t.editorLocked}</p>
      ) : (
        <form action={formAction} className="space-y-4">
          {/*
            A17 · contra qué versión se está escribiendo. Después de un
            choque pasa a ser la que se adelantó, para que el segundo
            "Guardar" sea un "sí, quiero que valga lo mío" y no el mismo
            rechazo otra vez.
          */}
          <input
            type="hidden"
            name="expectedVersion"
            value={state.conflict?.version ?? current?.version ?? ""}
          />
          <TextArea
            label={t.startersLabel}
            name="starters"
            rows={3}
            hint={t.linesHint}
            value={textos.starters}
            onChange={(e) => setTextos({ ...textos, starters: e.target.value })}
          />
          <CourseAllergens
            course="starters"
            dishes={platos.starters}
            declared={ajustado.starters}
            onChange={cambiarCurso}
          />

          <TextArea
            label={t.mainsLabel}
            name="mains"
            rows={3}
            hint={t.linesHint}
            value={textos.mains}
            onChange={(e) => setTextos({ ...textos, mains: e.target.value })}
          />
          <CourseAllergens
            course="mains"
            dishes={platos.mains}
            declared={ajustado.mains}
            onChange={cambiarCurso}
          />

          <TextArea
            label={t.dessertsLabel}
            name="desserts"
            rows={2}
            hint={t.linesHint}
            value={textos.desserts}
            onChange={(e) => setTextos({ ...textos, desserts: e.target.value })}
          />
          <CourseAllergens
            course="desserts"
            dishes={platos.desserts}
            declared={ajustado.desserts}
            onChange={cambiarCurso}
          />

          <Field
            label={t.drinkLabel}
            name="drink"
            value={textos.drink}
            onChange={(e) => setTextos({ ...textos, drink: e.target.value })}
          />
          {textos.drink.trim() === "" ? null : (
            <DishAllergenFields
              dishName={textos.drink.trim()}
              value={ajustado.drink}
              onChange={(valor) => setDeclarado((previo) => ({ ...previo, drink: valor }))}
            />
          )}

          {/*
            §39 · la declaración viaja en el formulario como un solo campo.
            El servidor la vuelve a validar entera —que cuadre con los
            platos y que los códigos sean de los catorce— y rechaza la
            versión si no (RN-ALE-09).
          */}
          <input type="hidden" name="allergens" value={JSON.stringify(ajustado)} />

          {/*
            RN-ALE-05 · se avisa y no se bloquea. Quien responde de esta
            información es el restaurante, y pararle el menú del día por una
            casilla sin marcar es un daño cierto por un riesgo que Cuotly no
            está en condiciones de juzgar.
          */}
          {sinDeclarar > 0 ? (
            <p className="rounded-[10px] bg-soft-surface p-3 text-sm text-text">
              {es.allergens.undeclaredWarning(sinDeclarar)}
            </p>
          ) : null}
          <p className="text-sm text-text-secondary">{es.allergens.whoseResponsibility}</p>
          <Field label={t.priceLabel} name="price" inputMode="decimal" hint={t.priceHint} defaultValue={precio} />
          <Field label={t.noteLabel} name="note" defaultValue={current?.note ?? ""} />

          {/*
            A17 · alguien guardó mientras escribías. No se pierde lo
            escrito —sigue en los cuadros de arriba— y en vez de un mensaje
            seco se enseña QUÉ cambió, que es lo que deja decidir si vale
            la pena volver a guardar. Es la misma comparación de R18.
          */}
          {state.conflict && current ? (
            <div className="rounded-[10px] border border-border bg-soft-surface p-3">
              <p className="mb-1 font-semibold text-text">{es.menuDiff.conflictTitle}</p>
              <p className="mb-2 text-sm text-text-secondary">
                {es.menuDiff.conflictHint(state.conflict.version)}
              </p>
              <p className="mb-2 text-sm text-text-secondary">{es.menuDiff.conflictChanges}</p>
              <MenuDiffView diff={diffMenuVersions(current, state.conflict.content)} />
            </div>
          ) : null}

          <Feedback state={state} />
          <Button type="submit" disabled={pending}>
            {pending ? t.saveVersionPending : t.saveVersion}
          </Button>
        </form>
      )}
    </Card>
  );
}

export interface TemplateOption {
  readonly id: string;
  readonly name: string;
}

export function DetailsForm({
  menuId,
  name,
  kind,
  targetDate,
  templateId,
  templates,
  editable,
}: {
  menuId: string;
  name: string;
  kind: string;
  targetDate: string;
  templateId: string | null;
  templates: readonly TemplateOption[];
  editable: boolean;
}) {
  const action = updateMenuDetails.bind(null, menuId);
  const [state, formAction, pending] = useActionState(action, INITIAL_MENU_ACTION);
  if (!editable) return null;

  return (
    <Card title={t.detailsTitle}>
      <form action={formAction} className="space-y-4">
        <Field label={t.newNameLabel} name="name" required defaultValue={name} />
        <Select
          label={t.newKindLabel}
          name="kind"
          defaultValue={kind}
          options={MENU_KINDS.map((k) => ({ value: k, label: es.naming.menuKinds[k] }))}
        />
        <Field label={t.newDateLabel} name="targetDate" type="date" required defaultValue={targetDate} hint={t.newDateHint} />
        <Select
          label={t.newTemplateLabel}
          name="templateId"
          defaultValue={templateId ?? ""}
          options={[{ value: "", label: t.newTemplateNone }, ...templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))]}
        />
        <Feedback state={state} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t.saveDetailsPending : t.saveDetails}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Los botones según el estado (RN-MEN-09). La pantalla elige qué pintar;
 * quién puede y en qué estado lo decide el servidor, que lanza si no.
 */
export function ActionPanel({
  slug,
  establishmentId,
  menuId,
  state,
  idempotencyKey,
  defaultCopyDate,
}: {
  slug: string;
  establishmentId: string;
  menuId: string;
  state: MenuState;
  idempotencyKey: string;
  defaultCopyDate: string;
}) {
  const [prepareState, prepareAction, preparePending] = useActionState(
    async () => prepareMenu(menuId),
    INITIAL_MENU_ACTION,
  );
  const [requestState, requestAction, requestPending] = useActionState(
    requestMenuPublication.bind(null, menuId),
    INITIAL_MENU_ACTION,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelMenu.bind(null, menuId),
    INITIAL_MENU_ACTION,
  );
  const [answerState, answerAction, answerPending] = useActionState(
    provideMenuInformation.bind(null, menuId),
    INITIAL_MENU_ACTION,
  );
  const [copyState, copyAction, copyPending] = useActionState(
    copyMenu.bind(null, slug, establishmentId, menuId),
    INITIAL_MENU_ACTION,
  );

  const closed = state === "published" || state === "cancelled";
  const inFlight = !closed && state !== "draft" && state !== "prepared";

  return (
    <Card title={t.actionsTitle}>
      <div className="space-y-6">
        {state === "draft" ? (
          <form action={prepareAction} className="space-y-2">
            <p className="text-sm text-text-secondary">{t.prepareHint}</p>
            <Feedback state={prepareState} />
            <Button type="submit" disabled={preparePending}>
              {preparePending ? t.pending : t.prepare}
            </Button>
          </form>
        ) : null}

        {state === "prepared" ? (
          <form action={requestAction} className="space-y-2">
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <p className="text-sm text-text-secondary">{t.requestPublicationHint}</p>
            <Feedback state={requestState} />
            <Button type="submit" disabled={requestPending}>
              {requestPending ? t.pending : t.requestPublication}
            </Button>
          </form>
        ) : null}

        {state === "needs_information" ? (
          <form action={answerAction} className="space-y-2">
            <p className="font-medium text-text">{t.answerTitle}</p>
            <p className="text-sm text-text-secondary">{t.answerHint}</p>
            <TextArea label={t.answerLabel} name="answer" rows={2} />
            <Feedback state={answerState} />
            <Button type="submit" disabled={answerPending}>
              {answerPending ? t.pending : t.answer}
            </Button>
          </form>
        ) : null}

        {!closed ? (
          <form action={cancelAction} className="space-y-2">
            <p className="text-sm text-text-secondary">{t.cancelHint}</p>
            <Field label={t.cancelReasonLabel} name="reason" required={inFlight} />
            <Feedback state={cancelState} />
            <Button type="submit" variant="danger" disabled={cancelPending}>
              {cancelPending ? t.pending : t.cancel}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-text-secondary">{t.nothingToDo}</p>
        )}

        <form action={copyAction} className="space-y-2">
          <p className="text-sm text-text-secondary">{t.copyHint}</p>
          <Field label={t.copyDateLabel} name="targetDate" type="date" required defaultValue={defaultCopyDate} />
          <Feedback state={copyState} />
          <Button type="submit" variant="secondary" disabled={copyPending}>
            {copyPending ? t.pending : t.copy}
          </Button>
        </form>
      </div>
    </Card>
  );
}

/**
 * RN-COR-10 · pedir la corrección mínima de un menú publicado. La
 * disponibilidad y la garantía las calcula `menuCorrectionAvailability()`
 * para poder decir el motivo (CA-20); quien decide de verdad es
 * `request_menu_correction()` al pulsar.
 */
export function CorrectionForm({
  menuId,
  availability,
}: {
  menuId: string;
  availability: MenuCorrectionAvailability;
}) {
  const [state, formAction, pending] = useActionState(requestMenuCorrection.bind(null, menuId), INITIAL_MENU_ACTION);

  if (!availability.available) {
    if (availability.reason === "not_published") return null;
    return (
      <Card title={t.correctionTitle}>
        <p className="text-sm text-text-secondary">
          {availability.reason === "already_used" ? t.correctionUsed : t.correctionWindowClosed}
        </p>
      </Card>
    );
  }

  return (
    <Card title={t.correctionTitle}>
      <form action={formAction} className="space-y-3">
        <p className="text-sm text-text-secondary">{t.correctionHint}</p>
        <p className="text-sm text-text-secondary">
          {availability.guaranteed ? t.correctionGuaranteedHint : t.correctionNotGuaranteedHint}
        </p>
        <TextArea label={t.correctionLabel} name="description" rows={2} required />
        <Feedback state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t.pending : t.correctionSubmit}
        </Button>
      </form>
    </Card>
  );
}
