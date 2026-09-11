import Link from "next/link";

import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { AttentionList } from "@/components/home/AttentionList";
import { Icon } from "@/components/ui/Icon";
import { EstablishmentDataForm } from "./DataForm";
import { ShareFileButton } from "./ShareFileButton";
import { UploadFileForm } from "./UploadFileForm";
import { MAX_FILE_SIZE_BYTES, fileTypeLabel } from "@/core/files";
import {
  IDENTITY_FIELDS,
  MULTILINE_IDENTITY_FIELDS,
  accessScope,
  currentJobDeadline,
  sortedCycleUsage,
  type CycleUsage,
} from "@/core/establishments";
import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
import { RevokeAccessButton } from "./RevokeAccessButton";
import { fechaCorta } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { tiempoRestante } from "@/i18n/duration";

import {
  MANAGEMENT_BLOCKS,
  MANAGEMENT_TAB,
  OPERATION_TAB,
  PAYMENTS_BLOCK,
  SHEET_TABS,
  filesHref,
  managementBlockLabel,
  sheetHref,
  sheetTabLabel,
  type ManagementBlock,
  type SheetTab,
} from "./tabs";
import type {
  SheetCounts,
  SheetCurrentJob,
  SheetFiles,
  SheetHeader,
  SheetIdentity,
  SheetHistoryEntry,
  SheetOperation,
  SheetPayments,
  SheetFileFolder,
  SheetStaffMember,
  SheetSummary,
  SheetUsers,
} from "@/app/espacios/[slug]/restaurantes/[id]/sheet-load";

/**
 * La ficha del restaurante para el equipo (PRD §15.2): cinco pestañas, y
 * Gestión con sus cinco bloques.
 *
 * Es de servidor entera. La pestaña viaja en la dirección y no en un
 * estado del navegador, así que "los archivos de Magariños" es un enlace
 * que se comparte, el botón de volver deshace el cambio de pestaña y nada
 * de esto depende de que hidrate JavaScript (CA-22).
 *
 * Lo que la Fase 1 no tiene —datos fiscales, backup de la web,
 * integraciones analíticas, el botón de retirar un acceso— aparece
 * diciendo **por qué** no está, no como un hueco en blanco ni como un dato
 * de ejemplo (CA-20, CLAUDE.md MUST NOT). La maqueta de la que sale esta
 * pantalla enseñaba esos bloques con datos inventados y va marcada como
 * "Datos de ejemplo"; aquí no se copian.
 */
export interface SheetData {
  readonly header: SheetHeader;
  /**
   * RN-EST-11 · si quien mira puede editar la ficha. Decide qué se pinta y
   * NADA más: `set_establishment_data()` lo comprueba por su cuenta, así
   * que un `true` de más aquí no autoriza nada — solo enseñaría un
   * formulario que el servidor rechazaría (CLAUDE.md).
   */
  readonly canEditData: boolean;
  readonly summary: SheetSummary;
  readonly operation: SheetOperation;
  readonly counts: SheetCounts;
  readonly payments: SheetPayments;
  /**
   * Hoy, en la zona del espacio y calculado en el SERVIDOR: es el día que
   * propone el formulario de registrar un pago. El navegador de quien lo
   * registra puede estar en otro huso y quien manda es el espacio
   * (CLAUDE.md MUST). Formato `YYYY-MM-DD`, el que entiende `<input
   * type="date">`.
   */
  readonly today: string;
  readonly users: SheetUsers;
  /**
   * Maqueta 15 · si quien mira puede retirar accesos (`manage_clients`).
   * Decide qué se PINTA y nada más: `revoke_establishment_access()` lo
   * comprueba por su cuenta, así que un `true` de más aquí enseñaría un
   * botón que el servidor rechaza, no un permiso concedido (CLAUDE.md).
   */
  readonly canManageClients: boolean;
  /** Maqueta 15 · el equipo autorizado en este restaurante (interno, P7). */
  readonly staff: readonly SheetStaffMember[];
  readonly files: SheetFiles;
  readonly history: readonly SheetHistoryEntry[];
}

type StatusKey = keyof typeof es.space.statuses;
type RequestStateKey = keyof typeof es.naming.states.request;
type JobStateKey = keyof typeof es.naming.states.job;
type PaymentMethodKey = keyof typeof es.teamArea.methods;
type SpecialtyKey = keyof typeof es.naming.specialties;
type TaskStateKey = keyof typeof es.naming.states.task;
type CategoryKey = keyof typeof es.naming.categories;
type FileCategoryKey = keyof typeof es.space.files.categories;
type FileVariantKey = keyof typeof es.establishmentSheet.fileVariants;
type ClientRoleKey = keyof typeof es.establishmentSheet.clientRoles;
type ChargeStateKey = keyof typeof es.teamArea.chargeStates;

/**
 * El color del estado de un cobro. "Vencido" en rojo y "Pendiente" en
 * ámbar no es decoración: es lo que distingue de un vistazo una cuota que
 * todavía tiene plazo de una que ya lo pasó (RN-FIN-02).
 */
function chargeTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid" || status === "waived") return "success";
  if (status === "overdue") return "danger";
  if (status === "pending" || status === "partially_paid") return "warning";
  return "neutral";
}
type WebPlatformKey = keyof typeof es.establishmentSheet.dataWebPlatforms;

const t = es.establishmentSheet;

/**
 * El bloque de la ficha de datos, buscado por su clave y no por su
 * posición, igual que `FILES_BLOCK`: es a donde llevan los enlaces de
 * "rellenar los datos".
 */
const DATA_BLOCK = MANAGEMENT_BLOCKS.find((block) => block.key === "establishmentData")!;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function dia(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

/**
 * "Hoy, 10:24" para lo de hoy y la fecha corta con su hora para lo demás,
 * como en la maqueta 03. Una solicitud que llegó hace veinte minutos y
 * otra de la semana pasada se distinguen de un vistazo, que es para lo que
 * sirve la columna.
 */
function momento(value: string): string {
  const fecha = new Date(value);
  const hora = new Intl.DateTimeFormat("es-ES", { timeStyle: "short" }).format(fecha);
  const hoy = new Date();
  const mismoDia =
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate();
  return mismoDia ? es.establishmentSheet.today(hora) : `${diaCorto(value)}, ${hora}`;
}

/**
 * El plazo del trabajo vivo, con su nombre. Un "Quedan 2 h" a secas no
 * dice para qué: T2 es el plazo para comenzar (RN-SLA-05) y T3 el de
 * ejecución (RN-SLA-11), y la misma tarjeta enseña uno u otro según el
 * estado. Sin contador en marcha se dice eso, no una hora inventada.
 */
function plazoDelTrabajo(job: SheetCurrentJob): string {
  const plazo = currentJobDeadline(job);
  if (plazo.kind === "overdue") return t.currentJobOverdue;
  if (plazo.kind === "none") return t.currentJobNoCounter;
  const restante = tiempoRestante(plazo.remainingMinutes);
  return plazo.kind === "t2" ? t.currentJobToStart(restante) : t.currentJobToFinish(restante);
}

function diaCorto(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(new Date(value));
}

/**
 * El tamaño en megabytes, con la coma decimal del español. `toFixed()`
 * escribe siempre un punto, así que "2.4 MB" se colaba en una pantalla que
 * en la línea de al lado escribe "599,00 €".
 */
function megabytes(sizeBytes: number): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(sizeBytes / 1_048_576);
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

/**
 * El color de la insignia de una solicitud, un trabajo y una tarea en las
 * tarjetas de la vista 04.
 *
 * El tono acompaña al texto, nunca lo sustituye: la insignia escribe el
 * estado en español y quien mira en blanco y negro lo lee igual (§21.4).
 * Lo que el color añade es el vistazo — qué pide algo de mí (`warning`),
 * qué ya está resuelto (`success`), qué se torció (`danger`).
 */
function requestTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "pending_internal_validation" || state === "needs_information") return "warning";
  if (state === "published" || state === "accepted" || state === "closed") return "success";
  if (state === "rejected" || state.startsWith("cancelled")) return "danger";
  if (state === "in_progress" || state === "in_correction") return "info";
  return "neutral";
}

