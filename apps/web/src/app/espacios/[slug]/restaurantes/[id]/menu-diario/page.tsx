import { notFound, redirect } from "next/navigation";

import { Card } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * El Menú Diario visto por el restaurante que lo tiene contratado. La
 * barra de móvil se lo ofrece (`client_daily_menu`, §20.3) y hasta hoy
 * llevaba a un 404.
 *
 * De Fase 1 solo se puede decir la verdad: el servicio existe y se puede
 * contratar (HU-07), pero la herramienta llega en la Fase 2. Se dice, en
 * vez de enseñar un calendario vacío que aparentaría estar esperando
 * datos.
 */
export const dynamic = "force-dynamic";

export default async function ClientDailyMenuPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS decide: un restaurante ajeno no devuelve fila y esto es un 404.
  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code")
    .eq("id", id)
    .maybeSingle();
  if (!establishment) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {establishment.code} · {establishment.name}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.dailyMenuPage.title}</h1>
        <p className="text-sm text-text-secondary">{es.dailyMenuPage.clientSubtitle}</p>
      </header>

      <Card title={es.dailyMenuPage.phaseTitle}>
        <p className="text-sm text-text-secondary">{es.dailyMenuPage.clientPhaseReason}</p>
      </Card>
    </div>
  );
}
