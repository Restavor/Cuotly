"use client";

import { es } from "@/i18n/es";
import { euros } from "@/i18n/money";
import type { MenuDiff } from "@/core/menu-diff";
import { countMenuChanges } from "@/core/menu-diff";

const t = es.menuDiff;

/**
 * R18 y A17 · cómo se pinta una comparación de dos versiones de menú.
 *
 * El cálculo no está aquí: está en `src/core/menu-diff.ts`, con sus tests.
 * Esto solo lo escribe, y lo escribe en palabras —"han quitado la crema de
 * calabaza", "el precio pasa de 14 a 15 €"— y no como dos bloques de rojo y
 * verde: un menú son cuatro listas y tres campos, y lo que hace falta leer
 * es qué cambió, no dónde estaba el texto.
 *
 * Lo usan las dos pantallas que comparan: la comparación de versiones que
 * pide el restaurante (R18) y el aviso de que alguien guardó mientras
 * escribías (A17). Es la misma comparación, así que es el mismo componente.
 */
export function MenuDiffView({ diff }: { diff: MenuDiff }) {
  if (diff.identical) {
    return <p className="text-sm text-text-secondary">{t.identical}</p>;
  }

  const precio = (cents: number | null) => (cents === null ? t.none : euros(cents));
  const texto = (valor: string | null) => (valor === null || valor.trim() === "" ? t.none : valor);

  return (
    <div className="space-y-3 text-sm">
      <p className="font-semibold text-text">{t.changes(countMenuChanges(diff))}</p>

      {diff.courses.map((curso) => {
        if (curso.added.length === 0 && curso.removed.length === 0 && !curso.reordered) return null;
        return (
          <div key={curso.course}>
            <p className="font-medium text-text">{t.courses[curso.course]}</p>
            {curso.removed.length > 0 ? (
              <p className="text-text-secondary">{t.removed(curso.removed.join(", "))}</p>
            ) : null}
            {curso.added.length > 0 ? (
              <p className="text-text-secondary">{t.added(curso.added.join(", "))}</p>
            ) : null}
            {curso.reordered ? <p className="text-text-secondary">{t.reordered}</p> : null}
          </div>
        );
      })}

      {diff.drink ? (
        <p className="text-text-secondary">
          {t.drink(texto(diff.drink.before), texto(diff.drink.after))}
        </p>
      ) : null}
      {diff.price ? (
        <p className="text-text-secondary">
          {t.price(precio(diff.price.before), precio(diff.price.after))}
        </p>
      ) : null}
      {diff.note ? (
        <p className="text-text-secondary">
          {t.note(texto(diff.note.before), texto(diff.note.after))}
        </p>
      ) : null}

      {/* RN-ALE-07 · lo que cambió en la declaración de alérgenos, por el
          NOMBRE del plato. "En Merluza se ha quitado leche" es lo que
          alguien querrá rastrear; "posición 1 de segundos" no lo es. */}
      {diff.allergens.length === 0 ? null : (
        <div>
          <p className="font-medium text-text">{es.allergens.title}</p>
          {diff.allergens.map((cambio, i) => (
            <p key={`${cambio.course}-${i}`} className="text-text-secondary">
              <span className="text-text">
                {cambio.dishAfter ?? cambio.dishBefore ?? t.courses.starters}
              </span>
              {cambio.dishBefore !== null &&
              cambio.dishAfter !== null &&
              cambio.dishBefore !== cambio.dishAfter
                ? ` (${t.dishRenamed(cambio.dishBefore)})`
                : ""}
              {": "}
              {cambio.declarationChanged === "declared"
                ? t.allergensDeclared
                : cambio.declarationChanged === "undeclared"
                  ? t.allergensUndeclared
                  : ""}
              {cambio.removed.length > 0
                ? ` ${t.allergensRemoved(cambio.removed.map((a) => es.allergens.names[a]).join(", "))}`
                : ""}
              {cambio.added.length > 0
                ? ` ${t.allergensAdded(cambio.added.map((a) => es.allergens.names[a]).join(", "))}`
                : ""}
              {cambio.noteChanged ? ` ${t.allergenNoteChanged}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