function jobTone(job: SheetCurrentJob): "success" | "warning" | "info" | "neutral" | "danger" {
  // Fuera de plazo manda sobre el estado: es lo único de la fila que pide
  // algo ahora mismo (RN-SLA-17).
  if (job.overdue) return "danger";
  if (job.state === "blocked_by_client" || job.state === "authorized_pause") return "warning";
  return "info";
}

function taskTone(state: string): "success" | "warning" | "info" | "neutral" | "danger" {
  if (state === "blocked") return "warning";
  if (state === "cancelled") return "danger";
  if (state === "completed") return "success";
  if (state === "in_progress") return "info";
  return "neutral";
}

/**
 * El recuadro de icono de cada fila, como en la vista 04. Es decorativo
 * —lo que identifica la fila es su título—, así que va oculto para quien
 * usa un lector de pantalla en vez de repetirle "solicitud" cuatro veces.
 */
function RowIcon({ name }: { name: "request" | "job" | "task" }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
    >
      <Icon name={name} className="h-4 w-4" />
    </span>
  );
}

/**
 * Lo que la tarjeta no está enseñando. Sin esta línea, cuatro de doce
 * parecen doce de doce: enseñar cuatro y callar ocho es esconderlas
 * (CA-20). El enlace "Ver todas" de la cabecera es a donde están.
 */
function CardMore({ hidden }: { hidden: number }) {
  if (hidden === 0) return null;
  return <p className="pt-3 text-sm text-text-secondary">{t.cardMore(hidden)}</p>;
}

/**
 * Una fila de la tarjeta de tareas.
 *
 * Es la única de las tres que puede no ser un enlace: no hay pantalla de
 * detalle de tarea —se opera con ella en su trabajo— y una actividad
 * interna independiente (§3, glosario) no cuelga de ninguno. Un enlace que
 * no lleva a ninguna parte es peor que su ausencia.
 */
function TaskRow({
  deepLink,
  title,
  subtitle,
  badge,
}: {
  deepLink: string | null;
  title: string;
  subtitle: string;
  badge: React.ReactNode;
}) {
  const contenido = (
    <>
      <RowIcon name="task" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-text">{title}</span>
        <span className="block truncate text-text-secondary">{subtitle}</span>
      </span>
      {badge}
    </>
  );

  return deepLink === null ? (
    <div className="flex items-center gap-3 py-3 text-sm">{contenido}</div>
  ) : (
    <Link
      href={deepLink}
      className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-cuotly-green"
    >
      {contenido}
    </Link>
  );
}

/**
 * Una bolsa del ciclo. El porcentaje puede ser `null` —el plan no incluye
 * nada de esa categoría— y entonces no se pinta barra: una barra al 0 %
 * diría "te quedan todos", que es lo contrario de lo que pasa.
 */
function CycleBagCard({ bag }: { bag: CycleUsage }) {
  const devueltos = bag.used < 0 ? -bag.used : 0;

  return (
    <div className="rounded-lg bg-soft-surface p-3">
      <p className="text-xs text-text-secondary">
        {es.naming.categories[bag.category as CategoryKey] ?? bag.category}
      </p>
      <p className="text-sm font-semibold text-primary-dark">
        {t.cycleUsed(Math.max(0, bag.used), bag.included)}
      </p>

      {bag.percentUsed === null ? (
        <p className="mt-1 text-xs text-text-secondary">{t.cycleNotIncluded}</p>
      ) : (
        <>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={bag.percentUsed}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={es.naming.categories[bag.category as CategoryKey] ?? bag.category}
          >
            <div className="h-full bg-cuotly-green" style={{ width: `${bag.percentUsed}%` }} />
          </div>
          {/*
            El porcentaje va escrito además de dibujado. La barra sola
            obliga a estimar a ojo cuánto queda, y a quien no la ve no le
            dice nada: el número es el dato y la barra, su forma.
          */}
          <p className="mt-1 flex items-baseline justify-between gap-2 text-xs text-text-secondary">
            <span>
              {bag.exhausted ? t.cycleExhausted : t.cycleRemaining(bag.remaining)}
              {devueltos > 0 ? ` · ${t.cycleReturned(devueltos)}` : ""}
            </span>
            <span className="shrink-0 font-semibold text-text">
              {t.cyclePercent(bag.percentUsed)}
            </span>
          </p>
        </>
      )}
    </div>
  );
}

/**
 * El desplegable "Categoría" del catálogo. Es un `<form method="get">`,
 * sin una línea de JavaScript, igual que los filtros del listado (§20.2):
 * filtra al enviar, no mientras se elige, y funciona antes de que hidrate
 * nada.
 *
 * Solo se pinta cuando hay más de una categoría que elegir. Un filtro con
 * una única opción no filtra nada y solo estorba.
 */
/**
 * Maqueta 16 · las carpetas, con lo que tiene cada una dentro.
 *
 * Enlaces, no botones: el filtro vive en la dirección (`?tipo=`), así que
 * "los menús de Magariños" se pega en un mensaje y el botón de volver
 * deshace el filtro. `aria-current` marca la carpeta abierta para quien no
 * ve el fondo resaltado.
 *
 * El archivo abierto en el panel viaja con el filtro: cambiar de carpeta
 * no debería cerrar lo que se estaba mirando.
 */
