import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { todayInTimeZone } from "@/core/finance";
import { isMenuState, menuTone } from "@/core/menu-states";
import { es } from "@/i18n/es";
import { fechaCorta } from "@/i18n/dates";
import { createClient } from "@/lib/supabase/server";

import { loadEstablishmentTimezone } from "../timezone-load";

import { CopyPreviousMenuForm } from "./CopyPreviousMenuForm";
import { NewMenuForm } from "./NewMenuForm";

/**
 * El Menú Diario del restaurante (Fase 2, Hito 10; RN-MEN-01, RN-MEN-05,
 * RN-MEN-11). Lo que hay: el saldo de actualizaciones del ciclo, sus
 * plantillas, sus menús con estado y fecha, y el formulario de uno nuevo.
 *
 * Todo lo que se lee lo filtra RLS y lo calcula el servidor: el saldo
 * sale de `menu_update_balance()` (suma del libro, nunca un contador),
 * y si no devuelve fila es que el restaurante no tiene el servicio, y se
 * dice el motivo (CA-20) en vez de enseñar ceros.
 */
export const dynamic = "force-dynamic";

const t = es.dailyMenuClient;

type MenuKindKey = keyof typeof es.naming.menuKinds;

export default async function ClientDailyMenuPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code")
    .eq("id", id)
    .maybeSingle();
  if (!establishment) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}`;

  const { data: balanceRows } = await supabase.rpc("menu_update_balance", { p_establishment_id: id });
  const balance = balanceRows?.[0] ?? null;

  if (!balance) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <Header establishment={establishment} base={base} />
        <Card title={t.noServiceTitle}>
          <p className="text-sm text-text-secondary">{t.noServiceReason}</p>
        </Card>
      </div>
    );
  }

  const [{ data: templates }, { data: menus }] = await Promise.all([
    supabase
      .from("menu_templates")
      .select("id, name, origin, archived_at")
      .eq("establishment_id", id)
      .is("archived_at", null)
      .order("created_at"),
    supabase
      .from("menus")
      .select("id, name, kind, target_date, state")
      .eq("establishment_id", id)
      .order("target_date", { ascending: false })
      .limit(60),
  ]);

  // En la zona del espacio (CLAUDE.md): "mañana" para un restaurante de
  // un espacio en otra zona no es el mañana de Restavor.
  const timezone = await loadEstablishmentTimezone(supabase, id);
  const hoy = todayInTimeZone(new Date(), timezone);
  const manana = new Date(`${hoy}T00:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const fechaPorDefecto = manana.toISOString().slice(0, 10);

  // R13 · cuál es "el menú anterior": el más reciente con fecha ANTERIOR a
  // la que se va a preparar. No es simplemente el primero de la lista,
  // porque la lista puede tener menús futuros ya hechos, y copiar uno de
  // ellos llamándolo "el anterior" sería mentir. Se enseña con su nombre y
  // su fecha para que quien copia vea qué está copiando.
  const menuAnterior =
    (menus ?? []).find((menu) => menu.target_date < fechaPorDefecto) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <Header establishment={establishment} base={base} />

      <Card title={t.balanceTitle}>
        <p className="text-lg font-semibold text-primary-dark">
          {t.balanceLine(balance.available, balance.included_updates)}
        </p>
        <p className="text-sm text-text-secondary">{t.balanceRenews(fechaCorta(balance.cycle_end.slice(0, 10)))}</p>
        <p className="mt-2 text-sm text-text-secondary">{t.balanceHint}</p>
      </Card>

      <NewMenuForm
        slug={slug}
        establishmentId={id}
        templates={(templates ?? []).map((tpl) => ({ id: tpl.id, name: tpl.name }))}
        defaultDate={fechaPorDefecto}
      />

      <CopyPreviousMenuForm
        slug={slug}
        establishmentId={id}
        previous={
          menuAnterior === null
            ? null
            : {
                id: menuAnterior.id,
                name: menuAnterior.name,
                target_date: menuAnterior.target_date,
              }
        }
        defaultDate={fechaPorDefecto}
      />

      <Card title={t.menusTitle}>
        {!menus || menus.length === 0 ? (
          <EmptyState title={t.menusEmptyTitle} description={t.menusEmptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {menus.map((menu) => (
              <li key={menu.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`${base}/menu-diario/${menu.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                    {menu.name}
                  </Link>
                  <p className="text-sm text-text-secondary">
                    {t.menuLine(es.naming.menuKinds[menu.kind as MenuKindKey] ?? menu.kind, fechaCorta(menu.target_date))}
                  </p>
                </div>
                <StatusBadge tone={isMenuState(menu.state) ? menuTone(menu.state) : "neutral"}>
                  {isMenuState(menu.state) ? es.naming.states.menu[menu.state] : menu.state}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.templatesTitle}>
        {!templates || templates.length === 0 ? (
          <EmptyState title={t.templatesEmptyTitle} description={t.templatesEmptyReason} />
        ) : (
          <ul className="divide-y divide-border">
            {templates.map((tpl) => (
              <li key={tpl.id} className="flex items-center justify-between gap-2 py-3">
                <span className="font-medium text-text">{tpl.name}</span>
                <span className="text-sm text-text-secondary">
                  {t.templateOrigin[tpl.origin as keyof typeof t.templateOrigin] ?? tpl.origin}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Header({ establishment, base }: { establishment: { name: string; code: string }; base: string }) {
  return (
    <header>
      <p className="text-sm text-text-secondary">
        {establishment.code} · {establishment.name}
      </p>
      <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
      <p className="text-sm text-text-secondary">{t.subtitle}</p>
      <Link href={base} className="mt-2 inline-block text-sm text-primary underline-offset-2 hover:underline">
        {t.back}
      </Link>
    </header>
  );
}
