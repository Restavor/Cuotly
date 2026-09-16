import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { invitationSignupStep } from "@/core/access-requests";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";
import { InvitationForm } from "./InvitationForm";

/**
 * RN-ACC-09 · la segunda puerta. El enlace de invitación **ya es** el alta:
 * quien lo recibe pone contraseña y entra, sin pasar por ningún registro.
 *
 * Tres caminos, y los decide `invitationSignupStep()` con lo que contesta
 * `invitation_signup_details()`:
 *
 *   · la invitación vale y ese correo **no** tiene cuenta → contraseña;
 *   · la invitación vale y ese correo **ya** tiene cuenta → entrar, que es
 *     HU-04 vista desde el otro lado (una persona, una cuenta, un correo);
 *   · la invitación no vale → se dice por qué, con su motivo.
 */
export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  /*
    Quien ya ha entrado no pasa por ninguna pantalla: la acepta y se va a
    su espacio, que es lo que hacía esta ruta desde HU-03 y sigue siendo
    lo correcto. Lo que cambia con la decisión 41 es lo de abajo: antes,
    quien NO había entrado se mandaba a `/signup` a registrarse solo, y
    eso ya no existe.
  */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: spaceId, error } = await supabase.rpc("accept_space_invitation", {
      p_token: token,
    });

    if (!error && spaceId) {
      const { data: space } = await supabase
        .from("spaces")
        .select("slug")
        .eq("id", spaceId)
        .maybeSingle();
      redirect(`/espacios/${space?.slug ?? ""}`);
    }
  }

  const { data } = await supabase
    .rpc("invitation_signup_details", { p_token: token })
    .maybeSingle();

  const t = es.auth.invitation;
  const estado = data?.state ?? "unknown";
  const paso = invitationSignupStep(estado, Boolean(data?.has_account));

  if (paso === "set_password" && data?.email) {
    return <InvitationForm token={token} email={data.email} spaceName={data.space_name} />;
  }

  const motivo =
    paso === "sign_in"
      ? { title: t.hasAccountTitle, body: t.hasAccountBody, cta: t.signIn }
      : estado === "expired"
        ? { title: t.expiredTitle, body: t.expiredBody, cta: t.goToLogin }
        : estado === "accepted"
          ? { title: t.acceptedTitle, body: t.acceptedBody, cta: t.goToLogin }
          : estado === "cancelled"
            ? { title: t.cancelledTitle, body: t.cancelledBody, cta: t.goToLogin }
            : { title: t.unknownTitle, body: t.unknownBody, cta: t.goToLogin };

  return (
    <div>
      <Logo />
      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{motivo.title}</h1>
      <p className="mb-7 text-sm text-text-secondary">{motivo.body}</p>
      <Link
        href="/login"
        className="block w-full rounded-[10px] bg-primary px-4 py-2.5 text-center text-[15px] font-semibold text-white"
      >
        {motivo.cta}
      </Link>
    </div>
  );
}
