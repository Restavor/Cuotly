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
  // §132 es el horario humano de Cuotly, en Europa/Madrid: la zona es de
  // la plataforma y no de ningún espacio, así que aquí sí va escrita
  // (RN-SOP-06). Ninguna pantalla la copia: le llega por el servidor.
  "core/support.ts",
  "components/home/ActivityFeed.tsx",
  "components/establishment/integrations-load.ts",
]);

const RAIZ = join(process.cwd(), "src");

function archivos(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      archivos(ruta, acc);
    } else if (
      /\.tsx?$/.test(entrada) &&
      !/\.test\.tsx?$/.test(entrada) &&
      // Un `*-fixture.ts` es dato de prueba, igual que un `*.test.tsx`: la
      // zona que lleva dentro es la de un restaurante inventado, no la que
      // una pantalla usa para pintar una fecha. Que esto sea de verdad
      // dato de prueba y no una pantalla colada por el nombre lo comprueba
      // el test de abajo, que exige que nadie fuera de las suites los
      // importe.
      !/-fixture\.tsx?$/.test(entrada)
    ) {
      acc.push(ruta);
    }
  }
  return acc;
}

/**
 * TODOS los `.ts`/`.tsx` bajo `src`, rutas relativas y sin saltarse nada:
 * suites y fixtures incluidos. `archivos()` se salta unos cuantos a
 * propósito, y para vigilar esos saltos hace falta una lista que no se
 * salte ninguno.
 */
function todos(dir: string, base = dir, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) todos(ruta, base, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(ruta.slice(base.length + 1).replaceAll("\\", "/"));
  }
  return acc;
}

describe("ninguna pantalla se inventa la zona horaria", () => {
  it("solo el dominio y el formateador construyen un Intl.DateTimeFormat", () => {
    const culpables: string[] = [];

    for (const ruta of archivos(RAIZ)) {
      const relativa = ruta.slice(RAIZ.length + 1).replaceAll("\\", "/");
      if (PERMITIDOS.has(relativa)) continue;
      // `new Intl.…` y no el nombre suelto: un comentario que nombre la
      // clase para explicar por qué NO se usa no es una infracción, y
      // hacía saltar el barrido con un falso positivo.
      if (/new\s+Intl\.DateTimeFormat/.test(readFileSync(ruta, "utf8"))) {
        culpables.push(relativa);
      }
    }

    expect(
      culpables,
      "una pantalla formatea una fecha por su cuenta: sin `timeZone` sale en la del servidor (UTC en Vercel), no en la del espacio. Usa `enZona(valor, zona, opciones)` de `@/i18n/dates`",
    ).toEqual([]);
  });

  it("tampoco se le pasa a `enZona()` una zona escrita a mano", () => {
    /*
      El agujero que dejó pasar la pantalla de detalle de un informe: no
      construía ningún formateador —así que el barrido de arriba la daba
      por buena— pero hacía `const timezone = "Europe/Madrid"` y se lo
      pasaba a `enZona()`. Lo encontró la revisión del Hito 16
      (14/09/2026); esto es lo que impide que vuelva.

      Se buscan literales con forma de zona IANA (`Region/Ciudad`) fuera
      del formateador y de los tests: la zona sale de `spaces.timezone` o
      de `establishment_timezone()`, nunca de una cadena en la pantalla.
    */
    const ZONA = /["'`][A-Z][a-z]+\/[A-Za-z_]+["'`]/;
    const culpables: string[] = [];

    for (const ruta of archivos(RAIZ)) {
      const relativa = ruta.slice(RAIZ.length + 1).replaceAll("\\", "/");
      if (relativa === "i18n/dates.ts") continue;
      // §132 es el horario humano de CUOTLY, en Europa/Madrid: esa zona es
      // de la plataforma y no de ningún espacio, así que `core/support.ts`
      // la lleva escrita a propósito (RN-SOP-06). Ninguna pantalla la
      // copia: el servidor la aplica y devuelve minutos.
      if (relativa === "core/support.ts") continue;

      // Un respaldo (`space?.timezone ?? "Europe/Madrid"`) no es el fallo:
      // ahí la zona del espacio manda y el literal solo cubre el hueco.
      // Lo que se busca es la zona como ORIGEN, que es lo que hacía la
      // pantalla del informe. Se quitan los respaldos y se mira lo que
      // queda.
      const codigo = readFileSync(ruta, "utf8")
        // Los comentarios no son código: nombrar una zona para explicar
        // qué es no la usa. Se quitan antes de mirar.
        .replaceAll(/\/\*[\s\S]*?\*\//g, "")
        .replaceAll(/\/\/.*$/gm, "")
        // Un respaldo (`space?.timezone ?? "Europe/Madrid"`) tampoco: ahí
        // la zona del espacio manda y el literal solo cubre el hueco. Lo
        // que se busca es la zona como ORIGEN, que es lo que hacía la
        // pantalla del informe.
        .replaceAll(/\?\?\s*["'`][A-Z][a-z]+\/[A-Za-z_]+["'`]/g, "");

      if (ZONA.test(codigo)) culpables.push(relativa);
    }

    expect(
      culpables,
      "una pantalla lleva una zona horaria escrita a mano. La zona la manda el espacio: `spaces.timezone` en las pantallas del equipo, `establishment_timezone()` en las del restaurante",
    ).toEqual([]);
  });

  it("los `*-fixture` que el barrido se salta son SOLO de las suites", () => {
    // El falso-cerrado de la excepción de arriba. Si alguien llama
    // `algo-fixture.ts` a una pantalla, o una pantalla empieza a tirar de
    // un fixture, el barrido dejaría de mirarla y su zona escrita a mano
    // pasaría sin que nadie se enterara. Aquí se exige lo contrario: un
    // fixture solo lo importa un `*.test.ts(x)`.
    const fixtures = todos(RAIZ).filter((r) => /-fixture\.tsx?$/.test(r));
    expect(fixtures.length, "no hay ningún fixture: si se quitaron, quita también la excepción")
      .toBeGreaterThan(0);

    const culpables: string[] = [];
    for (const ruta of todos(RAIZ)) {
      if (/\.test\.tsx?$/.test(ruta)) continue;
      if (/-fixture\.tsx?$/.test(ruta)) continue;
      const codigo = readFileSync(join(RAIZ, ruta), "utf8");
      if (/from\s+["'][^"']*-fixture["']/.test(codigo)) culpables.push(ruta);
    }
    expect(
      culpables,
      "algo que no es una suite importa un `*-fixture`: el barrido de zonas horarias no lo mira",
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
