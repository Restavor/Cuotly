import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, NoPermissionState } from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { AddHolidayForm } from "../CalendarForms";

/**
 * HU-32 · configurar festivos y cierres del espacio, con auditoría. Es el
 * destino "Añadir un festivo" del botón Crear (§20.5).
 *
 * La auditoría no la escribe la pantalla ni la acción: la escribe un
 * trigger sobre `holidays` desde la migración 16, para que el dato no
 * pueda entrar sin ella por ningún camino.
 *
 * No hay pantalla para editar ni borrar un festivo, y no es un olvido:
 * RN-CLK-10 dice que un cambio de festivos no recalcula hacia atrás
 * contadores ya en curso, así que la tabla solo admite INSERT y SELECT.
 */
export const dynamic = "force-dynamic";

export default async function NewHolidayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: puedeFestivos } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_holidays",
  });

  const hoy = todayInTimeZone(new Date(), space.timezone);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-primary-dark">{es.calendar.newHolidayTitle}</h1>

      {puedeFestivos === true ? (
        <Card title={es.calendar.newHolidayTitle} className="space-y-3">
          <p className="text-sm text-text-secondary">{es.calendar.newHolidayIntro}</p>
          <AddHolidayForm spaceId={space.id} defaultDay={hoy} />
        </Card>
      ) : (
        <NoPermissionState />
      )}

      <Link href={`/espacios/${space.slug}/calendario`} className="text-sm text-cuotly-green underline">
        {es.calendar.back}
      </Link>
    </div>
  );
}
