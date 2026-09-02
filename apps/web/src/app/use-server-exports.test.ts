import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Un archivo `"use server"` SOLO puede exportar funciones asíncronas.
 * Exportar cualquier otra cosa —una constante con el estado inicial del
 * formulario, por ejemplo— hace que Next.js tire el módulo entero al
 * evaluarlo:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * Y entonces ninguna acción de ese archivo funciona. Lo peor es cómo se
 * ve: el formulario envía, el servidor responde 500 y `useActionState`
 * deja el estado como estaba, así que la pantalla no cambia y tampoco da
 * error. Es indistinguible de "no ha pasado nada".
 *
 * Así estaban CINCO archivos —mensajes, trabajos, solicitudes, finanzas y
 * correcciones—, es decir casi todo lo que escribe en la aplicación. No lo
 * vio ni `tsc`, ni eslint, ni `next build`: `next build` compila el módulo
 * sin quejarse y el fallo solo aparece al ejecutar la acción. Lo destapó
 * el recorrido de CA-19 en un móvil, después de tres rondas persiguiendo
 * síntomas.
 *
 * Por eso esto es un barrido y no una nota en la documentación: recorre
 * TODOS los archivos con la directiva y falla si alguno exporta algo que
 * no sea una función asíncrona o un tipo.
 */

const FUENTES = join(process.cwd(), "src");

function archivosTypeScript(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosTypeScript(ruta);
    return entrada.name.endsWith(".ts") || entrada.name.endsWith(".tsx") ? [ruta] : [];
  });
}

/** `export ...` en la primera columna: las de dentro de una función no cuentan. */
const EXPORTACION = /^export\s+(.*)$/gm;

function exportacionesProhibidas(contenido: string): string[] {
  return [...contenido.matchAll(EXPORTACION)]
    .map((coincidencia) => coincidencia[1])
    .filter((declaracion) => !declaracion.startsWith("type "))
    .filter((declaracion) => !declaracion.startsWith("async function"))
    .filter((declaracion) => !declaracion.startsWith("default async function"));
}

describe('archivos "use server"', () => {
  const conDirectiva = archivosTypeScript(FUENTES)
    .map((ruta) => ({ ruta, contenido: readFileSync(ruta, "utf8") }))
    .filter(({ contenido }) => /^["']use server["'];/m.test(contenido));

  it("hay archivos que revisar (si no, el barrido no está probando nada)", () => {
    expect(conDirectiva.length).toBeGreaterThan(0);
  });

  it.each(conDirectiva.map(({ ruta }) => ruta))(
    "%s solo exporta funciones asíncronas",
    (ruta) => {
      const { contenido } = conDirectiva.find((archivo) => archivo.ruta === ruta)!;
      expect(exportacionesProhibidas(contenido)).toEqual([]);
    },
  );
});
