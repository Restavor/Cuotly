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
 * **Desde el 14/09/2026 los ejecuta CI** (job `e2e-datos`), y sin ningún
 * secreto: no hace falta el proyecto real, hace falta *un* Supabase con
 * las migraciones y este sembrado, y eso es lo que `supabase start`
 * levanta en el runner.
 *
 * Lo que sigue sin poder hacerse es lanzarlos desde el contenedor de
 * Claude Code: su política de salida bloquea el dominio del proyecto (403
 * al CONNECT), así que la aplicación no llega a Supabase aunque el
 * sembrado sí esté puesto. Fallan en el login diciendo "No hemos podido
 * conectar… no de tu contraseña", que es `src/core/auth-errors.ts`
 * separando un fallo de red de una credencial mala. Está explicado en
 * docs/DESPLIEGUE-SUPABASE.md.
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
const CLAVE = "Restavor-demo-2026";

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
  /**
   * Entrar y ponerse donde el test necesita.
   *
   * Desde la **decisión 42** (16/09/2026) entrar lleva SIEMPRE al Inicio
   * global: la raíz dejó de redirigir sola a tu único contexto. Así que
   * esto son dos pasos, y los dos importan — que se llegue a la portada, y
   * que desde la portada se pueda ir a lo tuyo—. Antes era uno solo porque
   * la raíz decidía por ti.
   *
   * El margen es holgado, y no el de 5 s por defecto, porque el aterrizaje
   * encadena varias consultas a Supabase por la red. No enmascara nada: si
   * no llega, el test sigue fallando, y ahora además dice dónde se quedó y
   * qué ponía en la pantalla.
   */
  async function entrar(page: Page, email: string, ruta?: string) {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar en Restavor web" }).click();

    try {
      await page.waitForURL(/\/$/, { timeout: 45_000 });
    } catch (fallo) {
      // Si no llega, decir DÓNDE se quedó y QUÉ ponía ahí. Un
      // "waitForURL: Timeout" a secas obliga a adivinar, y ya hemos
      // adivinado bastante.
      const titulo = await page
        .getByRole("heading")
        .first()
        .innerText()
        .catch(() => "(sin titular)");
      const alertas = await page
        .locator('[role="alert"]:visible:not(#__next-route-announcer__)')
        .allInnerTexts();
      throw new Error(
        `Entrando como ${email} no se llegó al Inicio de Restavor web. Se quedó en ${page.url()}, ` +
          `con el titular "${titulo.trim()}"` +
          (alertas.length ? ` y este error en pantalla: ${alertas.join(" / ")}` : " y sin error en pantalla") +
          `. Causa original: ${fallo instanceof Error ? fallo.message.split("\n")[0] : String(fallo)}`,
      );
    }

    if (ruta !== undefined) await page.goto(ruta);
  }

  const ESPACIO_URL = `/espacios/${ESPACIO}`;
  const RESTAURANTE_URL = `/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`;

  test.describe("El equipo", () => {
    test("la propietaria entra al Inicio de Restavor web y llega a su espacio, con el restaurante sembrado", async ({ page }) => {
      await entrar(page, EQUIPO.propietaria.email, ESPACIO_URL);

      // Decisión 42 · la raíz ya no redirige: se entra SIEMPRE al Inicio
      // global (§36), y el espacio se elige desde ahí. `entrar()` hace los
      // dos pasos; aquí se comprueba que el segundo ha llegado a su sitio.
      await expect(page).toHaveURL(new RegExp(`/espacios/${ESPACIO}$`));
      // El Inicio del espacio se rediseñó dos veces. Primero su titular pasó a
      // ser "Inicio" (commit cfd094a) y después, con el saludo del diseño
      // definitivo, a ser "Hola <nombre>," con los indicadores dentro de una
      // región llamada "Inicio". Este test se quedó anclado al diseño anterior
      // y nadie se enteró porque los recorridos con datos no los ejecutaba
      // nadie desde el 02/09. Se comprueban las dos cosas: que es el Inicio
      // (saludo + región) y que es SU espacio.
      await expect(page.getByRole("heading", { name: "Hola Elena,", level: 1 })).toBeVisible();
      await expect(page.getByRole("region", { name: "Inicio" })).toBeVisible();
      await expect(page.getByText("Demo Restavor web").first()).toBeVisible();

      // Y el equipo, con los dos miembros por su nombre visible: eso sí
      // sigue en el Inicio, en la tarjeta "Carga del equipo".
      await expect(page.getByText(EQUIPO.propietaria.nombre).first()).toBeVisible();
      await expect(page.getByText(EQUIPO.trabajadora.nombre).first()).toBeVisible();

      // El restaurante del sembrado, con su código y su estado. Ya no está
      // en el Inicio —el rediseño lo dejó con indicadores, atención, carga
      // del equipo, Menú Diario y actividad—, así que se mira donde vive.
      await page.goto(`/espacios/${ESPACIO}/restaurantes`);
      await expect(page.getByText("EST-0001")).toBeVisible();
      await expect(page.getByText("Bar Demo")).toBeVisible();
      await expect(page.getByText("Activo").first()).toBeVisible();
    });

    test("decisión 42 · la raíz es el Inicio de Restavor web, también con un solo espacio", async ({
      page,
    }) => {
      // Este test existe por lo que cambió: hasta el 16/09/2026 la raíz
      // redirigía sola cuando solo tenías un contexto (§20.1), y por eso
      // quien tiene un solo espacio no veía nunca el Inicio global. Si
      // alguien devuelve aquella redirección, esto se pone rojo.
      await entrar(page, EQUIPO.propietaria.email);

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Mis espacios de mantenimiento" }),
      ).toBeVisible();
      // Desde el diseño definitivo cada contexto es una tarjeta con su nombre
      // en un párrafo y un botón "Entrar al espacio" (ya no hay un enlace cuyo
      // nombre accesible sea el del espacio). El enlace se identifica por a
      // dónde lleva, que es lo que importa, y el nombre por su tarjeta.
      await expect(page.locator(`a[href="${ESPACIO_URL}"]`).first()).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Entrar al espacio" }),
      ).toBeVisible();
      await expect(page.getByText("Demo Restavor web").first()).toBeVisible();
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
      // El código ya no es un enlace: es texto de la fila, y el enlace es el
      // botón "Ver solicitud". Se comprueba la fila.
      await expect(fila(page, "SOL-0002")).toBeVisible();
      await expect(fila(page, "SOL-0003")).toBeVisible();
      await expect(fila(page, "SOL-0004")).toBeVisible();
      await expect(fila(page, "SOL-0001")).toHaveCount(0);

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
      // En la FILA: suelto, `getByText` encuentra primero la opción del
      // desplegable "Responsable", que existe pero no se ve.
      await expect(fila(page, "TRB-0001")).toContainText("Marta Gil");
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
    test("entra al Inicio de Restavor web y desde ahí a su restaurante, no a un espacio", async ({ page }) => {
      await entrar(page, CLIENTE.email);

      // Decisión 42 · el cliente también entra al Inicio global, y desde
      // ahí a lo suyo. Lo que se comprueba aquí es el otro lado de HU-02
      // y de RN-GLO-03: no pertenece a ningún espacio, así que su contexto
      // es su restaurante, y tiene que verlo listado y poder entrar.
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();

      // Y NO ve el espacio de mantenimiento como contexto suyo: el
      // restaurante es lo único que le pertenece (P7).
      await expect(
        page.getByRole("heading", { name: "Mis paneles de restaurante" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Mis espacios de mantenimiento" }),
      ).toHaveCount(0);

      // Exacto, y por el mismo motivo: el enlace del selector, no una fila
      // de "Necesita tu atención" que también lleve el nombre dentro.
      // Desde el diseño definitivo el panel es una tarjeta con el botón
      // "Entrar al panel", no un enlace con el nombre del restaurante.
      await page.getByRole("link", { name: "Entrar al panel" }).first().click();

      await expect(page).toHaveURL(
        new RegExp(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`),
      );
      // El panel del restaurante saluda ("Hola, Bar") y nombra el local y su
      // código en párrafos; ya no hay un titular con el nombre del local.
      await expect(page.getByText("Bar Demo").first()).toBeVisible();
      await expect(page.getByText("EST-0001").first()).toBeVisible();
    });

    test("la bolsa del plan refleja lo que se ha consumido de verdad", async ({ page }) => {
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);
      await page.goto(`/espacios/${ESPACIO}/restaurantes/${RESTAURANTE_ID}`);

      await expect(page.getByRole("heading", { name: "Cuotas de este ciclo" })).toBeVisible();

      // El plan del sembrado (el catálogo antiguo, Impulso+) incluye 16
      // cambios pequeños. El sembrado aceptó dos solicitudes de esa categoría.
      // La tarjeta ya no dice "quedan 14 de 16" sino lo USADO sobre lo
      // INCLUIDO: "2 / 16". El número no sale de un contador: sale de sumar el
      // libro de apuntes (`establishment_cycle_allowance`), que es lo que
      // manda CLAUDE.md.
      const pequeno = page.getByRole("listitem").filter({ hasText: "Cambio pequeño" });
      await expect(pequeno).toContainText("2 / 16");

      // Las otras categorías siguen sin gastar.
      await expect(
        page.getByRole("listitem").filter({ hasText: "Fotografía" }),
      ).toContainText("0 / 12");
    });

    test("ve sus cuatro solicitudes, el borrador incluido", async ({ page }) => {
      await entrar(page, CLIENTE.email, RESTAURANTE_URL);
      // La raíz del panel es ahora un resumen ("Hola, Bar"); la lista de
      // solicitudes vive en /solicitudes.
      await page.goto(`${RESTAURANTE_URL}/solicitudes`);

      await expect(page.getByRole("heading", { name: "Solicitudes", level: 1 })).toBeVisible();

      // Las cuatro, al revés que el equipo: el borrador es suyo. El código va
      // en el subtítulo de la fila ("SOL-0001 · …"), no en un enlace.
      for (const codigo of ["SOL-0001", "SOL-0002", "SOL-0003", "SOL-0004"]) {
        await expect(fila(page, codigo)).toBeVisible();
      }
      // En su fila: "Borrador" también es una opción del filtro de estado.
      await expect(fila(page, "SOL-0001")).toContainText("Borrador");
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
      await page.goto(`${RESTAURANTE_URL}/solicitudes`);

      await fila(page, "SOL-0001").getByRole("link", { name: "Ver solicitud" }).click();

      await expect(page).toHaveURL(/\/borrador$/);
      // El borrador se rediseñó (R07): ya no son tres bloques numerados sino
      // una pantalla de "Revisar y enviar" con un resumen, el destinatario, los
      // archivos y el botón de confirmar. Siguen estando los tres puntos de
      // §68 (alcance, destinatario, archivos), con otras palabras.
      await expect(
        page.getByRole("heading", { name: "Revisar y enviar solicitud", level: 1 }),
      ).toBeVisible();
      await expect(page.getByText("Resumen de la solicitud")).toBeVisible();
      // 1 · alcance, con lo que el cliente escribió.
      await expect(page.getByText(/horario de apertura de los domingos/).first()).toBeVisible();
      // 2 · destinatario.
      await expect(page.getByText(/^Para Bar Demo/)).toBeVisible();
      // 3 · archivos.
      await expect(page.getByText(/^Archivos adjuntos \(\d+\)$/)).toBeVisible();

      await expect(page.getByRole("button", { name: "Confirmar envío" })).toBeVisible();
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
      // Texto y no enlace: el código ya no es un enlace, y comprobar que no
      // hay un enlace que ya no existe no demostraría nada.
      await expect(page.getByText("SOL-0002")).toHaveCount(0);

      await page.goto(`/espacios/${ESPACIO}/trabajos`);
      await expect(page.getByText("TRB-0001")).toHaveCount(0);
    });
  });
});
