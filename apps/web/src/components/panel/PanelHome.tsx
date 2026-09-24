import Link from "next/link";
import type { ReactNode } from "react";

import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { es } from "@/i18n/es";

/*
 * R01, R02, R04 y R43 · el Inicio del panel del restaurante con el diseño
 * definitivo.
 *
 * Es solo pintura: todo lo que enseña lo trae la página ya calculado en
 * el servidor, con la RLS de quien mira. Cada tarjeta tiene su estado
 * vacío dicho con palabras; ninguna rellena con ejemplos (CLAUDE.md).
 *
 * Lo que el diseño pinta y aquí no está, a propósito:
 *   · el precio del plan ("599 € + IVA/mes"). El restaurante no puede
 *     leer `plans` —su RLS es de miembros del espacio— y no hay una
 *     función que se lo dé. Se enseña el nombre del plan, que sí le llega
 *     por sus condiciones.
 *   · la frase de presentación del local ("Cocina mediterránea…"). No
 *     existe ese dato; va su código y su ciudad.
 */

export type PanelAttention =
  | { readonly kind: "request"; readonly count: number; readonly href: string }
  | { readonly kind: "menu"; readonly menuName: string; readonly dateLabel: string; readonly href: string }
  | { readonly kind: "charge"; readonly overdue: boolean; readonly concept: string; readonly dateLabel: string; readonly href: string }
  | { readonly kind: "messages"; readonly href: string };

export type PanelHomeData = {
  readonly firstName: string;
  readonly establishment: {
    readonly name: string;
    readonly code: string;
    readonly city: string | null;
    readonly photoUrl: string | null;
  };
  readonly links: {
    readonly newRequest: string;
    readonly createMenu: string | null;
    readonly plan: string;
    readonly menus: string | null;
    readonly messages: string;
    readonly requests: string;
    readonly data: string;
    /** R41 · la actividad e historial del restaurante. */
    readonly activity: string;
  };
  readonly attention: readonly PanelAttention[];
  readonly plan: {
    readonly names: readonly string[];
    readonly quotas: readonly { readonly label: string; readonly used: number; readonly included: number }[];
    readonly renewsLabel: string | null;
  };
  readonly nextMenu: { readonly name: string; readonly stateLabel: string; readonly dateLabel: string; readonly href: string } | null;
  readonly showMenus: boolean;
  readonly messages: readonly { readonly id: string; readonly from: string; readonly body: string; readonly dateLabel: string }[];
  readonly activity: readonly { readonly id: string; readonly icon: IconName; readonly title: string; readonly detail: string; readonly dateLabel: string; readonly href: string | null }[];
  readonly inProgress: readonly { readonly id: string; readonly title: string; readonly stateLabel: string; readonly dateLabel: string; readonly href: string }[];
  /** R04 · el restaurante acaba de llegar: todavía no ha pedido nada. */
  readonly firstSteps: boolean;
};

const t = es.panelHome;

