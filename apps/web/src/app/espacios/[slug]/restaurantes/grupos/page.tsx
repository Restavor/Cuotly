import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, EmptyState, NoPermissionState, StatusBadge } from "@/components/ui";
import type { EstablishmentState } from "@/core/naming";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * M82 · los grupos de restaurantes del espacio: el grupo, quién tiene
 * acceso a todo él y los restaurantes que cuelgan.
 *
 * Los grupos existían en la base desde la migración 3 y no tenían pantalla:
 * se veían de refilón, como una columna del listado y como un desplegable
 * del filtro. Esto es la vista del grupo entero, que es como se mira un
 * cliente con siete locales.
 *
 * **Aquí no se crea un grupo.** Un grupo nace con su primer restaurante
 * —`create_establishment_with_data()` lo crea al escribir un nombre nuevo—,
 * y un grupo vacío no es nada. Inventar aquí un botón "crear grupo" sería
 * inventar una regla que el PRD no tiene; la pantalla lo dice en vez de
 * callarlo.
 *
 * **Tampoco se da acceso desde aquí**, aunque las dos funciones de grupo
 * existan (RN-EST-04). Dar acceso ya vive en la ficha del restaurante, con
 * sus cuatro casos juntos, y una segunda puerta a lo mismo es la manera de
 * que un día digan cosas distintas. Desde aquí se llega a ella.
 *
 * Qué grupos y qué restaurantes se ven lo decide RLS. Un trabajador ve los
 * de sus restaurantes autorizados; el cliente no llega aquí.
 */
export const dynamic = "force-dynamic";

const t = es.teamArea.groups;

function statusTone(status: EstablishmentState): "success" | "warning" | "danger" | "neutral" {
  if (status === "active") return "success";
  if (status === "suspended" || status === "archived") return "danger";
  if (status === "paused" || status === "ending" || status === "read_only") return "warning";
  return "neutral";
}

type GroupRoleKey = keyof typeof t.roles;

export default async function SpaceGroupsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const { data: isMember } = await supabase.rpc("is_space_member", { p_space_id: space.id });
  if (!isMember) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState />
      </div>
    );
  }

  const base = `/espacios/${slug}/restaurantes`;

  const [{ data: groups }, { data: establishments }] = await Promise.all([
    supabase.from("groups").select("id, name").eq("space_id", space.id).order("name"),
    supabase
      .from("establishments")
      .select("id, code, name, status, group_id")
      .eq("space_id", space.id)
      .order("code"),
  ]);

  const groupIds = (groups ?? []).map((group) => group.id);

  // Quién tiene acceso a TODO el grupo (RN-EST-03 el propietario global,
  // RN-EST-04 el editor de grupo). Las retiradas no cuentan: `revoked_at`
  // no se borra —no se borra nada— pero un acceso retirado no es un acceso.
  const { data: memberships } = groupIds.length
    ? await supabase
        .from("group_memberships")
        .select("id, group_id, user_id, role")
        .in("group_id", groupIds)
        .is("revoked_at", null)
    : { data: [] };

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };

  const personName = new Map(
    (people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email] as const),
  );

  const byGroup = new Map<string, typeof establishments>();
  for (const establishment of establishments ?? []) {
    byGroup.set(establishment.group_id, [
      ...(byGroup.get(establishment.group_id) ?? []),
      establishment,
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      {(groups ?? []).length === 0 ? (
        <Card>
          <EmptyState title={t.emptyTitle} description={t.emptyReason} />
        </Card>
      ) : (
        (groups ?? []).map((group) => {
          const suyos = byGroup.get(group.id) ?? [];
          const accesos = (memberships ?? []).filter((m) => m.group_id === group.id);

          return (
            <Card key={group.id} title={group.name}>
              <p className="mb-3 text-sm text-text-secondary">{t.count(suyos.length)}</p>

              <h3 className="mb-2 text-sm font-semibold text-text">{t.accessTitle}</h3>
              {accesos.length === 0 ? (
                <p className="mb-4 text-sm text-text-secondary">{t.accessNone}</p>
              ) : (
                <ul className="mb-4 space-y-1 text-sm">
                  {accesos.map((acceso) => (
                    <li key={acceso.id} className="text-text">
                      {personName.get(acceso.user_id) ?? t.personUnknown}
                      {" · "}
                      <span className="text-text-secondary">
                        {t.roles[acceso.role as GroupRoleKey] ?? acceso.role}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="mb-2 text-sm font-semibold text-text">{t.establishmentsTitle}</h3>
              {suyos.length === 0 ? (
                <p className="text-sm text-text-secondary">{t.establishmentsNone}</p>
              ) : (
                <ul className="space-y-2">
                  {suyos.map((establishment) => (
                    <li
                      key={establishment.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        href={`${base}/${establishment.id}`}
                        className="text-cuotly-green underline"
                      >
                        {establishment.code} · {establishment.name}
                      </Link>
                      <StatusBadge
                        tone={statusTone(establishment.status as EstablishmentState)}
                      >
                        {es.naming.states.establishment[
                          establishment.status as EstablishmentState
                        ] ?? establishment.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}

      <Card title={t.howTitle}>
        <p className="text-sm text-text-secondary">{t.howBorn}</p>
        <p className="mt-2 text-sm text-text-secondary">{t.howAccess}</p>
      </Card>

      <p>
        <Link href={base} className="text-cuotly-green underline">
          {t.backToList}
        </Link>
      </p>
    </div>
  );
}
