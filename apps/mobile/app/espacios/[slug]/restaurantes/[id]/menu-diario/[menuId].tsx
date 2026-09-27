import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { canSaveMenuVersion, menuTone, type MenuState } from "@/core/menu-states";

import { Badge, Body, Button, CacheNotice, Card, ErrorBox, Field, Loading, Notice, Screen, Title } from "../../../../../../src/components/ui";
import { es, web } from "../../../../../../src/i18n/es";
import { fromError, must } from "../../../../../../src/lib/api";
import { linesToItems, parseEurosToCents } from "../../../../../../src/lib/format";
import { newIdempotencyKey } from "../../../../../../src/lib/ids";
import { supabase } from "../../../../../../src/lib/supabase";
import { useSpace } from "../../../../../../src/lib/space-context";
import { useAction } from "../../../../../../src/lib/use-action";
import { useLoader } from "../../../../../../src/lib/use-loader";

type MenuDetail = {
  id: string;
  name: string;
  kind: string;
  state: string;
  target_date: string;
  current_version_id: string | null;
  version: { version: number; starters: string[]; mains: string[]; desserts: string[]; drink: string | null; price_cents: number | null; note: string | null } | null;
};

async function loadMenu(menuId: string): Promise<MenuDetail> {
  const { data, error } = await supabase.from("menus").select("id, name, kind, state, target_date, current_version_id").eq("id", menuId).maybeSingle();
  const menu = must(data, error);
  const { data: version } = menu.current_version_id
    ? await supabase.from("menu_versions").select("version, starters, mains, desserts, drink, price_cents, note").eq("id", menu.current_version_id).maybeSingle()
    : { data: null };
  return { ...menu, version: version ?? null };
}

/**
 * §176 · "preparar menú": guardar versión (RN-MEN-03), marcar preparado
 * (RN-MEN-09) y pedir la publicación (RN-MEN-05) con clave de
 * idempotencia. Sin botón "Comenzar" (CLAUDE.md). Sin hora de corte
 * (RN-CRE-24), y el menú del día publicado se cambia editándolo (RN-CRE-30).
 */
