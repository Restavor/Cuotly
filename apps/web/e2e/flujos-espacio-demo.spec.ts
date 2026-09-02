import { expect, test, type Page } from "@playwright/test";

/**
 * Los flujos, recorridos con los tres papeles sobre el espacio de
 * demostración que siembra `supabase/seed/espacio-demo.sql`.
 *
 * A DIFERENCIA del resto de la suite, este archivo NECESITA una base de
 * datos: entra con usuarios de verdad y lee lo que RLS le deja leer a cada
 * uno. Por eso se salta solo —y lo dice— cuando el entorno no apunta a
 * ningún Supabase. Un test que se salta en silencio es peor que no
 * tenerlo: parece verde y no ha probado nada.
 *
 * Antes de ejecutarlo:
 *
 *   1. `apps/web/.env.local` con NEXT_PUBLIC_SUPABASE_URL y
 *      NEXT_PUBLIC_SUPABASE_ANON_KEY del proyecto.
 *   2. El sembrado aplicado:
 *      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/espacio-demo.sql
 *   3. `pnpm test:e2e:datos` desde `apps/web`. El script pasa por
 *      `cross-env` para que la variable se ponga igual en bash, en cmd y
 *      en PowerShell: `E2E_DATOS=1 playwright test` a secas es sintaxis
 *      POSIX y en Windows falla con "no se reconoce como un comando".
 *
 * NO se puede ejecutar desde el contenedor de Claude Code: su política de
 * salida bloquea el dominio del proyecto (403 al CONNECT), así que la
 * aplicación no llega a Supabase aunque el sembrado sí esté puesto. Está
 * explicado en docs/DESPLIEGUE-SUPABASE.md.
 *
 * Lo que se comprueba no es "que la página cargue", sino las cuatro cosas
 * que solo se ven con datos reales y tres identidades distintas:
 *
 *   · que cada papel aterriza donde le toca (HU-02, los dos lados);
 *   · que el equipo NO ve el borrador del cliente, y el cliente SÍ;
 *   · que la bolsa del plan refleja lo consumido de verdad (RN-COM);
 *   · y que el cliente no ve el nombre de nadie del equipo (CA-04, el
 *     MUST NOT de CLAUDE.md que ya se escapó tres veces en el servidor).
 */

const ESPACIO = "demo";
const RESTAURANTE_ID = "d4000000-0000-0000-0000-000000000001";
const CLAVE = "Cuotly-demo-2026";

const EQUIPO = {
  propietaria: { email: "owner@cuotly.test", nombre: "Elena Ruiz (propietaria)" },
  trabajadora: { email: "trabajadora@cuotly.test", nombre: "Marta Gil (trabajadora)" },
};
const CLIENTE = { email: "restaurante@cuotly.test" };

