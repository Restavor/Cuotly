import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InfoNote } from "@/components/panel/RequestPieces";
import {
  ButtonLink,
  Card,
  EmptyState,
  FilterBar,
  FilterSelect,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { NO_TEMPLATE, filterClientMenus, menuMonths, readClientMenuFilters } from "@/core/client-menus";
import { isMenuState, menuTone } from "@/core/menu-states";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { MenuSectionHeader } from "./MenuSectionHeader";
import { loadMenuSection } from "./section-load";

/**
 * R13 · el Menú Diario del restaurante: el consumo del ciclo arriba a la
 * derecha, los filtros (mes, estado y plantilla), "Crear menú" y "Copiar
 * menú anterior", y la tabla de menús (Fase 2, Hito 10; RN-MEN-01,
 * RN-MEN-05, RN-MEN-11).
 *
 * Todo lo que se lee lo filtra RLS y lo calcula el servidor: el saldo sale
 * de `menu_update_balance()` (suma del libro, nunca un contador), y si no
 * devuelve fila es que el restaurante no tiene el servicio, y se dice el
 * motivo (CA-20) en vez de enseñar ceros.
 *
 * "Última actualización" es la hora de la última versión guardada
 * (`menu_versions`), que es lo que el restaurante entiende por actualizar
 * su menú; un menú sin ninguna lo dice.
 */
export const dynamic = "force-dynamic";

const t = es.panelMenus;
const d = es.dailyMenuClient;

export default async function ClientDailyMenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const filtros = readClientMenuFilters(await searchParams);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { establishment, balance, timezone, cycleLabel } = await loadMenuSection(supabase, id);
  if (!establishment) notFound();

  const base = `/espacios/${slug}/restaurantes/${id}/menu-diario`;

  if (!balance) {
    return (
      <div className="space-y-6">
        <MenuSectionHeader base={base} active="menus" title={d.title} subtitle={t.subtitle} balance={null} cycleLabel={null} />
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
      .select("id, name, kind, target_date, state, template_id, current_version_id")
      .eq("establishment_id", id)
      .order("target_date", { ascending: false })
      .limit(120),
  ]);

  const todos = menus ?? [];
  const filtrados = filterClientMenus(todos, filtros);

  // La hora de la versión vigente de cada menú que se enseña.
  const versionIds = filtrados.map((m) => m.current_version_id).filter((v): v is string => v !== null);
  const { data: versiones } = versionIds.length
    ? await supabase.from("menu_versions").select("id, created_at").in("id", versionIds)
    : { data: [] };
  const guardado = new Map((versiones ?? []).map((v) => [v.id, v.created_at]));

  const nombrePlantilla = new Map((templates ?? []).map((tpl) => [tpl.id, tpl.name]));
  const estados = [...new Set(todos.map((m) => m.state))];
  const hayFiltros = filtros.month !== null || filtros.state !== null || filtros.template !== null;
  // Días sueltos (`date`): `enZona()` los ancla en UTC, que es lo que
  // hace que salga ese día y no el anterior.
  const nombreMes = (mes: string) => enZona(`${mes}-01`, timezone, { month: "long", year: "numeric" });
  const diaCorto = (dia: string) =>
    enZona(dia, timezone, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <MenuSectionHeader
        base={base}
        active="menus"
        title={d.title}
        subtitle={t.subtitle}
        balance={balance}
        cycleLabel={cycleLabel}
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <FilterBar action={base} hasFilters={hayFiltros}>
            <FilterSelect
              id="filtro-mes"
              name="mes"
              label={t.filterMonth}
              allLabel={t.filterMonthAll}
              defaultValue={filtros.month}
              options={menuMonths(todos.map((m) => m.target_date)).map((mes) => ({ value: mes, label: nombreMes(mes) }))}
            />
            <FilterSelect
              id="filtro-estado"
              name="estado"
              label={t.filterState}
              allLabel={t.filterStateAll}
              defaultValue={filtros.state}
              options={estados.map((e) => ({ value: e, label: isMenuState(e) ? es.naming.states.menu[e] : e }))}
            />
            <FilterSelect
              id="filtro-plantilla"
              name="plantilla"
              label={t.filterTemplate}
              allLabel={t.filterTemplateAll}
              defaultValue={filtros.template}
              options={[
                ...(templates ?? []).map((tpl) => ({ value: tpl.id, label: tpl.name })),
                { value: NO_TEMPLATE, label: t.noTemplate },
              ]}
            />
          </FilterBar>
        </div>
        {/* En el teléfono, los dos botones a lo ancho debajo de los filtros
            (PDF móvil, p. 124). Al lado se comían media fila y los filtros
            quedaban uno por línea y cortados. */}
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <ButtonLink href={`${base}/nuevo`} icon="plus">
            {t.createMenu}
          </ButtonLink>
          <ButtonLink href={`${base}/nuevo#copiar`} variant="outline" icon="document">
            {t.copyPrevious}
          </ButtonLink>
        </div>
      </div>

      {todos.length === 0 ? (
        <Card>
          <EmptyState title={d.menusEmptyTitle} description={d.menusEmptyReason} />
        </Card>
      ) : filtrados.length === 0 ? (
        <Card>
          <EmptyState title={t.emptyFilteredTitle} description={t.emptyFilteredReason} />
        </Card>
      ) : (
        <Table
          footer={
            <TableFooter>
              <span>{es.ui.table.showing(filtrados.length, todos.length, t.menusNoun)}</span>
            </TableFooter>
          }
        >
          <TableHead>
            <TableRow>
              <TableHeaderCell>{t.columnDate}</TableHeaderCell>
              <TableHeaderCell>{t.columnTitle}</TableHeaderCell>
              <TableHeaderCell>{t.columnTemplate}</TableHeaderCell>
              <TableHeaderCell>{t.columnState}</TableHeaderCell>
              <TableHeaderCell>{t.columnUpdated}</TableHeaderCell>
              <TableHeaderCell>{t.columnActions}</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtrados.map((menu) => {
              const cuando = menu.current_version_id ? guardado.get(menu.current_version_id) ?? null : null;
              return (
                <TableRow key={menu.id}>
                  <TableCell>{diaCorto(menu.target_date)}</TableCell>
                  <TableCell>
                    <span className="font-medium text-text">{menu.name}</span>
                  </TableCell>
                  <TableCell>
                    {menu.template_id ? (nombrePlantilla.get(menu.template_id) ?? t.noTemplate) : t.noTemplate}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={isMenuState(menu.state) ? menuTone(menu.state) : "neutral"}>
                      {isMenuState(menu.state) ? es.naming.states.menu[menu.state] : menu.state}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {cuando ? (
                      enZona(cuando, timezone, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    ) : (
                      <span className="text-text-secondary">{t.notSaved}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ButtonLink href={`${base}/${menu.id}`} variant="outline" size="sm">
                      {t.view}
                    </ButtonLink>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InfoNote title={t.aboutTitle}>
            <p>{t.aboutBody(balance.included_updates)}</p>
            <Link href={`${base}/servicio`} className="mt-1 inline-flex items-center gap-1 font-semibold text-cuotly-green underline">
              {t.aboutLink}
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </InfoNote>
        </div>
        <Card>
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft-surface text-cuotly-green">
              <Icon name="dailyMenu" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">{t.helpTitle}</p>
              <p className="text-sm text-text-secondary">{t.helpBody}</p>
              <Link
                href={`/espacios/${slug}/restaurantes/${id}/ayuda`}
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-cuotly-green underline"
              >
                {t.helpLink}
                <Icon name="arrowRight" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