export default function ClientMenuDetailScreen() {
  const { menuId } = useLocalSearchParams<{ menuId: string }>();
  const { viewer } = useSpace();
  const detail = useLoader(viewer?.userId ?? null, `menu:${menuId}`, () => loadMenu(String(menuId)), [menuId]);
  if (!viewer || detail.loading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorBox message={detail.error ?? web.states.errorDescription} onRetry={detail.reload} />;
  const m = detail.data;
  const editable = canSaveMenuVersion(m.state as MenuState, m.kind);
  const isClient = viewer.role === "client" || viewer.role === "client_daily_menu";

  return (
    <Screen title={m.name} refreshing={detail.loading} onRefresh={detail.reload}>
      {detail.fromCache ? <CacheNotice fetchedAt={detail.fetchedAt} /> : null}
      <Card>
        <Badge tone={menuTone(m.state as MenuState)}>{web.naming.states.menu[m.state as keyof typeof web.naming.states.menu] ?? m.state}</Badge>
        {m.state === "published" && m.kind === "daily" && isClient ? <Body muted>{es.menu.publishedDailyHint}</Body> : null}
        <Body muted>{m.version ? es.menu.currentVersion(m.version.version) : es.menu.noVersion}</Body>
      </Card>

      {isClient && editable ? <MenuForm key={m.current_version_id ?? "sin-version"} menu={m} reload={detail.reload} /> : null}

      {m.version && !(isClient && editable) ? (
        <Card>
          <Title>{es.menu.currentVersion(m.version.version)}</Title>
          {m.version.starters.map((s) => <Body key={`s-${s}`}>· {s}</Body>)}
          {m.version.mains.map((s) => <Body key={`m-${s}`}>· {s}</Body>)}
          {m.version.desserts.map((s) => <Body key={`d-${s}`}>· {s}</Body>)}
          {m.version.drink ? <Body muted>{m.version.drink}</Body> : null}
        </Card>
      ) : null}
    </Screen>
  );
}

/**
 * El formulario nace con la versión vigente y se vuelve a montar cuando
 * cambia (por la `key` de arriba): así no hay que sincronizar estado en
 * un efecto.
 */
function MenuForm({ menu: m, reload }: { menu: MenuDetail; reload: () => void }) {
  const v = m.version;
  const [starters, setStarters] = useState(v?.starters.join("\n") ?? "");
  const [mains, setMains] = useState(v?.mains.join("\n") ?? "");
  const [desserts, setDesserts] = useState(v?.desserts.join("\n") ?? "");
  const [drink, setDrink] = useState(v?.drink ?? "");
  const [price, setPrice] = useState(v && v.price_cents !== null ? (v.price_cents / 100).toFixed(2).replace(".", ",") : "");
  const [note, setNote] = useState(v?.note ?? "");
  const [publicationKey, setPublicationKey] = useState(newIdempotencyKey("menu-publication"));
  const save = useAction("save_menu_version");
  const prepare = useAction("prepare_menu");
  const publish = useAction("request_menu_publication");

  async function saveVersion() {
    const cents = price.trim() ? parseEurosToCents(price) : null;
    if (price.trim() && cents === null) return void save.run(async () => ({ ok: false, error: es.finance.amountInvalid }));
    await save.run(
      async () => {
        const { data: versionId, error } = await supabase.rpc("save_menu_version", {
          p_menu_id: m.id,
          p_starters: linesToItems(starters),
          p_mains: linesToItems(mains),
          p_desserts: linesToItems(desserts),
          p_drink: drink.trim() || undefined,
          p_price_cents: cents ?? undefined,
          p_note: note.trim() || undefined,
        });
        if (error || !versionId) return fromError(error ?? new Error(web.states.errorDescription));
        return { ok: true };
      },
      reload,
      es.menu.versionSaved,
    );
  }

  return (
    <>
        <Card>
          <Field label={es.menu.startersLabel} value={starters} onChangeText={setStarters} multiline />
          <Field label={es.menu.mainsLabel} value={mains} onChangeText={setMains} multiline />
          <Field label={es.menu.dessertsLabel} value={desserts} onChangeText={setDesserts} multiline />
          <Field label={es.menu.drinkLabel} value={drink} onChangeText={setDrink} />
          <Field label={es.menu.priceLabel} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <Field label={es.menu.noteLabel} value={note} onChangeText={setNote} />
          {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
          {save.notice ? <Notice tone="success">{save.notice}</Notice> : null}
          <Button label={es.menu.saveVersion} pending={save.pending} disabled={!save.enabled} disabledReason={save.disabledReason} onPress={() => void saveVersion()} />
          {m.state === "draft" && m.version ? (
            <>
              {prepare.error ? <Notice tone="danger">{prepare.error}</Notice> : null}
              <Button label={es.menu.prepare} kind="secondary" pending={prepare.pending} disabled={!prepare.enabled} disabledReason={prepare.disabledReason} onPress={() => void prepare.run(async () => fromError((await supabase.rpc("prepare_menu", { p_menu_id: m.id })).error), reload)} />
            </>
          ) : null}
          {m.state === "prepared" ? (
            <>
              {publish.error ? <Notice tone="danger">{publish.error}</Notice> : null}
              {publish.notice ? <Notice tone="success">{publish.notice}</Notice> : null}
              <Button
                label={es.menu.requestPublication}
                pending={publish.pending}
                disabled={!publish.enabled}
                disabledReason={publish.disabledReason}
                onPress={() =>
                  void publish.run(
                    async () => fromError((await supabase.rpc("request_menu_publication", { p_menu_id: m.id, p_idempotency_key: publicationKey })).error),
                    () => { setPublicationKey(newIdempotencyKey("menu-publication")); reload(); },
                    es.menu.publicationRequested,
                  )
                }
              />
            </>
          ) : null}
        </Card>
    </>
  );
}
