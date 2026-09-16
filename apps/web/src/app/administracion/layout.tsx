import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, Card, ErrorState, NoPermissionState } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { canReadPanel, isPlatformPerson, platformNeedsTwoFactor } from "@/core/platform-admin";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myPlatformAccess } from "@/services/platform-gateway";

import { signOut } from "../(auth)/actions";

/**
 * El armazón del panel de Administración de Cuotly (§128, RN-ADM-01/02).
 *
 * Aquí hay UNA comprobación, y es cortesía: `my_platform_access()` dice si
 * quien mira es de Cuotly y si su sesión ha pasado el segundo paso, y con
 * eso se decide qué pintar —el panel, "no es para ti" o "te falta la 2FA"—.
 * Lo que decide de verdad es cada función del panel, que vuelve a
 * preguntar con la cerradura puesta (`is_platform_member()`): sin 2FA,
 * ninguna responde, aunque alguien llegue aquí por URL.
 *
 * Es un armazón propio y no el del espacio: la plataforma no está en
 * ningún espacio, y los catorce destinos de §20.2 no significan nada aquí.
 */
export const dynamic = "force-dynamic";

const NAV = [
  { key: "overview", href: "/administracion", label: es.platformAdmin.nav.overview },
  { key: "access", href: "/administracion/accesos", label: es.platformAdmin.nav.access },
  { key: "requests", href: "/administracion/solicitudes", label: es.platformAdmin.nav.requests },
  { key: "spaces", href: "/administracion/espacios", label: es.platformAdmin.nav.spaces },
  { key: "charges", href: "/administracion/cobros", label: es.platformAdmin.nav.charges },
  { key: "users", href: "/administracion/usuarios", label: es.platformAdmin.nav.users },
  { key: "support", href: "/administracion/soporte", label: es.platformAdmin.nav.support },
  { key: "incidents", href: "/administracion/incidencias", label: es.platformAdmin.nav.incidents },
  { key: "status", href: "/administracion/estado", label: es.platformAdmin.nav.status },
  { key: "audit", href: "/administracion/auditoria", label: es.platformAdmin.nav.audit },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let access;
  try {
    access = await myPlatformAccess(supabase);
  } catch (fallo) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <ErrorState
          title={es.platformAdmin.loadErrorTitle}
          description={fallo instanceof Error ? fallo.message : String(fallo)}
        />
      </main>
    );
  }

  if (!isPlatformPerson(access)) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <NoPermissionState
          title={es.platformAdmin.noAccessTitle}
          description={es.platformAdmin.noAccessReason}
          action={
            <Link href="/" className="text-sm text-cuotly-green underline">
              {es.platformAdmin.switchSpace}
            </Link>
          }
        />
      </main>
    );
  }

  if (platformNeedsTwoFactor(access) || !canReadPanel(access)) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <Card title={es.platformAdmin.twoFactorRequiredTitle}>
          <p className="mb-4 text-sm text-text-secondary">{es.platformAdmin.twoFactorRequiredReason}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/cuenta/seguridad" className="inline-flex items-center justify-center rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark focus:outline focus:outline-2 focus:outline-cuotly-green">
              {es.platformAdmin.twoFactorRequiredAction}
            </Link>
            <Link href="/cuenta/verificar" className="inline-flex items-center justify-center rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-soft-surface focus:outline focus:outline-2 focus:outline-cuotly-green">
              {es.platformAdmin.twoFactorChallengeAction}
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text">
      <header className="border-b border-border bg-primary-dark px-4 py-3 text-surface lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <Link href="/administracion" className="mr-auto">
            <span className="block text-lg font-bold leading-none tracking-tight">{es.common.appName}</span>
            <span className="block text-xs text-sidebar-text">{es.platformAdmin.title}</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-field border border-sidebar-border px-3 py-1.5 text-xs font-medium text-sidebar-text hover:text-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <Icon name="switchSpace" className="h-3.5 w-3.5" />
            {es.platformAdmin.switchSpace}
          </Link>
          <span className="text-xs text-sidebar-text">{user.email}</span>
          <form action={signOut}>
            <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs">
              {es.home.signOut}
            </Button>
          </form>
        </div>
        <nav aria-label={es.platformAdmin.title} className="mx-auto mt-3 max-w-7xl">
          <ul className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="block rounded-field px-3 py-1.5 text-sm text-sidebar-text hover:bg-sidebar-raised hover:text-surface focus:outline focus:outline-2 focus:outline-cuotly-green"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="contenido" className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
