import { HomeAndHelp, StateCard } from "@/components/access/AccessPieces";
import { AccessShell } from "@/components/access/AccessShell";
import { AuthCard } from "@/components/access/AuthCard";
import { hasSession } from "@/components/access/session";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { SetupForm } from "./SetupForm";

/**
 * RN-ACC-04 · el enlace de un solo uso y con caducidad donde quien fue
 * aprobado pone su contraseña. Es la primera mitad de "la contraseña no
 * viaja por correo": lo que viaja es esto, y solo sirve una vez.
 *
 * La pantalla no decide nada. Pregunta a `account_setup_details()`, que es
 * quien sabe si el enlace vale, y **cuando no vale no devuelve el correo**:
 * un enlace gastado o caducado no dice de quién era.
 */
export default async function AltaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("account_setup_details", { p_token: token })
    .maybeSingle();

  const t = es.auth.setup;
  const estado = data?.state ?? null;

  if (estado === "valid" && data?.email) {
    return (
      <AuthCard>
        <SetupForm token={token} email={data.email} name={data.contact_name} />
      </AuthCard>
    );
  }

  // A05 · el estado del enlace en la tarjeta centrada del diseño.
  const motivo =
    estado === "used"
      ? { title: t.usedTitle, body: t.usedBody, badge: "check" as const }
      : estado === "expired"
        ? { title: t.expiredTitle, body: t.expiredBody, badge: "clock" as const }
        : { title: t.unknownTitle, body: t.unknownBody, badge: "xCircle" as const };

  return (
    <AccessShell crumb={es.auth.access.crumbLink}>
      <StateCard illustration="mail" badge={motivo.badge} title={motivo.title} body={motivo.body}>
        <HomeAndHelp signedIn={await hasSession()} />
      </StateCard>
    </AccessShell>
  );
}
