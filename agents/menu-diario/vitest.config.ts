import { defineConfig } from "vitest/config";

// Solo tests sin red ni secretos: `pnpm test` también corre en CI, donde no hay credenciales.
// Lo que necesite Supabase o LandingSite (agente:e2e) va fuera de esta carpeta de tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
