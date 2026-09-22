import { HomeAndHelp, StateCard } from "@/components/access/AccessPieces";
import { AccessShell } from "@/components/access/AccessShell";
import { AuthCard } from "@/components/access/AuthCard";
import { hasSession } from "@/components/access/session";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { PanelSetupForm } from "./PanelSetupForm";

/**
 * RN-ACC-13 · la **tercera puerta**: el enlace con el que alguien a quien
 * invitó su restaurante se crea la cuenta y entra en su panel.
 *
 * Es hermana de `/alta/[token]` (RN-ACC-04) y se comporta igual: no decide
 * nada. Pregunta a `establishment_invitation_details()`, que es quien sabe
 * si el enlace vale, y **cuando no vale no devuelve el correo** — ni el
 * restaurante. Un enlace gastado, caducado o inventado no dice de quién
 * era, o sería un comprobador de direcciones abierto.
 *
 * El estado `pending_review` es propio de esta puerta y no de la otra: la
 * invitación existe pero el equipo todavía no la ha mirado (RN-PAN-14). Se
 * dice tal cual, porque quien abre el enlace no tiene forma de saberlo y
 * "este enlace no vale" sería mentira.
 */
export default async function PanelInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("establishment_invitation_details", { p_token: token })
    .maybeSingle();

  const t = es.auth.panelInvitation;
  const estado = data?.state ?? null;

  if (estado === "valid" && data?.email) {
    return (
      <AuthCard>
        <PanelSetupForm
          token={token}
          email={data.email}
          establishmentName={data.establishment_name}
        />
      </AuthCard>
    );
  }

  // A05 · el estado de la invitación en la tarjeta centrada del diseño.
  const motivo =
    estado === "used"
      ? { title: t.usedTitle, body: t.usedBody, badge: "check" as const }
      : estado === "expired"
        ? { title: t.expiredTitle, body: t.expiredBody, badge: "clock" as const }
        : estado === "pending_review"
          ? { title: t.pendingTitle, body: t.pendingBody, badge: "clock" as const }
          : { title: t.unknownTitle, body: t.unknownBody, badge: "xCircle" as const };

  return (
    <AccessShell crumb={es.auth.access.crumbInvitation}>
      <StateCard illustration="mail" badge={motivo.badge} title={motivo.title} body={motivo.body}>
        <HomeAndHelp signedIn={await hasSession()} />
      </StateCard>
    </AccessShell>
  );
}
