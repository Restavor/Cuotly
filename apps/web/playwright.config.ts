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
    reuseExistingServer: !process.env.CI,
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
