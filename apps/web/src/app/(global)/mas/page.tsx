import Link from "next/link";
import { redirect } from "next/navigation";

import { globalMoreDestinations } from "@/components/shell/navigation";
import { Card } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * §20.3 · el quinto elemento de la barra de móvil, en el contexto global.
 *
 * El espacio ya tenía el suyo (`/espacios/<slug>/mas`). Este es el mismo
 * hueco para §36: sin él, un teléfono en el Inicio global tenía en la barra
 * un destino que era un 404, y "Mi cuenta" y "Ayuda" —que en escritorio
 * están en la barra lateral— no se alcanzaban desde ningún sitio.
 *
 * No tiene contenido propio a propósito: enseña exactamente lo que
 * `globalMoreDestinations()` deja fuera de la barra, derivado de las mismas
 * listas que pintan el menú lateral. Escribir aquí una tercera lista a mano
 * sería la tercera que se queda desfasada.
 */
export const dynamic = "force-dynamic";

export default async function GlobalMorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const destinos = globalMoreDestinations();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{es.morePage.title}</h1>
        <p className="text-sm text-text-secondary">{es.morePage.subtitle}</p>
      </header>

      <Card>
        <nav aria-label={es.morePage.title}>
          <ul className="divide-y divide-border">
            {destinos.map((destino) => (
              <li key={destino.key}>
                <Link href={destino.href} className="block py-3 text-cuotly-green underline">
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
