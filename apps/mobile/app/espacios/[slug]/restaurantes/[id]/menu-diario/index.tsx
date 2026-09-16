import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { MENU_KINDS, type MenuKind } from "@/core/daily-menu";
import { menuTone, type MenuState } from "@/core/menu-states";

import { Badge, Body, Button, CacheNotice, Card, Choice, Empty, ErrorBox, Field, Loading, Notice, Screen, Title } from "../../../../../../src/components/ui";
import { es, web } from "../../../../../../src/i18n/es";
import { must } from "../../../../../../src/lib/api";
import { dayOf } from "../../../../../../src/lib/format";
import { supabase } from "../../../../../../src/lib/supabase";
import { useSpace } from "../../../../../../src/lib/space-context";
import { useAction } from "../../../../../../src/lib/use-action";
import { useLoader } from "../../../../../../src/lib/use-loader";

type MenusPage = {
  menus: { id: string; name: string; kind: string; target_date: string; state: string }[];
  templates: { id: string; name: string }[];
  balance: { available: number; included_updates: number } | null;
};

async function loadMenus(establishmentId: string): Promise<MenusPage> {
  const [{ data: menus, error }, { data: templates }, { data: balance }] = await Promise.all([
    supabase.from("menus").select("id, name, kind, target_date, state").eq("establishment_id", establishmentId).order("target_date", { ascending: false }).limit(40),
    supabase.from("menu_templates").select("id, name, archived_at").eq("establishment_id", establishmentId).is("archived_at", null),
    supabase.rpc("menu_update_balance", { p_establishment_id: establishmentId }),
  ]);
  return {
    menus: must(menus, error),
    templates: (templates ?? []).map((t) => ({ id: t.id, name: t.name })),
    balance: balance && balance.length > 0 ? balance[0] : null,
  };
}

function tomorrowIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** §176 · "preparar menú": la lista de menús y crear uno (`create_menu`). */
export default function ClientMenusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { viewer } = useSpace();
  const router = useRouter();
  const establishmentId = String(id);
  const page = useLoader(viewer?.userId ?? null, `menus:${establishmentId}`, () => loadMenus(establishmentId), [establishmentId]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MenuKind>("daily");
  const [date, setDate] = useState(tomorrowIso());
  const [template, setTemplate] = useState<string | null>(null);
  const create = useAction("save_menu_version");
  if (!viewer) return <Loading />;

  return (
    <Screen title={es.menu.title} refreshing={page.loading} onRefresh={page.reload}>
      {page.fromCache ? <CacheNotice fetchedAt={page.fetchedAt} /> : null}
      {page.error ? <ErrorBox message={page.error} onRetry={page.reload} /> : null}
      {page.data?.balance ? <Body muted>{es.menu.balance(page.data.balance.available, page.data.balance.included_updates)}</Body> : null}

      <Card>
        <Title>{es.menu.newMenu}</Title>
        <Field label={es.menu.nameLabel} value={name} onChangeText={setName} />
        <Choice label={es.menu.kindLabel} options={MENU_KINDS.map((k) => ({ value: k, label: web.naming.menuKinds[k] }))} value={kind} onChange={setKind} />
        <Field label={es.menu.dateLabel} value={date} onChangeText={setDate} autoCapitalize="none" />
        {page.data && page.data.templates.length > 0 ? (
          <Choice label={es.menu.templateLabel} options={[{ value: "", label: es.menu.noTemplate }, ...page.data.templates.map((t) => ({ value: t.id, label: t.name }))]} value={template ?? ""} onChange={(v) => setTemplate(v || null)} />
        ) : null}
        {create.error ? <Notice tone="danger">{create.error}</Notice> : null}
        <Button
          label={es.menu.newMenu}
          pending={create.pending}
          disabled={!create.enabled || name.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          disabledReason={create.disabledReason}
          onPress={() =>
            void create.run(async () => {
              const { data, error } = await supabase.rpc("create_menu", { p_establishment_id: establishmentId, p_name: name.trim(), p_kind: kind, p_target_date: date, p_template_id: template ?? undefined });
              if (error || !data) return { ok: false, error: error?.message ?? web.states.errorDescription };
              router.push(`/espacios/${viewer.slug}/restaurantes/${establishmentId}/menu-diario/${data}` as never);
              return { ok: true };
            }, page.reload)
          }
        />
      </Card>

      {page.data && page.data.menus.length === 0 ? <Empty>{es.menu.empty}</Empty> : null}
      {(page.data?.menus ?? []).map((m) => (
        <Card key={m.id} onPress={() => router.push(`/espacios/${viewer.slug}/restaurantes/${establishmentId}/menu-diario/${m.id}` as never)} testID={`menu-${m.id}`}>
          <Title>{m.name}</Title>
          <Badge tone={menuTone(m.state as MenuState)}>{web.naming.states.menu[m.state as keyof typeof web.naming.states.menu] ?? m.state}</Badge>
          <Body muted>
            {web.naming.menuKinds[m.kind as keyof typeof web.naming.menuKinds] ?? m.kind} · {dayOf(m.target_date, viewer.timezone)}
          </Body>
        </Card>
      ))}
    </Screen>
  );
}
