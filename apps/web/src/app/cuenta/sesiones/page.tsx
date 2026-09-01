import { redirect } from "next/navigation";

import { Card, EmptyState, ErrorState, StatusBadge } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { RevokeSessionButton } from "./RevokeSessionButton";

/**
 * HU-05 · "ver y cerrar mis sesiones activas".
 *
 * Los datos salen de `my_active_sessions()`, que filtra por `auth.uid()` en
 * el servidor: esta pantalla no puede enseñar la sesión de nadie más
 * aunque alguien manipule la petición, porque no es ella quien decide qué
 * filas devuelve.
 */
export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function SessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("my_active_sessions");

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{es.sessions.title}</h1>
        <ErrorState title={es.sessions.errorTitle} description={es.sessions.errorReason} />
      </main>
    );
  }

  const sessions = data ?? [];
  const others = sessions.filter((s) => !s.is_current);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-primary-dark">{es.sessions.title}</h1>
      <p className="mb-6 text-sm text-text-secondary">{es.sessions.subtitle}</p>

      <div className="space-y-3">
        {sessions.map((session) => (
          <Card key={session.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-text">
                  {session.user_agent ?? es.sessions.unknownDevice}
                </p>
                <p className="text-sm text-text-secondary">
                  {es.sessions.lastUsed}: {formatDate(session.refreshed_at ?? session.created_at)}
                </p>
                <p className="text-sm text-text-secondary">
                  {es.sessions.ip}: {session.ip ?? "—"}
                </p>
              </div>
              {session.is_current ? (
                <StatusBadge tone="success">{es.sessions.current}</StatusBadge>
              ) : (
                <RevokeSessionButton sessionId={session.id} />
              )}
            </div>
          </Card>
        ))}
      </div>

      {others.length === 0 ? (
        <div className="mt-6">
          <EmptyState title={es.sessions.emptyTitle} description={es.sessions.emptyReason} />
        </div>
      ) : null}
    </main>
  );
}
