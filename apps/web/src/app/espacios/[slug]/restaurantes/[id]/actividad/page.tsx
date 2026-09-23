import { notFound, redirect } from "next/navigation";

import { monthRange, readActivityParams } from "@/core/client-activity";
import { todayInTimeZone } from "@/core/finance";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";
import { ActivityView } from "./ActivityView";

/**
 * R41 · Inicio (Actividad e historial): lo que ha pasado en el restaurante
 * mes a mes.
 *
 * Los hechos los da `client_activity()` (migración 128): la fecha de cada
 * hecho en su tabla, sin ninguna identidad (P7) y con la visibilidad de
 * cada tabla, así que quien no tiene "Ver facturación" no ve cobros ni
 * pagos (RN-FIN-07). El mes se corta en la zona del espacio (CLAUDE.md).
 * Aquí solo se pinta.
 *
 * Lo que el dibujo pone y aquí NO está: "Evidencia pública", la captura de
 * la web con "Ver en la web". Ningún hecho lleva una imagen de la web
 * publicada que el restaurante pueda leer, y enseñar una foto cualquiera
 * sería inventarla. Tampoco "Datos de ejemplo": esto son sus datos.
 */
export const dynamic = "force-dynamic";

export default async function ClientActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: establishment }, zona] = await Promise.all([
    supabase.from("establishments").select("id").eq("id", id).maybeSingle(),
    loadEstablishmentTimezone(supabase, id),
  ]);
  if (!establishment) notFound();

  const hoy = todayInTimeZone(new Date(), zona);
  const q = readActivityParams(await searchParams, hoy);
  const { from, to } = monthRange(q.month, zona);

  const { data, error } = await supabase.rpc("client_activity", {
    p_establishment_id: id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  return (
    <ActivityView
      items={data ?? []}
      failed={error !== null}
      params={q}
      timeZone={zona}
      slug={slug}
      base={`/espacios/${slug}/restaurantes/${id}`}
      today={hoy}
    />
  );
}
