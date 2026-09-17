"use client";

import { Field } from "@/components/ui";
import {
  ALLERGENS,
  dishAllergenState,
  type Allergen,
  type AllergenCourse,
  type DishAllergens,
} from "@/core/allergens";
import { es } from "@/i18n/es";

const t = es.allergens;

/**
 * R14 · las casillas de un plato (§39, RN-ALE).
 *
 * Los catorce van dentro de un `<details>` cerrado, y el resumen de fuera
 * dice en qué estado está ese plato. Catorce casillas por plato abiertas a
 * la vez llenarían la pantalla de un menú de ocho platos con ciento doce
 * cuadraditos, y lo que hace falta leer de un vistazo no es cada casilla:
 * es cuáles faltan por declarar.
 *
 * **El nombre del plato va en el resumen**, y no es decoración. Las
 * declaraciones van atadas a la POSICIÓN (RN-ALE-09), así que reordenar las
 * líneas del cuadro de arriba no las mueve. Con el nombre al lado, quien
 * mueva "Merluza" al primer puesto ve que debajo pone "leche" y lo corrige;
 * detrás de un número de posición no lo habría visto nadie.
 */
export function DishAllergenFields({
  dishName,
  value,
  onChange,
}: {
  dishName: string;
  value: DishAllergens | null;
  onChange: (next: DishAllergens | null) => void;
}) {
  const estado = dishAllergenState(value);
  const marcados = new Set(value?.allergens ?? []);

  const alternar = (alergeno: Allergen, marcado: boolean) => {
    const siguiente = new Set(marcados);
    if (marcado) siguiente.add(alergeno);
    else siguiente.delete(alergeno);
    onChange({
      allergens: ALLERGENS.filter((a) => siguiente.has(a)),
      note: value?.note ?? null,
    });
  };

  return (
    <details className="rounded-[10px] border border-border p-3">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium text-text">{dishName}</span>
        {" · "}
        {/*
          CA-22 · el ámbar no es color de texto, y §21.4 dice que el color
          nunca es la única señal. Lo que distingue un plato sin declarar es
          la palabra, en negrita; el color no hace falta para leerlo.
        */}
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
      </summary>

      <fieldset className="mt-3">
        <legend className="mb-2 text-sm text-text-secondary">{t.pickLegend}</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {ALLERGENS.map((alergeno) => (
            <label key={alergeno} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={marcados.has(alergeno)}
                onChange={(e) => alternar(alergeno, e.target.checked)}
              />
              {t.names[alergeno]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3">
        <Field
          label={t.noteLabel}
          name={`nota-${dishName}`}
          hint={t.noteHint}
          value={value?.note ?? ""}
          onChange={(e) =>
            onChange({
              allergens: value?.allergens ?? [],
              note: e.target.value === "" ? null : e.target.value,
            })
          }
        />
      </div>

      {/*
        RN-ALE-06 · declarar que un plato no lleva ninguno de los catorce es
        un ACTO, no dejarlo en blanco. Sin este botón no habría manera de
        distinguir "no lleva nada" de "nadie lo ha mirado", y las dos cosas
        se leen muy distinto cuando quien lee tiene una alergia.
      */}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <button
          type="button"
          className="text-cuotly-green underline"
          onClick={() => onChange({ allergens: [], note: null })}
        >
          {t.markNone}
        </button>
        {estado.kind === "undeclared" ? null : (
          <button
            type="button"
            className="text-text-secondary underline"
            onClick={() => onChange(null)}
          >
            {t.clearDeclaration}
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * Las declaraciones de una categoría entera, una por plato.
 *
 * Sin platos escritos no se pinta nada: un bloque de "Primeros" vacío
 * encima de un cuadro de texto vacío es ruido, no información.
 */
export function CourseAllergens({
  course,
  dishes,
  declared,
  onChange,
}: {
  course: AllergenCourse;
  dishes: readonly string[];
  declared: readonly (DishAllergens | null)[];
  onChange: (course: AllergenCourse, index: number, value: DishAllergens | null) => void;
}) {
  if (dishes.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-text">{t.courseTitle[course]}</p>
      {dishes.map((plato, i) => (
        <DishAllergenFields
          // La clave lleva la posición porque la declaración va atada a la
          // posición (RN-ALE-09): si fuera solo el nombre, dos platos que se
          // llamaran igual compartirían estado.
          key={`${course}-${i}-${plato}`}
          dishName={plato}
          value={declared[i] ?? null}
          onChange={(valor) => onChange(course, i, valor)}
        />
      ))}
    </div>
  );
}
