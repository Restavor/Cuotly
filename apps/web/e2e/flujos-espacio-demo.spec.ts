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
 * aplicación no llega a Supabase aunque el sembrado sí esté puesto — los
 * nueve fallan en el login con "Correo o contraseña incorrectos.", que es
 * lo que devuelve `signIn` cuando no puede hablar con Supabase, y no un
 * problema de credenciales. Está explicado en docs/DESPLIEGUE-SUPABASE.md.
 *
 * En una máquina con salida al dominio pasan los nueve (comprobado en
 * Windows el 02/09/2026). Al ejecutarse por primera vez encontraron tres
 * fallos de la aplicación: usuarios sembrados que no autenticaban, un
 * espacio con dos personas que nunca redirigía, y el cliente sin acceso al
 * slug de su espacio. Los tres están en el historial de git y resumidos en
 * docs/DESPLIEGUE-SUPABASE.md.
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
 * La fila de una tabla, identificada por el código que lleva dentro
 * (SOL-0002, TRB-0001…). Los estados se comprueban SOBRE la fila y no
 * sueltos en la página: los listados del equipo enseñan todo el espacio,
 * así que cualquier recorrido que cree una solicitud o un trabajo en el
 * otro restaurante añade filas con los mismos estados.
 */
function fila(page: Page, codigo: string) {
  return page.locator("tbody tr").filter({ hasText: codigo });
}

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
   * Entrar es el mismo formulario para los tres, pero cada papel acaba en
   * un sitio distinto, así que el destino se pasa y se espera aquí.
   *
   * Entrar encadena DOS redirecciones de servidor: `signIn`
   * (`app/(auth)/actions.ts`) manda a `/`, y es la raíz la que decide a
   * dónde va cada uno. Esperar solo a "ya no estoy en /login" se queda
   * corto: en ese momento la segunda redirección todavía no ha ocurrido.
   *
   * El margen es holgado, y no el de 5 s por defecto, porque cada
   * aterrizaje encadena varias consultas a Supabase por la red. No
   * enmascara nada: si la redirección no llega, el test sigue fallando, y
   * ahora además dice dónde se quedó y qué ponía en la pantalla.
   */
  async function entrar(page: Page, email: string, destino: RegExp) {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar en Cuotly" }).click();
    // Cuarenta y cinco segundos, y no los cinco de serie: el primer
    // aterrizaje de cada papel encadena varias consultas a Supabase por
    // la red. Cabe dentro del límite del test (120 s en esta suite) — un
    // margen interior mayor que el exterior no es un margen, es un
    // mensaje de error peor.
    try {
      await page.waitForURL(destino, { timeout: 45_000 });
    } catch (fallo) {
      // Si no llega, decir DÓNDE se quedó y QUÉ ponía ahí. Un
      // "waitForURL: Timeout" a secas obliga a adivinar, y ya hemos
      // adivinado bastante: la portada decide a dónde entra cada papel, y
      // cuando esa decisión sale mal lo que se ve es otra pantalla, no un
      // error del navegador.
      const titulo = await page
        .getByRole("heading")
        .first()
        .innerText()
        .catch(() => "(sin titular)");
      const alertas = await page
        .locator('[role="alert"]:visible:not(#__next-route-announcer__)')
        .allInnerTexts();
      throw new Error(
        `Entrando como ${email} no se llegó a ${destino}. Se quedó en ${page.url()}, ` +
          `con el titular "${titulo.trim()}"` +
          (alertas.length ? ` y este error en pantalla: ${alertas.join(" / ")}` : " y sin error en pantalla") +
          `. Causa original: ${fallo instanceof Error ? fallo.message.split("\n")[0] : String(fallo)}`,
      );
    }
  }

  const ESPACIO_URL = new RegExp(`/espacios/${ESPACIO}$`);
  const RESTAURANTE_URL = new RegExp(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`);

  test.describe("El equipo", () => {
    test("la propietaria aterriza en su espacio, con el restaurante sembrado", async ({ page }) => {
      await entrar(page, EQUIPO.propietaria.email, ESPACIO_URL);

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
      await entrar(page, EQUIPO.propietaria.email, ESPACIO_URL);
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
      //
      // Cada estado se comprueba EN SU FILA, identificada por el código de
      // la solicitud. Buscarlo suelto en el `tbody` era ambiguo por dos
      // motivos distintos: "Recibida" es además la cabecera de la columna
      // de fecha, y esta bandeja enseña TODO el espacio, así que en cuanto
      // el recorrido de CA-19 crea una solicitud en Café Prueba hay dos
      // filas con el mismo estado y Playwright lo rechaza. Anclar a la
      // fila deja el test estable ejecute lo que ejecute a su lado.
      await expect(fila(page, "SOL-0002")).toContainText("Recibida");
      await expect(fila(page, "SOL-0003")).toContainText("En curso");
      await expect(fila(page, "SOL-0004")).toContainText("Publicada");
    });

    test("el tablero de trabajos enseña los dos, con su responsable y su estado", async ({
      page,
    }) => {
      await entrar(page, EQUIPO.propietaria.email, ESPACIO_URL);
      await page.goto(`/espacios/${ESPACIO}/trabajos`);

      await expect(page.getByRole("heading", { name: "Trabajos" })).toBeVisible();

      await expect(page.getByRole("link", { name: "TRB-0001" })).toBeVisible();
      await expect(page.getByRole("link", { name: "TRB-0002" })).toBeVisible();

      // Uno en curso y otro publicado: es lo que dejó el sembrado, y son
      // dos estados distintos del mismo tablero. Anclados a su fila por lo
      // mismo que en la bandeja de solicitudes.
      await expect(fila(page, "TRB-0001")).toContainText("En curso");
      await expect(fila(page, "TRB-0002")).toContainText("Publicado");

      // El equipo SÍ ve quién es el responsable — es su organización
      // interna (P7). Lo que no puede verlo es el cliente, y eso se
      // comprueba más abajo.
      await expect(page.getByText(EQUIPO.trabajadora.nombre).first()).toBeVisible();
    });

    test("la trabajadora entra al mismo espacio y ve el trabajo que tiene asignado", async ({
      page,
    }) => {
      await entrar(page, EQUIPO.trabajadora.email, ESPACIO_URL);

      await expect(page).toHaveURL(new RegExp(`/espacios/${ESPACIO}$`));

      await page.goto(`/espacios/${ESPACIO}/trabajos`);
      await expect(page.getByRole("heading", { name: "Trabajos" })).toBeVisible();
      await expect(page.getByRole("link", { name: "TRB-0001" })).toBeVisible();
    });
  });

  test.describe("El cliente", () => {
    test("aterriza en su restaurante, no en un espacio de mantenimiento", async ({ page }) => {
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);

      // El otro lado de HU-02: no pertenece a ningún espacio, así que sus
      // contextos son sus restaurantes (app/page.tsx). Y como solo tiene
      // uno, entra directamente — PRD §20.1: "Con un solo contexto
      // accesible se entra directamente. Con varios, aparece un selector".
      // El selector es para el cliente con varios restaurantes, y su
      // subtítulo lo dice: "Tienes acceso a más de un restaurante".
      await expect(page).toHaveURL(
        new RegExp(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`),
      );
      await expect(page.getByRole("heading", { name: "Bar Demo" })).toBeVisible();
      await expect(page.getByText("EST-0001")).toBeVisible();
    });

    test("la bolsa del plan refleja lo que se ha consumido de verdad", async ({ page }) => {
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);
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
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);
      await page.goto(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`);

      await expect(page.getByRole("heading", { name: "Tus solicitudes" })).toBeVisible();

      // Las cuatro, al revés que el equipo: el borrador es suyo.
      for (const codigo of ["SOL-0001", "SOL-0002", "SOL-0003", "SOL-0004"]) {
        await expect(page.getByRole("link", { name: codigo })).toBeVisible();
      }
      await expect(page.getByText("Borrador")).toBeVisible();
    });

    /**
     * §68 · RN-MSG-10: "antes de enviar se revisa alcance, destinatario y
     * archivos". El borrador del sembrado (SOL-0001) es el caso: abrirlo
     * no lleva a una ficha de solo lectura sino a la pantalla de revisión,
     * con los tres apartados que nombra el documento y el botón de enviar.
     *
     * Sin esto, el borrador era un callejón sin salida: aparecía en la
     * lista del cliente y no había ninguna pantalla desde la que enviarlo.
     */
    test("abre su borrador y encuentra los tres puntos de revisión de §68", async ({ page }) => {
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);
      await page.goto(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`);

      await page.getByRole("link", { name: "SOL-0001" }).click();

      await expect(page).toHaveURL(/\/borrador$/);
      await expect(page.getByRole("heading", { name: "Borrador de solicitud" })).toBeVisible();

      await expect(page.getByText("1. Alcance: qué pides")).toBeVisible();
      await expect(page.getByText("2. Destinatario: para quién es")).toBeVisible();
      await expect(page.getByText("3. Archivos: qué lo acompaña")).toBeVisible();

      // El alcance llega editable con lo que el cliente escribió.
      await expect(page.getByLabel("Qué quieres cambiar")).toHaveValue(
        /horario de apertura de los domingos/,
      );

      await expect(page.getByRole("button", { name: "Enviar solicitud" })).toBeVisible();
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
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);

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
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);

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
