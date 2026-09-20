import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RevokeAccessButton } from "@/components/establishment/RevokeAccessButton";
import { Card } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { PermissionsForm } from "./PermissionsForm";
import { InvitationRow } from "./InvitationRow";
import { InvitePanelForm } from "./InvitePanelForm";
import {
  CLIENT_PERMISSIONS,
  loadPanelInvitations,
  loadPanelUsers,
  type PanelUser,
} from "./users-load";

/**
 * Páginas 152 y 153 del diseño definitivo móvil · "Usuarios y accesos"
 * del panel del restaurante (RN-EST-15/16/17, decisiones 51 y 52).
 *
 * Quién entra en este restaurante, con qué rol y qué puede hacer cada
 * uno. Dos roles —Propietario y Editor— y siete casillas sobre el Editor.
 *
 * **Lo que esta pantalla NO decide.** Ni una cosa. Quién puede leer esta
 * lista lo contesta `establishment_panel_users()`; quién puede cambiar
 * una casilla, `set_establishment_permissions()`; quién puede retirar un
 * acceso, `assert_can_manage_access()` dentro de
 * `revoke_establishment_access()`. Aquí solo se pinta, y pintar de más
 * enseñaría un botón que el servidor rechaza, no un permiso concedido
 * (CLAUDE.md).
 *
 * **Quién se puede editar y quién no**, y por qué:
 *
 *   · Al **Propietario** no se le configuran los permisos: los tiene
 *     todos por su rol (RN-EST-15). Si se le pudiera quitar "Usuarios y
 *     accesos", su restaurante se quedaría sin nadie dentro que pudiera
 *     devolvérselo.
 *   · Un acceso que viene del **grupo** no cuelga de este restaurante
 *     (migración 74), así que tampoco se toca desde aquí.
 *
 * **La pestaña "Invitar usuario" de la página 153 ya está** (RN-ACC-13,
 * decisión 59). Hasta el 20/09/2026 no existía, porque crear una cuenta
 * nueva desde aquí era una tercera puerta de alta y `CLAUDE.md` no deja
 * improvisar una. Bosco la decidió: el restaurante invita y el equipo
 * aprueba.
 *
 * Un solo formulario para los dos casos, porque quien lo rellena no tiene
 * por qué saber cuál le toca: si ese correo ya tiene cuenta entra en el
 * momento, y si no, se crea una invitación. Lo decide el servidor.
 */
export const dynamic = "force-dynamic";

function rolName(user: PanelUser): string {
  const roles = es.establishmentSheet.clientRoles;
  return roles[user.role as keyof typeof roles] ?? user.role;
}

export default async function PanelUsersPage({
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
    .select("id, name, group_id, space_id")
    .eq("id", id)
    .maybeSingle();
  if (!establishment) notFound();

  // Decide qué se PINTA y nada más. El servidor lo vuelve a comprobar en
  // cada una de las tres funciones que esta pantalla puede llamar.
  const [{ data: puedeGestionar }, users, invitations, { data: esDelEquipo }] = await Promise.all([
    supabase.rpc("client_can_manage_users", { p_establishment_id: id }),
    loadPanelUsers(supabase, id),
    loadPanelInvitations(supabase, id),
    // RN-PAN-14 · quién ve los botones de aprobar y rechazar. Es lo que se
    // PINTA: quién puede de verdad lo decide
    // `review_establishment_invitation()`, que rechaza a cualquiera sin
    // `manage_clients` aunque llame a mano.
    supabase.rpc("has_capability", {
      p_space_id: establishment.space_id,
      p_capability: "manage_clients",
    }),
  ]);
  const gestiona = puedeGestionar === true;
  const revisa = esDelEquipo === true;
  const t = es.panelUsers;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{establishment.name}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t.hint}</p>
      </header>

      <Card title={t.listTitle}>
        {users.failed ? (
          <p className="text-sm text-danger">{t.failed}</p>
        ) : (
          <ul className="divide-y divide-border">
            {users.rows.map((row) => {
              const nombre = row.displayName ?? es.establishmentSheet.noName;
              const esPropietario = row.role === "local_owner";
              const delGrupo = row.source === "group";
              const concedidos = CLIENT_PERMISSIONS.filter((name) => row.permissions[name]);

              return (
                <li key={`${row.source}-${row.userId}`} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-text">{nombre}</span>
                    <span className="text-xs text-cuotly-green">{t.active}</span>
                  </div>

                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-text-secondary">{t.roleLabel}</dt>
                    <dd className="text-text">{rolName(row)}</dd>
                    <dt className="text-text-secondary">{t.emailLabel}</dt>
                    <dd className="text-text">{row.email}</dd>
                    <dt className="text-text-secondary">{t.scopeLabel}</dt>
                    <dd className="text-text">
                      {delGrupo ? t.scopeGroup : establishment.name}
                    </dd>
                    <dt className="text-text-secondary">{t.permissionsLabel}</dt>
                    <dd className="text-text">
                      {esPropietario ? (
                        t.ownerAll
                      ) : concedidos.length === 0 ? (
                        // CLAUDE.md · no es un hueco: es que todavía no
                        // tiene ninguno, y eso se dice con palabras.
                        <span className="text-text-secondary">{t.noneYet}</span>
                      ) : (
                        <ul>
                          {concedidos.map((name) => (
                            <li key={name}>{t.permissions[name]}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </dl>

                  {gestiona && !esPropietario && !delGrupo ? (
                    <>
                      <PermissionsForm
                        establishmentId={id}
                        userId={row.userId}
                        personName={nombre}
                        current={row.permissions}
                      />
                      <RevokeAccessButton
                        userId={row.userId}
                        source="establishment"
                        establishmentId={id}
                        groupId={establishment.group_id ?? ""}
                        personName={nombre}
                      />
                    </>
                  ) : gestiona && esPropietario ? (
                    <p className="text-xs text-text-secondary">{t.ownerNotEditable}</p>
                  ) : gestiona && delGrupo ? (
                    <p className="text-xs text-text-secondary">{t.groupNotEditable}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/*
        Página 152 · el aviso que el diseño pone bajo la lista. Se enseña
        a todos, tengan o no el permiso: a quien lo tiene le dice dónde
        está el límite, y a quien no, por qué no ve los botones.
      */}
      <Card title={t.onlyOwnerTitle}>
        <p className="text-sm text-text-secondary">{t.onlyOwnerHint}</p>
      </Card>

      {/*
        RN-ACC-13 · invitar. Solo se pinta a quien puede gestionar accesos;
        a quien no, ni el formulario ni la lista, porque no tendría nada
        que hacer con ellos. La barrera sigue estando en el servidor.
      */}
      {gestiona ? (
        <>
          <Card title={t.inviteTitle}>
            <InvitePanelForm establishmentId={id} />
          </Card>

          <Card title={es.establishmentSheet.invitations.title}>
            {invitations.failed ? (
              // §20.7 · "no se pudo mirar" no es "no hay ninguna".
              <p className="text-sm text-danger">{es.establishmentSheet.invitations.failed}</p>
            ) : invitations.rows.length === 0 ? (
              <p className="text-sm text-text-secondary">
                {es.establishmentSheet.invitations.empty}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {invitations.rows.map((invitation) => (
                  <InvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    canReview={revisa}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      <p>
        <Link
          href={`/espacios/${slug}/restaurantes/${id}`}
          className="text-sm text-primary underline"
        >
          {es.clientArea.priority.back}
        </Link>
      </p>
    </div>
  );
}