function FolderRail({
  base,
  folders,
  total,
  current,
  selectedFileId,
}: {
  base: string;
  folders: readonly SheetFileFolder[];
  total: number;
  current: string | null;
  selectedFileId: string | null;
}) {
  const clase = (activo: boolean) =>
    `flex items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
      activo
        ? "bg-soft-surface font-semibold text-primary-dark"
        : "text-text hover:bg-soft-surface"
    }`;

  return (
    <nav aria-label={t.foldersTitle}>
      <ul className="space-y-1">
        <li>
          <Link
            href={filesHref(base, { category: null, fileId: selectedFileId })}
            aria-current={current === null ? "true" : undefined}
            className={clase(current === null)}
          >
            <span>{t.foldersAll}</span>
            <span className="shrink-0 text-xs text-text-secondary">{total}</span>
          </Link>
        </li>
        {folders.map((folder) => (
          <li key={folder.category}>
            <Link
              href={filesHref(base, { category: folder.category, fileId: selectedFileId })}
              aria-current={current === folder.category ? "true" : undefined}
              className={clase(current === folder.category)}
            >
              <span>
                {es.space.files.categories[folder.category as FileCategoryKey] ?? folder.category}
              </span>
              <span className="shrink-0 text-xs text-text-secondary">{folder.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * RN-ARC-04 · si un archivo lo ve el restaurante o solo el equipo.
 *
 * El punto acompaña al texto, nunca lo sustituye: el color no puede ser la
 * única señal de algo que decide quién ve qué (§21.4). Quien mira en
 * blanco y negro lee "Interno" igual.
 */
function VisibilityMark({ visibility }: { visibility: string }) {
  const compartido = visibility === "shared_with_client";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${compartido ? "bg-success" : "bg-text-secondary"}`}
      />
      {compartido ? es.space.files.sharedWithClient : es.space.files.internal}
    </span>
  );
}

/**
 * §15.2 · la ficha de datos en lectura. Los mismos campos que el
 * formulario, en el mismo orden, para que quien alterna entre Operación y
 * Gestión no tenga que buscarlos dos veces (CA-21).
 *
 * Por defecto **omite lo vacío**: en Operación esto es una consulta y una
 * lista de "sin rellenar" repetida doce veces no informa de nada. En el
 * bloque de Gestión de quien no puede editar sí se enseñan todos
 * (`withEmptyFields`), porque ahí la pregunta es justamente qué falta.
 *
 * El horario respeta sus saltos de línea (`whitespace-pre-line`): se
 * guarda multilínea porque un horario partido en dos tramos son dos
 * líneas, y aplanarlo lo vuelve ilegible.
 */
function IdentityFacts({
  identity,
  withEmptyFields = false,
}: {
  identity: SheetIdentity;
  withEmptyFields?: boolean;
}) {
  // La lista de campos no se escribe aquí: sale de `IDENTITY_FIELDS`
  // (src/core/establishments.ts), que es la misma que usa el formulario.
  // Un campo nuevo aparece en los dos sitios o en ninguno.
  const filas = IDENTITY_FIELDS.map((field) => {
    // La plataforma web es una lista cerrada: se enseña su nombre en
    // español, no la clave con la que se guarda.
    const valor =
      field === "webPlatform" && identity.webPlatform !== null
        ? (t.dataWebPlatforms[identity.webPlatform as WebPlatformKey] ?? identity.webPlatform)
        : identity[field];
    return { field, valor, multilinea: MULTILINE_IDENTITY_FIELDS.includes(field) };
  });

  const visibles = withEmptyFields ? filas : filas.filter(({ valor }) => valor !== null);
  if (visibles.length === 0) return null;

  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {visibles.map(({ field, valor, multilinea }) => (
        <div key={field} className={multilinea ? "sm:col-span-2" : undefined}>
          <dt className="text-text-secondary">{t.identityFields[field]}</dt>
          <dd
            className={`font-medium text-text ${multilinea ? "whitespace-pre-line" : ""} ${
              valor === null ? "italic text-text-secondary" : ""
            }`}
          >
            {valor ?? t.identityFieldEmpty}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TabNav({ base, active }: { base: string; active: SheetTab }) {
  return (
    <nav aria-label={t.tabsLabel} className="border-b border-border">
      <ul className="flex flex-wrap gap-1">
        {SHEET_TABS.map((tab) => {
          const seleccionada = tab.key === active.key;
          return (
            <li key={tab.key}>
              <Link
                href={sheetHref(base, tab)}
                aria-current={seleccionada ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2 text-sm ${
                  seleccionada
                    ? "border-cuotly-green font-semibold text-primary-dark"
                    : "border-transparent text-text-secondary hover:text-text"
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

/**
 * Los cinco bloques de Gestión, como control segmentado: una pista clara
 * con el bloque elegido en blanco encima (maqueta §15.2).
 *
 * Siguen siendo enlaces, no botones: el bloque vive en la dirección
 * (`?vista=gestion&bloque=archivos`) y esta barra solo lo enseña. Que
 * parezca un interruptor no lo convierte en uno — sin JavaScript navega
 * igual (CA-22).
 */
function BlockNav({ base, active }: { base: string; active: ManagementBlock }) {
  return (
    <nav aria-label={t.blocksLabel}>
      <ul className="inline-flex flex-wrap gap-1 rounded-[14px] bg-soft-surface p-1">
        {MANAGEMENT_BLOCKS.map((block) => {
          const seleccionado = block.key === active.key;
          return (
            <li key={block.key}>
              <Link
                href={sheetHref(base, MANAGEMENT_TAB, block)}
                aria-current={seleccionado ? "true" : undefined}
                className={`inline-block rounded-[10px] px-3.5 py-1.5 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
                  seleccionado
                    ? "bg-surface font-semibold text-primary-dark shadow-sm"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                {managementBlockLabel(block)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function EstablishmentSheet({
  base,
  slug,
  tab,
  block,
  data,
}: {
  base: string;
  slug: string;
  tab: SheetTab;
  block: ManagementBlock;
  data: SheetData;
}) {
  const {
    header,
    canEditData,
    canManageClients,
    summary,
    operation,
    counts,
    payments,
    today,
    users,
    staff,
    files,
    history,
  } = data;
  const bolsas = sortedCycleUsage(summary.bags);
  /*
    Maqueta 14 · las tarjetas de arriba son las cuotas que siguen debiendo
    algo. "Vivo" lo dice la deuda, no el estado: un cobro perdonado
    (`waived`) tiene cero pendiente y no necesita tarjeta, y uno pagado en
    parte sí, aunque su estado no sea "pendiente".
  */
  const cuotasVivas = payments.charges.filter((charge) => charge.outstandingCents > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="space-y-2">
        <p className="text-sm text-text-secondary">{header.groupName ?? "—"}</p>
        <h1 className="text-2xl font-bold text-primary-dark">
          {header.name} <span className="text-text-secondary">{header.code}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(header.status)}>
            {es.space.statuses[header.status as StatusKey] ?? header.status}
          </StatusBadge>
          {header.planName ? <StatusBadge tone="info">{header.planName}</StatusBadge> : null}

          {/*
            El enlace al sitio web del restaurante, como en la maqueta 06.
            Solo cuando hay uno guardado: un botón que no lleva a ninguna
            parte es peor que no tenerlo, y hasta la migración 57 esta
            columna no existía.

            `rel="noreferrer"` porque es una web ajena, y el "se abre en
            una pestaña nueva" va escrito para quien no ve el icono: un
            enlace que cambia de contexto sin avisar desorienta (§21.4).
          */}
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {header.identity.websiteUrl === null ? null : (
              <a
                href={header.identity.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-field border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <Icon name="externalLink" aria-hidden="true" className="h-4 w-4" />
                {t.websiteLink}
                <span className="sr-only">{t.websiteLinkNewTab}</span>
              </a>
            )}

            {/*
              Maqueta 03 · "Editar restaurante", arriba a la derecha. Es un
              atajo al formulario que ya existe en Gestión · Datos, no un
              segundo sitio donde editar: dos formularios para lo mismo
              acaban divergiendo.

              Solo se pinta a quien puede editar, y eso es cortesía:
              `set_establishment_data()` comprueba RN-EST-11 por su cuenta
              y desde la migración 57 es la única puerta, así que llegar a
              esa dirección sin permiso enseña el motivo y no el formulario
              (CLAUDE.md: ocultar un botón no es un control de acceso).
            */}
            {canEditData ? (
              <Link
                href={sheetHref(base, MANAGEMENT_TAB, DATA_BLOCK)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-field border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                {t.editEstablishment}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <TabNav base={base} active={tab} />

      {tab.key === "summary" ? (
        <>
          {/*
            Maqueta 03 · el Resumen son cuatro bloques: el consumo del
            plan, las solicitudes pendientes, el trabajo actual y el estado
            de pago. Con el próximo menú en medio, que es de la Fase 2 y lo
            dice.

            Las tarjetas de plan, servicio y renovación que había aquí se
            han quitado: la maqueta no las tiene, el plan ya se lee en la
            insignia del encabezado y el bloque Gestión · Plan cuenta los
            tres datos enteros —plan, servicios y permanencia— sin
            resumirlos a medias.
          */}
          <Card
            title={t.cycleTitle}
            action={
              header.cycleStart !== null && header.cycleEnd !== null ? (
                <span className="shrink-0 text-sm text-text-secondary">
                  {t.cycleRange(dia(header.cycleStart), dia(header.cycleEnd))}
                </span>
              ) : undefined
            }
          >
            {bolsas.length === 0 ? (
              <EmptyState title={t.cycleEmptyTitle} description={t.cycleEmptyReason} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {bolsas.map((bag) => (
                    <CycleBagCard key={bag.category} bag={bag} />
                  ))}
                </div>
                <p className="mt-3 text-sm">
                  <Link href={`${base}/consumos`} className="text-cuotly-green underline">
                    {t.ledgerLink}
                  </Link>
                </p>
              </>
            )}
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card
              title={t.pendingRequestsTitle}
              action={
                <Link
                  href={sheetHref(base, OPERATION_TAB)}
                  className="shrink-0 text-sm text-cuotly-green underline"
                >
                  {t.pendingRequestsLink}
                </Link>
              }
            >
              {summary.openRequests === 0 ? (
                <EmptyState
                  title={t.pendingRequestsEmptyTitle}
                  description={t.pendingRequestsEmptyReason}
                />
              ) : summary.pendingValidation.length === 0 ? (
                /*
                  Hay solicitudes abiertas pero ninguna esperando al equipo.
                  No es lo mismo que "no hay ninguna", y enseñar el estado
                  vacío aquí haría creer que este restaurante no ha pedido
                  nada (CA-20).
                */
                <p className="text-sm text-text-secondary">
                  {t.pendingRequestsOpen(summary.openRequests)}
                </p>
              ) : (
                <>
                  <p className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-primary-dark">
                      {summary.pendingValidation.length}
                    </span>
                    <span className="text-sm text-text-secondary">
                      {t.pendingValidationCount(summary.pendingValidation.length)}
                    </span>
                  </p>

                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {summary.pendingValidation.map((request) => (
                      <li key={request.id}>
                        <Link
                          href={request.deepLink}
                          className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-cuotly-green"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-text">
                              {request.description}
                            </span>
                            <span className="block text-text-secondary">
                              {momento(request.createdAt)}
                            </span>
                          </span>
                          <Icon
                            name="chevronRight"
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-text-secondary"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <Card
              title={t.currentJobTitle}
              action={
                <Link
                  href={`/espacios/${slug}/trabajos`}
                  className="shrink-0 text-sm text-cuotly-green underline"
                >
                  {t.currentJobLink}
                </Link>
              }
            >
              {summary.currentJob === null ? (
                <EmptyState
                  title={t.currentJobEmptyTitle}
                  description={t.currentJobEmptyReason}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={summary.currentJob.deepLink}
                    className="min-w-0 text-sm transition-colors hover:text-cuotly-green"
                  >
                    <span className="block truncate font-semibold text-primary-dark">
                      {summary.currentJob.title}
                    </span>
                    <span className="block text-text-secondary">
                      {summary.currentJob.code} ·{" "}
                      {es.naming.states.job[summary.currentJob.state as JobStateKey] ??
                        summary.currentJob.state}
                      {summary.liveJobs > 1 ? ` · ${t.currentJobMore(summary.liveJobs - 1)}` : ""}
                    </span>
                  </Link>

                  {/*
                    El plazo, con su nombre. "Quedan 2 h" a secas no dice
                    para qué: T2 es el plazo para COMENZAR y T3 el de
                    ejecución (RN-SLA-05/11), y son dos cosas distintas
                    que la misma tarjeta enseña en momentos distintos.
                  */}
                  <StatusBadge tone={summary.currentJob.overdue ? "danger" : "info"}>
                    {plazoDelTrabajo(summary.currentJob)}
                  </StatusBadge>
                </div>
              )}
            </Card>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {/*
              RN-CON-02 y el propio servicio son de la Fase 2. La maqueta
              enseña aquí "Menú de mañana · Publicación solicitada" con
              datos de ejemplo; eso no lo está publicando nadie, así que se
              dice el motivo en vez de copiarlo (CLAUDE.md MUST NOT).
            */}
            <Card title={t.nextMenuTitle}>
              <EmptyState title={t.nextMenuEmptyTitle} description={t.nextMenuEmptyReason} />
            </Card>

            <Card
              title={t.paymentStatusTitle}
              action={
                summary.payment.allowed ? (
                  <Link
                    href={sheetHref(base, MANAGEMENT_TAB, PAYMENTS_BLOCK)}
                    className="shrink-0 text-sm text-cuotly-green underline"
                  >
                    {t.paymentStatusLink}
                  </Link>
                ) : undefined
              }
            >
              {!summary.payment.allowed ? (
                <EmptyState title={t.paymentHiddenTitle} description={t.paymentHiddenReason} />
              ) : (
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${
                      summary.payment.outstandingCents === 0
                        ? "bg-cuotly-green/10 text-cuotly-green"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    <Icon
                      name={summary.payment.outstandingCents === 0 ? "check" : "alert"}
                      className="h-6 w-6"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-semibold text-primary-dark">
                      {summary.payment.outstandingCents === 0
                        ? t.paymentUpToDate
                        : t.paymentOwed(euros(summary.payment.outstandingCents))}
                    </span>
                    <span className="block text-sm text-text-secondary">
                      {summary.payment.outstandingCents === 0
                        ? t.paymentUpToDateReason
                        : t.paymentOwedReason(summary.payment.overdueCount)}
                    </span>
                  </span>
                </div>
              )}
            </Card>
          </div>

          {/*
            No está en la maqueta, y se queda: cubre lo que las dos
            tarjetas de arriba no miran —un trabajo fuera de plazo, uno sin
            asignar, una corrección pedida— y es la misma lista, con el
            mismo orden y los mismos motivos, que el Inicio del espacio.
            Quitarla para parecerse más al dibujo escondería avisos reales.
          */}
          <Card title={t.attentionTitle}>
            {summary.attention.length === 0 ? (
              <EmptyState title={t.attentionEmptyTitle} description={t.attentionEmptyReason} />
            ) : (
              <AttentionList items={summary.attention} />
            )}
          </Card>
        </>
      ) : null}

      {tab.key === "operation" ? (
        /*
          Vista 04 · la Operación son cuatro tarjetas en rejilla:
          Solicitudes, Trabajos, Tareas y Menú Diario. Cada una enseña las
          primeras filas, dice cuántas deja detrás y enlaza a su listado
          filtrado por este restaurante.

          La tarjeta de datos fiscales y de contacto que había aquí se ha
          quitado: la maqueta no la tiene y los mismos quince datos se leen
          enteros en Gestión · Ficha —en formulario para quien puede editar
          y en lectura para quien no (RN-EST-11)—, así que no queda nada
          inalcanzable. Repetirlos en dos pestañas era además la manera de
          que un día dijeran cosas distintas.
        */
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card
            title={t.requestsTitle}
            action={
              <Link
                href={`/espacios/${slug}/solicitudes?restaurante=${header.id}`}
                className="shrink-0 text-sm text-cuotly-green underline"
              >
                {t.requestsLink}
              </Link>
            }
          >
            {operation.requests.shown.length === 0 ? (
              <EmptyState title={t.requestsEmptyTitle} description={t.requestsEmptyReason} />
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {operation.requests.shown.map((request) => (
                    <li key={request.id}>
                      <Link
                        href={request.deepLink}
                        className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-cuotly-green"
                      >
                        <RowIcon name="request" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-text">
                            {request.description}
                          </span>
                          {/*
                            Quién la pidió y cuándo. Dos solicitudes del
                            mismo día se distinguen por el autor, y cuando
                            RLS no deja resolver ese nombre se queda solo
                            la fecha: un uuid no le dice a nadie quién
                            escribió (CA-20).
                          */}
                          <span className="block truncate text-text-secondary">
                            {request.authorName === null
                              ? momento(request.createdAt)
                              : `${request.authorName} · ${momento(request.createdAt)}`}
                          </span>
                        </span>
                        <StatusBadge tone={requestTone(request.state)}>
                          {es.naming.states.request[request.state as RequestStateKey] ??
                            request.state}
                        </StatusBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
                <CardMore hidden={operation.requests.hidden} />
              </>
            )}
          </Card>

          <Card
            title={t.jobsTitle}
            action={
              <Link
                href={`/espacios/${slug}/trabajos?restaurante=${header.id}`}
                className="shrink-0 text-sm text-cuotly-green underline"
              >
                {t.jobsLink}
              </Link>
            }
          >
            {operation.jobs.shown.length === 0 ? (
              <EmptyState title={t.jobsEmptyTitle} description={t.jobsEmptyReason} />
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {operation.jobs.shown.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={job.deepLink}
                        className="flex items-center gap-3 py-3 text-sm transition-colors hover:text-cuotly-green"
                      >
                        <RowIcon name="job" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-text">{job.title}</span>
                          {/*
                            El estado, y no el nombre del restaurante que
                            la maqueta pone debajo: en la ficha de
                            Magariños todas estas filas son de Magariños, y
                            repetirlo cuatro veces gasta la línea que sí
                            dice algo.
                          */}
                          <span className="block truncate text-text-secondary">
                            {job.code} ·{" "}
                            {es.naming.states.job[job.state as JobStateKey] ?? job.state}
                          </span>
                        </span>
                        {/*
                          El mismo plazo que el Resumen, recalculado desde
                          los eventos por la misma función (CA-10), y con
                          su nombre: T2 es para comenzar y T3 para publicar
                          (RN-SLA-05/11).
                        */}
                        <StatusBadge tone={jobTone(job)}>{plazoDelTrabajo(job)}</StatusBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
                <CardMore hidden={operation.jobs.hidden} />
              </>
            )}
          </Card>

          <Card
            title={t.tasksTitle}
            action={
              <Link
                href={`/espacios/${slug}/tareas?restaurante=${header.id}`}
                className="shrink-0 text-sm text-cuotly-green underline"
              >
                {t.tasksLink}
              </Link>
            }
          >
            {operation.tasks.shown.length === 0 ? (
              <EmptyState title={t.tasksEmptyTitle} description={t.tasksEmptyReason} />
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {operation.tasks.shown.map((task) => (
                    <li key={task.id}>
                      {/*
                        Maqueta 07 · la fila lleva a LA TAREA, abierta en
                        la pantalla de coordinación de su trabajo. Antes
                        llevaba al trabajo entero porque no había detalle
                        de tarea al que llegar; ahora lo hay.

                        Y lleva los cuatro datos de la tabla del dibujo:
                        tarea, responsable, estado (la insignia) y fecha.
                        Una tarea sin planificar lo dice en vez de dejar
                        el hueco: "sin fecha" es una respuesta, un guion
                        no (CA-20).

                        Una actividad interna independiente (§3) no cuelga
                        de ningún trabajo y no hay pantalla donde abrirla,
                        así que no se pinta como enlace en vez de ser un
                        enlace que no lleva a nada.
                      */}
                      <TaskRow
                        deepLink={task.deepLink}
                        title={task.title}
                        subtitle={`${task.jobCode ?? t.tasksNoJob} · ${
                          task.assigneeName ?? t.tasksUnassigned
                        } · ${
                          task.plannedDate === null
                            ? t.tasksNoDate
                            : fechaCorta(task.plannedDate)
                        } · ${t.tasksMinutes(task.estimatedMinutes)}`}
                        badge={
                          <StatusBadge tone={taskTone(task.state)}>
                            {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
                          </StatusBadge>
                        }
                      />
                    </li>
                  ))}
                </ul>
                <CardMore hidden={operation.tasks.hidden} />
              </>
            )}
          </Card>

          {/*
            Menú Diario es la Fase 2 entera. La maqueta enseña aquí tres
            menús con sus plazos y va marcada "Datos de ejemplo": no los
            está publicando nadie, así que va el motivo (CLAUDE.md MUST
            NOT). Tampoco el enlace "Ver menú" del dibujo, que no llevaría
            a ninguna parte.
          */}
          <Card title={t.dailyMenuTitle}>
            <EmptyState title={t.dailyMenuEmptyTitle} description={t.dailyMenuEmptyReason} />
          </Card>
        </div>
      ) : null}

      {tab.key === "data" ? (
        <>
          <Card title={t.countsTitle}>
            <p className="mb-3 text-sm text-text-secondary">{t.countsHint}</p>
            {counts.requestsByState.length === 0 && counts.jobsByState.length === 0 ? (
              <EmptyState title={t.countsEmptyTitle} description={t.countsEmptyReason} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">{t.countsRequests}</p>
                  <p className="text-lg font-semibold text-primary-dark">
                    {counts.requestsByState.reduce((total, [, n]) => total + n, 0)}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">{t.countsByState}</p>
                  <ul className="text-sm text-text">
                    {counts.requestsByState.map(([state, n]) => (
                      <li key={state}>
                        {(es.naming.states.request[state as RequestStateKey] ?? state) + ": " + n}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">{t.countsJobs}</p>
                  <p className="text-lg font-semibold text-primary-dark">
                    {counts.jobsByState.reduce((total, [, n]) => total + n, 0)}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">{t.countsByState}</p>
                  <ul className="text-sm text-text">
                    {counts.jobsByState.map(([state, n]) => (
                      <li key={state}>
                        {(es.naming.states.job[state as JobStateKey] ?? state) + ": " + n}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg bg-soft-surface p-3">
                  <p className="text-xs text-text-secondary">{t.countsFiles}</p>
                  <p className="text-lg font-semibold text-primary-dark">{counts.files}</p>
                </div>
              </div>
            )}
          </Card>

          <Card
            title={t.digitalTitle}
            action={<StatusBadge tone="danger" icon="alert">{es.analyticsSync.noSyncBadge}</StatusBadge>}
          >
            <EmptyState title={t.digitalEmptyTitle} description={t.digitalEmptyReason} />
          </Card>
        </>
      ) : null}

      {tab.key === "management" ? (
        <>
          <BlockNav base={base} active={block} />

          {/*
            §15.2 · la ficha de datos. El formulario solo a quien puede
            editar (RN-EST-11); a los demás, los mismos datos en lectura y
            el motivo de que no haya formulario —no un formulario
            deshabilitado, que parece un fallo—.

            Quien puede editar de verdad lo decide
            `set_establishment_data()`, y desde la migración 57 es la única
            puerta: `establishments` no tiene política de UPDATE.
          */}
          {block.key === "establishmentData" ? (
            <Card title={t.dataTitle}>
              {canEditData ? (
                <EstablishmentDataForm
                  establishmentId={header.id}
                  name={header.name}
                  identity={header.identity}
                />
              ) : (
                <>
                  <p className="mb-4 rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
                    {t.dataNotPublicNotice}
                  </p>
                  <IdentityFacts identity={header.identity} withEmptyFields />
                  <div className="mt-4">
                    <EmptyState
                      title={t.dataReadOnlyTitle}
                      description={t.dataReadOnlyReason}
                    />
                  </div>
                </>
              )}
            </Card>
          ) : null}

          {/*
            Maqueta 13 · "Plan y servicios": dos tarjetas, no una lista de
            tres líneas. La de la izquierda es el plan con su uso incluido;
            la de la derecha, los servicios adicionales.

            El uso son las MISMAS bolsas del Resumen y la MISMA tarjeta
            (`CycleBagCard`), no una copia con otro aspecto: dos dibujos
            del mismo consumo acaban enseñando números distintos en la
            misma ficha (CA-10).
          */}
          {block.key === "plan" ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card
                title={t.planTitle}
                action={
                  header.planName === null ? null : (
                    <StatusBadge tone="success">{es.space.statuses.active}</StatusBadge>
                  )
                }
              >
                {header.planName === null ? (
                  <EmptyState title={t.planNone} description={t.planNoneReason} />
                ) : (
                  <>
                    <p className="text-lg font-semibold text-primary-dark">{header.planName}</p>
                    {header.planPriceCents === null ? null : (
                      <p className="text-sm text-text-secondary">
                        {t.planPrice(euros(header.planPriceCents))}
                      </p>
                    )}

                    <p className="mt-4 mb-2 text-sm font-semibold text-text">{t.planUsageTitle}</p>
                    {bolsas.length === 0 ? (
                      <EmptyState title={t.cycleEmptyTitle} description={t.cycleEmptyReason} />
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {bolsas.map((bag) => (
                          <CycleBagCard key={bag.category} bag={bag} />
                        ))}
                      </div>
                    )}

                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-lg bg-soft-surface p-3">
                        <dt className="text-xs text-text-secondary">{t.renewalTitle}</dt>
                        {/*
                          La fecha sale del ciclo abierto, que es quien
                          manda (RN-COM-06: los consumos se renuevan en la
                          fecha de renovación y no se acumulan). Sin ciclo
                          abierto se dice, no se calcula "dentro de un mes"
                          a ojo.
                        */}
                        <dd className="font-semibold text-primary-dark">
                          {header.cycleEnd === null ? t.renewalNone : dia(header.cycleEnd)}
                        </dd>
                        <dd className="text-xs text-text-secondary">
                          {header.cycleEnd === null ? t.renewalNoneHint : t.renewalAutomatic}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-soft-surface p-3">
                        <dt className="text-xs text-text-secondary">{t.commitmentTitle}</dt>
                        <dd className="font-semibold text-primary-dark">
                          {header.commitmentEndsAt === null
                            ? t.commitmentNone
                            : new Date(header.commitmentEndsAt) > new Date()
                              ? t.commitmentUntil(dia(header.commitmentEndsAt))
                              : t.commitmentOver}
                        </dd>
                        {header.commitmentStartedAt === null ? null : (
                          <dd className="text-xs text-text-secondary">
                            {t.commitmentSince(dia(header.commitmentStartedAt))}
                          </dd>
                        )}
                      </div>
                    </dl>

                    <p className="mt-4 text-sm">
                      <Link
                        href={`/espacios/${slug}/planes`}
                        className="text-cuotly-green underline"
                      >
                        {t.manageplanLink}
                      </Link>
                    </p>
                  </>
                )}
              </Card>

              <Card title={t.servicesTitle}>
                {header.services.length === 0 ? (
                  <EmptyState title={t.servicesNone} description={t.servicesNoneReason} />
                ) : (
                  <>
                    <ul className="divide-y divide-border">
                      {header.services.map((service) => (
                        <li
                          key={service.subscriptionId}
                          className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                        >
                          <span>
                            <span className="block font-semibold text-primary-dark">
                              {service.name}
                            </span>
                            <span className="block text-xs text-text-secondary">
                              {t.serviceSince(dia(service.startedAt))}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm text-text-secondary">
                            {service.priceCents === null
                              ? "—"
                              : t.planPrice(euros(service.priceCents))}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/*
                      Maqueta 13 · lo que la tarjeta del servicio enseña y
                      aquí NO se enseña, con su motivo en vez de un número
                      inventado (CLAUDE.md MUST NOT):

                        · "Actualizaciones 12/30". El uso de un servicio no
                          se cuenta en ninguna parte: las bolsas del ciclo
                          son las cuatro categorías del plan. Menú Diario
                          es Fase 2.
                        · El segundo precio. RN-COM-08 cobra 229 € o 199 €
                          según el plan sea Premium, y cuál se aplica no lo
                          decide todavía ninguna función — la mensualidad
                          de un servicio ni siquiera se emite.
                        · "Versión aceptada v2.1 · Ver condiciones". El
                          bloque legal entero está aplazado en CLAUDE.md:
                          términos, privacidad y jurisdicción. No hay
                          versiones que aceptar ni condiciones que abrir.
                    */}
                    <div className="mt-4">
                      <EmptyState
                        title={t.serviceUsageEmptyTitle}
                        description={t.serviceUsageEmptyReason}
                      />
                    </div>
                  </>
                )}
              </Card>
            </div>
          ) : null}

          {/*
            Maqueta 14 · "Pagos y presupuestos": las cuotas vivas como
            tarjetas con su desglose, el historial de pagos debajo y los
            presupuestos al lado.

            El desglose —base imponible, IVA y total— se LEE del cobro, no
            se calcula aquí. `charges` guarda los tres importes y el tipo
            que regía al emitir (RN-FIN-08), justo para que cambiar el IVA
            mañana no reescriba lo que se facturó ayer (P4). Un 21 %
            multiplicado en la pantalla haría exactamente eso, y además
            sería inventarse una regla fiscal de las que CLAUDE.md aplaza.
          */}
          {block.key === "payments" ? (
            <div className="space-y-4">
              {!payments.allowed ? (
                /*
                  RN-FIN-07 · quién ve la facturación lo decide el servidor.
                  `allowed` es lo que contestó, y a quien no le corresponde
                  se le dice el motivo en vez de enseñarle una tabla vacía
                  que parecería "no hay cobros".
                */
                <Card title={t.chargesTitle}>
                  <EmptyState
                    title={t.chargesNoAccessTitle}
                    description={t.chargesNoAccessReason}
                  />
                </Card>
              ) : (
                <>
                  {/*
                    Las cuotas que siguen debiendo algo, cada una con su
                    desglose y su formulario de registrar el pago. Un cobro
                    saldado no necesita tarjeta: está en el historial.
                  */}
                  {cuotasVivas.length === 0 ? (
                    <Card title={t.chargesTitle}>
                      <EmptyState
                        title={
                          payments.charges.length === 0
                            ? t.chargesEmptyTitle
                            : t.chargesAllPaidTitle
                        }
                        description={
                          payments.charges.length === 0
                            ? t.chargesEmptyReason
                            : t.chargesAllPaidReason
                        }
                      />
                    </Card>
                  ) : (
                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      {cuotasVivas.map((charge) => (
                        <Card
                          key={charge.id}
                          title={charge.concept}
                          action={
                            <StatusBadge tone={chargeTone(charge.status)}>
                              {es.teamArea.chargeStates[charge.status as ChargeStateKey] ??
                                charge.status}
                            </StatusBadge>
                          }
                        >
                          <dl className="space-y-2 text-sm">
                            <div className="flex items-baseline justify-between gap-2">
                              <dt className="text-text-secondary">{t.baseLabel}</dt>
                              <dd className="font-semibold text-primary-dark">
                                {euros(charge.baseCents)}
                              </dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                              <dt className="text-text-secondary">
                                {t.taxLabel(charge.taxRatePercent)}
                              </dt>
                              <dd className="font-semibold text-primary-dark">
                                {euros(charge.taxCents)}
                              </dd>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 border-t border-border pt-2">
                              <dt className="font-semibold text-text">{t.totalLabel}</dt>
                              <dd className="text-lg font-bold text-primary-dark">
                                {euros(charge.totalCents)}
                              </dd>
                            </div>
                          </dl>

                          <p className="mt-3 text-xs text-text-secondary">
                            {t.billingPeriod(
                              diaCorto(charge.periodStart),
                              diaCorto(charge.periodEnd),
                            )}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {t.dueOn(diaCorto(charge.dueAt))}
                          </p>

                          {/*
                            HU-26 · el MISMO formulario de Finanzas y del
                            detalle del trabajo, no una tercera copia: lo
                            que cambia entre roles es lo que permite
                            `register_payment()` en el servidor, no la
                            pantalla.
                          */}
                          <div className="mt-4 border-t border-border pt-4">
                            <RegisterPaymentForm
                              chargeId={charge.id}
                              establishmentId={header.id}
                              outstandingEuros={(charge.outstandingCents / 100).toFixed(2)}
                              defaultDay={today}
                            />
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}

                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <Card title={t.paymentHistoryTitle}>
                      {payments.payments.length === 0 ? (
                        <EmptyState
                          title={t.paymentHistoryEmptyTitle}
                          description={t.paymentHistoryEmptyReason}
                        />
                      ) : (
                        <>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                                <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
                                <TableHeaderCell>{t.amountColumn}</TableHeaderCell>
                                <TableHeaderCell>{t.methodColumn}</TableHeaderCell>
                                <TableHeaderCell>{t.receiptColumn}</TableHeaderCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {payments.payments.map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell>{diaCorto(payment.paidAt)}</TableCell>
                                  <TableCell>{payment.chargeConcept}</TableCell>
                                  <TableCell>
                                    {euros(payment.amountCents)}
                                    {/*
                                      RN-FIN-04 · un pago mal registrado no
                                      se borra: se revierte y queda
                                      marcado. Sin esta marca el historial
                                      sumaría un dinero que ya no cuenta.
                                    */}
                                    {payment.reversedAt === null ? null : (
                                      <span className="block text-xs text-text-secondary">
                                        {t.paymentReversed}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {es.teamArea.methods[payment.method as PaymentMethodKey] ??
                                      payment.method}
                                  </TableCell>
                                  <TableCell>
                                    {/*
                                      La maqueta enseña aquí "FAC-2026-083".
                                      Esa numeración es fiscal y CLAUDE.md
                                      la deja aplazada, así que lo que se
                                      enseña es lo que sí existe: si hay
                                      justificante adjunto, se dice; si no,
                                      que no lo hay.
                                    */}
                                    {payment.receiptFileId === null
                                      ? t.receiptNone
                                      : t.receiptAttached}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          <p className="mt-3 text-sm">
                            <Link
                              href={`/espacios/${slug}/finanzas`}
                              className="text-cuotly-green underline"
                            >
                              {t.financeLink}
                            </Link>
                          </p>
                        </>
                      )}
                    </Card>

                    {/*
                      Maqueta 14 · "Presupuestos". No se inventa ni uno: el
                      PRD §5.3 pone `quotes` entre las "entidades preparadas
                      pero NO explotadas en Fase 1", y la tabla no existe en
                      ninguna migración. Una tabla con tres presupuestos de
                      ejemplo sería exactamente el dato de relleno que
                      CLAUDE.md prohíbe.
                    */}
                    <Card title={t.quotesTitle}>
                      <EmptyState
                        title={t.quotesEmptyTitle}
                        description={t.quotesEmptyReason}
                      />
                    </Card>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/*
            Maqueta 15 · "Usuarios y accesos": dos tarjetas. Arriba quién
            del lado CLIENTE puede entrar en este restaurante y con qué
            alcance; abajo qué gente del EQUIPO lo tiene autorizado.

            La segunda es organización interna y el dibujo lo dice con
            todas las letras ("Solo visibles internamente"). No hay riesgo
            de que se escape: esta ficha con sus cinco pestañas solo se
            pinta para quien es miembro del espacio, y además `profiles`
            no le devuelve al cliente ni una fila del equipo (P7).
          */}
          {block.key === "users" ? (
            <div className="space-y-4">
            <Card title={t.usersTitle}>
              {/*
                Una consulta fallida y una lista vacía NO son lo mismo, y se
                distinguen: "no hay nadie" frente a "no se ha podido
                comprobar" (CA-20).
              */}
              {users.failed ? (
                <EmptyState title={t.usersFailedTitle} description={t.usersFailedReason} />
              ) : users.rows.length === 0 ? (
                <EmptyState title={t.usersEmptyTitle} description={t.usersEmptyReason} />
              ) : (
                <>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t.personColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.accessColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.roleColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.scopeColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.permissionsColumn}</TableHeaderCell>
                        <TableHeaderCell>{t.sinceColumn}</TableHeaderCell>
                        {canManageClients ? (
                          <TableHeaderCell>{t.actionsColumn}</TableHeaderCell>
                        ) : null}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.rows.map((user) => {
                        const permisos: string[] = [];
                        if (user.canEditData) permisos.push(t.permissionEditData);
                        if (user.canViewBilling) permisos.push(t.permissionViewBilling);

                        return (
                          <TableRow key={`${user.source}:${user.userId}`}>
                            <TableCell>
                              <span className="block text-text">
                                {user.displayName ?? t.noName}
                              </span>
                              <span className="block text-xs text-text-secondary">
                                {user.email}
                              </span>
                            </TableCell>
                            <TableCell>
                              {user.source === "group" ? t.sourceGroup : t.sourceEstablishment}
                            </TableCell>
                            <TableCell>
                              {t.clientRoles[user.role as ClientRoleKey] ?? user.role}
                            </TableCell>
                            {/*
                              El alcance no es un dato guardado: es lo que
                              el rol significa, leído del PRD §14 por
                              `accessScope()` en `src/core`, con su test.
                              Y es una etiqueta, no un permiso: quien lo
                              hace cumplir es RLS.
                            */}
                            <TableCell>{t.accessScopes[accessScope(user.role)]}</TableCell>
                            <TableCell>
                              {permisos.length === 0 ? t.permissionsNone : permisos.join(" · ")}
                            </TableCell>
                            <TableCell>{diaCorto(user.grantedAt)}</TableCell>
                            {canManageClients ? (
                              <TableCell>
                                <RevokeAccessButton
                                  userId={user.userId}
                                  source={user.source}
                                  establishmentId={header.id}
                                  groupId={header.groupId}
                                  personName={user.displayName ?? user.email}
                                />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-sm text-text-secondary">{t.revokeHint}</p>
                  {/*
                    Tres cosas del dibujo que NO están, cada una por su
                    motivo (CLAUDE.md MUST NOT):

                      · El estado "Invitación pendiente · Expira en 7
                        días". Las invitaciones de Cuotly son al ESPACIO
                        (`space_invitations`, HU-03), no a un restaurante:
                        a un usuario del lado cliente se le da acceso
                        cuando ya existe. No hay invitación que esté
                        pendiente, así que no hay estado que enseñar.
                      · El permiso "Ver informes". No hay columna: los dos
                        permisos finos que existen son `edit_establishment_data`
                        y `view_billing` (RN-EST-11, RN-FIN-07). El PRD §14
                        dice además que el Editor "ve informes siempre" y
                        que Consulta "necesita permiso de su propietario",
                        un permiso que no está modelado — y los informes
                        son Fase 3.
                      · El botón "Añadir usuario existente". Dar acceso es
                        RN-EST-04 ("uno, varios, todos los actuales, o
                        todos los actuales y futuros") y no hay función de
                        servidor que lo haga: solo existen las de retirar.
                  */}
                  <p className="mt-1 text-sm text-text-secondary">{t.usersPendingHint}</p>
                </>
              )}
            </Card>

            <Card title={t.staffTitle}>
              <p className="mb-3 text-sm text-text-secondary">{t.staffHint}</p>
              {staff.length === 0 ? (
                <EmptyState title={t.staffEmptyTitle} description={t.staffEmptyReason} />
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.personColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.specialtyColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.stateColumn}</TableHeaderCell>
                      <TableHeaderCell>{t.sinceColumn}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {staff.map((person) => (
                      <TableRow key={person.userId}>
                        <TableCell>
                          <span className="block text-text">
                            {person.displayName ?? t.noName}
                          </span>
                          <span className="block text-xs text-text-secondary">{person.email}</span>
                        </TableCell>
                        <TableCell>
                          {/*
                            Sin especialidad declarada se dice: un hueco
                            aquí se lee como "no sabemos", y lo que pasa es
                            que nadie se la ha puesto (§4.6).
                          */}
                          {person.specialties.length === 0
                            ? t.specialtyNone
                            : person.specialties
                                .map(
                                  (specialty) =>
                                    es.naming.specialties[specialty as SpecialtyKey] ?? specialty,
                                )
                                .join(" · ")}
                        </TableCell>
                        <TableCell>
                          {person.membershipStatus === null
                            ? "—"
                            : (es.space.statuses[person.membershipStatus as StatusKey] ??
                              person.membershipStatus)}
                        </TableCell>
                        <TableCell>{diaCorto(person.assignedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
            </div>
          ) : null}

          {block.key === "files" ? (
            <>
              {/*
                Maqueta 16 · las carpetas son una LISTA con su recuento, no
                un desplegable. El recuento es la mitad del valor: "Menús 6"
                dice que hay seis antes de entrar, y un desplegable obliga a
                abrirlo para descubrir qué hay. Siguen siendo enlaces —el
                filtro vive en la dirección (`?tipo=`)— así que se comparten
                y el botón de volver los deshace (CA-22).
              */}
              <div className="grid items-start gap-4 lg:grid-cols-[1fr_3fr]">
                <Card title={t.foldersTitle}>
                  <FolderRail
                    base={base}
                    folders={files.folders}
                    total={files.total}
                    current={files.category}
                    selectedFileId={files.selected?.file.id ?? null}
                  />
                </Card>

                <Card title={t.filesTitle(header.name)}>
                  <UploadFileForm establishmentId={header.id} />
                  {/* RN-ARC-06 · el límite, dicho antes de elegir el archivo. */}
                  <p className="mt-2 text-xs text-text-secondary">
                    {t.filesMaxSize(megabytes(MAX_FILE_SIZE_BYTES))}
                  </p>

                  <div className="mt-4">
                    {files.files.length === 0 ? (
                      <EmptyState title={t.filesEmptyTitle} description={t.filesEmptyReason} />
                    ) : (
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableHeaderCell>{t.fileNameColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileCategoryColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileTypeColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileSizeColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileVisibilityColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.dateColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.fileVersionColumn}</TableHeaderCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {files.files.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell>
                                {/*
                                  El enlace elige el archivo del panel de
                                  versiones. Va en la dirección: compartirlo
                                  abre exactamente esto.
                                */}
                                <Link
                                  href={filesHref(base, {
                                    category: files.category,
                                    fileId: file.id,
                                  })}
                                  className="text-cuotly-green underline"
                                >
                                  {file.name}
                                </Link>
                                {file.archivedAt === null ? null : (
                                  <span className="ml-2 text-xs text-text-secondary">
                                    {t.fileArchived}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {es.space.files.categories[file.category as FileCategoryKey] ?? file.category}
                              </TableCell>
                              {/*
                                Tipo y tamaño son de la versión VIGENTE: lo
                                que pesa el archivo hoy, no lo que pesaba
                                hace tres sustituciones (RN-ARC-03). Y el
                                tipo sale del `mime_type` guardado, no de la
                                extensión del nombre: un `.jpg` que en
                                realidad es un PDF diría "JPG" y sería
                                mentira.
                              */}
                              <TableCell>
                                {file.mimeType === null
                                  ? t.fileTypeUnknown
                                  : fileTypeLabel(file.mimeType)}
                              </TableCell>
                              <TableCell>
                                {file.sizeBytes === null
                                  ? t.fileSizeUnknown
                                  : t.fileSize(megabytes(file.sizeBytes))}
                              </TableCell>
                              <TableCell>
                                <VisibilityMark visibility={file.visibility} />
                              </TableCell>
                              <TableCell>{diaCorto(file.createdAt)}</TableCell>
                              <TableCell>{t.fileVersion(file.lastVersion)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </Card>

                <Card>
                  {files.selected === null ? (
                    <>
                      <h3 className="mb-3 text-base font-semibold text-primary-dark">
                        {t.versionsTitle}
                      </h3>
                      <p className="text-sm text-text-secondary">{t.versionsPick}</p>
                    </>
                  ) : (
                    <>
                      {/*
                        La cabecera del panel: qué archivo se está mirando y
                        la salida. La X es un enlace a este mismo bloque sin
                        `?archivo=`, así que cerrar el panel también se
                        deshace con el botón de volver.
                      */}
                      <div className="mb-4 flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
                        >
                          <Icon name="image" className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-primary-dark">
                            {files.selected.file.name}
                          </p>
                          <p className="mt-1">
                            <StatusBadge tone="neutral">
                              {es.space.files.categories[
                                files.selected.file.category as FileCategoryKey
                              ] ?? files.selected.file.category}
                            </StatusBadge>
                          </p>
                        </div>
                        <Link
                          href={filesHref(base, { category: files.category, fileId: null })}
                          aria-label={t.versionsClose}
                          className="shrink-0 rounded p-1 text-text-secondary transition-colors hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
                        >
                          <Icon name="close" className="h-4 w-4" />
                        </Link>
                      </div>

                      {/*
                        RN-ARC-04 · la marca y, si es interno, el botón de
                        compartirlo. Va en el panel y no en la fila de la
                        tabla a propósito: es aquí donde se ve QUÉ es el
                        archivo —su categoría, sus versiones, su
                        miniatura—, y compartir con el restaurante no se
                        deshace, así que la decisión se toma mirándolo.

                        El botón se le ofrece a cualquiera que llegue
                        hasta aquí, sin mirar su rol, y no por descuido:
                        las filas de esta tabla son las que `can_read_file()`
                        ha dejado pasar, `manage_files` la tienen los tres
                        roles del espacio (propietario, administrador y
                        trabajador) y esta pantalla es la del equipo. Quien
                        no pueda —un trabajador con facturación, que ni
                        siquiera ve la fila— recibe el "no" del servidor.
                      */}
                      <h3 className="mb-2 text-base font-semibold text-primary-dark">
                        {t.shareTitle}
                      </h3>
                      <div className="mb-5 rounded-[10px] bg-soft-surface p-3 text-sm">
                        <VisibilityMark visibility={files.selected.file.visibility} />
                        {files.selected.file.visibility === "shared_with_client" ? (
                          <p className="mt-2 text-text-secondary">{t.shareSharedHint}</p>
                        ) : (
                          <>
                            <p className="mt-2 text-text-secondary">{t.shareInternalHint}</p>
                            <ShareFileButton fileId={files.selected.file.id} />
                            <p className="mt-2 text-xs text-text-secondary">
                              {t.shareIrreversible}
                            </p>
                          </>
                        )}
                      </div>

                      <h3 className="mb-2 text-base font-semibold text-primary-dark">
                        {t.versionsTitle}
                      </h3>
                      <ul className="space-y-2">
                        {files.selected.versions.map((version) => (
                          <li
                            key={version.id}
                            className="flex items-start gap-3 rounded-[10px] bg-soft-surface p-2 text-sm"
                          >
                            {/*
                              La miniatura es el propio archivo servido por
                              la ruta privada, no una copia optimizada:
                              RN-ARC-08 pide esa optimización y la Fase 1 no
                              la monta, así que se dice en el adaptador y no
                              se finge aquí. Lo que no es imagen no enseña
                              recuadro vacío: dice que no hay vista previa.
                            */}
                            {version.mimeType.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element -- el original vive en un bucket privado y llega por un 302 firmado y temporal (RN-ARC-08): `next/image` no puede optimizar una URL que caduca en cinco minutos.
                              <img
                                src={`/api/archivos/${files.selected!.file.id}?version=${version.versionNumber}`}
                                /*
                                  Alternativa vacía a propósito: la miniatura
                                  no añade nada que no esté escrito al lado
                                  —el nombre del archivo está en la cabecera
                                  del panel y la versión, en la fila—, y una
                                  alternativa que repite eso solo lo hace
                                  leer dos veces. Además, así una miniatura
                                  que no cargue deja un hueco y no un párrafo
                                  desbordado.
                                */
                                alt=""
                                className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-border bg-soft-surface object-cover"
                              />
                            ) : (
                              <span
                                aria-hidden="true"
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-border bg-surface text-text-secondary"
                              >
                                <Icon name="document" className="h-5 w-5" />
                              </span>
                            )}

                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-primary-dark">
                                {version.variant === null
                                  ? t.fileVersion(version.versionNumber)
                                  : (t.fileVariants[version.variant as FileVariantKey] ??
                                    version.variant)}
                              </span>
                              <span className="block text-xs text-text-secondary">
                                {dia(version.createdAt)} · {t.fileSize(megabytes(version.sizeBytes))}
                              </span>
                              {/* RN-ARC-08: enlace privado y temporal, firmado tras
                                  comprobar el permiso. Cada versión descarga LA SUYA. */}
                              <a
                                href={`/api/archivos/${files.selected!.file.id}?version=${version.versionNumber}`}
                                className="text-cuotly-green underline"
                              >
                                {es.files.download}
                              </a>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Card>
              </div>

              {/*
                El backup va a lo ancho y debajo, como en la maqueta. Lo que
                la maqueta enseña dentro —"Último respaldo: 7 sep 2026"— es
                un dato de ejemplo: Cuotly no copia la web de nadie todavía,
                así que aquí va el motivo (CLAUDE.md MUST NOT).
              */}
              <Card>
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-soft-surface text-text-secondary"
                  >
                    <Icon name="database" className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-primary-dark">{t.backupTitle}</h3>
                    <p className="mt-1 text-sm font-medium text-text">{t.backupEmptyTitle}</p>
                    <p className="mt-1 text-sm text-text-secondary">{t.backupEmptyReason}</p>
                    {/*
                      §5.5 de la especificación maestra, y es la frase más
                      importante de la tarjeta: "si LandingSite u otra
                      plataforma no permite exportar una web completa,
                      Cuotly no afirmará que existe una copia completa
                      restaurable". La maqueta también la escribe. Se dice
                      aquí y no el día que haya integración, porque es
                      justo antes de conectarla cuando alguien se hace la
                      idea equivocada de lo que va a tener.
                    */}
                    <p className="mt-2 rounded-[10px] bg-soft-surface p-3 text-sm text-text-secondary">
                      {t.backupLimitation}
                    </p>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {block.key === "integrations" ? (
            <Card
              title={t.integrationsTitle}
              action={<StatusBadge tone="danger" icon="alert">{es.analyticsSync.noSyncBadge}</StatusBadge>}
            >
              <EmptyState
                title={t.integrationsEmptyTitle}
                description={t.integrationsEmptyReason}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {tab.key === "history" ? (
        <Card title={t.historyTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.historyHint}</p>
          {history.length === 0 ? (
            <EmptyState title={t.historyEmptyTitle} description={t.historyEmptyReason} />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {history.map((entry) => (
                  <li key={entry.id} className="py-2 text-sm">
                    <span className="text-text-secondary">{diaCorto(entry.occurredAt)} · </span>
                    {entry.deepLink === null ? (
                      <span className="text-text">{entry.jobCode ?? entry.entityType}</span>
                    ) : (
                      <Link href={entry.deepLink} className="text-cuotly-green underline">
                        {entry.jobCode ?? entry.entityType}
                      </Link>
                    )}
                    <span className="text-text">
                      {" · "}
                      {entry.entityType === "job"
                        ? (es.naming.states.job[entry.toState as JobStateKey] ?? entry.toState)
                        : (es.naming.states.task[entry.toState as TaskStateKey] ??
                          entry.toState)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                <Link href={`/espacios/${slug}/ajustes`} className="text-cuotly-green underline">
                  {t.auditLink}
                </Link>
              </p>
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
