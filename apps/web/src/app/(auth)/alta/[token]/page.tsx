import Link from "next/link";
import { Logo } from "@/components/Logo";
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
    return <SetupForm token={token} email={data.email} name={data.contact_name} />;
  }

  const motivo =
    estado === "used"
      ? { title: t.usedTitle, body: t.usedBody }
      : estado === "expired"
        ? { title: t.expiredTitle, body: t.expiredBody }
        : { title: t.unknownTitle, body: t.unknownBody };

  return (
    <div>
      <Logo />
      <h1 className="mb-1.5 text-2xl font-bold text-primary-dark">{motivo.title}</h1>
      <p className="mb-7 text-sm text-text-secondary">{motivo.body}</p>
      <Link
        href="/login"
        className="block w-full rounded-[10px] bg-primary px-4 py-2.5 text-center text-[15px] font-semibold text-white"
      >
        {t.goToLogin}
      </Link>
    </div>
  );
}
