import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui";
import { moreDestinations } from "@/components/shell/navigation";
import { resolveShellViewer } from "@/components/shell/viewer";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * §20.3 · el sexto elemento de la barra de móvil.
 *
 * No tiene contenido propio a propósito: enseña exactamente lo que
 * `moreDestinations()` deja fuera de los cinco, derivado de las mismas dos
 * listas que pintan el menú y la barra. Escribir aquí una tercera lista a
 * mano sería la tercera que se queda desfasada.
 *
 * Es la última pieza que le faltaba a CA-19 en móvil: sin esta pantalla, un
 * trabajador con el teléfono no tenía forma de llegar a Finanzas, al
 * calendario ni a sus sesiones — la barra le daba cinco destinos y el
 * sexto era un 404.
 */
export const dynamic = "force-dynamic";

export default async function MorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { role, establishmentId } = await resolveShellViewer(supabase, user.id, slug);
  const destinos = moreDestinations(slug, role, establishmentId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.morePage.title}</h1>
        <p className="text-sm text-text-secondary">{es.morePage.subtitle}</p>
      </header>

      <Card>
        <nav aria-label={es.morePage.title}>
          <ul className="divide-y divide-border">
            {destinos.map((destino) => (
              <li key={destino.key}>
                <Link
                  href={destino.href}
                  className="block py-3 text-cuotly-green underline"
                >
                  {destino.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Card>
    </div>
  );
}