export function PanelHome({ data }: { data: PanelHomeData }) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-primary-dark">
            {t.greeting(data.firstName)}
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            {t.subtitle(data.establishment.name)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-4">
          <div className="flex flex-wrap gap-3">
            <Link
              href={data.links.newRequest}
              className="inline-flex items-center gap-2 rounded-[10px] border border-cuotly-green bg-surface px-4 py-2.5 text-sm font-semibold text-cuotly-green transition-colors hover:bg-cuotly-green/10"
            >
              <Icon name="request" aria-hidden="true" className="h-[18px] w-[18px]" />
              {t.newRequest}
            </Link>
            {data.links.createMenu === null ? null : (
              <Link
                href={data.links.createMenu}
                className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark"
              >
                <Icon name="plus" aria-hidden="true" className="h-[18px] w-[18px]" />
                {t.createMenu}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <EstablishmentPhoto photoUrl={data.establishment.photoUrl} size={56} className="rounded-[10px]" />
            <div>
              <p className="font-semibold text-primary-dark">{data.establishment.name}</p>
              <p className="text-xs text-text-secondary">
                {[data.establishment.code, data.establishment.city].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        </div>
      </header>

      {data.firstSteps ? <FirstSteps data={data} /> : null}

      {/* R04 · en el primer acceso los primeros pasos ya dicen qué hacer. */}
      {data.firstSteps && data.attention.length === 0 ? null : <AttentionRow items={data.attention} />}

      {/*
        `grid-cols-1` en móvil a propósito: sin columnas declaradas, la
        única columna implícita mide lo que el texto más largo que no se
        parte (los `truncate` de Mensajes y Trabajos), y a 390 px el
        Inicio se salía por la derecha hasta los 593.
      */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <PlanCard data={data} />
        <div className="min-w-0 space-y-5">
          {data.showMenus ? <NextMenuCard data={data} /> : null}
          <ActivityCard data={data} />
        </div>
        <div className="min-w-0 space-y-5">
          <MessagesCard data={data} />
          <InProgressCard data={data} />
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  link,
  children,
}: {
  title: string;
  link?: { href: string; label: string } | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-text">{title}</h2>
        {link ? (
          <Link href={link.href} className="inline-flex items-center gap-1 text-sm font-medium text-info hover:underline">
            {link.label}
            <Icon name="arrowRight" aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-soft-surface text-text-secondary">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold text-text">{title}</p>
      <p className="mt-1 max-w-[260px] text-sm text-text-secondary">{body}</p>
    </div>
  );
}

const ATTENTION_STYLE: Record<PanelAttention["kind"] | "clear", { box: string; tile: string; icon: IconName; button: string }> = {
  request: { box: "border-danger/30 bg-danger/5", tile: "bg-danger/15 text-danger", icon: "alert", button: "border-danger/50 text-text" },
  menu: { box: "border-warning/40 bg-warning/10", tile: "bg-warning/25 text-primary-dark", icon: "calendar", button: "border-warning/60 text-text" },
  charge: { box: "border-warning/40 bg-warning/10", tile: "bg-warning/25 text-primary-dark", icon: "finance", button: "border-warning/60 text-text" },
  messages: { box: "border-info/30 bg-info/5", tile: "bg-info/15 text-info", icon: "info", button: "border-info/50 text-text" },
  clear: { box: "border-success/30 bg-success/5", tile: "bg-success/15 text-primary", icon: "check", button: "" },
};

function AttentionRow({ items }: { items: readonly PanelAttention[] }) {
  if (items.length === 0) {
    const s = ATTENTION_STYLE.clear;
    return (
      <div className={`flex items-center gap-4 rounded-card border p-5 ${s.box}`}>
        <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${s.tile}`}>
          <Icon name={s.icon} className="h-6 w-6" />
        </span>
        <div>
          <p className="font-semibold text-text">{t.allClearTitle}</p>
          <p className="text-sm text-text-secondary">{t.allClearBody}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const s = ATTENTION_STYLE[item.kind];
        const { title, body, cta } =
          item.kind === "request"
            ? { title: t.attentionRequestTitle, body: t.attentionRequestBody(item.count), cta: t.attentionRequestCta }
            : item.kind === "menu"
              ? { title: t.attentionMenuTitle, body: t.attentionMenuBody(item.menuName, item.dateLabel), cta: t.attentionMenuCta }
              : item.kind === "charge"
                ? item.overdue
                  ? { title: t.attentionChargeOverdueTitle, body: t.attentionChargeOverdueBody(item.concept, item.dateLabel), cta: t.attentionChargeCta }
                  : { title: t.attentionChargeTitle, body: t.attentionChargeBody(item.concept, item.dateLabel), cta: t.attentionChargeCta }
                : { title: t.attentionMessagesTitle, body: t.attentionMessagesBody, cta: t.attentionMessagesCta };
        return (
          <div key={item.kind} className={`flex gap-4 rounded-card border p-5 ${s.box}`}>
            <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${s.tile}`}>
              <Icon name={s.icon} className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-text">{title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{body}</p>
              <Link
                href={item.href}
                className={`mt-3 inline-flex rounded-[10px] border bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-soft-surface ${s.button}`}
              >
                {cta}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({ data }: { data: PanelHomeData }) {
  const { plan } = data;
  return (
    <Panel title={t.planTitle} link={{ href: data.links.plan, label: t.planDetails }}>
      {plan.names.length === 0 ? (
        <Empty icon="plans" title={t.planNone} body={t.planNoneReason} />
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-[12px] bg-soft-surface p-4">
          <p className="text-[20px] font-bold text-primary-dark">{plan.names.join(" · ")}</p>
          <StatusBadge tone="success">{t.planActive}</StatusBadge>
        </div>
      )}
      <h3 className="mt-5 text-[15px] font-semibold text-text">{t.quotasTitle}</h3>
      {plan.quotas.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{t.quotasEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {plan.quotas.map((q) => (
            <li key={q.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-text">{q.label}</span>
                <span className="font-semibold text-text">{t.quotaUsed(q.used, q.included)}</span>
              </div>
              <ProgressBar
                percent={q.included === 0 ? 0 : Math.min(100, Math.round((q.used / q.included) * 100))}
                label={`${q.label}: ${t.quotaUsed(q.used, q.included)}`}
              />
            </li>
          ))}
        </ul>
      )}
      {plan.renewsLabel === null ? null : (
        <p className="mt-4 text-xs text-text-secondary">{t.quotasRenew(plan.renewsLabel)}</p>
      )}
    </Panel>
  );
}

function NextMenuCard({ data }: { data: PanelHomeData }) {
  const menu = data.nextMenu;
  return (
    <Panel title={t.nextMenuTitle} link={data.links.menus ? { href: data.links.menus, label: t.nextMenuLink } : null}>
      {menu === null ? (
        <Empty icon="dailyMenu" title={t.nextMenuEmpty} body={t.nextMenuEmptyReason} />
      ) : (
        <Link href={menu.href} className="flex gap-4 rounded-[12px] p-1 hover:bg-soft-surface">
          <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-soft-surface text-primary-dark">
            <Icon name="dailyMenu" className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-text">{menu.name}</p>
            <p className="mt-1">
              <StatusBadge tone="warning">{menu.stateLabel}</StatusBadge>
            </p>
            <p className="mt-1 text-sm text-text-secondary">{t.nextMenuFor(menu.dateLabel)}</p>
          </div>
        </Link>
      )}
    </Panel>
  );
}

function RowIcon({ icon }: { icon: IconName }) {
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-text-secondary">
      <Icon name={icon} className="h-5 w-5" />
    </span>
  );
}

function ActivityCard({ data }: { data: PanelHomeData }) {
  return (
    <Panel title={t.activityTitle} link={{ href: data.links.activity, label: t.activityLink }}>
      {data.activity.length === 0 ? (
        <Empty icon="clock" title={t.activityEmpty} body={t.activityEmptyReason} />
      ) : (
        <ul className="space-y-4">
          {data.activity.map((a) => {
            const contenido = (
              <>
                <RowIcon icon={a.icon} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{a.title}</p>
                  <p className="truncate text-sm text-text-secondary">
                    {a.dateLabel} · {a.detail}
                  </p>
                </div>
              </>
            );
            return (
              <li key={a.id}>
                {a.href === null ? (
                  <div className="flex items-center gap-3">{contenido}</div>
                ) : (
                  <Link href={a.href} className="flex items-center gap-3 rounded-[10px] hover:bg-soft-surface">
                    {contenido}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function MessagesCard({ data }: { data: PanelHomeData }) {
  return (
    <Panel title={t.messagesTitle} link={{ href: data.links.messages, label: t.messagesLink }}>
      {data.messages.length === 0 ? (
        <Empty icon="messages" title={t.messagesEmpty} body={t.messagesEmptyReason} />
      ) : (
        <ul className="space-y-4">
          {data.messages.map((m) => (
            <li key={m.id} className="flex items-start gap-3">
              <RowIcon icon="messages" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-text">{m.from}</p>
                  <span className="shrink-0 text-xs text-text-secondary">{m.dateLabel}</span>
                </div>
                <p className="line-clamp-1 text-sm text-text-secondary">{m.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InProgressCard({ data }: { data: PanelHomeData }) {
  return (
    <Panel title={t.inProgressTitle} link={{ href: data.links.requests, label: t.inProgressLink }}>
      {data.inProgress.length === 0 ? (
        <Empty icon="job" title={t.inProgressEmpty} body={t.inProgressEmptyReason} />
      ) : (
        <ul className="space-y-4">
          {data.inProgress.map((j) => (
            <li key={j.id}>
              <Link href={j.href} className="flex items-center gap-3 rounded-[10px] hover:bg-soft-surface">
                <RowIcon icon="request" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{j.title}</p>
                  <p className="text-xs text-text-secondary">{t.requestedOn(j.dateLabel)}</p>
                </div>
                <StatusBadge tone="info">{j.stateLabel}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function FirstSteps({ data }: { data: PanelHomeData }) {
  const pasos = [
    { icon: "check" as const, title: t.stepDataTitle, body: t.stepDataBody, cta: t.stepDataCta, href: data.links.data },
    { icon: "request" as const, title: t.stepRequestTitle, body: t.stepRequestBody, cta: t.stepRequestCta, href: data.links.newRequest },
    { icon: "messages" as const, title: t.stepMessageTitle, body: t.stepMessageBody, cta: t.stepMessageCta, href: data.links.messages },
  ];
  // Solo cuenta lo que se sabe de verdad: que todavía no hay ninguna
  // solicitud (por eso se enseña esta tarjeta). Los otros dos pasos no
  // dejan huella que se pueda leer, así que no se marcan como hechos.
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold text-text">{t.firstStepsTitle}</h2>
          <p className="text-sm text-text-secondary">{t.firstStepsBody}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {pasos.map((p) => (
          <div key={p.title} className="flex gap-3 rounded-[14px] border border-border p-4">
            <RowIcon icon={p.icon} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{p.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{p.body}</p>
              <Link
                href={p.href}
                className="mt-3 inline-flex rounded-[10px] border border-cuotly-green bg-surface px-4 py-2 text-sm font-semibold text-cuotly-green hover:bg-cuotly-green/10"
              >
                {p.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
