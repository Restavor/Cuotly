import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/(auth)/actions";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * F01 y A01 a A12 · la cabecera pública de la puerta de entrada: la marca
 * "Cuotly by Restavor" a la izquierda y, a la derecha, Ayuda, Mi cuenta y
 * Cerrar sesión. Debajo, la miga de pan "Cuotly / …" y la pantalla.
 *
 * **Lo que se enseña a la derecha depende de si hay sesión.** El diseño
 * pinta Mi cuenta y Cerrar sesión en el formulario, pero desde la
 * decisión 41 quien pide acceso no tiene cuenta todavía (RN-ACC-01):
 * ofrecerle "Mi cuenta" sería un enlace que lo manda a entrar con una
 * cuenta que no existe. Sin sesión se pinta lo que pinta A08, que es la
 * vista del diseño sin sesión, más "Iniciar sesión" para quien sí la
 * tiene. "Ayuda" lleva al centro de ayuda, que pide sesión; sin ella no
 * hay ayuda pública a la que mandar y no se pinta un enlace que acabaría
 * en la pantalla de entrar.
 */
export async function AccessShell({
  crumb,
  children,
}: {
  /** El segundo tramo de la miga de pan: "Solicitud de acceso", "Invitación"… */
  crumb?: string;
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = es.auth.access;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link
            href="/"
            className="inline-flex flex-col items-end rounded-lg leading-none focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <span className="text-[30px] font-bold tracking-tight text-primary">{es.common.appName}</span>
            <span className="mt-0.5 text-[11px] font-semibold text-primary-dark">{es.common.appOwner}</span>
          </Link>

          <nav aria-label={es.common.appName} className="flex items-center gap-4 text-[15px] text-text sm:gap-6">
            {user ? (
              <>
                <Link href="/ayuda" className="inline-flex items-center gap-2 hover:text-primary">
                  <Icon name="help" aria-hidden="true" className="h-[22px] w-[22px]" />
                  {t.help}
                </Link>
                <Link href="/cuenta" className="inline-flex items-center gap-2 hover:text-primary">
                  <Icon name="person" aria-hidden="true" className="h-[22px] w-[22px]" />
                  {t.myAccount}
                </Link>
                <span aria-hidden="true" className="h-8 w-px bg-border" />
                <form action={signOut}>
                  <button type="submit" className="hover:text-primary">
                    {t.signOut}
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login" className="inline-flex items-center gap-2 hover:text-primary">
                <Icon name="person" aria-hidden="true" className="h-[22px] w-[22px]" />
                {t.signIn}
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-12 pt-5 sm:px-8 lg:px-[100px]">
        {crumb ? (
          <nav aria-label={t.crumbRoot} className="mb-4 text-[15px] text-text-secondary">
            <Link href="/" className="hover:text-primary">
              {t.crumbRoot}
            </Link>
            <span aria-hidden="true" className="mx-3">
              /
            </span>
            <span aria-current="page">{crumb}</span>
          </nav>
        ) : null}
        {children}
      </main>
    </div>
  );
}
