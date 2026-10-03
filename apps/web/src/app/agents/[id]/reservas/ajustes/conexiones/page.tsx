import Link from "next/link";

import { requireAgentsPage } from "@/app/agents/agents-context";
import { agentsDb } from "@/app/agents/db";
import { Card, ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { agentsPageHref } from "@/core/reservations/agents-routes";
import { es } from "@/i18n/es";
import { loadNoticeChannels } from "@/services/agents/notice-channels-gateway";

import { SettingsTabs } from "../_components/SettingsTabs";
import { NoticeChannelsForm } from "./NoticeChannelsForm";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Conexiones (`AjustesConexiones`, PRD de agents §11.1). De momento lleva una sola tarjeta de verdad: «Avisos a
 * tus clientes» (Fase F), con los tres interruptores de canal —correo, WhatsApp y SMS—, el saldo y el enlace a recargar.
 * Las plataformas y las reservas por internet llegan en su fase y aquí lo dicen, sin simular nada.
 *
 * Cambiar los canales es de una cuenta (Propietario, Encargado, Restavor y el soporte en sesión): la tablet del local los
 * ve fijos. El importe del saldo solo lo ve quien puede ver importes (RN-APP-05): la tablet no.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id: establishmentId } = await params;
  const access = await requireAgentsPage(establishmentId, "connections");
  const title = es.agents.menu.connectionsTitle;
  const t = es.agents.notices;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={title} />
        <NoPermissionState />
      </div>
    );
  }

  const channels = await loadNoticeChannels(await agentsDb(establishmentId), establishmentId).catch(() => null);
  const onDevice = access.mode === "device";
  const canEdit = access.mode === "user" || (access.mode === "support" && access.nav.actor.kind === "support" && access.nav.actor.twoFactor);
  const readOnlyNote = onDevice ? t.deviceNote : t.readOnlyNote;
  const soon = es.agents.soon;

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={access.nav.name} />
      <SettingsTabs establishmentId={establishmentId} current="connections" />

      <Card title={t.title}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">{t.intro}</p>
          {channels === null ? (
            <ErrorState description={t.loadFailed} />
          ) : (
            <NoticeChannelsForm establishmentId={establishmentId} initial={channels} editable={canEdit} readOnlyNote={canEdit ? null : readOnlyNote} />
          )}
          {access.nav.balanceLabel !== null ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
              <span className="text-text">{t.balance(access.nav.balanceLabel)}</span>
              <Link href={agentsPageHref(establishmentId, "balance")} className="font-semibold text-primary underline">
                {t.seeBalance}
              </Link>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title={t.comingTitle}>
        <p className="text-sm text-text-secondary">{soon.reason(soon.phaseConnectors)}</p>
      </Card>
    </div>
  );
}
