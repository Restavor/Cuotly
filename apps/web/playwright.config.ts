import { defineConfig, devices } from "@playwright/test";

// Este entorno de desarrollo trae Chromium preinstalado en una ruta fija y
// bloquea la descarga de navegadores de Playwright — por eso se apunta a
// esa ruta explícitamente en vez de dejar que Playwright intente
// descargarse el suyo. Si tu máquina no tiene esa variable de entorno,
// Playwright usa su propia instalación normal.
const executablePath = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
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
    reuseExistingServer: !process.env.CI && process.env.E2E_DATOS !== "1",
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
