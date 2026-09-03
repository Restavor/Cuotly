import { notFound, redirect } from "next/navigation";

import {
  Card,
  EmptyState,
  NoPermissionState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * HU-25 · "ver el libro de consumos de un establecimiento con cada
 * apunte, su motivo y su autor".
 *
 * Es la versión del equipo del mismo libro que el restaurante ve en su
 * facturación, y la diferencia es exactamente el **autor**: al cliente no
 * se le devuelve nunca la persona del equipo, sólo "Equipo de
 * mantenimiento". Esa distinción no la hace esta pantalla, la hace
 * `establishment_consumption_ledger()`, que sólo rellena `author_id`
 * cuando quien consulta es del espacio (CLAUDE.md MUST NOT).
 *
 * El libro es inmutable: son apuntes con signo, no un contador
 * (RN-DAT-04). Por eso aquí no hay ningún botón que corrija una línea.
 */
export const dynamic = "force-dynamic";

type CategoryKey = keyof typeof es.naming.categories;
type EntryTypeKey = keyof typeof es.teamArea.ledger.types;

export default async function TeamConsumptionLedgerPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id, name, code, space_id")
    .eq("id", id)
    .maybeSingle();

  if (!establishment) notFound();

  // Esta pantalla es del equipo. Un cliente que llegue por URL no ve un
  // libro vacío ni un 404 mudo: se le dice cuál es el motivo (CA-20, P6).
  // La barrera de verdad no es ésta, es la función: sin
  // `can_read_establishment` no devuelve ni una fila.
  const { data: isMember } = await supabase.rpc("is_space_member", {
    p_space_id: establishment.space_id,
  });

  if (!isMember) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.teamArea.ledger.title}</h1>
        <NoPermissionState
          title={es.teamArea.ledger.noAccessTitle}
          description={es.teamArea.ledger.noAccessReason}
        />
      </div>
    );
  }

  const { data: ledger } = await supabase.rpc("establishment_consumption_ledger", {
    p_establishment_id: id,
  });

  const rows = ledger ?? [];

  // Los nombres se piden en una sola consulta y sólo para los autores que
  // la función ha identificado: si devolvió `author_id` nulo, es que a
  // quien mira no le corresponde saberlo, y aquí no se busca por detrás.
  const authorIds = [...new Set(rows.map((row) => row.author_id).filter((v): v is string => !!v))];
  const { data: people } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
    : { data: [] };
  const authorName = new Map((people ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));

  function author(row: { author_display: string | null; author_id: string | null }): string {
    if (row.author_display === "system") return es.teamArea.ledger.authorSystem;
    if (row.author_display === "self") return es.teamArea.ledger.authorSelf;

    // El nombre sólo aparece si la función devolvió `author_id`, y sólo lo
    // devuelve a quien es del espacio. Para el cliente ese campo llega
    // nulo, así que este camino no se recorre nunca desde su lado y cae en
    // la etiqueta genérica de abajo: es la misma pantalla, y aun así no
    // hay forma de que le enseñe a una persona (CLAUDE.md MUST NOT).
    const nombre = row.author_id ? authorName.get(row.author_id) : undefined;
    if (nombre) return nombre;

    return row.author_display === "client"
      ? es.teamArea.ledger.authorClient
      : es.teamArea.ledger.authorTeam;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">
          {establishment.code} · {establishment.name}
        </p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.teamArea.ledger.title}</h1>
        <p className="text-sm text-text-secondary">{es.teamArea.ledger.subtitle}</p>
      </header>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={es.teamArea.ledger.emptyTitle}
            description={es.teamArea.ledger.emptyReason}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{es.teamArea.ledger.dateColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.ledger.categoryColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.ledger.amountColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.ledger.typeColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.ledger.requestColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.ledger.reasonColumn}</TableHeaderCell>
                <TableHeaderCell>{es.teamArea.ledger.authorColumn}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.entry_id}>
                  <TableCell>
                    {new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(
                      new Date(row.occurred_at),
                    )}
                  </TableCell>
                  <TableCell>
                    {es.naming.categories[row.category as CategoryKey] ?? row.category}
                  </TableCell>
                  {/* El signo se enseña tal cual: el libro son apuntes con
                      signo y un "+1" y un "-1" no significan lo mismo. */}
                  <TableCell>{row.amount > 0 ? `+${row.amount}` : String(row.amount)}</TableCell>
                  <TableCell>
                    {es.teamArea.ledger.types[row.entry_type as EntryTypeKey] ?? row.entry_type}
                  </TableCell>
                  <TableCell>{row.request_code ?? "—"}</TableCell>
                  <TableCell>{row.reason ?? es.teamArea.ledger.noReason}</TableCell>
                  <TableCell>{author(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
