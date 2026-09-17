import { Card } from "@/components/ui";
import {
  dishAllergenState,
  menuAllergenSummary,
  undeclaredCount,
  type MenuAllergens,
} from "@/core/allergens";
import { ALLERGEN_COURSES } from "@/core/allergens";
import { es } from "@/i18n/es";

const t = es.allergens;

/**
 * §39 · lo declarado de un menú, para quien lo LEE (el restaurante y el
 * equipo). El editor es otra pantalla.
 *
 * Tres cosas que esta tarjeta hace a propósito:
 *
 *   · **El resumen se deriva, no se lee de ningún sitio** (RN-ALE-08).
 *     Escribirlo aparte sería un segundo lugar donde decir lo mismo.
 *   · **Un menú sin declaración no dice "no lleva alérgenos"**: dice que
 *     nadie la ha escrito (RN-ALE-06). Las dos frases se parecen y
 *     significan lo contrario para quien tiene una alergia.
 *   · **Los platos sin declarar se enumeran**, no solo se cuentan. "Faltan
 *     dos" obliga a buscarlos; decir cuáles son ahorra el paseo.
 */
export function MenuAllergensCard({
  content,
  declared,
}: {
  content: {
    readonly starters: readonly string[];
    readonly mains: readonly string[];
    readonly desserts: readonly string[];
    readonly drink: string | null;
  };
  declared: MenuAllergens | null;
}) {
  if (declared === null) {
    return (
      <Card title={t.title}>
        <p className="font-medium text-text">{t.notDeclaredTitle}</p>
        <p className="mt-1 text-sm text-text-secondary">{t.notDeclaredReason}</p>
      </Card>
    );
  }

  const resumen = menuAllergenSummary(declared);
  const faltan = undeclaredCount(content, declared);

  const sinDeclarar: string[] = [];
  for (const curso of ALLERGEN_COURSES) {
    content[curso].forEach((plato, i) => {
      if (dishAllergenState(declared[curso][i]).kind === "undeclared") sinDeclarar.push(plato);
    });
  }
  if ((content.drink ?? "").trim() !== "" && dishAllergenState(declared.drink).kind === "undeclared") {
    sinDeclarar.push(content.drink!);
  }

  return (
    <Card title={t.summaryTitle}>
      <p className="text-sm text-text">
        {resumen.length === 0
          ? t.summaryNone
          : t.summaryLine(resumen.map((alergeno) => t.names[alergeno]).join(", "))}
      </p>

      {faltan > 0 ? (
        <p className="mt-2 text-sm text-text-secondary">
          {t.someUndeclared(faltan)} {sinDeclarar.join(", ")}
        </p>
      ) : null}

      <ul className="mt-4 space-y-2 text-sm">
        {ALLERGEN_COURSES.map((curso) =>
          content[curso].map((plato, i) => {
            const estado = dishAllergenState(declared[curso][i]);
            return (
              <li key={`${curso}-${i}-${plato}`}>
                <span className="font-medium text-text">{plato}</span>
                {" · "}
                {/* CA-22 · el ámbar no es color de texto. Lo que marca un
                    plato sin declarar es la palabra en negrita. */}
                <span
                  className={
                    estado.kind === "undeclared" ? "font-semibold text-text" : "text-text-secondary"
                  }
                >
                  {estado.kind === "undeclared"
                    ? t.undeclared
                    : estado.kind === "none"
                      ? t.declaredNone
                      : estado.allergens.map((a) => t.names[a]).join(", ") || t.onlyNote}
                </span>
                {estado.kind === "some" && estado.note ? (
                  <span className="text-text-secondary"> · {estado.note}</span>
                ) : null}
              </li>
            );
          }),
        )}
      </ul>

      <p className="mt-4 text-sm text-text-secondary">{t.whoseResponsibility}</p>
    </Card>
  );
}
