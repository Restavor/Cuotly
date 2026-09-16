import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { totalUnread } from "@/core/global-home";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myConversations } from "@/services/global-gateway";

import { signOut } from "../(auth)/actions";
import { GlobalNav, type GlobalNavItem } from "./GlobalNav";

/**
 * El armazón del contexto global (PRD §36, vistas G01 a G08): la zona de
 * Cuotly que ocurre **fuera de todo espacio y de todo panel**.
 *
 * Solo cuelgan de aquí las cinco pantallas de §36. Los espacios
 * (`/espacios/...`), el panel de Administración y la página pública de
 * estado tienen su propio armazón y no pasan por este: el diseño los
 * presenta como contextos distintos, y mezclar las dos barras dejaría a
 * la vista dos navegaciones a la vez.
 *
 * El contador de no leídos se calcula aquí, una vez, y es el MISMO número
 * que enseña la bandeja: si se contara en cada sitio, tarde o temprano
 * dirían cosas distintas (RN-GLO-05, "reúne, no duplica").
 */
export const dynamic = "force-dynamic";

export default async function GlobalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Si la bandeja no se puede leer, la barra sale sin número. Un cero sería
  // afirmar que no hay nada sin saberlo (CLAUDE.md, CA-20).
  const conversaciones = await myConversations(supabase).catch(() => null);

  const t = es.globalContext.nav;
  const items: readonly GlobalNavItem[] = [
    { href: "/inicio", label: t.home },
    { href: "/mis-solicitudes", label: t.requests },
    {
      href: "/mensajes",
      label: t.messages,
      badge: conversaciones === null ? undefined : totalUnread(conversaciones),
    },
    { href: "/cuenta", label: t.account },
    { href: "/ayuda", label: t.help },
  ];

  return (
    <div className="min-h-dvh bg-soft-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:flex-row">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="rounded-[16px] border border-border bg-surface p-4">
            <Link href="/inicio" className="mb-4 block">
              <Logo />
            </Link>
            <GlobalNav items={items} />
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 break-words text-xs text-text-secondary">{user.email}</p>
              <form action={signOut}>
                <Button type="submit" variant="secondary" className="w-full">
                  {es.home.signOut}
                </Button>
              </form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
