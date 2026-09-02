import { defineConfig, devices } from "@playwright/test";

// Este entorno de desarrollo trae Chromium preinstalado en una ruta fija y
// bloquea la descarga de navegadores de Playwright — por eso se apunta a
// esa ruta explícitamente en vez de dejar que Playwright intente
// descargarse el suyo. Si tu máquina no tiene esa variable de entorno,
// Playwright usa su propia instalación normal.
const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
  : undefined;

/**
 * Los tests con datos juegan en otra liga que los del armazón: entran con
 * sesión, cada pantalla encadena varias consultas a Supabase por la red y
 * todo eso corre contra UN `next dev`, que es un solo proceso.
 *
 * De ahí las dos diferencias de abajo, y las dos vienen de la misma
 * equivocación: subí el tiempo de espera del login a 45 s dejando el
 * límite del test en los 30 s de serie, así que ese 45 nunca podía
 * agotarse — Playwright mataba el test antes, con "Test timeout of 30000ms
 * exceeded" y sin decir qué esperaba. Un margen interior mayor que el
 * límite exterior no es un margen: es un mensaje de error peor.
 *
 * Y con doce tests a la vez sobre un servidor de desarrollo, la lentitud
 * no era mala suerte: era la carga que les metíamos nosotros mismos.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // El límite de CADA test. Tiene que ser mayor que la suma de esperas de
  // dentro, o las esperas no significan nada.
  timeout: CON_DATOS ? 120_000 : 30_000,
  // Dos en paralelo, no doce. El cuello de botella es el servidor, así que
  // más trabajadores no acortan la ejecución: solo hacen que todos vayan
  // lentos a la vez y que falle el que peor suerte tuvo.
  workers: CON_DATOS ? 2 : undefined,
  // Compila las pantallas antes de repartir los tests. Solo hace algo con
  // E2E_DATOS=1; el porqué está en el propio archivo.
  globalSetup: "./e2e/calentar-rutas.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    // Los tests con datos NO reutilizan un servidor que ya esté escuchando.
    // Reutilizarlo fue una trampa cara: un `pnpm dev` arrancado antes de
    // añadir SUPABASE_SERVICE_ROLE_KEY sigue sin verla, así que la
    // clasificación se saltaba en silencio y el recorrido fallaba por algo
    // que en el código estaba bien. Si el puerto está ocupado, Playwright
    // lo dice y se cierra ese `pnpm dev`; eso se arregla en diez segundos,
    // y lo otro cuesta una tarde.
    reuseExistingServer: !process.env.CI && !CON_DATOS,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : undefined,
      },
    },
  ],
});
