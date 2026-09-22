import Link from "next/link";

import { StatusBadge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { sortedCycleUsage, type CycleBag } from "@/core/establishments";
import { es } from "@/i18n/es";
import type { SheetHeader } from "@/app/espacios/[slug]/restaurantes/[id]/sheet-load";

import { EstablishmentPhoto } from "./EstablishmentPhoto";
import {
  MANAGEMENT_BLOCKS,
  MANAGEMENT_TAB,
  OPERATION_SECTION_TABS,
  SHEET_TABS,
  operationSectionHref,
  operationSectionLabel,
  sheetHref,
  sheetTabLabel,
  type OperationSectionTab,
  type SheetTab,
} from "./tabs";

/**
 * La cabecera de la ficha del restaurante con sus cinco pestañas: la que
 * dibujan las 31 vistas del diseño de escritorio (M25 a M48).
 *
 * Está en su propio archivo porque la llevan dos sitios: la ficha y las
 * pantallas de detalle que se abren desde ella —solicitud (M26), trabajo
 * (M28), tarea (M30), menú (M32) e informe (M39)—, que en el diseño se
 * leen dentro del mismo marco. Una sola cabecera: dos copias acabarían
 * enseñando un plan distinto del mismo restaurante.
 *
 * No inventa nada. Lo que no está en la ficha de datos no se pinta, y los
 * números del plan salen de la bolsa del ciclo vigente.
 */

const t = es.establishmentSheet;

type StatusKey = keyof typeof es.space.statuses;
type CategoryKey = keyof typeof es.naming.categories;

const DATA_BLOCK = MANAGEMENT_BLOCKS.find((block) => block.key === "establishmentData")!;

export function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

function TabNav({ base, active }: { base: string; active: SheetTab }) {
  /*
    Las cinco pestañas del diseño, pegadas al pie de la cabecera: una fila
    de casillas iguales sobre la superficie suave, y la elegida en blanco
    con la raya verde debajo. Siguen siendo enlaces (CA-22).
  */
  return (
    <nav aria-label={t.tabsLabel} className="border-t border-border bg-soft-surface/60">
      <ul className="flex overflow-x-auto">
        {SHEET_TABS.map((tab) => {
          const seleccionada = tab.key === active.key;
          return (
            <li key={tab.key} className="min-w-[8.5rem] flex-1 sm:flex-none">
              <Link
                href={sheetHref(base, tab)}
                aria-current={seleccionada ? "page" : undefined}
                className={`-mb-px block border-b-2 border-r border-r-border px-5 py-3 text-center text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
                  seleccionada
                    ? "border-b-cuotly-green bg-surface font-semibold text-cuotly-green"
                    : "border-b-transparent font-medium text-text-secondary hover:bg-surface/70 hover:text-text"
                }`}
              >
                {sheetTabLabel(tab)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SheetHeaderCard({
  base,
  tab,
  header,
  bags,
  photoUrl,
  canEditData,
}: {
  /** La dirección de la ficha, sin parámetros. */
  base: string;
  /** La pestaña que se marca como actual. */
  tab: SheetTab;
  header: SheetHeader;
  /** La bolsa del ciclo vigente, para "25 cambios pequeños · 5 medianos…". */
  bags: readonly CycleBag[];
  photoUrl: string | null;
  /** Solo decide si se pinta "Editar restaurante"; el servidor manda (RN-EST-11). */
  canEditData: boolean;
}) {
  const bolsas = sortedCycleUsage(bags);

  /*
    La cabecera de la ficha, igual en las 31 vistas del diseño de
    escritorio (M25 a M48): la foto, el nombre con su estado al lado,
    una línea con el plan y lo que incluye, "Ver sitio web" a la
    derecha, y las cinco pestañas pegadas debajo, dentro de la misma
    tarjeta.

    Lo que el diseño dibuja y NO está:

      · El **menú de tres puntos** junto a "Ver sitio web". No hay
        ninguna acción decidida para él, y un menú que se abre vacío es
        peor que no estar.
      · La **frase que describe el restaurante**. No hay campo de
        descripción en la ficha de datos (`IDENTITY_FIELDS`), e
        inventarla sería escribirle al cliente algo que no ha dicho.
      · El **desplegable sobre la insignia de estado**. El estado se
        cambia en Gestión, con su motivo y su auditoría (RN-EST-08).
  */
  return (
    <header className="overflow-hidden rounded-card border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
        {/*
          RN-EST-18 · la foto del local. Sin foto se pinta el icono de
          local, no un marco vacío (CA-20).
        */}
        <div className="flex min-w-0 flex-1 basis-72 items-start gap-4 sm:items-center">
          <EstablishmentPhoto photoUrl={photoUrl} size={80} className="rounded-[14px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-primary-dark">
                {header.name}
              </h1>
              <StatusBadge tone={statusTone(header.status)}>
                {es.space.statuses[header.status as StatusKey] ?? header.status}
              </StatusBadge>
            </div>

            {/*
              La línea del diseño: "Plan Premium+ | 25 pequeños · 5
              medianos · 1 grande · 24 fotos". Lo que incluye sale del
              ciclo vigente (`summary.bags`), no del nombre del plan: es
              lo que de verdad le toca este mes, y sin ciclo no se
              escribe ningún número (CLAUDE.md MUST NOT).
            */}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-secondary">
              <span className="font-medium text-text">
                {header.planName === null
                  ? es.teamArea.establishments.noPlan
                  : t.headerPlan(header.planName)}
              </span>
              {bolsas.length === 0 ? null : (
                <>
                  <span aria-hidden="true" className="hidden text-border sm:inline">|</span>
                  <span>
                    {bolsas
                      .map((bag) => t.headerIncluded[bag.category as CategoryKey](bag.included))
                      .join(" · ")}
                  </span>
                </>
              )}
            </p>

            {/*
              El código, el grupo y la ciudad: lo que identifica al
              restaurante cuando hay dos que se llaman parecido. Cada
              uno solo si lo hay (P6).
            */}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-secondary">
              <span>{header.code}</span>
              <span>
                {es.teamArea.establishments.groupColumn}:{" "}
                {header.groupName ?? es.teamArea.establishments.noGroup}
              </span>
              {header.identity.city === null ? null : (
                <span className="inline-flex items-center gap-1">
                  <Icon name="location" aria-hidden="true" className="h-3.5 w-3.5" />
                  {header.identity.city}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {header.identity.websiteUrl === null ? null : (
            /*
              `rel="noreferrer"` porque es una web ajena, y el "se abre en
              una pestaña nueva" va escrito para quien no ve el icono
              (§21.4).
            */
            <a
              href={header.identity.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-field border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green transition-colors hover:bg-cuotly-green/10 focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {t.websiteLink}
              <Icon name="externalLink" aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">{t.websiteLinkNewTab}</span>
            </a>
          )}

          {/*
            Maqueta 03 · "Editar restaurante". Es un atajo al formulario
            de Gestión · Datos, no un segundo sitio donde editar. Solo se
            pinta a quien puede editar, y eso es cortesía:
            `set_establishment_data()` comprueba RN-EST-11 por su cuenta
            (CLAUDE.md: ocultar un botón no es un control de acceso).
          */}
          {canEditData ? (
            <Link
              href={sheetHref(base, MANAGEMENT_TAB, DATA_BLOCK)}
              className="inline-flex items-center gap-2 rounded-field border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
            >
              {t.editEstablishment}
            </Link>
          ) : null}
        </div>
      </div>

      <TabNav base={base} active={tab} />
    </header>
  );
}

/**
 * Página 25 · las cuatro secciones de Operación, con la pieza común de
 * pestañas subrayadas. Son enlaces: la sección vive en la dirección.
 */
export function SheetOperationNav({
  base,
  active,
}: {
  base: string;
  active: OperationSectionTab;
}) {
  return (
    <Tabs
      label={t.operationSectionsLabel}
      active={active.key}
      tabs={OPERATION_SECTION_TABS.map((section) => ({
        key: section.key,
        label: operationSectionLabel(section),
        href: operationSectionHref(base, section),
      }))}
    />
  );
}

/**
 * Lo que necesita el marco de la ficha encima de una pantalla de detalle.
 * `null` cuando no se puede leer el restaurante —RLS no lo deja ver, o el
 * informe es consolidado y no es de ninguno—: entonces no hay marco, en
 * vez de uno a medias.
 */
export interface SheetFrameData {
  readonly header: SheetHeader;
  readonly bags: readonly CycleBag[];
  readonly photoUrl: string | null;
  readonly canEditData: boolean;
}

/**
 * M26, M28, M30, M32 y M39 · el marco de la ficha encima de un detalle: la
 * cabecera con la pestaña que toca y, en Operación, sus cuatro secciones.
 */
export function SheetFrame({
  slug,
  frame,
  tab,
  section,
}: {
  slug: string;
  frame: SheetFrameData | null;
  tab: "operation" | "data";
  /** En Operación, cuál de las cuatro secciones se marca. */
  section?: OperationSectionTab["key"];
}) {
  if (frame === null) return null;
  const base = `/espacios/${slug}/restaurantes/${frame.header.id}`;
  const pestana = SHEET_TABS.find((candidata) => candidata.key === tab)!;
  const seccion =
    section === undefined
      ? null
      : (OPERATION_SECTION_TABS.find((candidata) => candidata.key === section) ?? null);

  return (
    <div className="space-y-4">
      <SheetHeaderCard
        base={base}
        tab={pestana}
        header={frame.header}
        bags={frame.bags}
        photoUrl={frame.photoUrl}
        canEditData={frame.canEditData}
      />
      {seccion === null ? null : <SheetOperationNav base={base} active={seccion} />}
    </div>
  );
}
