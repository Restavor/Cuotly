import Link from "next/link";

import {
  Card,
  EmptyState,
  ProgressBar,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { AttentionList } from "@/components/home/AttentionList";
import { ReportsTable } from "@/components/report/ReportsTable";
import type { ReportRow } from "@/components/report/reports-load";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { SheetHeaderCard, SheetOperationNav } from "./SheetHeader";
import { Avatar, PersonCell } from "@/components/ui/Avatar";
import { EstablishmentDataForm } from "./DataForm";
import { DataSectionNav, DigitalSection } from "./DigitalSections";
import { IntegrationsBlock } from "./IntegrationsBlock";
import { isIntegrationProvider } from "@/core/integrations";
import type { DigitalDataView, IntegrationsView } from "./integrations-load";
import {
  OpportunitiesSection,
  OpportunityHighlights,
  type OpportunityViewer,
} from "./Opportunities";
import type { OpportunitiesView } from "./opportunities-load";
import { ShareFileButton } from "./ShareFileButton";
import { UploadFileForm } from "./UploadFileForm";
import { AUDIT_FAMILIES, auditEntityLink, auditFamily } from "@/core/audit";
import { MAX_FILE_SIZE_BYTES, fileTypeLabel } from "@/core/files";
import { isQuoteState, quoteTone } from "@/core/quotes";
import { isMenuState, menuTone } from "@/core/menu-states";
import {
  IDENTITY_FIELDS,
  MULTILINE_IDENTITY_FIELDS,
  accessScope,
  currentJobDeadline,
  sortedCycleUsage,
  type CycleUsage,
} from "@/core/establishments";
import { CounterBox } from "@/components/request/Detail";
import { RegisterPaymentForm } from "@/components/RegisterPaymentForm";
import { GrantAccessForm } from "./GrantAccessForm";
import { BackupsBlock, type BackupRow } from "./BackupsBlock";
import { CreatePanelForm } from "./CreatePanelForm";
import { SubtasksAndEvidence } from "@/components/request/SubtasksAndEvidence";
import { ManagerForm } from "./ManagerForm";
import { PhotoForm } from "./PhotoForm";
import { NotesPanel } from "@/components/notes/NotesPanel";
import type { EstablishmentNotes } from "@/app/espacios/[slug]/mensajes/[id]/notes-load";
import { ServiceStatusForms } from "./ServiceStatusForms";
import { TransferBlock, type PendingTransfer } from "./TransferForms";
import { StatusLegend } from "./StatusLegend";
import { StatusNotice } from "./StatusNotice";
import { InvitationRow } from "@/app/espacios/[slug]/restaurantes/[id]/usuarios/InvitationRow";
import type { PanelInvitations } from "@/app/espacios/[slug]/restaurantes/[id]/usuarios/users-load";
import { RevokeAccessButton } from "./RevokeAccessButton";
import { fechaCorta } from "@/i18n/dates";
import { enZona, instanteRelativo } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { readableSize } from "@/i18n/money";
import { tiempoRestante } from "@/i18n/duration";

import {
  MANAGEMENT_BLOCKS,
  HISTORY_TAB,
  MANAGEMENT_TAB,
  OPERATION_TAB,
  PAYMENTS_BLOCK,
  filesHref,
  managementBlockLabel,
  sheetHref,
  type ManagementBlock,
  type SheetTab,
  DATA_SECTION_TABS,
  dataSectionHref,
  OPPORTUNITIES_SECTION,
  type DataSectionTab,
  OPERATION_SECTION_TABS,
  openRequestHref,
  type OperationSectionTab,
  PAYMENTS_SECTIONS,
  paymentsSectionHref,
  type PaymentsSection,
} from "./tabs";
import type {
  SheetCounts,
  SheetCurrentJob,
  SheetFiles,
  SheetHeader,
  SheetIdentity,
  SheetOperation,
  SheetPayments,
  SheetFileFolder,
  SheetAudit,
  SheetAuditRow,
  SheetManager,
  SheetNextMenu,
  SheetStaffMember,
  SheetSummary,
  SheetUsers,
} from "@/app/espacios/[slug]/restaurantes/[id]/sheet-load";
import type { SubscriptionTerms } from "@/app/espacios/[slug]/planes/terms-load";
import type { RequestDetail } from "@/app/espacios/[slug]/solicitudes/[id]/detail-load";

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
  /**
   * Página 24 · "Actividad reciente" del Resumen: las últimas filas de la
   * auditoría, **sin los filtros** de la pestaña Historial. Llegan aparte
   * y no se recortan de `audit` a propósito: esos filtros viven en la
   * dirección y siguen puestos al volver al Resumen, así que este bloque
   * enseñaría lo último de lo filtrado sin decirlo.
   */
  readonly recentActivity: readonly SheetAuditRow[];
  /** Página 24 · "Próxima publicación de menú" (§57, Menú Diario). */
  readonly nextMenu: SheetNextMenu;
  /**
   * Página 25 · la solicitud **abierta dentro de la ficha**, debajo de la
   * lista. `null` cuando no hay ninguna abierta, o cuando la que pide la
   * dirección no es de este restaurante.
   */
  readonly requestDetail: RequestDetail | null;
  /** RN-EST-19 · quién lleva el restaurante y a quién se le puede asignar. */
  readonly manager: SheetManager;
  /**
   * RN-EST-18 · el enlace firmado y temporal de la foto del local, o
   * `null` si no tiene ninguna — que es un estado normal (decisión 62).
   */
  readonly photoUrl: string | null;
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
   * M43 · las invitaciones vivas del panel de este restaurante (RN-PAN-14).
   * `failed` cuando no se pudieron leer: "no se pudo mirar" no es "no hay
   * ninguna" (CA-20).
   */
  readonly invitations: PanelInvitations;
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
  /** Maqueta 19 · la auditoría de este restaurante, ya filtrada y paginada. */
  readonly audit: SheetAudit;
  /**
   * RN-EST-08 · el motivo concreto del último cambio de estado, que se
   * enseña junto al estado. `null` cuando nadie escribió ninguno: entonces
   * se dice lo que el estado significa y no se inventa un porqué.
   */
  readonly statusReason: string | null;
  // §38 · la propuesta de transferencia abierta (RN-TRA) y las copias de
  // seguridad (RN-BCK). Las dos viven en el bloque "Estado del servicio".
  readonly transfer: PendingTransfer | null;
  readonly backups: readonly BackupRow[];
  /** RN-EST-14 · las notas internas, ahora un bloque de Gestión. */
  readonly notes: EstablishmentNotes;
  /**
   * RN-ARC-10 · lo que ocupan los archivos de este restaurante, o `null`
   * cuando quien mira no puede ver todos. `null` NO es cero: la pantalla
   * dice el motivo, porque un total parcial llamado "lo que ocupa el
   * restaurante" sería más pequeño de lo que ocupa de verdad.
   */
  readonly storageBytes: number | null;
  readonly canProposeTransfer: boolean;
  /**
   * Maqueta 17 · las integraciones del restaurante (Fase 3, Hito 14).
   * `null` cuando no se pudieron leer: entonces se dice, no se pinta un
   * bloque vacío que parezca "ninguna conectada".
   */
  readonly integrations: IntegrationsView | null;
  /** §178 · los datos de las fuentes para "Informes y datos" (maquetas 09 a 12). */
  readonly digital: DigitalDataView | null;
  /**
   * §96 a §101 · las oportunidades de este restaurante (Hito 15). `null`
   * cuando no se pudieron leer: se dice, no se enseña una lista vacía que
   * parezca "ninguna detectada".
   */
  readonly opportunities: OpportunitiesView | null;
  /** Quién mira, para saber qué se le ofrece: aprobar es de §97. */
  readonly opportunityViewer: OpportunityViewer;
  /**
   * Maqueta 09 · los informes de este restaurante (§89, Hito 16). Lista
   * vacía cuando no se está mirando el Resumen: no se leen si no se ven.
   */
  readonly reports: readonly ReportRow[];
  /**
   * La zona horaria del espacio (CLAUDE.md: las fechas se calculan en
   * ella). No es decorativa ni tiene valor por defecto: sin ella, `Intl`
   * usaría la del servidor —UTC en Vercel— y un cobro registrado a las
   * once de la noche aparecería con la fecha del día anterior.
   */
  readonly timeZone: string;
}

type StatusKey = keyof typeof es.space.statuses;
type RequestStateKey = keyof typeof es.naming.states.request;
type JobStateKey = keyof typeof es.naming.states.job;
type PaymentMethodKey = keyof typeof es.teamArea.methods;
type SpecialtyKey = keyof typeof es.naming.specialties;
type TaskStateKey = keyof typeof es.naming.states.task;
type CategoryKey = keyof typeof es.naming.categories;
type MenuKindKey = keyof typeof es.naming.menuKinds;
type MenuStateKey = keyof typeof es.naming.states.menu;
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
const INTEGRATIONS_BLOCK = MANAGEMENT_BLOCKS.find((block) => block.key === "integrations")!;

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * Maqueta 13 · la frase del estado de las condiciones. `null` no es "sin
 * condiciones": es que la función no contestó, y se dice así.
 */
function termsLine(terms: SubscriptionTerms | null, timeZone: string): string {
  const t = es.establishmentSheet;
  if (terms === null) return t.termsUnknown;
  if (terms.current === null) return t.termsNoTerms;
  if (terms.accepted === null) return t.termsPending(terms.current.version);
  if (terms.status === "accepted") {
    return t.termsAccepted(terms.accepted.version, dia(terms.accepted.acceptedAt, timeZone));
  }
  return t.termsOutdated(terms.accepted.version, terms.current.version);
}

function dia(value: string, timeZone: string): string {
  return enZona(value, timeZone, { dateStyle: "medium" });
}

/**
 * "Hoy, 10:24" para lo de hoy y la fecha corta con su hora para lo demás,
 * como en la maqueta 03. Una solicitud que llegó hace veinte minutos y
 * otra de la semana pasada se distinguen de un vistazo, que es para lo que
 * sirve la columna.
 */
