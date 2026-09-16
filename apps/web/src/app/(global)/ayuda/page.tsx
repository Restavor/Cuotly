import { redirect } from "next/navigation";

import { HelpCenter } from "@/components/help/HelpCenter";
import type { ShellRole } from "@/components/shell/navigation";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";
import { myContexts } from "@/services/global-gateway";

/**
 * G06 · la Ayuda global (RN-GLO-07): el centro de ayuda de RN-SOP visto
 * desde fuera de los espacios. Los artículos son los mismos
 * (`help_articles`), y el componente también: dos copias del buscador
 * acabarían enseñando dos catálogos.
 *
 * Abrir una incidencia sí necesita un espacio detrás —una incidencia es de
 * un espacio y va con su prioridad (RN-SOP-03)—. Con un solo espacio se
 * pasa ese, que es lo que la persona esperaría; con varios no se elige por
 * ella, y la pantalla dice por dónde abrirla en vez de ofrecer un botón que
 * el servidor rechazaría.
 */
export const dynamic = "force-dynamic";

export default async function GlobalHelpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contextos = await myContexts(supabase).catch(() => []);
  const espacios = contextos.filter((c) => c.kind === "space");
  const t = es.globalContext.help;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <HelpCenter
        supabase={supabase}
        role={rolDeGuias(espacios)}
        base="/ayuda"
        spaceId={espacios.length === 1 ? espacios[0].space_id : null}
        consulta={(q ?? "").trim()}
      />

      {espacios.length !== 1 ? (
        <p className="text-sm text-text-secondary">{t.incidentNeedsSpace}</p>
      ) : null}
    </div>
  );
}

/**
 * Con qué papel se ordenan las guías. NO es un permiso: `HelpCenter`
 * pregunta por separado quién puede abrir una incidencia
 * (`has_capability(..., 'contact_cuotly')`). Esto solo decide qué guía sale
 * primero, así que con varios espacios se toma el rol del primero en vez de
 * inventar una mezcla.
 */
function rolDeGuias(espacios: readonly { role: string | null }[]): ShellRole {
  const rol = espacios[0]?.role;
  return rol === "owner" || rol === "admin" || rol === "worker" ? rol : "client";
}
