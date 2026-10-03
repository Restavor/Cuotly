import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui";
import { dinerLinkState, parseDinerView, type DinerLinkState, type DinerLinkView } from "@/core/reservations/diner-link";
import { localDateTimeOf } from "@/core/reservations/dates";
import { formatNoticeLongDate } from "@/core/reservations/format";
import { isNoticeToken, type NoticeLanguage } from "@/core/reservations/notices";
import { es } from "@/i18n/es";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNoticeGateway, type RpcClient } from "@/services/agents/messaging/gateway";

import { cancelByLinkAction } from "./actions";
import { CancelButton } from "./CancelButton";

/**
 * La página del comensal, `/c/[token]` (PRD de agents §6.9 y §10.3, AVI-05; maqueta `CancelarCliente`): ve su reserva y
 * puede cancelarla hasta `hora − plazo` (120 minutos por defecto). **Sin sesión y sin el armazón de Restavor**: es de quien
 * reserva, no de quien paga. En español o en inglés (el de la reserva, con selector).
 *
 * Abrirla no escribe nada ni se limita (escáneres de correo, vistas previas): cancelar es un envío de formulario. Cada
 * estado se decide en `core/reservations/diner-link.ts` con lo que dice la base de datos; el reloj del navegador no
 * decide nada. Va sin caché, sin referrer y sin indexar (cabeceras en `next.config.ts`).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Restavor",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function capitalize(text: string): string {
  return text === "" ? text : text[0]!.toUpperCase() + text.slice(1);
}

function phoneLink(phone: string) {
  return (
    <a href={`tel:${phone}`} className="font-semibold text-primary underline">
      {phone}
    </a>
  );
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-1.5 text-center">
        <p className="text-lg font-bold text-text">{title}</p>
        {children !== undefined ? <div className="text-sm text-text-secondary">{children}</div> : null}
      </div>
    </Card>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string; error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;

  let view: DinerLinkView | null = null;
  let loadFailed = false;
  if (isNoticeToken(token)) {
    try {
      view = parseDinerView(await createNoticeGateway(createAdminClient() as unknown as RpcClient).customerView(token));
    } catch {
      loadFailed = true;
    }
  }

  const language: NoticeLanguage = query.lang === "en" ? "en" : query.lang === "es" ? "es" : (view?.language ?? "es");
  const t = es.agents.diner[language];

  if (view === null) {
    return (
      <main lang={language} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
        <h1 className="text-2xl font-bold text-primary-dark">{loadFailed ? t.title : t.invalidTitle}</h1>
        <Card>
          <p className="text-sm text-text-secondary">{loadFailed ? t.loadFailed : t.invalidBody}</p>
        </Card>
      </main>
    );
  }

  const state: DinerLinkState = dinerLinkState(view);
  const restaurant = view.restaurant;
  const phone = restaurant.phone;
  const limitMinutes = Math.max(0, Math.round((view.startsAt.getTime() - view.cancelDeadline.getTime()) / 60_000));
  const deadline = localDateTimeOf(view.cancelDeadline, view.timezone);
  const canCancel = state === "ok" || state === "pending";
  const callLine = (lead: string) => (
    <>
      {lead} {phone !== null ? phoneLink(phone) : null}
    </>
  );

  return (
    <main lang={language} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm text-text-secondary">{t.restaurantLine(restaurant.name, restaurant.city)}</p>
          <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        </div>
        <nav aria-label={t.languageLabel} className="flex gap-1">
          {(["es", "en"] as const).map((option) => (
            <Link
              key={option}
              href={`/c/${token}?lang=${option}`}
              hrefLang={option}
              aria-current={option === language ? "true" : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border px-3 text-sm font-semibold ${
                option === language ? "border-primary bg-primary text-surface" : "border-border bg-surface text-text hover:bg-soft-surface"
              }`}
            >
              {option.toUpperCase()}
            </Link>
          ))}
        </nav>
      </header>

      {query.error === "rate" ? (
        <p role="alert" className="rounded-[10px] bg-danger/10 p-3 text-sm text-text">
          {t.rateLimited}
        </p>
      ) : null}
      {query.error === "failed" ? (
        <p role="alert" className="rounded-[10px] bg-danger/10 p-3 text-sm text-text">
          {t.failed}
        </p>
      ) : null}

      <section className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-soft-surface p-4" aria-label={t.title}>
        <strong className="text-lg text-text">{t.dateTime(capitalize(formatNoticeLongDate(view.date, language)), view.time)}</strong>
        <span className="text-sm text-text-secondary">{t.cardLine(t.people(view.partySize), view.customerName)}</span>
        {view.status === "pending" && state !== "rejected" && state !== "cancelled" ? <span className="text-sm text-text-secondary">{t.pendingNote}</span> : null}
      </section>

      {canCancel ? (
        <>
          <form action={cancelByLinkAction} className="flex flex-col gap-3">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="lang" value={language} />
            <CancelButton label={state === "pending" ? t.cancelRequest : t.cancelBooking} pendingLabel={t.cancelling} />
          </form>
          <p className="text-center text-sm text-text-secondary">
            {t.deadline(t.atTime(formatNoticeLongDate(deadline.date, language), deadline.time), t.beforeMinutes(limitMinutes))}
          </p>
          {phone !== null ? <p className="text-center text-sm text-text-secondary">{callLine(t.callToChange)}</p> : null}
        </>
      ) : null}

      {state === "cancelled" ? (
        view.cancelReason === "customer_link" ? (
          <Message title={t.cancelledTitle}>{t.cancelledThanks}</Message>
        ) : (
          <Message title={t.cancelledTitle}>
            <p>{t.cancelledOther}</p>
            {phone !== null ? <p>{callLine(t.cancelledCall(restaurant.name))}</p> : null}
          </Message>
        )
      ) : null}

      {state === "rejected" ? (
        <Message title={t.rejectedTitle}>{phone !== null ? callLine(t.rejectedCall(restaurant.name)) : null}</Message>
      ) : null}

      {state === "deadline_passed" || state === "closed" ? (
        <Message title={t.tooLateTitle}>{callLine(t.callTo(restaurant.name))}</Message>
      ) : null}

      {state === "past" ? <Message title={t.pastTitle}>{t.pastBody}</Message> : null}
    </main>
  );
}
