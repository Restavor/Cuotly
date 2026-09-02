import { rmSync } from "node:fs";

/**
 * Borra los restos que deja `next dev` antes de compilar para los tests.
 *
 * `tsconfig.json` incluye en la comprobación de tipos DOS carpetas
 * generadas: `.next/types/**` (las que escribe `next build`) y
 * `.next/dev/types/**` (las que escribe `next dev`). Conviven en la misma
 * carpeta, y las del servidor de desarrollo se quedan ahí describiendo
 * rutas y firmas de hace días. Compilar encima de ellas hace que `next
 * build` falle la comprobación de tipos por archivos que ya no existen o
 * que ya no son así — un error que no está en el código y que no aparece
 * en una máquina que solo compila.
 *
 * Se borran también `tsconfig.tsbuildinfo` (la caché incremental de
 * TypeScript, que puede apuntar a esos mismos archivos) y `test-results`,
 * que no estorba pero se acumula.
 *
 * Lo que NO se borra es `.next` entera: la caché de compilación de
 * producción vale dinero en tiempo y no tiene nada que ver con el
 * problema.
 */
for (const resto of [".next/dev", "tsconfig.tsbuildinfo", "test-results"]) {
  rmSync(resto, { recursive: true, force: true });
}
