import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, ErrorState, NoPermissionState, PageHeader, StatusBadge } from "@/components/ui";
import { formatMicrosAsEuros } from "@/core/agents/balance";
import { parseFakeNotices, renderFakeMessage, type FakeNotice } from "@/core/reservations/fake-notices";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { fakeMessagingAllowed } from "@/services/agents/messaging/providers";

import { ProcessPendingButton, SimulateButtons } from "./MessageActions";

/**
 * Pruebas › Mensajes (PRD de agents §10.3, decisión 159): los avisos a comensales que salen con el proveedor FALSO. Solo con
 * `ENABLE_FAKE_MESSAGING=true` y fuera de producción, y solo para quien gestiona clientes en Restavor. No hay datos de
 * relleno: cada mensaje es un aviso real de una reserva de prueba, redactado con los textos de verdad.
 */
export const dynamic = "force-dynamic";

const TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  queued: "info",
  sent: "warning",
  delivered: "success",
  failed: "danger",
  skipped: "neutral",
};

async function siteUrlOf(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  return `${list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

export default async function FakeMessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = es.agents.fakeMessages;

  if (!fakeMessagingAllowed()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <EmptyState title={t.disabledTitle} description={t.disabledBody} />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: space } = await supabase.from("spaces").select("id, timezone").eq("slug", slug).maybeSingle();
  if (!space) notFound();
  const { data: allowed } = await supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "manage_clients" });
  if (allowed !== true) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState description={t.noPermission} />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("reservation_fake_notices", { p_space_id: space.id });
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <ErrorState description={t.loadFailed} />
      </div>
    );
  }
  const notices: readonly FakeNotice[] = parseFakeNotices(data);
  const siteUrl = await siteUrlOf();

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <ProcessPendingButton slug={slug} />
      {notices.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyReason} />
      ) : (
        <ul className="space-y-4">
          {notices.map((notice) => {
            const message = renderFakeMessage(notice, siteUrl);
            return (
              <li key={notice.noticeId}>
                <Card>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong className="text-text">{notice.establishmentName}</strong>
                      <StatusBadge tone="neutral">{t.channelNames[notice.channel]}</StatusBadge>
                      <StatusBadge tone={TONE[notice.status] ?? "neutral"}>{t.statusNames[notice.status]}</StatusBadge>
                      <span className="text-text-secondary">{enZona(notice.createdAt, space.timezone, { dateStyle: "short", timeStyle: "short" })}</span>
                      {notice.costMicros !== null && notice.costMicros > 0 ? <span className="text-text-secondary">{t.cost(formatMicrosAsEuros(notice.costMicros))}</span> : null}
                    </div>
                    <p className="break-all text-sm text-text-secondary">{t.to(notice.recipient)}</p>
                    {message.subject !== null ? <p className="break-words text-sm font-semibold text-text">{t.subject(message.subject)}</p> : null}
                    <pre className="whitespace-pre-wrap break-words rounded-[10px] bg-soft-surface p-3 font-sans text-sm text-text [overflow-wrap:anywhere]">{message.body}</pre>
                    {message.link !== null ? (
                      <a href={message.link} className="text-sm font-semibold text-primary underline">
                        {t.link}
                      </a>
                    ) : null}
                    <SimulateButtons slug={slug} noticeId={notice.noticeId} channel={notice.channel} status={notice.status} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
