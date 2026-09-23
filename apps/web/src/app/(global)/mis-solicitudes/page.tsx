import { redirect } from "next/navigation";

import { ErrorState } from "@/components/ui";
import { readMyRequestFilters } from "@/core/my-space-requests";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { MyRequestsView, type MyRequestRow } from "./MyRequestsView";

/**
 * G04 · Mis solicitudes (RN-GLO-04).
 *
 * Son las de **creación de espacio** (§10, RN-PLA-01), y la pantalla lo
 * dice en su propio texto para que nadie busque aquí las de trabajo, que
 * viven dentro de cada espacio o panel.
 *
 * Cada fila lleva la acción que toca ahora (`myRequestAction()`). Para una
 * aprobada eso depende del espacio que creó: mientras su primera
 * mensualidad no esté pagada, las instrucciones de pago; con el espacio
 * activo, entrar en él (RN-SUB-05). Por eso se lee el estado de esos
 * espacios, con la misma política que decide si quien mira es miembro.
 *
 * Las columnas van enumeradas: `decided_by` está revocada (RN-PLA-07) y un
 * `select *` devolvería 403. Quién la revisó no se enseña, y también se
 * dice: callarlo sin explicarlo parece un descuido.
 */
export const dynamic = "force-dynamic";

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = readMyRequestFilters(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // "Mis": la plataforma las ve todas por RLS (RN-PLA-01), y aquí solo van
  // las que escribió quien mira.
  const { data, error } = await supabase
    .from("space_requests")
    .select(
      "id, business_name, contact_name, tax_name, plan, status, status_reason, submitted_at, created_at, updated_at, space_id",
    )
    .eq("requester_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return <ErrorState title={es.platformAdmin.loadErrorTitle} description={error.message} />;
  }

  const filas = data ?? [];
  const idsEspacio = filas.flatMap((f) => (f.space_id ? [f.space_id] : []));
  const { data: espacios } =
    idsEspacio.length > 0
      ? await supabase.from("spaces").select("id, slug, cuotly_status").in("id", idsEspacio)
      : { data: [] };
  const porId = new Map((espacios ?? []).map((e) => [e.id, e]));

  const rows: MyRequestRow[] = filas.map((f) => {
    const espacio = f.space_id ? porId.get(f.space_id) : undefined;
    return {
      id: f.id,
      business_name: f.business_name,
      contact_name: f.contact_name,
      tax_name: f.tax_name,
      plan: f.plan,
      status: f.status,
      status_reason: f.status_reason,
      submitted_at: f.submitted_at,
      created_at: f.created_at,
      space: espacio ? { slug: espacio.slug, cuotly_status: espacio.cuotly_status } : null,
    };
  });

  return <MyRequestsView rows={rows} filters={filters} />;
}