function momento(value: string, timeZone: string): string {
  // Qué día es "hoy" también depende de la zona: la comparación se hacía
  // con `getFullYear()` de la fecha del servidor, así que a partir de las
  // 22:00 de Madrid lo de esta noche dejaba de ser "hoy".
  return instanteRelativo(value, timeZone, new Date(), es.establishmentSheet.today);
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

function diaCorto(value: string, timeZone: string): string {
  return enZona(value, timeZone, { dateStyle: "short" });
}

/**
 * El tamaño en megabytes, con la coma decimal del español. `toFixed()`
 * escribe siempre un punto, así que "2.4 MB" se colaba en una pantalla que
 * en la línea de al lado escribe "599,00 €".
 */
/** "15 sept 2026, 10:24", la columna "Fecha y hora" de la maqueta 19. */
function fechaYHoraLarga(value: string, timeZone: string): string {
  return enZona(value, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function megabytes(sizeBytes: number): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(sizeBytes / 1_048_576);
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
 * Lo que la tarjeta no está enseñando. Sin esta línea, cuatro de doce
 * parecen doce de doce: enseñar cuatro y callar ocho es esconderlas
 * (CA-20). El enlace "Ver todas" de la cabecera es a donde están.
 */
function CardMore({ hidden }: { hidden: number }) {
  if (hidden === 0) return null;
  return <p className="pt-3 text-sm text-text-secondary">{t.cardMore(hidden)}</p>;
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
  /*
    M44 · las carpetas como fichas en fila, con su recuento dentro: la
    elegida en verde lleno y las demás con borde.
  */
  const clase = (activo: boolean) =>
    `inline-flex items-center gap-2 rounded-field border px-3.5 py-2 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
      activo
        ? "border-primary bg-primary font-semibold text-surface"
        : "border-border bg-surface text-text hover:bg-soft-surface"
    }`;

  return (
    <nav aria-label={t.foldersTitle}>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={filesHref(base, { category: null, fileId: selectedFileId })}
            aria-current={current === null ? "true" : undefined}
            className={clase(current === null)}
          >
            <span>{t.foldersAll}</span>
            <span className="shrink-0 text-xs opacity-80">{total}</span>
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
              <span className="shrink-0 text-xs opacity-80">{folder.count}</span>
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


/**
 * Los cinco bloques de Gestión, como control segmentado: una pista clara
 * con el bloque elegido en blanco encima (maqueta §15.2).
 *
 * Siguen siendo enlaces, no botones: el bloque vive en la dirección
 * (`?vista=gestion&bloque=archivos`) y esta barra solo lo enseña. Que
 * parezca un interruptor no lo convierte en uno — sin JavaScript navega
 * igual (CA-22).
 */
/**
 * Página 25 · las cuatro secciones de Operación, como control segmentado,
 * con la misma forma que la subnavegación de "Informes y datos": una
 * pista de pestañas subrayadas.
 *
 * Son **enlaces**, no botones. La sección vive en la dirección, así que
 * sin JavaScript navega igual y el botón de volver deshace el cambio de
 * sección (el mismo criterio que `BlockNav`, CA-22).
 */

/**
 * M42 · las tres pestañas de Pagos, como casillas unidas: la elegida en
 * blanco con la raya verde. Son enlaces (`?pagos=`), no botones (CA-22).
 */
function PaymentsSectionNav({ base, active }: { base: string; active: PaymentsSection }) {
  return (
    <nav aria-label={t.paymentsSectionsLabel}>
      <ul className="inline-flex overflow-hidden rounded-[12px] border border-border bg-soft-surface/60">
        {PAYMENTS_SECTIONS.map((section) => {
          const activa = section.key === active.key;
          return (
            <li key={section.key} className="border-r border-border last:border-r-0">
              <Link
                href={paymentsSectionHref(base, section)}
                aria-current={activa ? "page" : undefined}
                className={`-mb-px block border-b-2 px-6 py-2.5 text-sm transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
                  activa
                    ? "border-b-cuotly-green bg-surface font-semibold text-primary-dark"
                    : "border-b-transparent font-medium text-text-secondary hover:bg-surface/70 hover:text-text"
                }`}
              >
                {t.paymentsSections[section.key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Los bloques de Gestión, como las subpestañas subrayadas del diseño (M40
 * a M46). Siguen siendo enlaces: el bloque vive en la dirección
 * (`?vista=gestion&bloque=archivos`).
 */
function BlockNav({ base, active }: { base: string; active: ManagementBlock }) {
  return (
    <Tabs
      label={t.blocksLabel}
      active={active.key}
      tabs={MANAGEMENT_BLOCKS.map((block) => ({
        key: block.key,
        label: managementBlockLabel(block),
        href: sheetHref(base, MANAGEMENT_TAB, block),
      }))}
    />
  );
}

/**
 * Maqueta 19 · los tres filtros del historial: periodo, tipo de actividad
 * y persona.
 *
 * Un formulario GET, no un componente de cliente: los filtros viven en la
 * dirección, así que "el historial de Magariños en septiembre" se pega en
 * un mensaje, el botón de volver deshace el filtro y la pantalla entera
 * sigue funcionando sin JavaScript (CA-22).
 *
 * El desplegable de personas ofrece SOLO a quien aparece de verdad en este
 * historial: un filtro que devuelve cero resultados se lee como un error
 * de la pantalla, no como un filtro bien aplicado.
 */
function AuditFilters({ base, audit }: { base: string; audit: SheetAudit }) {
  return (
    <form method="get" action={base} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="vista" value={HISTORY_TAB.slug} />

      <div>
        <label htmlFor="auditoria-desde" className="block text-xs text-text-secondary">
          {t.auditFromLabel}
        </label>
        <input
          id="auditoria-desde"
          type="date"
          name="desde"
          defaultValue={audit.filters.from ?? ""}
          className="rounded-field border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        />
      </div>

      <div>
        <label htmlFor="auditoria-hasta" className="block text-xs text-text-secondary">
          {t.auditToLabel}
        </label>
        <input
          id="auditoria-hasta"
          type="date"
          name="hasta"
          defaultValue={audit.filters.to ?? ""}
          className="rounded-field border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        />
      </div>

      <div>
        <label htmlFor="auditoria-familia" className="block text-xs text-text-secondary">
          {t.auditFamilyLabel}
        </label>
        <select
          id="auditoria-familia"
          name="familia"
          defaultValue={audit.filters.family ?? ""}
          className="rounded-field border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <option value="">{t.auditAllOption}</option>
          {AUDIT_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {(es.settings.auditFamilies as Readonly<Record<string, string>>)[family] ?? family}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="auditoria-persona" className="block text-xs text-text-secondary">
          {t.auditActorLabel}
        </label>
        <select
          id="auditoria-persona"
          name="persona"
          defaultValue={audit.filters.actorId ?? ""}
          className="rounded-field border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <option value="">{t.auditAllOption}</option>
          {audit.actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded-field border border-border px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
      >
        {t.auditFilterSubmit}
      </button>
    </form>
  );
}

/**
 * §20.7 · la auditoría crece para siempre, así que se pagina. No hay
 * "página 7 de 43": contar el total exigiría recorrer la tabla entera cada
 * vez. Se pide una fila de más y con eso se sabe si hay siguiente.
 */
/**
 * La dirección del historial con sus filtros puestos: la de otra página, o
 * la de la misma página con un evento abierto al lado (M48). Los filtros
 * viajan siempre, para que abrir un evento no deshaga lo que se filtró.
 */
function historyHref(
  base: string,
  audit: SheetAudit,
  { page = audit.filters.page, event = null }: { page?: number; event?: string | null } = {},
): string {
  const params = new URLSearchParams({ vista: HISTORY_TAB.slug });
  if (audit.filters.from !== null) params.set("desde", audit.filters.from);
  if (audit.filters.to !== null) params.set("hasta", audit.filters.to);
  if (audit.filters.family !== null) params.set("familia", audit.filters.family);
  if (audit.filters.actorId !== null) params.set("persona", audit.filters.actorId);
  if (page > 1) params.set("pagina", String(page));
  if (event !== null) params.set("evento", event);
  return `${base}?${params.toString()}`;
}

function AuditPager({ base, audit }: { base: string; audit: SheetAudit }) {
  const href = (pagina: number) => historyHref(base, audit, { page: pagina });

  const pagina = audit.filters.page;
  if (pagina === 1 && !audit.hasMore) return null;

  return (
    <nav aria-label={t.auditPagerLabel} className="mt-3 flex items-center gap-3 text-sm">
      {pagina > 1 ? (
        <Link href={href(pagina - 1)} className="text-cuotly-green underline">
          {t.auditPrevious}
        </Link>
      ) : null}
      <span className="text-text-secondary">{t.auditPage(pagina)}</span>
      {audit.hasMore ? (
        <Link href={href(pagina + 1)} className="text-cuotly-green underline">
          {t.auditNext}
        </Link>
      ) : null}
    </nav>
  );
}

function auditActionLabel(action: string): string {
  return (es.settings.auditActions as Readonly<Record<string, string>>)[action] ?? action;
}

/**
 * Quién hizo un apunte. Sin actor no es un hueco: es el servidor —los
 * barridos y las emisiones automáticas escriben su apunte sin nadie
 * detrás—, y decirlo es más honesto que un guion (CA-20).
 *
 * Y "no hay actor" no es lo mismo que "hay actor y no sé su nombre": lo
 * segundo pasa cuando quien mira no puede resolver ese perfil, y llamarlo
 * "Sistema" sería mentir en la pantalla que existe justo para saber quién
 * hizo qué.
 */
function AuditActor({ row }: { row: SheetAuditRow }) {
  if (row.actorId === null) {
    return <span className="text-text-secondary">{t.auditSystemActor}</span>;
  }
  if (row.actorName === null) return <>{t.auditUnknownActor}</>;
  return <PersonCell name={row.actorName} />;
}

/**
 * M48 · "Detalle del evento": qué pasó, cuándo y quién; de qué tipo es, en
 * qué restaurante y qué pantalla abre; el motivo si se escribió; y lo que
 * cambió en dos columnas, antes y después.
 *
 * Todo sale de la MISMA fila de `establishment_audit()` que pinta la lista:
 * no se vuelve a pedir a la base, así que el detalle no puede enseñar un
 * apunte que la lista —y la política de `audit_log`— no deja ver. Si el
 * evento pedido no está entre las filas de esta página (un enlace viejo,
 * o filtros que lo dejan fuera), se dice, no se busca por otro camino.
 *
 * Lo que el dibujo pone y no está: la "Evidencia de publicación" con su
 * captura. La evidencia vive en el trabajo, y el enlace lleva a él.
 */
function AuditEventDetail({
  row,
  closeHref,
  slug,
  establishmentName,
  timeZone,
}: {
  row: SheetAuditRow | null;
  closeHref: string;
  slug: string;
  establishmentName: string;
  timeZone: string;
}) {
  const enlace = row === null ? null : auditEntityLink(slug, row.entityType, row.entityId);
  const familia = row === null ? null : auditFamily(row.action);

  return (
    <Card
      className="min-w-0"
      title={t.eventDetailTitle}
      action={
        <Link
          href={closeHref}
          aria-label={t.eventDetailClose}
          className="shrink-0 rounded p-1 text-text-secondary transition-colors hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <Icon name="close" className="h-4 w-4" />
        </Link>
      }
    >
      {row === null ? (
        <EmptyState title={t.eventNotFoundTitle} description={t.eventNotFoundReason} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green"
              >
                <Icon name="check" className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-primary-dark">
                  {auditActionLabel(row.action)}
                </p>
                <p className="text-sm text-text-secondary">
                  {fechaYHoraLarga(row.createdAt, timeZone)}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <AuditActor row={row} />
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">{t.eventTypeLabel}</dt>
              <dd className="font-medium text-text">
                {(es.settings.auditFamilies as Readonly<Record<string, string>>)[familia!] ??
                  familia}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">{t.eventContextLabel}</dt>
              <dd className="font-medium text-text">{establishmentName}</dd>
            </div>
            {enlace === null ? null : (
              <div className="sm:col-span-2">
                <dt className="text-text-secondary">{t.eventLinkedLabel}</dt>
                <dd>
                  <Link href={enlace.href} className="font-medium text-cuotly-green underline">
                    {t.eventLinks[enlace.kind]}
                  </Link>
                </dd>
              </div>
            )}
            {row.reason === null ? null : (
              <div className="sm:col-span-2">
                <dt className="text-text-secondary">{t.eventReasonLabel}</dt>
                <dd className="whitespace-pre-line text-text">{row.reason}</dd>
              </div>
            )}
          </dl>

          <div>
            <h4 className="mb-2 text-base font-semibold text-primary-dark">
              {t.eventChangesTitle}
            </h4>
            {row.changes.length === 0 ? (
              /* P6 · esa acción no guarda valores: se dice, no se pinta una
                 tabla vacía que parecería "no cambió nada". */
              <p className="text-sm text-text-secondary">{t.eventNoChanges}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[12px] border border-border p-3">
                  <p className="mb-2 text-sm font-semibold text-danger">{t.eventBefore}</p>
                  <dl className="space-y-1.5 text-sm">
                    {row.changes.map((change) => (
                      <div key={change.field}>
                        <dt className="text-xs text-text-secondary">{change.field}</dt>
                        <dd className="break-words text-text">{change.before ?? t.auditNoValue}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-[12px] border border-border p-3">
                  <p className="mb-2 text-sm font-semibold text-cuotly-green">{t.eventAfter}</p>
                  <dl className="space-y-1.5 text-sm">
                    {row.changes.map((change) => (
                      <div key={change.field}>
                        <dt className="text-xs text-text-secondary">{change.field}</dt>
                        <dd className="break-words text-text">{change.after ?? t.auditNoValue}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function EstablishmentSheet({
  base,
  slug,
  tab,
  block,
  section = DATA_SECTION_TABS[0],
  operationSection = OPERATION_SECTION_TABS[0],
  paymentsSection = PAYMENTS_SECTIONS[0],
  integrationSource = null,
  auditEventId = null,
  data,
}: {
  base: string;
  slug: string;
  tab: SheetTab;
  block: ManagementBlock;
  /** La sección de "Informes y datos" (`?seccion=`); sin ella, el Resumen. */
  section?: DataSectionTab;
  /** Página 25 · cuál de las cuatro secciones de Operación se enseña. */
  operationSection?: OperationSectionTab;
  /** M42 · la pestaña de Pagos (`?pagos=`); sin ella, Cobros. */
  paymentsSection?: PaymentsSection;
  /** M45 · la fuente del panel "Configurar …" (`?fuente=`), si la hay. */
  integrationSource?: string | null;
  /** M48 · el evento del historial abierto al lado (`?evento=`), si lo hay. */
  auditEventId?: string | null;
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
    audit,
    recentActivity,
    nextMenu,
    requestDetail,
    manager,
    photoUrl,
    statusReason,
    transfer,
    backups,
    notes,
    storageBytes,
    canProposeTransfer,
    integrations,
    digital,
    opportunities,
    opportunityViewer,
    reports,
    invitations,
    timeZone,
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
    <div className="space-y-6">
      {/*
        La cabecera de la ficha con sus cinco pestañas, igual en las 31
        vistas del diseño de escritorio (M25 a M48). Vive en su propio
        componente porque las pantallas de detalle —solicitud, trabajo,
        tarea, menú e informe— la llevan también encima.
      */}
      <SheetHeaderCard
        base={base}
        tab={tab}
        header={header}
        bags={summary.bags}
        photoUrl={photoUrl}
        canEditData={canEditData}
      />

      {/*
        Maqueta 20 · el aviso de estado va aquí, antes de las pestañas: un
        restaurante pausado lo está se mire la pestaña que se mire, y quien
        entra a Gestión a cambiar un dato necesita saberlo antes de
        escribirlo, no después de que el servidor se lo rechace.

        La acción que lleva depende de lo que de verdad haya: solo se
        ofrece registrar un pago cuando hay deuda vencida, y eso lo dice el
        libro (`summary.payment`), no el estado. Un "Registrar pago" en un
        restaurante pausado por otro motivo mandaría a alguien a pagar algo
        que no debe.
      */}
      <StatusNotice
        status={header.status}
        reason={statusReason}
        action={
          summary.payment.allowed && summary.payment.overdueCount > 0 ? (
            <Link
              href={sheetHref(base, MANAGEMENT_TAB, PAYMENTS_BLOCK)}
              className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark"
            >
              {t.registerPaymentLink}
            </Link>
          ) : undefined
        }
      />

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
                  {t.cycleRange(dia(header.cycleStart, timeZone), dia(header.cycleEnd, timeZone))}
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
          {/*
            La rejilla del Resumen en escritorio: las tres tarjetas que se
            miran cada mañana —lo que espera validación, el trabajo que corre y
            el estado de pago— en una fila; debajo lo que pide atención junto a
            la próxima publicación de menú, y la actividad a ancho completo.
            En un teléfono se apilan en ese mismo orden.
          */}
          <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
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
                              {momento(request.createdAt, timeZone)}
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

          <div className="grid items-start gap-4 lg:grid-cols-2">

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
              <AttentionList timeZone={timeZone} items={summary.attention} />
            )}
          </Card>

          {/*
            Página 24 · "Próxima publicación de menú". El bloque estaba
            marcado como "de la Fase 2" desde que se dibujó el Resumen;
            Menú Diario existe desde el Hito 11 y ya se puede contestar.

            Tres respuestas y no una fecha, porque son tres cosas que se
            leen distinto: sin el servicio contratado no hay nada que
            programar, contratado y sin nada por delante significa que
            toca preparar uno, y si lo hay se dice **cuándo, cuál y en qué
            estado**. Una fecha sola no distingue las dos primeras
            (CA-20).

            El diseño escribe solo la fecha y el nombre. El estado se
            añade porque es lo que decide si alguien tiene que hacer algo:
            "7 abr · Menú semanal" se lee igual esté listo para publicar o
            pendiente de asignar, y no son lo mismo.
          */}
          <Card
            title={t.nextMenuTitle}
            action={
              nextMenu.kind === "no_service" ? undefined : (
                <Link
                  href={`${base}/menu-diario`}
                  className="shrink-0 text-sm text-cuotly-green underline"
                >
                  {t.nextMenuLink}
                </Link>
              )
            }
          >
            {nextMenu.kind === "no_service" ? (
              <EmptyState
                title={t.nextMenuNoServiceTitle}
                description={t.nextMenuNoServiceReason}
              />
            ) : nextMenu.kind === "none" ? (
              <EmptyState title={t.nextMenuNoneTitle} description={t.nextMenuNoneReason} />
            ) : (
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-cuotly-green/10 text-cuotly-green"
                >
                  <Icon name="calendar" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-primary-dark">
                    {fechaCorta(nextMenu.targetDate)}
                  </p>
                  <p className="truncate text-sm text-text">
                    {nextMenu.name}
                    {" · "}
                    {es.naming.menuKinds[nextMenu.menuKind as MenuKindKey] ?? nextMenu.menuKind}
                  </p>
                  <p className="mt-1.5">
                    <StatusBadge
                      tone={isMenuState(nextMenu.state) ? menuTone(nextMenu.state) : "neutral"}
                    >
                      {es.naming.states.menu[nextMenu.state as MenuStateKey] ?? nextMenu.state}
                    </StatusBadge>
                  </p>
                </div>
              </div>
            )}
          </Card>
          </div>


          {/*
            Página 24 · "Actividad reciente". Son las últimas filas de la
            **misma auditoría** que enseña la pestaña Historial, no un
            registro paralelo: `establishment_audit()` es SECURITY INVOKER
            y la política de `audit_log` decide qué ve cada quien (§21.2),
            así que aquí no hay ninguna regla de permiso escrita.

            El diseño pone una cara junto a cada línea. No van: a estas
            filas les basta el nombre, y una foto por línea en un teléfono
            se come el ancho que necesita la frase. Lo que sí se respeta
            es la diferencia que costó ver con datos reales: sin actor es
            el sistema, y "hay actor y no sé su nombre" es otra cosa.
          */}
          <Card
            title={t.recentActivityTitle}
            action={
              <Link
                href={sheetHref(base, HISTORY_TAB)}
                className="shrink-0 text-sm text-cuotly-green underline"
              >
                {t.recentActivityLink}
              </Link>
            }
          >
            {recentActivity.length === 0 ? (
              <EmptyState
                title={t.recentActivityEmptyTitle}
                description={t.recentActivityEmptyReason}
              />
            ) : (
              <ul className="divide-y divide-border">
                {recentActivity.slice(0, 5).map((row) => (
                  <li key={row.id} className="py-2.5">
                    <p className="text-sm text-text">
                      {(es.settings.auditActions as Readonly<Record<string, string>>)[row.action] ??
                        row.action}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {row.actorId === null
                        ? t.auditSystemActor
                        : (row.actorName ?? t.auditUnknownActor)}
                      {" · "}
                      {momento(row.createdAt, timeZone)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/*
            Maqueta 20 · la leyenda de estados. "Pausado" y "Solo lectura"
            se parecen y no son lo mismo, y quien recibe uno de los dos
            necesita saber cuál le ha tocado sin preguntar. Lo que dice
            cada tarjeta sale de las reglas y de la guarda del servidor,
            no del dibujo (`statusEffects`, con sus tests).
          */}
          <Card title={t.statusLegendTitle}>
            <p className="mb-3 text-sm text-text-secondary">
              {es.establishmentStatus.legendHint}
            </p>
            <StatusLegend current={header.status} />
          </Card>
        </>
      ) : null}

      {/*
        Página 25 del diseño · la Operación es un **control segmentado** con
        cuatro secciones —Solicitudes, Trabajos, Tareas y Menú Diario— y se
        enseña una cada vez.

        Eran cuatro tarjetas a la vez en una rejilla de dos columnas. En un
        teléfono salían apiladas: cuatro listas cortas seguidas, y para
        llegar a las tareas había que pasar por delante de todo lo demás.

        La sección vive en la dirección (`?vista=operacion&seccion=tareas`),
        como las de "Informes y datos": son enlaces, no botones, así que un
        enlace a "los trabajos de Magariños" se pega en un mensaje y el
        botón de volver lo deshace. Sin JavaScript navega igual.
      */}
      {tab.key === "operation" ? (
        <SheetOperationNav base={base} active={operationSection} />
      ) : null}

      {tab.key === "operation" && operationSection.key === "requests" ? (
        <section>
          <Card
            title={t.requestsTitle}
            action={
              <Link
                href={`/espacios/${slug}/solicitudes?restaurante=${header.id}`}
                className="shrink-0 text-sm font-medium text-cuotly-green hover:underline"
              >
                {t.requestsLink}
              </Link>
            }
          >
            <p className="-mt-3 mb-4 text-sm text-text-secondary">
              {t.requestsSubtitle(header.name)}
            </p>
            {operation.requests.shown.length === 0 ? (
              <EmptyState title={t.requestsEmptyTitle} description={t.requestsEmptyReason} />
            ) : (
              <>
                {/*
                  M25 · la tabla del diseño: recibida, solicitud, categoría,
                  estado y trabajo. La categoría es la validada, o la que
                  propuso el clasificador dicho que es una propuesta
                  (RN-CLS-04): enseñarla sin avisar la haría pasar por
                  decidida. La "Fecha límite" del dibujo no va: una
                  solicitud no tiene plazo propio, el plazo es del trabajo
                  (RN-SLA), y está en su tabla. La fila **abre la solicitud
                  aquí debajo**, sin perder la lista: un solo control por
                  fila (§20.1).
                */}
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.columnReceived}</TableHeaderCell>
                      <TableHeaderCell>{t.columnRequest}</TableHeaderCell>
                      <TableHeaderCell>{t.columnCategory}</TableHeaderCell>
                      <TableHeaderCell>{t.columnState}</TableHeaderCell>
                      <TableHeaderCell>{t.columnJob}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {operation.requests.shown.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <span className="whitespace-nowrap text-text-secondary">
                            {diaCorto(request.createdAt, timeZone)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={openRequestHref(base, request.id)}
                            className="block max-w-md truncate font-semibold text-text hover:text-cuotly-green"
                          >
                            {request.description}
                          </Link>
                          {/*
                            El código y quién la pidió. Sin nombre que
                            resolver queda el código: un uuid no le dice a
                            nadie quién escribió (CA-20).
                          */}
                          <span className="block truncate text-xs text-text-secondary">
                            {request.authorName === null
                              ? `${request.code} · ${momento(request.createdAt, timeZone)}`
                              : `${request.code} · ${request.authorName} · ${momento(request.createdAt, timeZone)}`}
                          </span>
                        </TableCell>
                        <TableCell>
                          {request.category === null ? (
                            <span className="text-text-secondary">{t.categoryNone}</span>
                          ) : (
                            <span className="whitespace-nowrap">
                              <StatusBadge tone="neutral">
                                {es.naming.categories[request.category.key as CategoryKey] ??
                                  request.category.key}
                              </StatusBadge>
                              {request.category.proposed ? (
                                <span className="block text-xs text-text-secondary">
                                  {t.categoryProposed}
                                </span>
                              ) : null}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={requestTone(request.state)}>
                            {es.naming.states.request[request.state as RequestStateKey] ??
                              request.state}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          {request.job === null ? (
                            <span className="whitespace-nowrap text-text-secondary">
                              {t.requestNoJob}
                            </span>
                          ) : (
                            <Link
                              href={`/espacios/${slug}/trabajos/${request.job.id}`}
                              className="whitespace-nowrap font-medium text-cuotly-green hover:underline"
                            >
                              {request.job.code}
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <CardMore hidden={operation.requests.hidden} />
              </>
            )}
          </Card>
        </section>
      ) : null}

      {/*
        Página 25 · la solicitud abierta, debajo de la lista.

        **Lo que el diseño dibuja aquí y NO está**: las subtareas con sus
        marcas y las evidencias con sus fotos. No es una omisión de
        pantalla, es de modelo: las dos cuelgan del **trabajo**, que nace
        cuando alguien acepta la solicitud (RN-JOB). Pintarlas bajo una
        solicitud sin aceptar sería enseñar algo que todavía no existe, y
        bajo una aceptada sería una segunda copia de lo que ya se opera en
        el trabajo. Va el enlace al trabajo, y cuando no lo hay se dice
        cuándo nacerá.

        Tampoco va "Asignado a" con su cara: quién lleva el trabajo se ve
        en el trabajo, junto a lo demás.
      */}
      {tab.key === "operation" && operationSection.key === "requests" && requestDetail !== null ? (
        <Card
          title={requestDetail.request.code}
          action={
            <span className="flex shrink-0 items-center gap-3">
              <Link
                href={`/espacios/${slug}/solicitudes/${requestDetail.request.id}`}
                className="text-sm text-cuotly-green underline"
              >
                {t.openRequestOpenFull}
              </Link>
              <Link
                href={openRequestHref(base, null)}
                className="text-sm text-text-secondary underline"
              >
                {t.openRequestClose}
              </Link>
            </span>
          }
        >
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-text-secondary">{t.openRequestCategory}</dt>
              <dd className="font-medium text-text">
                {/*
                  La categoría validada manda; si todavía no la hay, se
                  enseña la que propuso el clasificador **dicho que es una
                  propuesta** (RN-CLS-04). Enseñarla sin avisar la haría
                  pasar por decidida.
                */}
                {requestDetail.request.validated_category !== null
                  ? (es.naming.categories[
                      requestDetail.request.validated_category as CategoryKey
                    ] ?? requestDetail.request.validated_category)
                  : requestDetail.proposal !== null
                    ? `${
                        es.naming.categories[requestDetail.proposal.category as CategoryKey] ??
                        requestDetail.proposal.category
                      } · ${t.openRequestCategoryProposed}`
                    : t.identityFieldEmpty}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">{t.openRequestCreatedAt}</dt>
              <dd className="font-medium text-text">
                {fechaYHoraLarga(requestDetail.request.created_at, timeZone)}
              </dd>
            </div>
          </dl>

          {/*
            El reloj de primera atención, con el MISMO componente que la
            pantalla de la solicitud. Se recalcula desde sus eventos
            (CA-10) y, parado, dice por qué lo está, que es un dato
            distinto de "quedan 0".
          */}
          <CounterBox counter={requestDetail.counter} state={requestDetail.request.state} />

          <div className="mt-4">
            <p className="text-sm text-text-secondary">{t.openRequestDescription}</p>
            <p className="whitespace-pre-line text-sm text-text">
              {requestDetail.request.description}
            </p>
          </div>

          {requestDetail.request.context === null ? null : (
            <div className="mt-3">
              <p className="text-sm text-text-secondary">{t.openRequestContext}</p>
              <p className="whitespace-pre-line text-sm text-text">
                {requestDetail.request.context}
              </p>
            </div>
          )}

          <p className="mt-4 text-sm text-text-secondary">
            {/*
              "No se pudo leer" y "no lleva ninguno" son cosas distintas, y
              el cargador ya las separa (CA-20).
            */}
            {requestDetail.attachmentsFailed
              ? t.openRequestAttachmentsFailed
              : requestDetail.attachments.length === 0
                ? t.openRequestNoAttachments
                : t.openRequestAttachments(requestDetail.attachments.length)}
          </p>

          <p className="mt-3 text-sm">
            <span className="text-text-secondary">{t.openRequestJob}: </span>
            {requestDetail.job === null ? (
              <span className="text-text-secondary">{t.openRequestNoJob}</span>
            ) : (
              <>
                <Link
                  href={`/espacios/${slug}/trabajos/${requestDetail.job.id}`}
                  className="text-cuotly-green underline"
                >
                  {requestDetail.job.code}
                </Link>
              </>
            )}
          </p>

          {/*
            RN-REQ-07 · las subtareas y las evidencias del trabajo, en solo
            lectura (decisión 64). Antes aquí solo estaba el enlace al
            trabajo, con la razón escrita de que "cuelgan del trabajo, que
            nace al aceptar". Eso sigue siendo verdad y por eso se enseñan
            **sin un solo control**: se ven aquí, se marcan allí.
          */}
          <SubtasksAndEvidence
            jobId={requestDetail.job?.id ?? null}
            jobHref={
              requestDetail.job === null
                ? null
                : `/espacios/${slug}/trabajos/${requestDetail.job.id}`
            }
            tasks={requestDetail.jobTasks}
            evidence={requestDetail.evidence}
            timeZone={timeZone}
          />
        </Card>
      ) : null}

      {tab.key === "operation" && operationSection.key === "jobs" ? (
        <section>
          <Card
            title={t.jobsTitle}
            action={
              <Link
                href={`/espacios/${slug}/trabajos?restaurante=${header.id}`}
                className="shrink-0 text-sm font-medium text-cuotly-green hover:underline"
              >
                {t.jobsLink}
              </Link>
            }
          >
            <p className="-mt-3 mb-4 text-sm text-text-secondary">{t.jobsSubtitle(header.name)}</p>
            {operation.jobs.shown.length === 0 ? (
              <EmptyState title={t.jobsEmptyTitle} description={t.jobsEmptyReason} />
            ) : (
              <>
                {/*
                  M27 · código, trabajo, asignado a, plazo, estado y
                  evidencias. El plazo es el mismo del Resumen,
                  recalculado desde los eventos (CA-10), y con su nombre:
                  T2 para comenzar y T3 para publicar (RN-SLA-05/11). Es la
                  ficha del equipo: quién lo lleva es organización interna
                  y aquí sí se enseña (P7 es para el cliente).
                */}
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.columnCode}</TableHeaderCell>
                      <TableHeaderCell>{t.columnJob}</TableHeaderCell>
                      <TableHeaderCell>{t.columnJobAssignee}</TableHeaderCell>
                      <TableHeaderCell>{t.columnDeadline}</TableHeaderCell>
                      <TableHeaderCell>{t.columnState}</TableHeaderCell>
                      <TableHeaderCell>{t.columnEvidence}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {operation.jobs.shown.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <span className="whitespace-nowrap font-medium text-text-secondary">
                            {job.code}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={job.deepLink}
                            className="block max-w-md truncate font-semibold text-text hover:text-cuotly-green"
                          >
                            {job.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {job.assigneeId === null ? (
                            <span className="whitespace-nowrap text-text-secondary">
                              {t.jobUnassigned}
                            </span>
                          ) : (
                            <PersonCell name={job.assigneeName ?? t.auditUnknownActor} />
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={jobTone(job)}>{plazoDelTrabajo(job)}</StatusBadge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={job.state === "in_progress" ? "info" : "neutral"}>
                            {es.naming.states.job[job.state as JobStateKey] ?? job.state}
                          </StatusBadge>
                        </TableCell>
                        <TableCell>
                          {job.evidence === null ? (
                            <span className="whitespace-nowrap text-xs text-text-secondary">
                              {t.evidenceUnknown}
                            </span>
                          ) : (
                            <span className="text-text">{job.evidence}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <CardMore hidden={operation.jobs.hidden} />
              </>
            )}
          </Card>
        </section>
      ) : null}

      {tab.key === "operation" && operationSection.key === "tasks" ? (
        <section>
          <Card
            title={t.tasksTitle}
            action={
              <Link
                href={`/espacios/${slug}/tareas?restaurante=${header.id}`}
                className="shrink-0 text-sm font-medium text-cuotly-green hover:underline"
              >
                {t.tasksLink}
              </Link>
            }
          >
            <p className="-mt-3 mb-4 text-sm text-text-secondary">{t.tasksSubtitle(header.name)}</p>
            {operation.tasks.shown.length === 0 ? (
              <EmptyState title={t.tasksEmptyTitle} description={t.tasksEmptyReason} />
            ) : (
              <>
                {/*
                  M29 · tarea, trabajo vinculado, asignada a, fecha,
                  estimado y estado. La "Prioridad" del dibujo no va: las
                  tareas no tienen prioridad propia, tienen peso (§14.4).

                  La fila lleva a LA TAREA, abierta en la pantalla de su
                  trabajo (maqueta 07). Una actividad interna independiente
                  (§3) no cuelga de ningún trabajo y no se pinta como
                  enlace: no hay pantalla donde abrirla.
                */}
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>{t.columnTask}</TableHeaderCell>
                      <TableHeaderCell>{t.columnLinkedJob}</TableHeaderCell>
                      <TableHeaderCell>{t.columnAssignee}</TableHeaderCell>
                      <TableHeaderCell>{t.columnDate}</TableHeaderCell>
                      <TableHeaderCell>{t.columnEstimate}</TableHeaderCell>
                      <TableHeaderCell>{t.columnState}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {operation.tasks.shown.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          {task.deepLink === null ? (
                            <span className="block max-w-xs truncate font-semibold text-text">
                              {task.title}
                            </span>
                          ) : (
                            <Link
                              href={task.deepLink}
                              className="block max-w-xs truncate font-semibold text-text hover:text-cuotly-green"
                            >
                              {task.title}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap font-medium text-cuotly-green">
                            {task.jobCode ?? t.tasksNoJob}
                          </span>
                        </TableCell>
                        <TableCell>
                          {task.assigneeName === null ? (
                            <span className="text-text-secondary">{t.tasksUnassigned}</span>
                          ) : (
                            <PersonCell name={task.assigneeName} />
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap">
                            {task.plannedDate === null ? t.tasksNoDate : fechaCorta(task.plannedDate)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="whitespace-nowrap text-text-secondary">
                            {t.tasksMinutes(task.estimatedMinutes)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={taskTone(task.state)}>
                            {es.naming.states.task[task.state as TaskStateKey] ?? task.state}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <CardMore hidden={operation.tasks.hidden} />
              </>
            )}
          </Card>
        </section>
      ) : null}

      {/*
        M31 · la sección Menú Diario: la cuota del ciclo arriba a la
        derecha, y la tabla de los últimos menús con su fecha, su
        plantilla y su estado. La cuota es la de `menu_update_balance()`,
        la misma que la cabecera de Menú Diario del restaurante: dos
        pantallas no pueden contar distinto las mismas 30 actualizaciones
        (RN-CON-02, CA-10). Sin el servicio contratado no hay cuota que
        enseñar, y se dice.

        Lo que no se copia: "Nuevo menú" (un menú lo prepara el restaurante
        o se crea desde Menú Diario, donde están sus plantillas), la
        columna "Versión" (la versión vive en el detalle, con su historial)
        y los filtros de estado y orden (están en la pantalla entera de
        Menú Diario, a un enlace).
      */}
      {tab.key === "operation" && operationSection.key === "dailyMenu" ? (
        <Card
          title={t.dailyMenuTitle}
          action={
            operation.menus === null || operation.menus === "failed" ? undefined : (
              <Link
                href={`${base}/menu-diario`}
                className="shrink-0 text-sm font-medium text-cuotly-green hover:underline"
              >
                {t.nextMenuLink}
              </Link>
            )
          }
        >
          {operation.menus === "failed" ? (
            <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
          ) : operation.menus === null ? (
            <EmptyState
              title={t.nextMenuNoServiceTitle}
              description={t.nextMenuNoServiceReason}
            />
          ) : (
            <>
              <div className="-mt-3 mb-4 flex flex-wrap items-start justify-between gap-4">
                <p className="text-sm text-text-secondary">{t.dailyMenuSubtitle(header.name)}</p>
                <div className="w-full max-w-xs rounded-[12px] border border-border p-3">
                  <p className="text-xs text-text-secondary">{t.dailyMenuQuotaTitle}</p>
                  <p className="text-xl font-bold text-primary-dark">
                    {t.dailyMenuQuota(operation.menus.consumed, operation.menus.included)}
                  </p>
                  <ProgressBar
                    percent={operation.menus.usedPercent}
                    label={t.dailyMenuQuota(operation.menus.consumed, operation.menus.included)}
                  />
                  <p className="mt-1 text-xs text-text-secondary">
                    {t.dailyMenuQuotaCycle(
                      diaCorto(operation.menus.cycleStart, timeZone),
                      diaCorto(operation.menus.cycleEnd, timeZone),
                    )}
                  </p>
                </div>
              </div>

              {operation.menus.rows.shown.length === 0 ? (
                <EmptyState title={t.dailyMenuEmptyTitle} description={t.dailyMenuEmptyReason} />
              ) : (
                <>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>{t.columnDate}</TableHeaderCell>
                        <TableHeaderCell>{t.columnMenu}</TableHeaderCell>
                        <TableHeaderCell>{t.columnTemplate}</TableHeaderCell>
                        <TableHeaderCell>{t.columnState}</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {operation.menus.rows.shown.map((menu) => (
                        <TableRow key={menu.id}>
                          <TableCell>
                            <span className="whitespace-nowrap">{fechaCorta(menu.targetDate)}</span>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={menu.deepLink}
                              className="block max-w-md truncate font-semibold text-text hover:text-cuotly-green"
                            >
                              {menu.name}
                            </Link>
                            <span className="block text-xs text-text-secondary">
                              {es.naming.menuKinds[menu.kind as MenuKindKey] ?? menu.kind}
                            </span>
                          </TableCell>
                          <TableCell>
                            {menu.templateName === null ? (
                              <span className="text-text-secondary">{t.menuNoTemplate}</span>
                            ) : (
                              menu.templateName
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              tone={isMenuState(menu.state) ? menuTone(menu.state) : "neutral"}
                            >
                              {es.naming.states.menu[menu.state as MenuStateKey] ?? menu.state}
                            </StatusBadge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <CardMore hidden={operation.menus.rows.hidden} />
                </>
              )}
            </>
          )}
        </Card>
      ) : null}

      {tab.key === "data" ? (
        <>
          {/*
            Maquetas 09 a 12 y las seis vistas "sin datos": la pestaña se
            divide en seis secciones que viajan en la dirección
            (`?vista=datos&seccion=analitica`), como las pestañas y los
            bloques. El Resumen lleva los indicadores operativos, el estado
            de las fuentes y el hueco de los informes (Hito 16); las otras
            cuatro, lo que cada fuente trajo o el motivo de §178; la sexta,
            Oportunidades, es el Hito 15 y lo dice.
          */}
          <DataSectionNav active={section} hrefFor={(s) => dataSectionHref(base, s)} />
          {section.key !== "summary" ? (
            <DigitalSection
              section={section.key}
              view={digital}
              manageHref={canManageClients ? sheetHref(base, MANAGEMENT_TAB, INTEGRATIONS_BLOCK) : null}
              opportunities={
                <OpportunitiesSection
                  view={opportunities}
                  viewer={opportunityViewer}
                  establishmentId={header.id}
                  path={base}
                />
              }
            />
          ) : null}
        </>
      ) : null}

      {tab.key === "data" && section.key === "summary" ? (
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

          {/*
            Página 26 · "Oportunidades destacadas", debajo de las fuentes.

            Es un resumen de la sección Oportunidades, no un segundo sitio
            donde decidir: aprobar o descartar se hace allí, con la
            evidencia y el periodo delante, que es lo que no cabe en cuatro
            líneas (§96). Por eso aquí no hay ni un botón.

            La gráfica de "Visitas y conversiones" que el diseño dibuja
            entre medias NO está, y el propio dibujo dice por qué: va
            marcada "Datos de ejemplo". Las cifras de analítica se leen en
            la sección Analítica, que enseña lo que la fuente trajo de
            verdad o el motivo por el que no hay nada (§178, RN-INT-07).
          */}
          <Card
            title={es.opportunities.highlightsTitle}
            action={
              <Link
                href={dataSectionHref(base, OPPORTUNITIES_SECTION)}
                className="shrink-0 text-sm text-cuotly-green underline"
              >
                {es.opportunities.highlightsLink}
              </Link>
            }
          >
            <OpportunityHighlights view={opportunities} />
          </Card>

          {/*
            Vista sin datos 1/6 · "Estado de las fuentes", y el hueco de
            "Todavía no hay datos disponibles" cuando ninguna trae cifra.
          */}
          <DigitalSection
            section="summary"
            view={digital}
            manageHref={canManageClients ? sheetHref(base, MANAGEMENT_TAB, INTEGRATIONS_BLOCK) : null}
          />

          {/*
            Maqueta 09 · "Informes generados" (§89 a §95). Cada uno enlaza
            a "Revisar y programar" (vista 10.04), que es donde se aprueba
            y se programa: aquí no se repiten esos botones, porque la
            decisión se toma con el informe delante.
          */}
          <Card
            title={t.reportsTitle}
            action={
              <Link className="text-sm underline" href={`/espacios/${slug}/informes`}>
                {t.reportsLink}
              </Link>
            }
          >
            {reports.length === 0 ? (
              <EmptyState icon="document" title={t.reportsEmptyTitle} description={t.reportsEmptyReason} />
            ) : (
              <ReportsTable rows={reports} base={`/espacios/${slug}/informes`} />
            )}
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
          {/*
            M40 · "Datos del establecimiento" en dos columnas: el
            formulario a la izquierda, y a la derecha lo que se consulta
            de un vistazo —la foto, quién lo lleva y el contacto del
            cliente—. En pantallas estrechas se apilan en ese orden.
          */}
          {block.key === "establishmentData" ? (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="min-w-0">
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
              </div>
              <div className="min-w-0 space-y-4">

          {/*
            RN-EST-19 · quién del equipo lleva este restaurante (decisión
            63).

            Va aquí, al lado del contacto del cliente, porque las dos
            tarjetas responden a la misma pregunta desde los dos lados: a
            quién se llama de fuera y quién responde de dentro.

            **Solo se le ofrece el formulario a quien puede cambiarlo**, y
            eso es cortesía: `set_establishment_manager()` comprueba
            `manage_clients` por su cuenta y es la única puerta (CLAUDE.md:
            ocultar un control no es un control de acceso). A los demás se
            les enseña quién lo lleva, que sí pueden ver.
          */}
          {/*
            RN-EST-18 · la foto del restaurante (decisión 62), en el mismo
            bloque donde se editan sus datos: cambiarla ES un cambio de
            datos y deja auditoría como los demás.

            Se le ofrece a quien puede editar los datos, que es la misma
            puerta que comprueba `set_establishment_photo()` por su cuenta.
            A los demás se les enseña la foto —que ya sale en la cabecera—
            sin los botones, no un formulario que el servidor rechazaría.
          */}
          {block.key === "establishmentData" && canEditData ? (
            <Card title={es.teamArea.establishments.photo}>
              <PhotoForm establishmentId={header.id} photoUrl={photoUrl} />
            </Card>
          ) : null}

          {block.key === "establishmentData" ? (
            <Card title={es.teamArea.establishments.manager}>
              {canManageClients ? (
                <ManagerForm
                  establishmentId={header.id}
                  current={manager.currentId}
                  team={manager.team}
                />
              ) : (
                <p className="text-sm text-text">
                  {manager.currentId === null ? (
                    <span className="text-text-secondary">
                      {es.teamArea.establishments.noManager}
                    </span>
                  ) : (
                    (manager.currentName ?? es.teamArea.establishments.managerUnknown)
                  )}
                </p>
              )}
            </Card>
          ) : null}

          {/*
            Página 27 · "Contacto del propietario".

            Los tres datos —nombre, correo y teléfono— ya estaban en la
            ficha, en la lista larga, entre la identificación fiscal y el
            horario. Aquí salen aparte porque son los que se usan cuando
            hay que **llamar al cliente**, y no se leen: se pulsan. Por eso
            el correo es un `mailto:` y el número un `tel:`, que en un
            teléfono abren el correo y la llamada.

            Es el contacto DEL CLIENTE —quien firma, a quien se llama
            cuando hay un impago—, nunca nadie del equipo de mantenimiento
            (CLAUDE.md MUST NOT); su propio nombre lo escribe él.

            La cara que dibuja el diseño no está: no hay foto del contacto
            en ninguna parte. Y "Enviar mensaje" tampoco abre una
            conversación nueva —crearla al pintar una pantalla sería un
            efecto por mirar—: lleva a los mensajes del restaurante, que
            es donde está la suya.
          */}
          {block.key === "establishmentData" ? (
            <Card title={t.ownerContactTitle}>
              <p className="text-base font-semibold text-primary-dark">
                {header.identity.contactName ?? (
                  <span className="text-sm font-normal text-text-secondary">
                    {t.ownerContactNoName}
                  </span>
                )}
              </p>

              <ul className="mt-2 space-y-1.5 text-sm">
                <li>
                  {header.identity.contactEmail === null ? (
                    <span className="text-text-secondary">{t.ownerContactNoEmail}</span>
                  ) : (
                    <a
                      href={`mailto:${header.identity.contactEmail}`}
                      className="inline-flex items-center gap-2 text-cuotly-green underline focus:outline focus:outline-2 focus:outline-cuotly-green"
                    >
                      <Icon name="messages" aria-hidden="true" className="h-4 w-4" />
                      {header.identity.contactEmail}
                    </a>
                  )}
                </li>
                <li>
                  {header.identity.phonePrimary === null ? (
                    <span className="text-text-secondary">{t.ownerContactNoPhone}</span>
                  ) : (
                    <a
                      href={`tel:${header.identity.phonePrimary.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-2 text-cuotly-green underline focus:outline focus:outline-2 focus:outline-cuotly-green"
                    >
                      <Icon name="person" aria-hidden="true" className="h-4 w-4" />
                      {header.identity.phonePrimary}
                    </a>
                  )}
                </li>
              </ul>

              <p className="mt-3 text-sm">
                <Link href={`/espacios/${slug}/mensajes`} className="text-cuotly-green underline">
                  {t.ownerContactMessages}
                </Link>
              </p>
            </Card>
          ) : null}

              </div>
            </div>
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
                          {header.cycleEnd === null ? t.renewalNone : dia(header.cycleEnd, timeZone)}
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
                              ? t.commitmentUntil(dia(header.commitmentEndsAt, timeZone))
                              : t.commitmentOver}
                        </dd>
                        {header.commitmentStartedAt === null ? null : (
                          <dd className="text-xs text-text-secondary">
                            {t.commitmentSince(dia(header.commitmentStartedAt, timeZone))}
                          </dd>
                        )}
                      </div>
                    </dl>

                    {/*
                      Maqueta 13 · "Versión aceptada · Ver condiciones". El
                      estado lo deriva el servidor (`subscription_terms()`)
                      y la frase sale de una sola función para el plan y
                      los servicios, que es lo que impide que las dos
                      tarjetas digan lo mismo con palabras distintas.
                    */}
                    <p className="mt-3 text-sm text-text-secondary">
                      {t.termsLabel}: {termsLine(header.planTerms, timeZone)}
                    </p>

                    <p className="mt-4 text-sm">
                      <Link
                        href={`/espacios/${slug}/planes`}
                        className="text-cuotly-green underline"
                      >
                        {t.manageplanLink}
                      </Link>
                      {" · "}
                      <Link
                        href={`/espacios/${slug}/planes/${header.id}`}
                        className="text-cuotly-green underline"
                      >
                        {t.termsLink}
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
                              {t.serviceSince(dia(service.startedAt, timeZone))}
                            </span>
                            <span className="block text-xs text-text-secondary">
                              {t.termsLabel}: {termsLine(service.terms, timeZone)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right text-sm text-text-secondary">
                            {service.priceCents === null ? (
                              es.plansPage.servicePriceUnknown
                            ) : (
                              <>
                                {t.planPrice(euros(service.priceCents))}
                                <span className="block text-xs">
                                  {service.premiumApplied
                                    ? t.servicePricePremium
                                    : t.servicePriceStandard}
                                </span>
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/*
                      Maqueta 13 · "Actualizaciones 12/30". El uso del
                      servicio se cuenta en Menú Diario (RN-CON-02,
                      `menu_update_cycles`), y es allí donde se enseña con
                      su ciclo: aquí se enlaza con palabras en vez de
                      copiar el contador a otra pantalla que podría
                      discrepar. El segundo precio de RN-COM-08 ya no
                      falta: el aplicado lo dice el servidor
                      (`service_monthly_price()`, decisión 20) y va junto
                      al número, arriba.
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
          {/*
            M42 · Pagos y cobros, con sus tres pestañas: Cobros, Presupuestos
            y Facturas.
          */}
          {block.key === "payments" ? (
            <div className="space-y-4">
              <PaymentsSectionNav base={base} active={paymentsSection} />

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
              ) : paymentsSection.key === "charges" ? (
                <>
                  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    {/*
                      M42 · "Próximo cobro": la cuota que sigue debiendo algo,
                      con la fecha grande, el concepto, su estado, el
                      desglose guardado (RN-FIN-08: la pantalla no multiplica
                      nada) y sus dos botones. Si hay más de una, van todas,
                      una debajo de otra.
                    */}
                    <Card
                      className="min-w-0"
                      title={cuotasVivas.length > 1 ? t.pendingChargesTitle : t.nextChargeTitle}
                    >
                      {cuotasVivas.length === 0 ? (
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
                      ) : (
                        <div className="space-y-4">
                          {cuotasVivas.map((charge) => (
                            <section
                              key={charge.id}
                              className="rounded-[14px] border border-border bg-surface p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    aria-hidden="true"
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cuotly-green/10 text-cuotly-green"
                                  >
                                    <Icon name="calendar" className="h-5 w-5" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-[22px] font-bold leading-tight text-primary-dark">
                                      {diaCorto(charge.dueAt, timeZone)}
                                    </p>
                                    <h4 className="truncate text-sm text-text-secondary">
                                      {charge.concept}
                                    </h4>
                                  </div>
                                </div>
                                <StatusBadge tone={chargeTone(charge.status)}>
                                  {es.teamArea.chargeStates[charge.status as ChargeStateKey] ??
                                    charge.status}
                                </StatusBadge>
                              </div>

                              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
                                <div>
                                  <dt className="text-xs text-text-secondary">{t.baseLabel}</dt>
                                  <dd className="mt-0.5 text-base font-semibold text-primary-dark">
                                    {euros(charge.baseCents)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-text-secondary">
                                    {t.taxLabel(charge.taxRatePercent)}
                                  </dt>
                                  <dd className="mt-0.5 text-base font-semibold text-primary-dark">
                                    {euros(charge.taxCents)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs text-text-secondary">{t.totalLabel}</dt>
                                  <dd className="mt-0.5 text-base font-bold text-primary-dark">
                                    {euros(charge.totalCents)}
                                  </dd>
                                </div>
                              </dl>

                              <p className="mt-3 text-xs text-text-secondary">
                                {t.billingPeriod(
                                  diaCorto(charge.periodStart, timeZone),
                                  diaCorto(charge.periodEnd, timeZone),
                                )}
                              </p>

                              {/*
                                Los dos botones del diseño. "Ver detalle"
                                lleva al detalle de ESE cobro (M17), no a
                                Finanzas en general. "Registrar pago" abre
                                aquí mismo el MISMO formulario de Finanzas
                                y del detalle del trabajo (HU-26): lo que
                                cambia entre roles es lo que permite
                                `register_payment()`, no la pantalla.
                              */}
                              <div className="mt-4 flex flex-wrap items-start justify-end gap-2">
                                <Link
                                  href={`/espacios/${slug}/finanzas/cobros/${charge.id}`}
                                  className="inline-flex items-center justify-center rounded-field border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green transition-colors hover:bg-cuotly-green/10 focus:outline focus:outline-2 focus:outline-cuotly-green"
                                >
                                  {t.chargeViewDetail}
                                </Link>
                                <details className="group open:basis-full">
                                  <summary className="flex cursor-pointer list-none justify-end [&::-webkit-details-marker]:hidden">
                                    <span className="inline-flex items-center justify-center rounded-field bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark group-open:bg-primary-dark">
                                      {t.chargeRegisterPayment}
                                    </span>
                                  </summary>
                                  <div className="mt-4 border-t border-border pt-4">
                                    <RegisterPaymentForm
                                      chargeId={charge.id}
                                      establishmentId={header.id}
                                      outstandingEuros={(charge.outstandingCents / 100).toFixed(2)}
                                      defaultDay={today}
                                    />
                                  </div>
                                </details>
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </Card>

                    {/*
                      M42 · "Resumen de cobros": las dos casillas del diseño,
                      con su icono y su color, y SIN cifra. Ese total no lo
                      calcula todavía ninguna función del servidor, y sumarlo
                      aquí haría de la pantalla la autoridad sobre el dinero
                      (CLAUDE.md MUST). En su sitio va el motivo.

                      El reloj va sobre ámbar con el trazo oscuro: el ámbar
                      como color de trazo no llega a 3:1 (CA-22, y
                      `contrast.test.ts` lo prohíbe).
                    */}
                    <Card className="min-w-0" title={t.chargesSummaryTitle}>
                      <div className="space-y-3">
                        {(
                          [
                            {
                              key: "collected",
                              label: t.chargesSummaryCollected(today.slice(0, 4)),
                              icon: "calendar",
                              tint: "bg-cuotly-green/10 text-cuotly-green",
                            },
                            {
                              key: "pending",
                              label: t.chargesSummaryPending,
                              icon: "clock",
                              tint: "bg-warning/25 text-primary-dark",
                            },
                          ] as const
                        ).map((casilla) => (
                          <div
                            key={casilla.key}
                            className="flex items-center gap-3 rounded-[14px] border border-border p-3.5"
                          >
                            <span
                              aria-hidden="true"
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${casilla.tint}`}
                            >
                              <Icon name={casilla.icon} className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm text-text-secondary">{casilla.label}</p>
                              <p className="text-base font-semibold text-text-secondary">
                                {t.chargesSummaryNoFigure}
                              </p>
                              <p className="text-xs text-text-secondary">
                                {t.chargesSummaryNoFigureReason}
                              </p>
                            </div>
                          </div>
                        ))}
                        <p className="flex items-start gap-2 rounded-[10px] bg-soft-surface px-3 py-2 text-xs text-text-secondary">
                          <Icon name="alert" aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {t.chargesOnlyThis(header.name)}
                        </p>
                      </div>
                    </Card>
                  </div>

                  {/*
                    M42 · "Historial de cobros": cada cuota emitida, con su
                    periodo, su importe guardado y el estado que deriva el
                    servidor de su libro (RN-FIN-02).
                  */}
                  <Card title={t.chargeHistoryTitle}>
                    {payments.charges.length === 0 ? (
                      <p className="text-sm text-text-secondary">{t.chargeHistoryEmpty}</p>
                    ) : (
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableHeaderCell>{t.chargeHistoryDate}</TableHeaderCell>
                            <TableHeaderCell>{t.conceptColumn}</TableHeaderCell>
                            <TableHeaderCell>{t.chargeHistoryPeriod}</TableHeaderCell>
                            <TableHeaderCell>{t.chargeHistoryAmount}</TableHeaderCell>
                            <TableHeaderCell>{t.chargeHistoryState}</TableHeaderCell>
                            <TableHeaderCell>{t.chargeHistoryDetail}</TableHeaderCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {payments.charges.map((charge) => (
                            <TableRow key={charge.id}>
                              <TableCell>
                                <span className="whitespace-nowrap">
                                  {diaCorto(charge.dueAt, timeZone)}
                                </span>
                              </TableCell>
                              <TableCell>{charge.concept}</TableCell>
                              <TableCell>
                                <span className="whitespace-nowrap text-text-secondary">
                                  {diaCorto(charge.periodStart, timeZone)} –{" "}
                                  {diaCorto(charge.periodEnd, timeZone)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="whitespace-nowrap font-semibold">
                                  {euros(charge.totalCents)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <StatusBadge tone={chargeTone(charge.status)}>
                                  {es.teamArea.chargeStates[charge.status as ChargeStateKey] ??
                                    charge.status}
                                </StatusBadge>
                              </TableCell>
                              <TableCell>
                                <Link
                                  href={`/espacios/${slug}/finanzas/cobros/${charge.id}`}
                                  className="inline-flex items-center justify-center rounded-field border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-soft-surface"
                                >
                                  {t.chargeViewDetail}
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </Card>

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
                                <TableCell>{diaCorto(payment.paidAt, timeZone)}</TableCell>
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

                  <p className="flex items-center gap-2 rounded-[12px] bg-soft-surface px-3.5 py-2.5 text-sm text-text-secondary">
                    <Icon name="alert" aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {t.paymentsFootNote}
                  </p>
                </>
              ) : paymentsSection.key === "quotes" ? (
                /*
                  Maqueta 14 · "Presupuestos" (§84, desde el Hito 12). Los
                  que hay, con el estado que deriva el servidor del cobro
                  (`quote_status()`, RN-DAT-05), y el enlace a Finanzas.
                */
                  <Card title={t.quotesTitle}>
                    {payments.quotes.length === 0 ? (
                      <EmptyState
                        title={t.quotesEmptyTitle}
                        description={t.quotesEmptyReason}
                      />
                    ) : (
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableHeaderCell>{es.quotesTeam.codeColumn}</TableHeaderCell>
                            <TableHeaderCell>{es.quotesTeam.conceptColumn}</TableHeaderCell>
                            <TableHeaderCell>{es.quotesTeam.totalColumn}</TableHeaderCell>
                            <TableHeaderCell>{es.quotesTeam.stateColumn}</TableHeaderCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {payments.quotes.map((quote) => (
                            <TableRow key={quote.id}>
                              <TableCell>
                                <Link
                                  href={`/espacios/${slug}/finanzas/presupuestos/${quote.id}`}
                                  className="text-cuotly-green underline"
                                >
                                  {quote.code}
                                </Link>
                              </TableCell>
                              <TableCell>{quote.concept}</TableCell>
                              <TableCell>{euros(quote.totalCents)}</TableCell>
                              <TableCell>
                                <StatusBadge
                                  tone={isQuoteState(quote.status) ? quoteTone(quote.status) : "neutral"}
                                >
                                  {isQuoteState(quote.status)
                                    ? es.naming.states.quote[quote.status]
                                    : quote.status}
                                </StatusBadge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <p className="mt-3 text-sm">
                      <Link
                        href={`/espacios/${slug}/finanzas/presupuestos?restaurante=${header.id}`}
                        className="text-cuotly-green underline"
                      >
                        {t.quotesLink}
                      </Link>
                    </p>
                  </Card>
              ) : (
                <Card title={t.invoicesTitle}>
                  <EmptyState
                    icon="document"
                    title={t.invoicesEmptyTitle}
                    description={t.invoicesEmptyReason}
                  />
                </Card>
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
                Maqueta 15 · "Añadir usuario existente" (RN-EST-04). Se le
                ofrece a quien gestiona clientes; a los demás ni se pinta,
                aunque quien mande la acción a mano recibe el "no" del
                servidor igual (CLAUDE.md: ocultar no es controlar).
              */}
              {canManageClients ? (
                <details className="mb-4 rounded-[10px] border border-border p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-primary-dark">
                    {t.grantTitle}
                  </summary>
                  <p className="mb-3 mt-2 text-sm text-text-secondary">{t.grantHint}</p>
                  <GrantAccessForm establishmentId={header.id} groupId={header.groupId} />
                </details>
              ) : null}

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
                              <span className="flex min-w-0 items-center gap-3">
                                <Avatar name={user.displayName ?? user.email} size={34} />
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-text">
                                    {user.displayName ?? t.noName}
                                  </span>
                                  <span className="block truncate text-xs text-text-secondary">
                                    {user.email}
                                  </span>
                                </span>
                              </span>
                            </TableCell>
                            <TableCell>
                              {user.source === "group" ? t.sourceGroup : t.sourceEstablishment}
                            </TableCell>
                            <TableCell>
                              <StatusBadge tone="neutral">
                                {t.clientRoles[user.role as ClientRoleKey] ?? user.role}
                              </StatusBadge>
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
                            <TableCell>{diaCorto(user.grantedAt, timeZone)}</TableCell>
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
                    Lo que del dibujo NO está, y por qué (CLAUDE.md MUST
                    NOT):

                      · El permiso "Ver informes". No hay columna: los dos
                        permisos finos que existen son `edit_establishment_data`
                        y `view_billing` (RN-EST-11, RN-FIN-07). El PRD §14
                        dice además que el Editor "ve informes siempre" y
                        que Consulta "necesita permiso de su propietario",
                        un permiso que no está modelado — y los informes
                        son Fase 3.
                  */}
                </>
              )}

              {/*
                M43 · la fila "Usuario pendiente · Invitación pendiente" del
                dibujo. Existen desde RN-PAN-14: el restaurante invita y el
                equipo aprueba o rechaza. Se listan aquí las vivas, con el
                mismo componente que la pantalla de Usuarios y accesos del
                restaurante; los botones de revisar se PINTAN a quien
                gestiona clientes, y quien decide es
                `review_establishment_invitation()` (CLAUDE.md). No hay
                "Reenviar": Cuotly todavía no envía el correo.
              */}
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-base font-semibold text-primary-dark">
                  {t.invitations.title}
                </h3>
                {invitations.failed ? (
                  <p className="mt-2 text-sm text-danger">{t.invitations.failed}</p>
                ) : invitations.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">{t.invitations.empty}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {invitations.rows.map((invitation) => (
                      <InvitationRow
                        key={invitation.id}
                        invitation={invitation}
                        canReview={canManageClients}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            {/*
              M43 · debajo de la tabla, dos tarjetas lado a lado: el panel
              del cliente y el equipo de mantenimiento que tiene este
              restaurante autorizado.
            */}
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {/*
                §40.1 · el panel del restaurante (página 56 del diseño).
                Va DELANTE de la lista de usuarios porque es lo primero que
                se pregunta de un restaurante nuevo: si el cliente puede
                entrar ya o todavía no.

                El estado se DERIVA de los accesos vivos (RN-PAN-09): no hay
                bandera que guardar, porque una bandera puede decir "creado"
                con todos los accesos revocados. Y "no se ha podido mirar" no
                se dice como "no creado" (CLAUDE.md).
              */}
              <Card title={t.panelTitle}>
                {users.failed ? (
                  <EmptyState title={t.panelUnknownTitle} description={t.panelUnknownReason} />
                ) : users.rows.length > 0 ? (
                  <>
                    <StatusBadge tone="success">{t.panelCreatedTitle}</StatusBadge>
                    <p className="mt-2 text-sm text-text-secondary">
                      {t.panelCreatedHint(users.rows.length)}
                    </p>
                  </>
                ) : (
                  <>
                    <StatusBadge tone="neutral">{t.panelNotCreated}</StatusBadge>
                    <p className="mt-2 text-sm text-text-secondary">{t.panelNotCreatedReason}</p>
                    {canManageClients ? (
                      <div className="mt-4 border-t border-border pt-4">
                        <p className="text-base font-semibold text-primary-dark">
                          {t.panelCreateTitle}
                        </p>
                        <p className="mb-3 mt-1 text-sm text-text-secondary">{t.panelCreateHint}</p>
                        <CreatePanelForm
                          establishmentId={header.id}
                          groupId={header.groupId}
                          establishmentName={header.name}
                          code={header.code}
                          groupName={header.groupName}
                        />
                      </div>
                    ) : null}
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
                            <span className="flex min-w-0 items-center gap-3">
                              <Avatar name={person.displayName ?? person.email} size={34} />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-text">
                                  {person.displayName ?? t.noName}
                                </span>
                                <span className="block truncate text-xs text-text-secondary">
                                  {person.email}
                                </span>
                              </span>
                            </span>
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
                          <TableCell>{diaCorto(person.assignedAt, timeZone)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

            </div>
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
              {/*
                M44 · dos columnas: a la izquierda las carpetas en fila y la
                tabla de archivos a lo ancho; a la derecha el archivo
                elegido con sus versiones, y cuánto ocupa el restaurante.
              */}
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4">
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
                                <TableCell>{diaCorto(file.createdAt, timeZone)}</TableCell>
                                <TableCell>{t.fileVersion(file.lastVersion)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </Card>
                </div>

                <div className="min-w-0 space-y-4">
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
                                  {dia(version.createdAt, timeZone)} · {t.fileSize(megabytes(version.sizeBytes))}
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
                  {/*
                    RN-ARC-10 · cuánto ocupa este restaurante (página 50 del
                    diseño definitivo móvil).

                    Va con la frase de que NO es una cuota, y esa frase no es
                    relleno: un número junto al nombre de un restaurante se
                    lee como su límite, y aquí el límite es del espacio y no
                    se reparte (RN-SUB-13). El total del espacio no se repite
                    aquí —vive en la suscripción— y se enlaza: dos copias del
                    mismo número acaban discrepando.
                  */}
                  <Card title={t.storageTitle}>
                    {storageBytes === null ? (
                      <EmptyState
                        title={t.storageHiddenTitle}
                        description={t.storageHiddenReason}
                      />
                    ) : (
                      <>
                        <p className="text-sm font-medium text-text">
                          {t.storageValue(header.name, readableSize(storageBytes))}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">{t.storageNotAQuota}</p>
                        <Link
                          href={`/espacios/${slug}/ajustes/suscripcion`}
                          className="mt-2 inline-block text-sm text-cuotly-green underline"
                        >
                          {t.storageSpaceLink}
                        </Link>
                      </>
                    )}
                  </Card>
                </div>
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

          {/*
            Maqueta 17 · "Gestión — Integraciones" (Fase 3, Hito 14). Las
            cinco fuentes con lo que §117 manda enseñar y las acciones de
            quien mira; sin "Sincronizar ahora" (RN-INT-03).
          */}
          {/*
            M84 y M47 · el estado de servicio. Solo a quien puede gestionar
            clientes: a los demás, el estado en lectura y el motivo de que
            no haya formularios. Que no se vean no es el control —
            `set_establishment_status()` exige `manage_clients` y
            `request_service_termination()` comprueba lo suyo—: es no
            ofrecer botones que van a decir que no.
          */}
          {/*
            RN-EST-14 · las notas internas, que hasta ahora solo se leían
            desde la conversación. Cambiar dónde se entra no las acerca al
            cliente: `NotesPanel` no se pinta cuando quien mira no tiene
            nada que ver con ellas —ni siquiera vacío, porque una caja
            titulada "Notas internas" diciendo "no hay ninguna" ya le
            cuenta al cliente que existen (RN-EST-13, RN-MSG-04)—. Quién
            las lee lo decide `can_read_establishment_notes()`, no esto.
          */}
          {block.key === "internalNotes" ? (
            <NotesPanel establishmentId={header.id} notes={notes} timeZone={timeZone} wide />
          ) : null}

          {/* RN-EST-14 · las copias de seguridad (§38, RN-BCK), que hasta
              ahora vivían con el estado del servicio. */}
          {block.key === "backups" ? (
            <BackupsBlock
              establishmentId={header.id}
              backups={backups}
              timezone={timeZone}
              canManage={canManageClients}
            />
          ) : null}

          {block.key === "serviceStatus" ? (
            <>
              <Card title={t.serviceStatusTitle}>
                <p className="mb-3 text-sm text-text-secondary">{t.serviceStatusHint}</p>
                <StatusLegend current={header.status} />
              </Card>

              {/* §38 · la transferencia entre espacios. Va aquí, con el
                  estado del servicio, porque es la otra manera de que un
                  restaurante deje de ser de este espacio — la primera es
                  archivarlo, y las dos se miran juntas. */}
              <TransferBlock
                establishmentId={header.id}
                pending={transfer}
                canPropose={canProposeTransfer}
              />

              {canManageClients ? (
                <ServiceStatusForms establishmentId={header.id} status={header.status} />
              ) : (
                <Card title={t.serviceStatusTitle}>
                  <EmptyState
                    title={t.dataReadOnlyTitle}
                    description={t.dataReadOnlyReason}
                  />
                </Card>
              )}
            </>
          ) : null}

          {block.key === "integrations" ? (
            integrations === null ? (
              <Card title={t.integrationsTitle}>
                <EmptyState title={es.states.errorTitle} description={es.emptyReasons.error} />
              </Card>
            ) : (
              <IntegrationsBlock
                view={integrations}
                establishmentId={header.id}
                slug={slug}
                returnTo={sheetHref(base, MANAGEMENT_TAB, INTEGRATIONS_BLOCK)}
                title={t.integrationsTitle}
                hint={t.integrationsHint}
                configure={{
                  hrefFor: (provider) =>
                    `${sheetHref(base, MANAGEMENT_TAB, INTEGRATIONS_BLOCK)}&fuente=${provider}`,
                  selected:
                    integrationSource !== null && isIntegrationProvider(integrationSource)
                      ? integrationSource
                      : null,
                }}
              />
            )
          ) : null}
        </>
      ) : null}

      {/*
        Maqueta 19 · "Actividad y auditoría": todas las acciones realizadas
        en el restaurante, con sus filtros.

        Antes esta pestaña enseñaba solo los cambios de estado de los
        trabajos (`state_events`) y remitía a Ajustes para lo demás. Ahora
        lee la auditoría acotada a este restaurante, que es lo que la
        maqueta pide y lo que alguien viene a buscar aquí.

        **Qué filas salen no lo decide esta pantalla.** `establishment_audit()`
        es SECURITY INVOKER, así que la política de `audit_log` (§21.2)
        sigue mandando fila a fila: el propietario ve su espacio entero, un
        administrador la operativa, un trabajador lo suyo y lo que ya puede
        ver, y un cliente no llega hasta aquí.
      */}
      {/*
        M48 · con un evento abierto (`?evento=`), el historial se parte en
        dos: la lista a la izquierda y el detalle a la derecha, como el
        dibujo. El evento viaja en la dirección con los filtros y la
        página, así que se comparte y el botón de volver lo cierra.
      */}
      {tab.key === "history" ? (
        <div
          className={
            auditEventId === null
              ? ""
              : "grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
          }
        >
        <Card className="min-w-0" title={t.historyTitle}>
          <p className="mb-3 text-sm text-text-secondary">{t.historyHint}</p>

          <AuditFilters base={base} audit={audit} />

          {audit.rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={t.historyEmptyTitle}
                description={
                  audit.filters.from !== null ||
                  audit.filters.to !== null ||
                  audit.filters.family !== null ||
                  audit.filters.actorId !== null
                    ? t.historyFilteredEmptyReason
                    : t.historyEmptyReason
                }
              />
            </div>
          ) : (
            <div className="mt-4">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>{t.auditWhenColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.auditActionColumn}</TableHeaderCell>
                    {/*
                      Con el detalle abierto, los cambios se leen en él: en
                      la mitad del ancho, una columna de "antes → después"
                      aplastaría la fila.
                    */}
                    {auditEventId === null ? (
                      <TableHeaderCell>{t.auditChangesColumn}</TableHeaderCell>
                    ) : null}
                    <TableHeaderCell>{t.auditActorColumn}</TableHeaderCell>
                    <TableHeaderCell>{t.auditDetailColumn}</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {audit.rows.map((row) => (
                    <TableRow key={row.id} highlight={row.id === auditEventId}>
                      <TableCell>
                        <span className="whitespace-nowrap text-text-secondary">
                          {fechaYHoraLarga(row.createdAt, timeZone)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {/*
                          El nombre en español sale del catálogo de
                          `src/core/audit.ts`; una acción sin nombre se
                          enseña cruda en vez de esconderse, igual que en la
                          auditoría del espacio.
                        */}
                        <span className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-cuotly-green/10 text-cuotly-green"
                          >
                            <Icon name="document" className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-text">
                              {auditActionLabel(row.action)}
                            </span>
                            {row.reason === null ? null : (
                              <span className="block text-xs text-text-secondary">{row.reason}</span>
                            )}
                          </span>
                        </span>
                      </TableCell>
                      {auditEventId === null ? (
                        <TableCell>
                          {/*
                            Los cambios se derivan comparando el valor anterior
                            con el nuevo (`auditChanges`), y solo salen los
                            campos que de verdad cambiaron: una lista con diez
                            campos idénticos y uno distinto esconde el que
                            importa.
                          */}
                          {row.changes.length === 0 ? (
                            <span className="text-text-secondary">—</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {row.changes.map((change) => (
                                <li key={change.field} className="text-xs">
                                  <span className="text-text-secondary">{change.field}: </span>
                                  <span className="text-text">
                                    {change.before ?? t.auditNoValue}
                                    {" → "}
                                    {change.after ?? t.auditNoValue}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <AuditActor row={row} />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={historyHref(base, audit, { event: row.id })}
                          aria-current={row.id === auditEventId ? "true" : undefined}
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-field border border-cuotly-green bg-surface px-3 py-1.5 text-xs font-semibold text-cuotly-green transition-colors hover:bg-cuotly-green/10 focus:outline focus:outline-2 focus:outline-cuotly-green"
                        >
                          {t.auditViewDetail}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <AuditPager base={base} audit={audit} />
            </div>
          )}

          {/*
            M07 no dibuja "Exportar" en el historial del restaurante. El
            registro se exporta en CSV desde Ajustes · Auditoría (M62), con
            sus filtros; allí no se filtra por restaurante porque el
            registro no lo guarda como columna. Se dice y se enlaza, en vez
            de un botón que exportaría otra cosa que lo que se ve aquí.
          */}
          <p className="mt-4 text-xs text-text-secondary">
            {t.auditExportElsewhere}{" "}
            <Link
              href={`/espacios/${slug}/ajustes/auditoria`}
              className="text-cuotly-green underline"
            >
              {t.auditLink}
            </Link>
          </p>
        </Card>

        {auditEventId === null ? null : (
          <AuditEventDetail
            row={audit.rows.find((row) => row.id === auditEventId) ?? null}
            closeHref={historyHref(base, audit)}
            slug={slug}
            establishmentName={header.name}
            timeZone={timeZone}
          />
        )}
        </div>
      ) : null}
    </div>
  );
}
