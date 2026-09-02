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
 * sesión y cada pantalla encadena una docena de consultas a Supabase por
 * la red.
 *
 * Se les cambia el servidor: **compilación de producción**, no `next dev`.
 * Tres rondas de fallos fueron todas la misma historia contada de formas
 * distintas —un `waitForURL` que se agota, un estado que no aparece a
 * tiempo, un test muerto por el reloj— y ninguna era un fallo del
 * producto: era `next dev` compilando y renderizando bajo demanda mientras
 * varios tests le pedían pantallas a la vez. Subir márgenes lo tapa unas
 * veces sí y otras no, que es lo peor de los dos mundos. `next build` una
 * vez y `next start` quita la causa: sin compilación en caliente, los
 * renders van varias veces más rápidos y la ejecución deja de depender de
 * la suerte.
 *
 * Cuesta un `build` al principio de cada ejecución. Vale la pena: un test
 * que falla por el reloj no dice nada de la aplicación, y hemos gastado
 * varias tardes averiguándolo.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // El límite de CADA test. Tiene que ser mayor que la suma de esperas de
  // dentro, o las esperas no significan nada: subir la espera del login a
  // 45 s dejando este en 30 s hizo que Playwright matara diez tests por el
  // reloj sin decir a qué esperaban.
  timeout: CON_DATOS ? 120_000 : 30_000,
  // Con el servidor de producción el cuello de botella pasa a ser la red
  // contra Supabase, que sí aguanta ir en paralelo.
  workers: CON_DATOS ? 4 : undefined,
  // Pide cada pantalla una vez antes de repartir los tests. Con `next
  // start` ya no hay compilación que adelantar, pero sigue sirviendo de
  // comprobación de que el servidor contesta de verdad antes de empezar.
  globalSetup: "./e2e/calentar-rutas.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    // `build` + `start` para la suite con datos; `dev` para la del
    // armazón, que no lo necesita y agradece el arranque instantáneo.
    command: CON_DATOS ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://localhost:3000",
    // Los tests con datos NO reutilizan un servidor que ya esté escuchando.
    // Reutilizarlo fue una trampa cara: un `pnpm dev` arrancado antes de
    // añadir SUPABASE_SERVICE_ROLE_KEY sigue sin verla, así que la
    // clasificación se saltaba en silencio y el recorrido fallaba por algo
    // que en el código estaba bien. Si el puerto está ocupado, Playwright
    // lo dice y se cierra ese `pnpm dev`; eso se arregla en diez segundos,
    // y lo otro cuesta una tarde.
    reuseExistingServer: !process.env.CI && !CON_DATOS,
    // Compilar entero lleva su rato; arrancar `next dev`, no.
    timeout: CON_DATOS ? 300_000 : 60_000,
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
