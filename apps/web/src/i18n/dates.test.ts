import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { enZona, fechaCorta, instanteRelativo } from "./dates";

/**
 * CLAUDE.md · "las fechas se guardan en `timestamptz` y se calculan en la
 * zona horaria del espacio".
 *
 * **Por qué este archivo existe.** La regla se cumplía en el dominio
 * (`business-clock.ts`, `finance.ts`, `home.ts`, `daily-menu.ts`, que
 * reciben la zona y la pasan) y se incumplía en las pantallas: treinta
 * llamadas a `Intl.DateTimeFormat` sin `timeZone`, repartidas por casi
 * todos los hitos. Sin `timeZone`, `Intl` usa la del entorno, y en una
 * pantalla de servidor el entorno es el servidor: en Vercel, UTC.
 *
 * No se vio en dos meses porque en España el desfase es de una o dos
 * horas: la fecha sale bien salvo en un apunte de última hora de la tarde,
 * que aparece con el día anterior. Es el mismo patrón que el
 * `"Europe/Madrid"` escrito a mano de las pantallas del restaurante
 * (migración 83): correcto por casualidad mientras solo hubo un espacio.
 *
 * Arreglar las treinta no impide la treinta y una. Lo que lo impide es el
 * barrido de más abajo: `Intl.DateTimeFormat` solo puede construirse en
 * los archivos que lo tienen por oficio. En cualquier otro, el test falla
 * y dice qué usar en su lugar.
 */

/**
 * Quién puede construir un `Intl.DateTimeFormat`, y por qué.
 *
 * `src/core/` es dominio puro: sus funciones reciben la zona como
 * argumento —nunca la adivinan— y sus tests la fijan. `i18n/dates.ts` es
 * el formateador de las pantallas. `ActivityFeed` e `integrations-load`
 * calculan el día en la zona para agrupar, no para pintar.
 */
const PERMITIDOS = new Set([
  "i18n/dates.ts",
  "core/business-clock.ts",
  "core/daily-menu.ts",
  "core/finance.ts",
  "core/home.ts",
  "core/menu-render.ts",
  "components/home/ActivityFeed.tsx",
  "components/establishment/integrations-load.ts",
]);

const RAIZ = join(process.cwd(), "src");

function archivos(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      archivos(ruta, acc);
    } else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
      acc.push(ruta);
    }
  }
  return acc;
}

describe("ninguna pantalla se inventa la zona horaria", () => {
  it("solo el dominio y el formateador construyen un Intl.DateTimeFormat", () => {
    const culpables: string[] = [];

    for (const ruta of archivos(RAIZ)) {
      const relativa = ruta.slice(RAIZ.length + 1).replaceAll("\\", "/");
      if (PERMITIDOS.has(relativa)) continue;
      if (readFileSync(ruta, "utf8").includes("Intl.DateTimeFormat")) {
        culpables.push(relativa);
      }
    }

    expect(
      culpables,
      "una pantalla formatea una fecha por su cuenta: sin `timeZone` sale en la del servidor (UTC en Vercel), no en la del espacio. Usa `enZona(valor, zona, opciones)` de `@/i18n/dates`",
    ).toEqual([]);
  });

  it("el barrido mira archivos de verdad, no una lista vacía", () => {
    // Si `archivos()` dejara de leer, el test de arriba pasaría siempre.
    expect(archivos(RAIZ).length).toBeGreaterThan(100);
  });
});

describe("enZona · un instante se pinta en la zona que se le dice", () => {
  // 23:30 del 19 en Madrid (UTC+2 en septiembre) son las 21:30 UTC. Es
  // exactamente el caso que el fallo escondía: en UTC sale el día 19 a las
  // 21:30, y el apunte de "anoche" aparece con la hora equivocada.
  const nocheDeMadrid = "2026-09-19T21:30:00Z";

  it("la misma hora se lee distinta en dos zonas del mismo espacio", () => {
    expect(enZona(nocheDeMadrid, "Europe/Madrid", { timeStyle: "short" })).toBe("23:30");
    expect(enZona(nocheDeMadrid, "Atlantic/Canary", { timeStyle: "short" })).toBe("22:30");
    expect(enZona(nocheDeMadrid, "UTC", { timeStyle: "short" })).toBe("21:30");
  });

  it("y puede cambiar el DÍA, que es lo que hacía invisible el fallo", () => {
    // 00:30 del 20 en Madrid son las 22:30 UTC del 19: un cobro de esa
    // noche se enseñaba con la fecha del día anterior.
    const medianoche = "2026-09-19T22:30:00Z";
    expect(enZona(medianoche, "Europe/Madrid", { dateStyle: "short" })).toBe("20/9/26");
    expect(enZona(medianoche, "UTC", { dateStyle: "short" })).toBe("19/9/26");
  });
});

describe("enZona · un día suelto no tiene zona y no se le inventa una", () => {
  it("un `date` sale igual en cualquier zona, también al oeste de Greenwich", () => {
    for (const zona of ["Europe/Madrid", "UTC", "America/Los_Angeles", "Pacific/Auckland"]) {
      expect(enZona("2026-09-20", zona, { dateStyle: "short" })).toBe("20/9/26");
    }
  });

  it("`fechaCorta` es la de la maqueta 07 y tampoco corre el día", () => {
    expect(fechaCorta("2026-09-13")).toBe("13 sept");
    expect(fechaCorta("2026-01-01")).toBe("1 ene");
  });
});

describe("instanteRelativo · 'hoy' es hoy en el espacio", () => {
  const hoyEtiqueta = (hora: string) => `Hoy, ${hora}`;

  it("lo de esta madrugada en Madrid es 'hoy' aunque en UTC sea ayer", () => {
    // 00:30 del 20 en Madrid; el "ahora" son las 10:00 del 20 en Madrid.
    const ahora = new Date("2026-09-20T08:00:00Z");
    expect(instanteRelativo("2026-09-19T22:30:00Z", "Europe/Madrid", ahora, hoyEtiqueta)).toBe(
      "Hoy, 0:30",
    );
    // La misma llamada comparando en UTC lo daría por otro día.
    expect(instanteRelativo("2026-09-19T22:30:00Z", "UTC", ahora, hoyEtiqueta)).toBe(
      "19/9/26, 22:30",
    );
  });

  it("lo de otro día lleva su fecha", () => {
    const ahora = new Date("2026-09-20T08:00:00Z");
    expect(instanteRelativo("2026-09-18T10:00:00Z", "Europe/Madrid", ahora, hoyEtiqueta)).toBe(
      "18/9/26, 12:00",
    );
  });
});
