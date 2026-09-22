import { notFound, redirect } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { CopyPreviousMenuForm } from "../CopyPreviousMenuForm";
import { NewMenuForm } from "../NewMenuForm";
import { loadMenuSection } from "../section-load";

/**
 * R13 · "Crear menú" y "Copiar menú anterior", los dos botones del
 * listado. Son los formularios de siempre (`create_menu()` y
 * `copy_menu()`), en su propia pantalla para que el listado quede como el
 * dibujo.
 */
export const dynamic = "force-dynamic";

const d = es.dailyMenuClient;
const t = es.panelMenus;

export default async function NewClientMenuPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { establishment, balance, timezone } = await loadMenuSection(supabase, id);
  if (!establishment) notFound();

  if (!balance) {
    return (
      <div className="space-y-6">
        <PageHeader title={t.newPageTitle} subtitle={t.newPageSubtitle} />
        <Card title={d.noServiceTitle}>
          <p className="text-sm text-text-secondary">{d.noServiceReason}</p>
        </Card>
      </div>
    );
  }

  const [{ data: templates }, { data: menus }] = await Promise.all([
    supabase
      .from("menu_templates")
      .select("id, name")
      .eq("establishment_id", id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("menus")
      .select("id, name, target_date")
      .eq("establishment_id", id)
      .order("target_date", { ascending: false })
      .limit(60),
  ]);

  // En la zona del espacio (CLAUDE.md): "mañana" para un restaurante de
  // un espacio en otra zona no es el mañana de Restavor.
  const hoy = todayInTimeZone(new Date(), timezone);
  const manana = new Date(`${hoy}T00:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const fechaPorDefecto = manana.toISOString().slice(0, 10);

  // "El menú anterior" es el más reciente con fecha ANTERIOR a la que se
  // va a preparar, no el primero de la lista: puede haber menús futuros ya
  // hechos, y copiar uno de ellos llamándolo "el anterior" sería mentir.
  const menuAnterior = (menus ?? []).find((menu) => menu.target_date < fechaPorDefecto) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={t.newPageTitle} subtitle={t.newPageSubtitle} />
      <div className="grid gap-6 lg:grid-cols-2">
        <NewMenuForm
          slug={slug}
          establishmentId={id}
          templates={(templates ?? []).map((tpl) => ({ id: tpl.id, name: tpl.name }))}
          defaultDate={fechaPorDefecto}
        />
        <section id="copiar" className="scroll-mt-20">
          <CopyPreviousMenuForm slug={slug} establishmentId={id} previous={menuAnterior} defaultDate={fechaPorDefecto} />
        </section>
      </div>
    </div>
  );
}
