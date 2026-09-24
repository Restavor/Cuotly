import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Avatar, ButtonLink, Card, NoPermissionState, StatusBadge } from "@/components/ui";
import { isSpaceReadOnly, type SpaceCuotlyState } from "@/core/cuotly-subscription";
import { canOwnerRestore } from "@/core/space-lifecycle";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ExportForm } from "../exportacion/ExportForm";
import { SettingsHeader } from "../SettingsHeader";
import {
  ArchiveSpaceForm,
  RestoreSpaceForm,
  TransferOwnershipForm,
  type TransferCandidate,
} from "./OwnershipForms";

/**
 * §127 · Propiedad y fin de un espacio (RN-CIC-05 a 09). Las tres cosas
 * que §127 nombra: transferir la propiedad, archivar y restaurar.
 *
 * **Lo que esta pantalla no hace, y lo dice en voz alta:** no elimina
 * nada. §127 dice "después se programa eliminación", y programar es lo
 * único que ocurre: se guarda la fecha y se enseña. Qué se elimina y qué
 * se conserva por obligación legal es del bloque legal (§170.1), que
 * sigue aplazado, y fingir un botón de borrado sería exactamente lo que
 * CLAUDE.md prohíbe.
 *
 * Todo lo que se puede pulsar aquí lo vuelve a decidir el servidor: las
 * tres funciones comprueban `manage_space` y rechazan una sesión de Modo
 * soporte (RN-CIC-05, RN-CIC-07).
 */
export const dynamic = "force-dynamic";

export default async function OwnershipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select(
      "id, name, timezone, cuotly_status, cuotly_archived_at, cuotly_reactivation_deadline_at, cuotly_deletion_scheduled_at",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.spaceOwnership;

  const { data: canManage } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_space",
  });

  if (!canManage) {
    return (
      <div className="space-y-6">
        <SettingsHeader slug={slug} active={null} />
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  // Los candidatos a recibir la propiedad: miembros activos que no sean
  // quien la tiene. Las columnas van enumeradas, como en todo el proyecto.
  const { data: miembros } = await supabase
    .from("space_memberships")
    .select("user_id, role, profiles(full_name, email)")
    .eq("space_id", space.id)
    .eq("status", "active");

  const candidatos: TransferCandidate[] = (miembros ?? [])
    .filter((m) => m.user_id !== user.id)
    .map((m) => {
      const perfil = m.profiles as unknown as { full_name: string | null; email: string } | null;
      const nombre = perfil?.full_name ?? perfil?.email ?? m.user_id;
      return { userId: m.user_id, label: `${nombre} · ${t.roles[m.role as "admin" | "worker" | "owner"]}` };
    });

  const dueno = (miembros ?? []).find((m) => m.role === "owner");
  const perfilDueno = dueno?.profiles as unknown as { full_name: string | null; email: string } | null | undefined;
  const nombreDueno = perfilDueno?.full_name ?? perfilDueno?.email ?? "—";

  const estado = space.cuotly_status as SpaceCuotlyState | null;
  const archivadoPorSuDueno = estado === "archived_by_owner";
  const limite = space.cuotly_reactivation_deadline_at;
  const aTiempo = limite !== null && canOwnerRestore(new Date(limite), new Date());
  const cuando = (valor: string | null) =>
    valor === null ? "—" : enZona(valor, space.timezone, { dateStyle: "long" });

  const m = t.m64;

  return (
    <div className="space-y-6">
      {/*
        M64 · "Propiedad, exportación y soporte". No es una pestaña: se
        llega desde General ("Transferir propiedad", "Archivar espacio"), y
        la barra de Ajustes se enseña sin ninguna subrayada.
      */}
      <SettingsHeader slug={slug} active={null} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Card title={m.exportTitle} subtitle={es.spaceExport.spaceHint}>
            <ExportForm spaceId={space.id} scope="space" label={es.spaceExport.submit} />
            <p className="mt-3 text-sm">
              <Link href={`/espacios/${slug}/ajustes/exportacion`} className="text-cuotly-green underline">
                {m.exportHistory}
              </Link>
            </p>
          </Card>

          <Card title={m.supportTitle} subtitle={m.supportHint}>
            <ButtonLink href={`/espacios/${slug}/ayuda`} variant="outline" size="sm">
              {m.supportLink}
            </ButtonLink>
          </Card>

          <Card title={t.stateTitle}>
            <div className="mb-2">
              <StatusBadge tone={isSpaceReadOnly(estado) ? "danger" : "success"}>
                {estado === null ? t.stateUnknown : es.cuotlySubscription.statuses[estado]}
              </StatusBadge>
            </div>
            {archivadoPorSuDueno ? (
              <dl className="text-sm text-text-secondary">
                <div className="flex gap-2">
                  <dt>{t.archivedOn}</dt>
                  <dd className="font-medium text-text">{cuando(space.cuotly_archived_at)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt>{t.recoverableUntil}</dt>
                  <dd className="font-medium text-text">{cuando(limite)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt>{t.deletionScheduledFor}</dt>
                  <dd className="font-medium text-text">{cuando(space.cuotly_deletion_scheduled_at)}</dd>
                </div>
              </dl>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {archivadoPorSuDueno ? (
            <>
              <Card title={t.restoreTitle}>
                <p className="mb-4 text-sm text-text-secondary">{aTiempo ? t.restoreHint : t.restoreTooLate}</p>
                {aTiempo ? <RestoreSpaceForm spaceId={space.id} /> : null}
              </Card>
              {/* RN-CIC-09 · el placeholder del bloque legal, dicho y no fingido. */}
              <Card title={t.deletionTitle}>
                <p className="text-sm text-text-secondary">{t.deletionPending}</p>
              </Card>
            </>
          ) : (
            <>
              <Card title={m.ownershipTitle} subtitle={m.ownershipHint}>
                <p className="mb-1 text-sm font-semibold text-text">{m.currentOwner}</p>
                <p className="mb-4 flex items-center gap-3 text-sm text-text">
                  <Avatar name={nombreDueno} size={36} />
                  {nombreDueno}
                </p>
                <div className="rounded-[10px] bg-soft-surface p-4">
                  <p className="font-semibold text-text">{t.transferTitle}</p>
                  <p className="mb-3 text-sm text-text-secondary">{t.transferHint}</p>
                  <TransferOwnershipForm spaceId={space.id} spaceName={space.name} candidates={candidatos} />
                </div>
              </Card>

              <div id="archivar">
                <Card title={t.archiveTitle} tone="danger">
                  <p className="mb-4 text-sm text-text-secondary">{t.archiveHint}</p>
                  <ArchiveSpaceForm spaceId={space.id} spaceName={space.name} />
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
