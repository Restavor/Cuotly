import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, EmptyState } from "@/components/ui";
import { accountRemedyFor, canRequestAccountDeletion, type AccountBlockerKind } from "@/core/space-lifecycle";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

/**
 * §141 · Cerrar la cuenta (RN-CIC-12): "Un usuario no puede eliminar su
 * cuenta si es único propietario de un espacio o grupo. Primero
 * transfiere propiedad o cierra entidades."
 *
 * **Esta pantalla no cierra ninguna cuenta**, y lo dice en voz alta. Lo
 * que entrega es la comprobación de §141 y su respuesta útil: qué lo
 * impide, cuántos son y qué hay que hacer con cada uno. El cierre en sí
 * —cuánto se conserva, de qué se anonimiza, qué se entrega antes— es del
 * bloque legal (§170.1), que sigue aplazado. Pintar un botón que no hace
 * nada, o que hiciera algo inventado, sería peor que no tenerlo.
 *
 * Los bloqueos los calcula `account_deletion_blockers()`, que no admite
 * ningún argumento: nadie consulta los de otra persona.
 */
export const dynamic = "force-dynamic";

export default async function CloseAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = es.closeAccount;
  const { data: bloqueos } = await supabase.rpc("account_deletion_blockers");
  const lista = bloqueos ?? [];
  const sinBloqueos = canRequestAccountDeletion(
    lista.map((b) => ({
      kind: b.kind as AccountBlockerKind,
      entityId: b.entity_id,
      entityName: b.entity_name,
      remedy: accountRemedyFor(b.kind as AccountBlockerKind),
    })),
  );

  return (
    <div className="mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card title={t.blockersTitle} className="mb-6">
        {sinBloqueos ? (
          <EmptyState title={t.noBlockersTitle} description={t.noBlockersReason} />
        ) : (
          <>
            <p className="mb-4 text-sm text-text-secondary">{t.blockersHint}</p>
            <ul className="flex flex-col gap-3">
              {lista.map((bloqueo) => (
                <li key={`${bloqueo.kind}:${bloqueo.entity_id}`} className="rounded-[12px] bg-soft-surface p-4">
                  <p className="text-sm font-semibold text-text">
                    {t.kinds[bloqueo.kind as AccountBlockerKind]} · {bloqueo.entity_name}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {t.remedies[bloqueo.remedy as "transfer_ownership" | "transfer_or_close_group"]}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* El placeholder del bloque legal, dicho y no fingido (§170.1). */}
      <Card title={t.deletionTitle}>
        <p className="text-sm text-text-secondary">{t.deletionPending}</p>
      </Card>

      <p className="mt-6 text-sm text-text-secondary">
        <Link href="/cuenta/seguridad" className="font-medium text-primary underline">
          {t.backToSecurity}
        </Link>
      </p>
    </div>
  );
}
