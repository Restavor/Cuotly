import Link from "next/link";
import { notFound, redirect } from "next/navigation";


import { Card } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { PriorityList, type PriorityRow } from "./PriorityList";

/**
 * El restaurante ordena sus cambios pendientes por importancia.
 *
 * Decisión de producto de Bosco (10/09/2026): "los clientes premium son
 * los únicos que pueden indicar la prioridad, y lo hacen organizando sus
 * cambios por cuál es más importante". Esta pantalla es ese "lo hacen".
 *
 * Quién puede ordenar lo contesta el servidor
 * (`client_can_set_priority()`), y aquí solo se pregunta para saber si
 * pintar las flechas o el motivo. Enviar el formulario sin poder falla
 * igual: `set_request_priority_order()` lo comprueba por su cuenta
 * (CLAUDE.md — ocultar un botón no es un control de acceso).
 *
 * Los estados que se ordenan son los mismos que acepta la función. Están
 * escritos aquí porque `request_is_rankable()` es interna y no se puede
 * llamar por RPC.
 *
 * `in_progress` NO está entre ellos desde la migración 72 (decisión de
 * Bosco, 12/09/2026: "si un trabajo ya se está haciendo no se puede mover,
 * no se puede reordenar"). Lo que ya arrancó se sigue enseñando —es un
 * cambio que el restaurante pidió y hacerlo desaparecer se leería como que
 * se ha perdido— pero en su propio bloque y sin flechas.
 *
 * Que las dos listas coincidan lo comprueba `listas-compartidas.test.ts`,
 * que lee la migración y las compara. **No** lo comprueba
 * `prioridad_del_restaurante.sql`, como decía aquí antes: esa suite mira
 * que la función sea coherente consigo misma y no toca el TypeScript. Si
 * las dos listas se separaran, la pantalla mandaría una lista incompleta,
 * la función la rechazaría, y el fallo lo vería un restaurante intentando
 * ordenar sus cambios — no un test.
 */
export const dynamic = "force-dynamic";

const PENDIENTES = [
  "received",
  "analyzing",
  "needs_information",
  "pending_internal_validation",
  "pending_client_acceptance",
  "accepted",
];

/** Lo que ya arrancó: se enseña, no se ordena. */
const EN_CURSO = ["in_progress"];

export default async function PriorityPage({
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
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!establishment) notFound();

  const [{ data: puedeOrdenar }, { data: requests }, { data: enCurso }] = await Promise.all([
    supabase.rpc("client_can_set_priority", { p_establishment_id: id }),
    supabase
      .from("requests")
      .select("id, description, state, priority_rank, created_at")
      .eq("establishment_id", id)
      .in("state", PENDIENTES)
      // Sin ordenar todavía, el criterio es la antigüedad: lo que lleva más
      // tiempo esperando va primero. No es una regla de negocio, es el
      // punto de partida antes de que el restaurante diga lo suyo.
      .order("priority_rank", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("requests")
      .select("id, description, state, created_at")
      .eq("establishment_id", id)
      .in("state", EN_CURSO)
      .order("created_at", { ascending: true }),
  ]);

  const rows: PriorityRow[] = (requests ?? []).map((request) => ({
    id: request.id,
    description: request.description,
    state: request.state,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <p className="text-sm text-text-secondary">{establishment.name}</p>
        <h1 className="text-2xl font-bold text-primary-dark">{es.clientArea.priority.title}</h1>
      </header>

      {/*
        Sin acceso de lectura al restaurante no se llega aquí: `establishments`
        se lo niega RLS y la consulta de arriba devuelve nada. Lo que sí puede
        pasar es llegar pudiendo LEER y no ESCRIBIR, y eso se dice.
      */}
      <PriorityList
        establishmentId={id}
        rows={rows}
        canOrder={puedeOrdenar === true}
        reasonWhyNot={es.clientArea.priority.notAllowed}
      />

      {(enCurso ?? []).length > 0 ? (
        <Card title={es.clientArea.priority.inProgressTitle}>
          <p className="mb-4 text-sm text-text-secondary">
            {es.clientArea.priority.inProgressReason}
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {(enCurso ?? []).map((request) => (
              <li key={request.id} className="py-3">
                <span className="block truncate text-sm font-medium text-text">
                  {request.description}
                </span>
                <span className="block text-xs text-text-secondary">
                  {es.naming.states.request[
                    request.state as keyof typeof es.naming.states.request
                  ] ?? request.state}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-sm">
        <Link href={`/espacios/${slug}/restaurantes/${id}`} className="text-cuotly-green underline">
          {es.clientArea.priority.back}
        </Link>
      </p>
    </div>
  );
}
