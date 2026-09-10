import Link from "next/link";

import { Card, StatusBadge } from "@/components/ui";
import { EmptyReason } from "@/components/ui/EmptyReason";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  requestTone,
  t1StopCause,
  validationSteps,
  type ConsumptionEstimate,
  type RequestTone,
  type ValidationStepState,
} from "@/core/requests";

import { es } from "@/i18n/es";
import { tiempoRestante } from "@/i18n/duration";

import type {
  RequestAttachment,
  RequestCounter,
  RequestDetailRow,
  RequestHistoryEntry,
  RequestProposal,
} from "@/app/espacios/[slug]/solicitudes/[id]/detail-load";

/**
 * La pantalla de una solicitud vista por el equipo (§20.4, HU-11 a
 * HU-14): a la izquierda lo que pidió el restaurante, a la derecha la
 * propuesta de clasificación con su plazo y sus dos botones, y debajo el
 * historial.
 *
 * Es de servidor entera y no guarda nada en el navegador: "corregir la
 * clasificación" abre el formulario largo cambiando la dirección
 * (`?corregir=1`), así que el botón de volver lo cierra y la pantalla
 * funciona igual si no hidrata JavaScript (CA-22). Lo único que es cliente
 * son los formularios, porque necesitan enseñar el error de la acción.
 *
 * Aquí no se decide nada: qué se puede hacer lo dice el servidor, y estos
 * componentes solo eligen qué pintar. Si alguien llamara a la acción
 * equivocada, la función del servidor lanza (CLAUDE.md, MUST).
 */
type RequestStateKey = keyof typeof es.naming.states.request;
type CategoryKey = keyof typeof es.naming.categories;
type MimeKey = keyof typeof es.files.types;
type AuditActionKey = keyof typeof es.settings.auditActions;

const t = es.teamArea.requests;

