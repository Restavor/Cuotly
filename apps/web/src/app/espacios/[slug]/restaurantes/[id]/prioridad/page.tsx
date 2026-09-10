import Link from "next/link";
import { notFound, redirect } from "next/navigation";


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
 * llamar por RPC; que las dos listas coincidan lo comprueba
 * `prioridad_del_restaurante.sql` al exigir que la lista venga entera.
 */
export const dynamic = "force-dynamic";

const PENDIENTES = [
  "received",
  "analyzing",
  "needs_information",
  "pending_internal_validation",
  "pending_client_acceptance",
  "accepted",
  "in_progress",
];

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

  const [{ data: puedeOrdenar }, { data: requests }] = await Promise.all([
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

      <p className="text-sm">
        <Link href={`/espacios/${slug}/restaurantes/${id}`} className="text-cuotly-green underline">
          {es.clientArea.priority.back}
        </Link>
      </p>
    </div>
  );
}
