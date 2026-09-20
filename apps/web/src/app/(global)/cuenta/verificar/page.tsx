import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { TwoFactorChallenge } from "./TwoFactorChallenge";

/**
 * §137, RN-ADM-02 · el segundo paso en cada inicio de sesión. Quien tiene
 * la 2FA activada llega aquí desde `proxy.ts` mientras su sesión sea
 * `aal1`, y no ve ninguna otra pantalla hasta pasarlo.
 */
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel === "aal2") redirect("/");
  if (aal && aal.nextLevel !== "aal2") redirect("/cuenta/seguridad");

  return (
    /*
      Un `div` y no una región principal propia: esa la abre el armazón, y
      dos anidadas son HTML inválido y dos destinos para el atajo "Saltar al
      contenido" (CA-22).

      Sigue siendo la misma pantalla de paso —el degradado y la tarjeta
      centrada—, pero ya no se estira a la altura de la ventana: ahora vive
      dentro del contenido, que es quien pone el alto.
    */
    <div className="flex items-center justify-center rounded-card bg-[radial-gradient(circle_at_50%_30%,var(--color-primary)_0%,var(--color-primary-dark)_45%,var(--color-primary-darkest)_100%)] p-6 py-16">
      <div className="w-full max-w-md rounded-[20px] bg-surface p-10 shadow-[0_30px_60px_-20px_rgba(5,21,16,0.5)]">
        <Logo />
        <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{es.twoFactor.challengeTitle}</h1>
        <p className="mb-7 text-sm text-text-secondary">{es.twoFactor.challengeSubtitle}</p>
        <TwoFactorChallenge />
      </div>
    </div>
  );
}
