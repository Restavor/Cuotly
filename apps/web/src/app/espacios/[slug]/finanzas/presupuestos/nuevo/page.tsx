import Link from "next/link";

import { Icon } from "@/components/ui/Icon";
import { notFound, redirect } from "next/navigation";

import { NoPermissionState } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { QuoteForm } from "../QuoteForms";

/**
 * Alta de un presupuesto (§84). Dos entradas: desde Finanzas, eligiendo
 * el restaurante (y el presupuesto crea solicitud y trabajo al aceptarse,
 * o una plantilla de Menú Diario); o desde una solicitud
 * (`?solicitud=`), que queda fija y cuya aceptación pasa a ser la del
 * presupuesto.
 *
 * `manage_requests` se consulta para no pintar un formulario condenado;
 * quien lo exige de verdad es `create_quote()`.
 */
export const dynamic = "force-dynamic";

const t = es.quotesTeam;

export default async function NewQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ restaurante?: string; solicitud?: string }>;
}) {
  const { slug } = await params;
  const { restaurante, solicitud } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase.from("spaces").select("id, slug").eq("slug", slug).maybeSingle();
  if (!space) notFound();

  const { data: puedeGestionar } = await supabase.rpc("has_capability", {
    p_space_id: space.id,
    p_capability: "manage_requests",
  });

  if (puedeGestionar !== true) {
    return (
      <div className="space-y-6">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.newTitle}</h1>
        <NoPermissionState title={t.noPermissionTitle} description={t.noPermissionReason} />
      </div>
    );
  }

  const [{ data: establishments }, { data: request }] = await Promise.all([
    supabase
      .from("establishments")
      .select("id, name")
      .eq("space_id", space.id)
      .neq("status", "archived")
      .order("name"),
    solicitud
      ? supabase
          .from("requests")
          .select("id, code, establishment_id, validated_category")
          .eq("id", solicitud)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <Link
          href={`/espacios/${space.slug}/finanzas/presupuestos`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cuotly-green hover:underline"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          {t.backToList}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-primary-dark sm:text-[28px]">{t.newTitle}</h1>
      </header>

      <QuoteForm
        slug={space.slug}
        establishments={establishments ?? []}
        fixedRequest={
          request
            ? {
                id: request.id,
                code: request.code,
                establishmentId: request.establishment_id,
                category: request.validated_category,
              }
            : null
        }
        defaultEstablishmentId={restaurante ?? null}
        quote={null}
      />
    </div>
  );
}
