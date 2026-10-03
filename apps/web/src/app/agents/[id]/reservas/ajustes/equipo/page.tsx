import { randomUUID } from "node:crypto";

import { EmptyState, ErrorState, NoPermissionState, PageHeader } from "@/components/ui";
import { canReservations } from "@/core/reservations/permissions";
import { formatDateTime } from "@/core/reservations/format";
import { instanteRelativo } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { loadDevice } from "@/services/agents/device";
import { myUserId } from "@/services/agents/my-name";
import { pinSecretConfigured } from "@/services/agents/pin";
import { loadDevices, loadPeople, loadRemovableOwners } from "@/services/agents/team-gateway";

import { agentsDb } from "@/app/agents/db";
import { requireAgentsPage } from "../../../../agents-context";
import { SettingsTabs } from "../_components/SettingsTabs";
import { DevicesSection, type DeviceRowView } from "./_components/DevicesSection";
import { InviteCard } from "./_components/InviteCard";
import { MyPinCard } from "./_components/MyPinCard";
import { PeopleSection } from "./_components/PeopleSection";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Equipo (EQU-01 y EQU-02; PRD de agents §3.2, §3.3 y §11.1, `AjustesEquipo`): las personas de Reservas —
 * Propietarios y Encargados con cuenta, y el Equipo con su PIN—, «Mi PIN para la tablet», invitar a un Propietario
 * o Encargado, y las tablets del local con «Usar este dispositivo como tablet del local». La ven el Propietario, el
 * Encargado, Restavor y el soporte en sesión, y la tablet con los Ajustes abiertos con PIN; el Equipo no ve Ajustes.
 * Cada botón repite el permiso en la base de datos.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAgentsPage(id, "team");
  const t = es.agents.team;
  if (access.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} />
        <NoPermissionState />
      </div>
    );
  }
  const { nav, mode } = access;

  const db = await agentsDb(id);
  let people;
  let devices;
  let timeZone: string;
  try {
    const [p, d, settings] = await Promise.all([
      loadPeople(db, id),
      loadDevices(db, id),
      db.from("reservation_settings").select("timezone").eq("establishment_id", id).maybeSingle(),
    ]);
    people = p;
    devices = d;
    // La zona la manda el restaurante (CLAUDE.md): sin ella no se pinta una hora inventada, se dice que no se pudo cargar.
    if (!settings.data?.timezone) throw new Error("Sin zona horaria");
    timeZone = settings.data.timezone;
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={t.title} subtitle={nav.name} />
        <SettingsTabs establishmentId={id} current="team" />
        <ErrorState title={es.agents.agenda.common.failedLoad} description={t.loadFailed} />
      </div>
    );
  }

  // Quién mira, para el «Tú» y para «Mi PIN»: solo una persona con cuenta (la tablet no es nadie en concreto).
  const myId = mode === "user" ? await myUserId() : null;
  const me = myId === null ? null : (people.find((p) => p.kind === "member" && p.id === myId) ?? null);
  const thisDevice = await loadDevice();
  const now = new Date();

  const rows: DeviceRowView[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    since: formatDateTime(d.createdAt, timeZone).split(",")[0] ?? "",
    lastUsed: d.lastUsedAt ? instanteRelativo(d.lastUsedAt.toISOString(), timeZone, now, t.devices.todayAt) : null,
    isThis: thisDevice.kind === "active" && thisDevice.deviceId === d.id,
  }));

  const secret = pinSecretConfigured();
  const canInvite = mode !== "device" && canReservations(nav.actor, "manage_owners_and_managers", { serviceStatus: nav.serviceStatus });
  // Quitar a un Encargado o a un Propietario: el Propietario del restaurante y el equipo del espacio (decisiones 110 y
  // 131); nunca desde la tablet. Los Propietarios que se pueden quitar los dice la base de datos.
  const canRemoveManagers = mode !== "device" && canReservations(nav.actor, "manage_owners_and_managers", { serviceStatus: nav.serviceStatus });
  let removableOwnerIds: string[] = [];
  if (canRemoveManagers) {
    try {
      removableOwnerIds = [...(await loadRemovableOwners(db, id))];
    } catch {
      // Sin la lista no se ofrece quitar a nadie: es peor equivocarse hacia «se puede» que esconder un botón.
      removableOwnerIds = [];
    }
  }
  // Activar este dispositivo: solo una cuenta de Propietario o Encargado, en su propio navegador.
  const canActivate = mode === "user" && (nav.actor.kind === "owner" || nav.actor.kind === "manager");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.title} subtitle={nav.name} />
      <SettingsTabs establishmentId={id} current="team" />

      {!secret ? (
        <EmptyState title={t.pinSecretMissingTitle} description={t.pinSecretMissingBody} />
      ) : (
        <>
          <PeopleSection
            establishmentId={id}
            people={people}
            myUserId={myId}
            canRemoveManagers={canRemoveManagers}
            removableOwnerIds={removableOwnerIds}
            idempotencyKey={randomUUID()}
          />
          {mode === "user" && (nav.actor.kind === "owner" || nav.actor.kind === "manager") ? (
            <MyPinCard establishmentId={id} hasPin={me?.hasPin ?? false} />
          ) : null}
          {canInvite ? <InviteCard establishmentId={id} idempotencyKey={randomUUID()} /> : null}
        </>
      )}

      <DevicesSection establishmentId={id} devices={rows} canActivate={secret && canActivate} />
    </div>
  );
}
