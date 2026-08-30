import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { es } from "@/i18n/es";

/**
 * Enlace de invitación (HU-03). Si la persona no ha iniciado sesión
 * todavía, primero se registra o entra, y vuelve aquí — el token no
 * caduca por eso. Una vez dentro, acepta la invitación llamando a
 * accept_space_invitation(), que comprueba que el correo coincide y que
 * el token sigue vigente (RN-DAT-09: todo en una transacción).
 */
export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/signup?invitacion=${token}`);
  }

  const { data: spaceId, error } = await supabase.rpc("accept_space_invitation", {
    p_token: token,
  });

  if (error || !spaceId) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-danger">{es.invitations.invalid}</p>
      </main>
    );
  }

  const { data: space } = await supabase.from("spaces").select("slug").eq("id", spaceId).single();

  redirect(`/espacios/${space?.slug ?? ""}`);
}