/**
 * La señal es EXPLÍCITA (`E2E_DATOS=1`), y no "¿está
 * NEXT_PUBLIC_SUPABASE_URL?", por dos motivos:
 *
 *   · Playwright no lee `apps/web/.env.local` — eso lo hace Next.js al
 *     arrancar el servidor. Mirar esas variables desde aquí daría
 *     "no configurado" SIEMPRE, y este archivo se saltaría entero para
 *     siempre pareciendo verde. Es justo lo que no puede pasar.
 *   · Con la señal puesta y la base caída, los tests FALLAN en vez de
 *     saltarse. Que es lo correcto: has pedido el recorrido con datos.
 *
 * O sea: se salta solo si no lo has pedido; si lo pides, o pasa o falla.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";

test.describe("Flujos sobre el espacio de demostración", () => {
  test.skip(
    !CON_DATOS,
    "Necesita base de datos y el espacio sembrado. Ejecuta `pnpm test:e2e:datos` " +
      "(o E2E_DATOS=1 pnpm test:e2e) con apps/web/.env.local apuntando al proyecto y " +
      "supabase/seed/espacio-demo.sql aplicado. Ver docs/DESPLIEGUE-SUPABASE.md.",
  );

  /**
   * Entrar es el mismo formulario para los tres. Se espera a que el
   * servidor redirija fuera de /login: el `signIn` de
   * `app/(auth)/actions.ts` hace `redirect("/")` y es la raíz la que
   * decide dónde aterriza cada papel.
   */
  async function entrar(page: Page, email: string) {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar en Cuotly" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }

  test.describe("El equipo", () => {
    test("la propietaria aterriza en su espacio, con el restaurante sembrado", async ({ page }) => {
      await entrar(page, EQUIPO.propietaria.email);

      // Pertenece a un solo espacio, así que la raíz redirige sola
      // (app/page.tsx: `if (spaces.length === 1) redirect(...)`).
      await expect(page).toHaveURL(new RegExp(`/espacios/${ESPACIO}$`));
      await expect(page.getByRole("heading", { name: "Demo Cuotly" })).toBeVisible();

      // El restaurante del sembrado, con su código y su estado.
      await expect(page.getByText("EST-0001")).toBeVisible();
      await expect(page.getByText("Bar Demo")).toBeVisible();
      await expect(page.getByText("Activo").first()).toBeVisible();

      // Y el equipo, con los dos miembros por su nombre visible.
      await expect(page.getByText(EQUIPO.propietaria.nombre)).toBeVisible();
      await expect(page.getByText(EQUIPO.trabajadora.nombre)).toBeVisible();
    });

    test("la bandeja de solicitudes enseña las enviadas y NO el borrador del cliente", async ({
      page,
    }) => {
      await entrar(page, EQUIPO.propietaria.email);
      await page.goto(`/espacios/${ESPACIO}/solicitudes`);

      await expect(page.getByRole("heading", { name: "Solicitudes" })).toBeVisible();

      // Tres de las cuatro: la bandeja del equipo filtra `draft`
      // (`.neq("state", "draft")` en la página). Que SOL-0001 no esté es
      // la mitad interesante de la comprobación — un borrador es del
      // cliente hasta que lo envía.
      await expect(page.getByRole("link", { name: "SOL-0002" })).toBeVisible();
      await expect(page.getByRole("link", { name: "SOL-0003" })).toBeVisible();
      await expect(page.getByRole("link", { name: "SOL-0004" })).toBeVisible();
      await expect(page.getByRole("link", { name: "SOL-0001" })).toHaveCount(0);

      // Los estados, con el nombre único de CA-21 (src/i18n/es.ts), no en
      // crudo desde la base de datos.
      await expect(page.getByText("Recibida")).toBeVisible();
      await expect(page.getByText("En curso")).toBeVisible();
      await expect(page.getByText("Publicada")).toBeVisible();
    });

    test("el tablero de trabajos enseña los dos, con su responsable y su estado", async ({
      page,
    }) => {
      await entrar(page, EQUIPO.propietaria.email);
      await page.goto(`/espacios/${ESPACIO}/trabajos`);

      await expect(page.getByRole("heading", { name: "Trabajos" })).toBeVisible();

      await expect(page.getByRole("link", { name: "TRB-0001" })).toBeVisible();
      await expect(page.getByRole("link", { name: "TRB-0002" })).toBeVisible();

      // Uno en curso y otro publicado: es lo que dejó el sembrado, y son
      // dos estados distintos del mismo tablero.
      await expect(page.getByText("En curso")).toBeVisible();
      await expect(page.getByText("Publicado")).toBeVisible();

      // El equipo SÍ ve quién es el responsable — es su organización
      // interna (P7). Lo que no puede verlo es el cliente, y eso se
      // comprueba más abajo.
      await expect(page.getByText(EQUIPO.trabajadora.nombre).first()).toBeVisible();
    });

    test("la trabajadora entra al mismo espacio y ve el trabajo que tiene asignado", async ({
      page,
    }) => {
      await entrar(page, EQUIPO.trabajadora.email);

      await expect(page).toHaveURL(new RegExp(`/espacios/${ESPACIO}$`));

      await page.goto(`/espacios/${ESPACIO}/trabajos`);
      await expect(page.getByRole("heading", { name: "Trabajos" })).toBeVisible();
      await expect(page.getByRole("link", { name: "TRB-0001" })).toBeVisible();
    });
  });

  test.describe("El cliente", () => {
    test("aterriza en su restaurante, no en un espacio de mantenimiento", async ({ page }) => {
      await entrar(page, CLIENTE.email);

      // El otro lado de HU-02: no pertenece a ningún espacio, así que sus
      // contextos son sus restaurantes (app/page.tsx). Con uno solo, la
      // raíz pinta el selector de cliente con su tarjeta.
      await expect(page.getByRole("heading", { name: "Elige un restaurante" })).toBeVisible();
      await page.getByText("Bar Demo").click();

      await expect(page).toHaveURL(
        new RegExp(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`),
      );
      await expect(page.getByRole("heading", { name: "Bar Demo" })).toBeVisible();
      await expect(page.getByText("EST-0001")).toBeVisible();
    });

    test("la bolsa del plan refleja lo que se ha consumido de verdad", async ({ page }) => {
      await entrar(page, CLIENTE.email);
      await page.goto(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`);

      await expect(
        page.getByRole("heading", { name: "Lo que incluye tu plan este ciclo" }),
      ).toBeVisible();

      // Impulso incluye 16 cambios pequeños. El sembrado aceptó dos
      // solicitudes de esa categoría, así que quedan 14. El número no sale
      // de un contador: sale de sumar el libro de apuntes
      // (`establishment_cycle_allowance`), que es lo que manda CLAUDE.md.
      const pequeno = page.getByRole("listitem").filter({ hasText: "Cambio pequeño" });
      await expect(pequeno).toContainText("14");
      await expect(pequeno).toContainText("de 16");

      // Las otras tres categorías siguen enteras.
      await expect(
        page.getByRole("listitem").filter({ hasText: "Fotografía" }),
      ).toContainText("de 12");
    });

    test("ve sus cuatro solicitudes, el borrador incluido", async ({ page }) => {
      await entrar(page, CLIENTE.email);
      await page.goto(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`);

      await expect(page.getByRole("heading", { name: "Tus solicitudes" })).toBeVisible();

      // Las cuatro, al revés que el equipo: el borrador es suyo.
      for (const codigo of ["SOL-0001", "SOL-0002", "SOL-0003", "SOL-0004"]) {
        await expect(page.getByRole("link", { name: codigo })).toBeVisible();
      }
      await expect(page.getByText("Borrador")).toBeVisible();
    });

    /**
     * CA-04 y el MUST NOT de CLAUDE.md: "no mostrar al cliente el nombre,
     * foto o identidad individual de nadie del equipo de mantenimiento".
     *
     * En el servidor esto lo sostienen los privilegios de columna y las
     * vistas barrera, y se escapó tres veces. Esta es la comprobación por
     * el otro extremo: mirando lo que la pantalla enseña de verdad.
     */
    test("nunca ve el nombre de nadie del equipo (CA-04)", async ({ page }) => {
      await entrar(page, CLIENTE.email);

      const pantallas = [
        `/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`,
        `/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}/facturacion`,
      ];

      for (const ruta of pantallas) {
        await page.goto(ruta);
        const texto = await page.locator("body").innerText();
        expect(texto, `${ruta} enseña el nombre de la trabajadora`).not.toContain("Marta Gil");
        expect(texto, `${ruta} enseña el nombre de la propietaria`).not.toContain("Elena Ruiz");
        expect(texto, `${ruta} enseña un correo del equipo`).not.toContain("@cuotly.test");
      }
    });

    test("no puede entrar en las pantallas del equipo por la URL", async ({ page }) => {
      await entrar(page, CLIENTE.email);

      // Ocultar un enlace no es un control de acceso (CLAUDE.md): la
      // comprobación es ir por la URL directa. La bandeja del equipo
      // responde "sin permiso" porque el cliente no es miembro del
      // espacio, no una lista vacía que parezca que no hay trabajo.
      await page.goto(`/espacios/${ESPACIO}/solicitudes`);
      await expect(page.getByRole("link", { name: "SOL-0002" })).toHaveCount(0);

      await page.goto(`/espacios/${ESPACIO}/trabajos`);
      await expect(page.getByRole("link", { name: "TRB-0001" })).toHaveCount(0);
    });
  });
});
