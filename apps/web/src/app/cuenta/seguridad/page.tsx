import Link from "next/link";
import { redirect } from "next/navigation";

import { ErrorState } from "@/components/ui";
import { twoFactorPolicyFor, type PlatformAccess } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myPlatformAccess } from "@/services/platform-gateway";

import { TwoFactorSetup } from "./TwoFactorSetup";

/**
 * §136, RN-ADM-02 · activar o desactivar la verificación en dos pasos. La
 * política se dice con las palabras de §136 según quién mira: obligatoria
 * para la plataforma, recomendada para propietarios y administradores de
 * espacio, opcional para el resto. Lo que la hace obligatoria de verdad
 * no está aquí: está en `is_platform_owner()`.
 */
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let access: PlatformAccess;
  try {
    access = await myPlatformAccess(supabase);
  } catch (fallo) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <ErrorState
          title={es.twoFactor.errorTitle}
          description={fallo instanceof Error ? fallo.message : es.twoFactor.loadError}
        />
      </main>
    );
  }

  // El rol de espacio más alto que tiene, para elegir la frase de §136.
  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active");
  const roles = new Set((memberships ?? []).map((m) => m.role));
  const spaceRole = roles.has("owner") ? "owner" : roles.has("admin") ? "admin" : roles.has("worker") ? "worker" : null;
  const policy = twoFactorPolicyFor(access, spaceRole);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <p className="text-sm">
        <Link href="/" className="text-cuotly-green underline">
          {es.twoFactor.backHome}
        </Link>
        {" · "}
        <Link href="/cuenta/sesiones" className="text-cuotly-green underline">
          {es.twoFactor.sessionsLink}
        </Link>
        {" · "}
        {/* §141 · RN-CIC-12 · qué impide cerrar la cuenta. */}
        <Link href="/cuenta/cerrar" className="text-cuotly-green underline">
          {es.closeAccount.title}
        </Link>
      </p>
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.twoFactor.title}</h1>
        <p className="text-sm text-text-secondary">{es.twoFactor.subtitle}</p>
        <p className="mt-2 text-sm font-medium text-text">{es.twoFactor.policy[policy]}</p>
      </header>

      <TwoFactorSetup sessionVerified={access.twoFactor} />
    </main>
  );
}
