import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RevokeAccessButton } from "@/components/establishment/RevokeAccessButton";
import {
  ButtonLink,
  Card,
  PageHeader,
  PersonCell,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
} from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
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
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, id } = await params;
  const { tab } = await searchParams;
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

  const base = `/espacios/${slug}/restaurantes/${id}/usuarios`;
  const vista = tab === "invitar" && gestiona ? "invitar" : "usuarios";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        subtitle={t.hint}
        actions={
          gestiona && vista === "usuarios" ? (
            <ButtonLink href={`${base}?tab=invitar`} icon="plus">
              {t.inviteTitle}
            </ButtonLink>
          ) : null
        }
      />

      {gestiona ? (
        <Tabs
          label={t.title}
          active={vista}
          tabs={[
            { key: "usuarios", label: t.listTitle, href: base },
            { key: "invitar", label: t.inviteTitle, href: `${base}?tab=invitar` },
          ]}
        />
      ) : null}

      {vista === "usuarios" ? (
      <Card title={t.listTitle}>
        {users.failed ? (
          <p className="text-sm text-danger">{t.failed}</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{t.nameLabel}</TableHeaderCell>
                <TableHeaderCell>{t.roleLabel}</TableHeaderCell>
                <TableHeaderCell>{t.emailLabel}</TableHeaderCell>
                <TableHeaderCell>{t.scopeLabel}</TableHeaderCell>
                <TableHeaderCell>{t.stateLabel}</TableHeaderCell>
                <TableHeaderCell>{t.permissionsLabel}</TableHeaderCell>
                <TableHeaderCell>{es.ui.table.actions}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.rows.map((row) => {
                const nombre = row.displayName ?? es.establishmentSheet.noName;
                const esPropietario = row.role === "local_owner";
                const delGrupo = row.source === "group";
                return (
                  <TableRow key={`${row.source}-${row.userId}`}>
                    <TableCell>
                      <PersonCell name={nombre} />
                    </TableCell>
                    <TableCell>{rolName(row)}</TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{delGrupo ? t.scopeGroup : establishment.name}</TableCell>
                    <TableCell>
                      <StatusBadge tone="success">{t.active}</StatusBadge>
                    </TableCell>
                    <TableCell>
                      {esPropietario ? (
                        t.ownerAll
                      ) : (
                        <ul className="space-y-0.5 text-sm">
                          {CLIENT_PERMISSIONS.map((name) => (
                            <li key={name} className="flex items-center gap-1.5">
                              <Icon
                                name={row.permissions[name] ? "check" : "close"}
                                className={`h-3.5 w-3.5 ${row.permissions[name] ? "text-cuotly-green" : "text-danger"}`}
                              />
                              <span className={row.permissions[name] ? "text-text" : "text-text-secondary"}>
                                {t.permissions[name]}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {gestiona && !esPropietario && !delGrupo ? (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-cuotly-green">
                            {t.editPermissions}
                          </summary>
                          <div className="mt-3 w-72 space-y-3">
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
                          </div>
                        </details>
                      ) : gestiona && esPropietario ? (
                        <span className="text-xs text-text-secondary">{t.ownerNotEditable}</span>
                      ) : gestiona && delGrupo ? (
                        <span className="text-xs text-text-secondary">{t.groupNotEditable}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      ) : null}

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
      {gestiona && vista === "invitar" ? (
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
