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

  const [{ data: establishments }, { data: canCreateEstablishment }] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, code, name, status")
      .eq("space_id", space.id)
      .order("code"),
    supabase.rpc("has_capability", { p_space_id: space.id, p_capability: "create_establishment" }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-bold text-primary-dark">{space.name}</h1>

      {/*
        Accesos directos a las pantallas de operación. No sustituyen al
        armazón de §20.2 —el menú lateral, la barra de móvil, la búsqueda y
        los avisos envuelven ya estas rutas desde el layout del espacio—:
        son los atajos del inicio.
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
        <Link href={`/espacios/${space.slug}/calendario`} className="text-cuotly-green underline">
          {es.nav.calendar}
        </Link>
        <Link href={`/espacios/${space.slug}/equipo`} className="text-cuotly-green underline">
          {es.nav.team}
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

      {/*
        La lista del equipo y las invitaciones (HU-03, HU-04) viven ahora
        en su propio destino del menú, junto a la supervisión de HU-29.
        Estaban aquí porque en el Hito 2 no existía `/equipo`; tenerlas en
        dos sitios sería la misma lista con dos verdades posibles.
      */}
      <Card title={es.space.team.title}>
        <Link href={`/espacios/${space.slug}/equipo`} className="text-sm text-cuotly-green underline">
          {es.nav.team}
        </Link>
      </Card>
    </div>
  );
}