function fechaHora(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

/**
 * El tamaño del adjunto: en KB por debajo del mega, en MB por encima, y
 * con la coma decimal del español —`toFixed()` escribe siempre un punto, y
 * en la línea de al lado se leen euros con coma—.
 */
function tamano(sizeBytes: number): string {
  if (sizeBytes < 1_048_576) {
    return t.attachmentKilobytes(
      new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(sizeBytes / 1024),
    );
  }
  return t.attachmentMegabytes(
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(sizeBytes / 1_048_576),
  );
}

/**
 * El icono de la insignia de estado (§21.4: el estado va con texto e
 * icono, nunca solo con color). Un reloj para todo diría "esperando"
 * también de una solicitud publicada o rechazada, que es justo lo que no
 * está esperando a nadie.
 */
const TONE_ICON: Readonly<Record<RequestTone, IconName>> = {
  success: "check",
  danger: "alert",
  warning: "clock",
  info: "clock",
  neutral: "clock",
};

/** Una etiqueta y su valor, en la columna izquierda de las dos tarjetas. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-1.5">
      <dt className="w-32 shrink-0 text-sm text-text-secondary sm:w-40">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-text">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------

export interface RequestPager {
  readonly index: number;
  readonly total: number;
  readonly previousHref: string | null;
  readonly nextHref: string | null;
}

/** Una flecha del paginador. Deshabilitada en los extremos, nunca oculta. */
function PagerLink({
  href,
  icon,
  label,
}: {
  href: string | null;
  icon: IconName;
  label: string;
}) {
  const clases =
    "flex h-9 w-9 items-center justify-center rounded-[10px] border border-border transition-colors";

  if (href === null) {
    return (
      <span
        aria-hidden="true"
        className={`${clases} cursor-not-allowed text-border`}
      >
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={`${clases} text-text-secondary hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green`}
    >
      <Icon name={icon} aria-hidden="true" className="h-[18px] w-[18px]" />
    </Link>
  );
}

export function RequestHeader({
  headline,
  code,
  state,
  establishmentName,
  backHref,
  pager,
}: {
  headline: string;
  code: string;
  state: string;
  establishmentName: string | null;
  backHref: string;
  /** Ausente cuando no se viene de una lista que contenga esta solicitud. */
  pager?: RequestPager;
}) {
  return (
    <header className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-soft-surface text-text-secondary sm:flex"
      >
        <Icon name="request" className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold text-primary-dark lg:text-3xl">{headline}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-text-secondary">
            {establishmentName ?? "—"} · {code}
          </p>
          <StatusBadge tone={requestTone(state)} icon={TONE_ICON[requestTone(state)]}>
            {es.naming.states.request[state as RequestStateKey] ?? state}
          </StatusBadge>
        </div>
      </div>

      {/*
        Con su texto, como en la maqueta 05. Era un botón de solo icono con
        el nombre en `aria-label`: quien ve la pantalla tenía que deducir a
        dónde volvía por una flecha, y en móvil, sin `title` que se pueda
        posar, no había manera de averiguarlo.
      */}
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={backHref}
          className="flex shrink-0 items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-soft-surface hover:text-text focus:outline focus:outline-2 focus:outline-cuotly-green"
        >
          <Icon name="arrowLeft" aria-hidden="true" className="h-[18px] w-[18px]" />
          {t.back}
        </Link>

        {/*
          Maqueta 05 · "1 de 3" con sus flechas. Solo cuando se viene de
          una lista que contiene esta solicitud: llegando por un enlace
          directo no se pinta, porque "1 de 1" fingiría un recorrido que no
          existe (`listPosition()` devuelve null y aquí no hay nada que
          decidir).

          Los extremos van deshabilitados y no ocultos: un control que
          desaparece mueve los de al lado y se pulsa el que no era.
        */}
        {pager === undefined ? null : (
          <nav aria-label={t.pagerLabel} className="flex shrink-0 items-center gap-1">
            <PagerLink href={pager.previousHref} icon="arrowLeft" label={t.pagerPrevious} />
            <span className="whitespace-nowrap px-1 text-sm text-text-secondary">
              {t.pagerPosition(pager.index, pager.total)}
            </span>
            <PagerLink href={pager.nextHref} icon="arrowRight" label={t.pagerNext} />
          </nav>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------
// Estado de validación (maqueta 05)
// ---------------------------------------------------------------------

/**
 * Los tres pasos de la maqueta 05, cada uno con su marca. Lo que decide
 * cuál está en cuál es `validationSteps()` en `src/core/requests.ts`, con
 * sus pruebas: aquí solo se elige el icono y el color.
 *
 * El paso actual lleva además `aria-current`: quien navega con lector de
 * pantalla oye "paso actual" en vez de tener que deducirlo del color, que
 * es lo único que lo distingue a la vista.
 */
const MARCA_DEL_PASO: Record<
  ValidationStepState["status"],
  { readonly icon: IconName; readonly clase: string }
> = {
  done: { icon: "check", clase: "bg-cuotly-green/10 text-cuotly-green" },
  // En `info` y no en ámbar: el ámbar sobre su tinte da 2,15:1 y AA pide
  // 3:1 para un icono. Además el paso actual no es un aviso, es dónde está
  // la solicitud ahora mismo.
  current: { icon: "alert", clase: "bg-info/10 text-info" },
  rejected: { icon: "close", clase: "bg-danger/10 text-danger" },
  pending: { icon: "clock", clase: "bg-soft-surface text-text-secondary" },
  unknown: { icon: "clock", clase: "bg-soft-surface text-text-secondary" },
};

export function ValidationStatusCard({ request, proposal }: {
  request: RequestDetailRow;
  proposal: RequestProposal | null;
}) {
  const pasos = validationSteps({
    state: request.state,
    validatedAt: request.validated_at,
    acceptedAt: request.accepted_at,
    rejectedAt: request.rejected_at,
    proposedAt: proposal?.createdAt ?? null,
  });

  return (
    <Card title={t.validationStatusTitle}>
      <ol className="space-y-4">
        {pasos.map((paso) => {
          const marca = MARCA_DEL_PASO[paso.status];
          return (
            <li
              key={paso.step}
              className="flex items-start gap-3"
              aria-current={paso.status === "current" ? "step" : undefined}
            >
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${marca.clase}`}
              >
                <Icon name={marca.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">
                  {t.validationSteps[paso.step]}
                </span>
                {/*
                  Debajo, qué le pasa a ese paso. La fecha cuando la hay, y
                  si no, el motivo: un paso "pendiente" sin nada debajo se
                  lee igual que uno que falló.
                */}
                <span className="block text-sm text-text-secondary">
                  {paso.at !== null
                    ? fechaHora(paso.at)
                    : t.validationStepStatus[paso.status]}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Lo que pidió el restaurante
// ---------------------------------------------------------------------

function iconoDeArchivo(mimeType: string | null): IconName {
  if (mimeType !== null && mimeType.startsWith("image/")) return "image";
  return "document";
}

export function ClientRequestCard({
  request,
  establishmentName,
  attachments,
  attachmentsFailed,
}: {
  request: RequestDetailRow;
  establishmentName: string | null;
  attachments: readonly RequestAttachment[];
  attachmentsFailed: boolean;
}) {
  return (
    <Card title={t.clientCardTitle}>
      <dl className="divide-y divide-border">
        <Dato label={t.establishmentLabel}>{establishmentName ?? "—"}</Dato>
        <Dato label={t.receivedAtLabel}>{fechaHora(request.created_at)}</Dato>
        {/* "Dónde" solo si lo escribió: un guion en una fila vacía no dice
            nada que no diga no pintarla. */}
        {request.context ? <Dato label={t.contextLabel}>{request.context}</Dato> : null}
      </dl>

      <p className="mb-2 mt-4 text-sm text-text-secondary">{t.messageLabel}</p>
      <blockquote className="whitespace-pre-wrap rounded-[14px] bg-soft-surface p-4 text-sm text-text">
        {request.description}
      </blockquote>

      <p className="mb-2 mt-5 text-sm text-text-secondary">{t.attachments(attachments.length)}</p>

      {attachmentsFailed ? (
        <EmptyReason reason="error" title={t.attachmentsFailedTitle} />
      ) : attachments.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border px-4 py-5 text-center text-sm text-text-secondary">
          {t.attachmentsNoneReason}
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((file) => (
            <li
              key={file.fileId}
              className="flex items-center gap-3 rounded-[14px] border border-border p-3"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-text-secondary"
              >
                <Icon name={iconoDeArchivo(file.mimeType)} className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{file.name}</span>
                <span className="block text-xs text-text-secondary">
                  {/*
                    Sin versión vigente no se inventa un tipo ni un tamaño:
                    se dice que no la hay (CA-20). Pasa con un archivo cuyo
                    registro llegó a medias.
                  */}
                  {file.sizeBytes === null
                    ? t.attachmentNoVersion
                    : `${
                        file.mimeType !== null && file.mimeType in es.files.types
                          ? es.files.types[file.mimeType as MimeKey]
                          : t.attachmentUnknownType
                      } · ${tamano(file.sizeBytes)}`}
                </span>
              </span>

              {/*
                RN-ARC-08 · el bucket es privado: la descarga pasa por la
                ruta que comprueba `can_read_file()` y firma un enlace de
                unos minutos. No hay URL permanente de ningún archivo.
              */}
              <a
                href={`/api/archivos/${file.fileId}`}
                aria-label={`${t.attachmentDownload}: ${file.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-text-secondary transition-colors hover:bg-soft-surface hover:text-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
              >
                <Icon name="download" className="h-[18px] w-[18px]" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------
// La propuesta de clasificación, su plazo y sus botones
// ---------------------------------------------------------------------

function ConsumoEstimado({ estimate }: { estimate: ConsumptionEstimate }) {
  const categoria = es.naming.categories[estimate.category as CategoryKey] ?? estimate.category;

  switch (estimate.kind) {
    case "included":
      return (
        <>
          {t.consumptionOne(categoria)}
          <span className="block text-xs text-text-secondary">
            {t.consumptionRemaining(estimate.remaining, estimate.included)}
          </span>
        </>
      );
    case "budgeted":
      return (
        <>
          {t.consumptionBudgeted}
          <span className="block text-xs text-text-secondary">{t.consumptionBudgetedReason}</span>
        </>
      );
    case "exhausted":
      return (
        <>
          <span className="font-semibold text-danger">{t.consumptionExhausted}</span>
          <span className="block text-xs text-text-secondary">{t.consumptionExhaustedReason}</span>
        </>
      );
    case "unknown":
      return (
        <>
          {t.consumptionUnknown}
          <span className="block text-xs text-text-secondary">{t.consumptionUnknownReason}</span>
        </>
      );
  }
}

/**
 * El reloj de primera atención (RN-SLA-01/02/03).
 *
 * Se enseña el contador exacto porque quien mira es el equipo (RN-SLA-16:
 * el cliente ve rangos, el equipo ve el número). Parado no dice "quedan
 * 0": dice por qué está parado, que es un dato distinto.
 */
function CounterBox({ counter, state }: { counter: RequestCounter; state: string }) {
  const status = counter.status;
  const parada = t1StopCause(state);

  const titulo =
    status === null
      ? t.t1NotStarted
      : counter.running
        ? status.overdue
          ? t.t1Overdue
          : t.t1Remaining(tiempoRestante(status.remainingMinutes))
        : parada === "waiting_client"
          ? t.t1StoppedWaitingClient
          : parada === "waiting_information"
            ? t.t1StoppedWaitingInformation
            : parada === "rejected"
              ? t.t1StoppedRejected
              : t.t1StoppedClosed;

  const pie =
    status === null
      ? t.t1NotStartedHint
      : counter.running && status.overdue
        ? t.t1OverdueHint
        : counter.running
          ? t.t1Hint
          : t.t1Total(status.totalMinutes / 60);

  const tono =
    status !== null && counter.running && status.overdue ? "text-danger" : "text-text-secondary";

  return (
    <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-border p-4">
      <Icon name="clock" className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${tono}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">
          {t.t1Title} · {titulo}
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">{pie}</p>
      </div>
    </div>
  );
}

export function ClassificationCard({
  request,
  proposal,
  estimate,
  counter,
  actions,
}: {
  request: RequestDetailRow;
  proposal: RequestProposal | null;
  estimate: ConsumptionEstimate | null;
  counter: RequestCounter;
  /**
   * Lo que se puede hacer con esta clasificación: los formularios (que son
   * de cliente porque enseñan el error de la acción) o el aviso de que
   * quien mira no puede validar. Lo decide la pantalla, no esta tarjeta:
   * aquí no hay ninguna comprobación de permisos, y es a propósito
   * —duplicarla sería la copia que se desfasa—.
   */
  actions: React.ReactNode;
}) {
  // Una vez validada, lo que manda es lo que decidió la persona, no lo que
  // propuso el clasificador (RN-CLS-03/04): las dos cosas se guardan, y
  // esta tarjeta enseña la vigente diciendo cuál es.
  const validada = request.validated_category !== null;
  const categoria = request.validated_category ?? proposal?.category ?? null;
  const alcance = request.validated_summary ?? proposal?.summary ?? null;

  return (
    <Card title={validada ? t.validatedTitle : t.proposalTitle}>
      {categoria === null ? (
        <EmptyReason reason="no_data_yet" title={t.proposalNoneTitle} />
      ) : (
        <>
          <dl className="divide-y divide-border">
            <Dato label={t.proposalCategoryLabel}>
              <StatusBadge tone="neutral">
                {es.naming.categories[categoria as CategoryKey] ?? categoria}
              </StatusBadge>
            </Dato>
            {estimate === null ? null : (
              <Dato label={t.proposalConsumptionLabel}>
                <ConsumoEstimado estimate={estimate} />
              </Dato>
            )}
          </dl>

          <p className="mb-2 mt-4 text-sm text-text-secondary">{t.proposalScopeLabel}</p>
          <p className="whitespace-pre-wrap rounded-[14px] bg-soft-surface p-4 text-sm text-text">
            {alcance}
          </p>

          {/* RN-CLS-02 · de dónde salió la propuesta. Que la escribiera el
              motor de reglas porque la IA no contestó no es un detalle
              técnico: cambia cuánto se fía uno de ella. */}
          {validada || proposal === null ? null : (
            <p className="mt-2 text-xs text-text-secondary">
              {proposal.source === "ai" ? t.proposalSourceAi : t.proposalSourceRules}
              {proposal.fallbackReason
                ? ` · ${t.proposalFallbackReason(proposal.fallbackReason)}`
                : ""}
            </p>
          )}
        </>
      )}

      {/* El plazo solo mientras este tramo sea el que corre: en una
          solicitud ya publicada, "primera atención" es historia. */}
      {t1StopCause(request.state) === "closed" ? null : (
        <CounterBox counter={counter} state={request.state} />
      )}

      {actions}
    </Card>
  );
}

/** El aviso de qué pasa después de validar, tal cual lo dice la maqueta. */
export function AfterValidateNote() {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-info/10 p-3 text-xs text-text">
      <Icon name="alert" className="mt-px h-4 w-4 shrink-0" />
      {t.afterValidateNote}
    </p>
  );
}

// ---------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------

/**
 * §21.2 y CA-15 · el historial no es una tabla propia: es el rastro de la
 * solicitud en el libro de auditoría, que ya guarda quién, qué, cuándo y
 * por qué. Escribir a mano una frase bonita por cada paso habría sido
 * inventar un segundo relato que se separa del libro en cuanto cambie una
 * función; el nombre de cada acción sale del mismo diccionario que la
 * pantalla de auditoría (CA-21).
 */
export function RequestHistoryCard({ entries }: { entries: readonly RequestHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card title={t.historyTitle}>
        <EmptyReason reason="no_data_yet" title={t.historyEmptyTitle} />
      </Card>
    );
  }

  return (
    <Card title={t.historyTitle}>
      <ol className="space-y-0">
        {entries.map((entry, index) => {
          const ultimo = index === entries.length - 1;
          return (
            <li key={entry.id} className="flex gap-3">
              <span aria-hidden="true" className="flex w-5 shrink-0 flex-col items-center">
                {ultimo ? (
                  <span className="mt-1 h-4 w-4 shrink-0 rounded-full border-[3px] border-warning bg-surface" />
                ) : (
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success text-surface">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                )}
                {ultimo ? null : <span className="w-px flex-1 bg-border" />}
              </span>

              <div className={`min-w-0 flex-1 ${ultimo ? "pb-1" : "pb-5"}`}>
                <p className="text-sm font-medium text-text">
                  {es.settings.auditActions[entry.action as AuditActionKey] ?? entry.action}
                </p>
                <p className="text-xs text-text-secondary">
                  {fechaHora(entry.occurredAt)} · {entry.actor ?? t.historySystemActor}
                </p>
                {entry.reason ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">
                    {entry.reason}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
