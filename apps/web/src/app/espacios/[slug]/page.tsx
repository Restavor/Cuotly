import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { NewEstablishmentForm } from "@/components/NewEstablishmentForm";
import { InviteMemberForm } from "@/components/InviteMemberForm";
import { es } from "@/i18n/es";

type StatusKey = keyof typeof es.space.statuses;

export default async function SpacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  // RLS ya impide ver espacios ajenos: si no aparece nada, es que no
  // existe o no pertenece a este usuario — en los dos casos, 404. No hay
  // forma de distinguir "no existe" de "no tienes acceso" desde fuera, y
  // es intencional (CA-02): no se confirma ni se niega la existencia de
  // espacios ajenos.
  if (!space) {
    notFound();
  }

  const [
    { data: establishments },
    { data: memberships },
    { data: invitations },
    { data: canCreateEstablishment },
    { data: canInvite },
  ] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, code, name, status")
      .eq("space_id", space.id)
      .order("code"),
    supabase
      .from("space_memberships")
      .select("role, status, profiles(email, full_name)")
      .eq("space_id", space.id),
    supabase
      .from("space_invitations")
      .select("id, email, role, status, expires_at")
      .eq("space_id", space.id)
      .eq("status", "pending"),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "create_establishment" }),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "invite_member" }),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-bold text-primary-dark">{space.name}</h1>

      {/*
        Enlaces a las pantallas de operación. El armazón completo de
        §20.2 (menú lateral, barra de móvil, búsqueda, avisos) existe y se
        prueba en /armazon, pero todavía no envuelve estas rutas: eso
        queda dicho en el ROADMAP en vez de darlo por hecho.
      */}
      <nav aria-label={es.nav.home} className="flex flex-wrap gap-3 text-sm">
        <Link href={`/espacios/${space.slug}/solicitudes`} className="text-cuotly-green underline">
          {es.nav.requests}
        </Link>
        <Link href={`/espacios/${space.slug}/trabajos`} className="text-cuotly-green underline">
          {es.nav.jobs}
        </Link>
        <Link href={`/espacios/${space.slug}/finanzas`} className="text-cuotly-green underline">
          {es.nav.finance}
        </Link>
      </nav>

      <Card
        title={es.space.establishments.title}
        className="space-y-4"
      >
        <div className="flex justify-end">
          {canCreateEstablishment ? (
            <NewEstablishmentForm spaceId={space.id} spaceSlug={space.slug} />
          ) : null}
        </div>
        {establishments && establishments.length > 0 ? (
          <Table>
            <TableHead>
              <TableHeaderCell>{es.space.establishments.codeColumn}</TableHeaderCell>
              <TableHeaderCell>{es.space.establishments.nameColumn}</TableHeaderCell>
              <TableHeaderCell>{es.space.establishments.statusColumn}</TableHeaderCell>
            </TableHead>
            <TableBody>
              {establishments.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.code}</TableCell>
                  <TableCell>{e.name}</TableCell>
                  <TableCell>
                    <StatusBadge tone={e.status === "active" ? "success" : "neutral"}>
                      {es.space.statuses[e.status as StatusKey]}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState description={es.space.establishments.empty} />
        )}
      </Card>

      <Card title={es.space.team.title} className="space-y-4">
        <div className="flex justify-end">
          {canInvite ? <InviteMemberForm spaceId={space.id} spaceSlug={space.slug} /> : null}
        </div>
        {memberships && memberships.length > 0 ? (
          <Table>
            <TableHead>
              <TableHeaderCell>{es.space.team.emailColumn}</TableHeaderCell>
              <TableHeaderCell>{es.space.team.roleColumn}</TableHeaderCell>
              <TableHeaderCell>{es.space.team.statusColumn}</TableHeaderCell>
            </TableHead>
            <TableBody>
              {memberships.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{m.profiles?.full_name ?? m.profiles?.email}</TableCell>
                  <TableCell>{m.role}</TableCell>
                  <TableCell>
                    <StatusBadge tone={m.status === "active" ? "success" : "neutral"}>
                      {es.space.statuses[m.status as StatusKey]}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState description={es.space.team.empty} />
        )}

        {canInvite && invitations && invitations.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-text">{es.space.team.pendingInvitations}</p>
            <Table>
              <TableHead>
                <TableHeaderCell>{es.space.team.emailColumn}</TableHeaderCell>
                <TableHeaderCell>{es.space.team.roleColumn}</TableHeaderCell>
              </TableHead>
              <TableBody>
                {invitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{invite.role}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
