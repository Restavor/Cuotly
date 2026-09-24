import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, NoPermissionState, StatusBadge } from "@/components/ui";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/core/space-lifecycle";
import { enZona } from "@/i18n/dates";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/server";

import { ConfirmStepButton } from "./ConfirmStepButton";

/**
 * RN-CIC-01 · el asistente de §9: los diez pasos, en su orden, **sin IA**
 * y **sin bloquear nada**. §9 dice "completa progresivamente", así que
 * esto es una lista de tareas pendientes y no una puerta: el espacio
 * funciona entero desde el primer minuto.
 *
 * Lo que enseña cada fila no lo decide esta pantalla: `space_onboarding_progress()`
 * responde si el paso está hecho y **por qué** —porque el dato está, o
 * porque el propietario lo confirmó—, y aquí se pinta esa distinción tal
 * cual. Un paso confirmado dice "confirmado por el propietario" y no
 * "hecho": enseñar lo segundo sería el dato de relleno que CLAUDE.md
 * prohíbe (RN-CIC-02).
 *
 * Quién lo ve lo decide la función (`manage_space`, RN-CIC-03), no el
 * hecho de que este enlace esté o no en el menú.
 */
export const dynamic = "force-dynamic";

/** A dónde se va a hacer cada paso. El asistente no duplica pantallas. */
const DESTINO: Readonly<Record<OnboardingStep, string | null>> = {
  space_details: "/ajustes",
  logo: "/ajustes",
  timezone: "/ajustes",
  working_hours: "/calendario",
  taxes: "/ajustes",
  plans_and_services: "/planes",
  first_establishment: "/restaurantes/nuevo",
  first_worker: "/equipo/invitar",
  notifications: "/ajustes",
  security: "/cuenta/seguridad",
};

/** Los destinos que no cuelgan del espacio, sino de la cuenta personal. */
const ABSOLUTO: ReadonlySet<string> = new Set(["/cuenta/seguridad"]);

export default async function OnboardingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, timezone, onboarding_completed_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!space) notFound();

  const t = es.onboarding;
  const { data: progreso, error } = await supabase.rpc("space_onboarding_progress", {
    p_space_id: space.id,
  });

  // La negativa de la función ES el control de acceso (RN-CIC-03). No se
  // pregunta antes por la capacidad para decidir si pintar: se pinta lo
  // que el servidor haya contestado.
  if (error || progreso === null) {
    return (
      <div className="mx-auto max-w-4xl sm:p-8">
        <h1 className="mb-6 text-2xl font-bold text-primary-dark">{t.title}</h1>
        <NoPermissionState title={t.noAccessTitle} description={t.noAccessReason} />
      </div>
    );
  }

  const porPaso = new Map(progreso.map((fila) => [fila.step, fila]));
  const pendientes = progreso.filter((fila) => !fila.done).length;

  return (
    <div className="mx-auto max-w-4xl sm:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary-dark">{t.title}</h1>
        <p className="text-sm text-text-secondary">{t.subtitle}</p>
      </header>

      <Card className="mb-6">
        {space.onboarding_completed_at ? (
          <p className="text-sm text-text-secondary">
            {t.completedOn}{" "}
            <strong>{enZona(space.onboarding_completed_at, space.timezone, { dateStyle: "long" })}</strong>
            {". "}
            {t.completedHint}
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            <strong>{t.pendingCount(pendientes)}</strong> {t.neverBlocks}
          </p>
        )}
      </Card>

      <ol className="flex flex-col gap-3">
        {ONBOARDING_STEPS.map((paso, indice) => {
          const fila = porPaso.get(paso.step);
          const destino = DESTINO[paso.step];
          const href =
            destino === null
              ? null
              : ABSOLUTO.has(destino)
                ? destino
                : `/espacios/${slug}${destino}`;

          return (
            <li key={paso.step}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-text-secondary">{indice + 1}.</span>
                      <h2 className="text-base font-semibold text-primary-dark">
                        {t.steps[paso.step].title}
                      </h2>
                      {fila?.done ? (
                        <StatusBadge tone={fila.source === "data" ? "success" : "info"}>
                          {fila.source === "data" ? t.doneByData : t.doneByConfirmation}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">{t.pending}</StatusBadge>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary">{t.steps[paso.step].hint}</p>
                    {fila?.done && fila.source === "confirmed" && fila.confirmed_at ? (
                      <p className="mt-1 text-sm text-text-secondary">
                        {t.confirmedOn}{" "}
                        {enZona(fila.confirmed_at, space.timezone, { dateStyle: "short" })}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {href ? (
                      <Link href={href} className="text-sm font-medium text-primary underline">
                        {t.steps[paso.step].action}
                      </Link>
                    ) : null}
                    {fila?.done ? null : <ConfirmStepButton spaceId={space.id} step={paso.step} />}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-sm text-text-secondary">{t.noAiNote}</p>
    </div>
  );
}
