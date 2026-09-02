import { expect, test, type Page } from "@playwright/test";

/**
 * CA-19 · "Cada flujo principal (solicitar, aceptar, asignar, comenzar,
 * bloquear, publicar, corregir, pagar o confirmar, consultar, gestionar
 * equipo) puede completarse **íntegramente en móvil**, con la anchura de un
 * teléfono, sin recurrir al escritorio."
 *
 * Esto es lo que faltaba para cerrar el criterio, y la diferencia con
 * `flujos-espacio-demo.spec.ts` importa: aquel NAVEGA y LEE —comprueba que
 * cada papel aterriza donde le toca y que ve lo que le corresponde—, y
 * este PULSA. Aquí una solicitud nace, se analiza, se valida, se acepta,
 * se asigna, se comienza, se bloquea, se desbloquea, se publica y se
 * corrige, toda ella desde botones, con 390 px de ancho.
 *
 * Sobre los datos, que es la decisión de diseño de este archivo: todo lo
 * que se escribe ocurre en **"Café Prueba"** (EST-0002), nunca en "Bar
 * Demo" (EST-0001). El otro archivo cuenta cosas exactas sobre Bar Demo
 * —cuatro solicitudes, catorce de dieciséis en la bolsa— y un recorrido
 * que crea y acepta le cambiaría el suelo bajo los pies. Café Prueba tiene
 * plan Básico a propósito: Básico no incluye ningún cambio, así que
 * aceptar aquí no gasta bolsa y el recorrido se puede repetir sin agotar
 * nada (ver `supabase/seed/espacio-demo.sql`, sección 5 bis).
 *
 * Los pasos van en un solo test y en orden, con `test.step()`, porque un
 * recorrido ES una secuencia: no se puede publicar lo que no se ha
 * comenzado. `test.step()` deja ver en qué paso falla, que es lo que se
 * pierde si se mete todo en un bloque sin marcar.
 *
 * Requisitos, además de los del otro archivo: `SUPABASE_SERVICE_ROLE_KEY`
 * en `apps/web/.env.local`. El envío graba lo que propuso el clasificador
 * con `record_classification()`, reservada a `service_role` porque
 * RN-CLS-01 dice que eso no puede depender de lo que afirme el cliente.
 * Sin esa clave la solicitud se queda en "Recibida" y el recorrido para en
 * el segundo paso.
 */

const ESPACIO = "demo";
const CAFE_ID = "d4000000-0000-0000-0000-000000000002";
const CLAVE = "Cuotly-demo-2026";

const PROPIETARIA = "owner@cuotly.test";
const TRABAJADORA = "trabajadora@cuotly.test";
const CLIENTE_CAFE = "cliente2@cuotly.test";

const TELEFONO = { width: 390, height: 844 }; // iPhone 14

const CON_DATOS = process.env.E2E_DATOS === "1";

/** Un texto irrepetible por ejecución, para reencontrar la solicitud creada. */
const MARCA = `E2E ${Date.now().toString(36)}`;

test.describe("CA-19 · cada flujo principal se completa en un teléfono", () => {
  test.skip(
    !CON_DATOS,
    "Necesita base de datos y el espacio sembrado. Ejecuta `pnpm test:e2e:datos`. " +
      "Ver docs/DESPLIEGUE-SUPABASE.md.",
  );

  test.use({ viewport: TELEFONO });

  async function entrar(page: Page, email: string, destino: RegExp) {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar en Cuotly" }).click();
    await page.waitForURL(destino, { timeout: 20_000 });
  }

  /**
   * Lo que CA-19 quiere decir con "sin recurrir al escritorio": que nada
   * obligue a desplazarse en horizontal. Se comprueba en cada pantalla del
   * recorrido, no una vez al principio — es donde se rompe de verdad, en
   * una tabla o un formulario concreto, no en el armazón.
   */
  async function cabeEnElTelefono(page: Page, donde: string) {
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda, `${donde} se desborda a lo ancho en un teléfono`).toBe(false);
  }

  test("de pedir un cambio a corregirlo publicado, sin salir del móvil", async ({ page }) => {
    test.setTimeout(180_000);

    let solicitudUrl = "";
    let trabajoUrl = "";

    await test.step("SOLICITAR · el restaurante pide un cambio", async () => {
      await entrar(page, CLIENTE_CAFE, new RegExp(`/restaurantes/${CAFE_ID}`));
      await cabeEnElTelefono(page, "la ficha del restaurante");

      await expect(page.getByRole("heading", { name: "Pedir un cambio" })).toBeVisible();
      await page.getByLabel("Qué quieres cambiar").fill(`${MARCA} · cambiar el teléfono del pie`);
      await page.getByLabel("Dónde está (opcional)").fill("En el pie de todas las páginas");
      await page.getByRole("button", { name: "Enviar solicitud" }).click();

      // Aparece en su lista, ya enviada y ya clasificada: RN-CLS-01 dice
      // que la clasificación ocurre "al enviarse una solicitud", así que el
      // propio envío la lleva de "Recibida" a "Pendiente de validar" sin
      // que nadie del equipo pulse nada.
      const fila = page.locator("tbody tr").filter({ hasText: MARCA });
      await expect(fila).toBeVisible({ timeout: 15_000 });
      await expect(
        fila,
        'Si aquí pone "Recibida", la solicitud se envió pero NO se clasificó. ' +
          "La consola del servidor de desarrollo dice por qué; casi siempre es que " +
          "falta SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local, o que el servidor " +
          "se arrancó antes de añadirla (Playwright reutiliza el `pnpm dev` que ya " +
          "esté escuchando en el 3000: ciérralo y vuelve a lanzar los tests).",
      ).toContainText("Pendiente de validar", { timeout: 15_000 });
    });

    await test.step("VALIDAR · el equipo confirma la clasificación", async () => {
      await entrar(page, PROPIETARIA, new RegExp(`/espacios/${ESPACIO}$`));
      await page.goto(`/espacios/${ESPACIO}/solicitudes`);
      await cabeEnElTelefono(page, "la bandeja de solicitudes");

      await page.locator("tbody tr").filter({ hasText: MARCA }).getByRole("link").first().click();
      await page.waitForURL(/\/solicitudes\/[0-9a-f-]{36}/, { timeout: 15_000 });
      solicitudUrl = page.url();
      await cabeEnElTelefono(page, "el detalle de la solicitud");

      // La propuesta ya está grabada: la escribió el servidor al enviar,
      // con `record_classification()`, y sin clave de IA habrá caído al
      // motor de reglas (RN-CLS-02). El equipo no arranca nada: llega y
      // valida.
      await expect(page.getByRole("heading", { name: "Validar la clasificación" })).toBeVisible({
        timeout: 15_000,
      });

      // RN-CLS-03: hasta que una persona valida, el restaurante no ve ni
      // categoría ni resumen.
      await page.getByLabel("Categoría").selectOption("small");
      await page
        .getByLabel("Resumen para el restaurante")
        .fill("Corrección del teléfono del pie de página.");
      await page.getByRole("button", { name: "Validar y enviar al restaurante" }).click();

      await expect(page.getByText("Esperando al restaurante")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("ACEPTAR · el restaurante da el visto bueno", async () => {
      await entrar(page, CLIENTE_CAFE, new RegExp(`/restaurantes/${CAFE_ID}`));
      await cabeEnElTelefono(page, "la ficha con la aceptación pendiente");

      const pendiente = page
        .locator("div")
        .filter({ hasText: "Pendiente de tu aceptación" })
        .first();
      await expect(pendiente).toBeVisible();

      await page.getByRole("button", { name: "Aceptar y que empiecen" }).first().click();

      // Aceptar crea el trabajo. En Básico no gasta bolsa: se presupuesta
      // aparte (CLAUDE.md, "Básico NO incluye ningún cambio").
      const fila = page.locator("tbody tr").filter({ hasText: MARCA });
      await expect(fila).toContainText("Aceptada", { timeout: 15_000 });
    });

    await test.step("ASIGNAR · el equipo elige responsable", async () => {
      await entrar(page, PROPIETARIA, new RegExp(`/espacios/${ESPACIO}$`));
      await page.goto(`/espacios/${ESPACIO}/trabajos`);
      await cabeEnElTelefono(page, "el tablero de trabajos");

      // El trabajo nuevo es el del restaurante Café Prueba que está sin
      // asignar; se abre por ahí, que es como lo haría una persona.
      const fila = page
        .locator("tbody tr")
        .filter({ hasText: "Café Prueba" })
        .filter({ hasText: "Sin asignar" })
        .first();
      await fila.getByRole("link").first().click();
      await page.waitForURL(/\/trabajos\/[0-9a-f-]{36}/, { timeout: 15_000 });
      trabajoUrl = page.url();
      await cabeEnElTelefono(page, "el detalle del trabajo");

      // Los candidatos y su orden los calcula el servidor, no la pantalla.
      await expect(page.getByRole("heading", { name: "Asignar" })).toBeVisible();
      await page.getByRole("button", { name: "Asignar" }).first().click();
      await expect(page.getByText("Asignado").first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("COMENZAR, BLOQUEAR y DESBLOQUEAR · la trabajadora", async () => {
      await entrar(page, TRABAJADORA, new RegExp(`/espacios/${ESPACIO}$`));
      await page.goto(trabajoUrl);
      await cabeEnElTelefono(page, "el trabajo asignado");

      // Comenzar para T2 y arranca T3 (RN-SLA). Solo puede el responsable.
      await page.getByRole("button", { name: "Comenzar" }).click();
      await expect(page.getByText("En curso").first()).toBeVisible({ timeout: 15_000 });

      // Bloquear detiene el contador de ejecución.
      await page.getByLabel("Motivo del bloqueo").selectOption("client_information");
      await page.getByLabel("Detalle").fill("Falta el número nuevo.");
      await page.getByRole("button", { name: "Bloquear" }).click();
      await expect(page.getByText("Bloqueado").first()).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Desbloquear" }).click();
      await expect(page.getByText("En curso").first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("PUBLICAR · la trabajadora entrega", async () => {
      await page.goto(trabajoUrl);
      await cabeEnElTelefono(page, "el trabajo antes de publicar");

      // La ventana de corrección la calcula el reloj laborable de
      // src/core/, no SQL; la pantalla solo la envía.
      await page.getByRole("button", { name: "Publicar" }).click();
      await expect(page.getByText("Publicado").first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("CORREGIR · el restaurante pide su corrección gratuita", async () => {
      await entrar(page, CLIENTE_CAFE, new RegExp(`/restaurantes/${CAFE_ID}`));

      await page.locator("tbody tr").filter({ hasText: MARCA }).getByRole("link").first().click();
      await page.waitForURL(/\/solicitudes\/[0-9a-f-]{36}/, { timeout: 15_000 });
      await cabeEnElTelefono(page, "el detalle de la solicitud publicada");

      // RN-COR-01: una sola por trabajo, dentro de la ventana que se abre
      // al publicar.
      await expect(page.getByRole("heading", { name: "Pedir una corrección" })).toBeVisible();
      await page.getByLabel("Qué hay que corregir").fill("El prefijo está mal.");
      await page.getByRole("button", { name: "Pedir la corrección" }).click();

      // Gastada la única, la pantalla lo dice en vez de ofrecerla otra vez.
      await expect(page.getByText("Ya has usado la corrección de este trabajo")).toBeVisible({
        timeout: 15_000,
      });
    });

    expect(solicitudUrl, "no se llegó a abrir el detalle de la solicitud").not.toBe("");
    expect(trabajoUrl, "no se llegó a abrir el detalle del trabajo").not.toBe("");
  });

  test("PAGAR · el equipo registra un pago desde el teléfono", async ({ page }) => {
    test.setTimeout(90_000);

    await entrar(page, PROPIETARIA, new RegExp(`/espacios/${ESPACIO}$`));
    await page.goto(`/espacios/${ESPACIO}/finanzas`);
    await cabeEnElTelefono(page, "el panel financiero");

    // El cobro de Café Prueba queda pendiente en el sembrado justo para
    // esto: 99 € + 21 % = 119,79 €. El formulario va dentro de la propia
    // fila, sin ventana intermedia, y el importe viene ya relleno con lo
    // que queda por cobrar.
    const fila = page.locator("tbody tr").filter({ hasText: "Café Prueba" }).first();
    await expect(fila).toBeVisible();

    const importe = fila.getByLabel("Importe cobrado");
    await expect(importe).toHaveValue(/\d/);

    // Se cobra UN EURO, no la deuda entera, y esa es la decisión de este
    // test: un cobro saldado deja de ofrecer el formulario, así que pagar
    // los 119,79 € lo dejaría sin nada que pulsar en la segunda ejecución
    // y obligaría a resembrar entre pasada y pasada. Cobrar una parte
    // ejercita exactamente los mismos botones y se puede repetir. El
    // importe se escribe a mano en vez de fiarse del valor que trae puesto
    // el campo: lo que se está probando es que un importe tecleado en un
    // teléfono llega hasta el libro de apuntes.
    // Los céntimos cambian en cada ejecución a propósito: la clave de
    // idempotencia que arma el servidor es `ui:<cobro>:<céntimos>`, así que
    // repetir el importe exacto devolvería el pago anterior sin escribir
    // nada y el test pasaría sin haber probado nada. Se escribe con coma,
    // que es como se teclea un importe en español.
    await importe.fill(`1,${String(Date.now() % 100).padStart(2, "0")}`);
    await fila.getByLabel("Método").selectOption("transfer");

    // El envío se espera explícitamente. Sin esto, un formulario que no
    // llega a enviarse y un servidor que rechaza el pago fallan igual —con
    // un "no encuentro el estado" a los 20 segundos— y son dos averías
    // distintas.
    const envio = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/finanzas"),
      { timeout: 20_000 },
    );
    await fila.getByRole("button", { name: "Registrar el pago" }).click();

    // Si la acción del servidor revienta, Next devuelve un 500 y
    // `useActionState` deja la pantalla igual que estaba: sin este control
    // ese caso y "el formulario ni se envió" fallan idénticos.
    const respuesta = await envio;
    if (!respuesta.ok()) {
      throw new Error(
        `El servidor devolvió ${respuesta.status()} al registrar el pago: ` +
          `${(await respuesta.text()).slice(0, 800)}`,
      );
    }

    // A partir de aquí la acción SIEMPRE dice algo: o la confirmación o el
    // error. Se espera a cualquiera de las dos y luego se mira cuál fue,
    // en vez de preguntar por el error antes de que haya llegado.
    const confirmacion = fila.getByText("Pago registrado.");
    const alerta = fila.getByRole("alert");
    await expect(
      confirmacion.or(alerta),
      "el pago no dejó ni confirmación ni error: la acción del servidor no llegó a ejecutarse",
    ).toBeVisible({ timeout: 20_000 });

    if (await alerta.count()) {
      throw new Error(`El servidor rechazó el pago: ${await alerta.first().innerText()}`);
    }

    // RN-FIN: el estado sale del libro de apuntes, no de una marca.
    // "Pagado en parte" es precisamente lo que `charge_status()` deriva
    // cuando hay cobrado y queda deuda, así que ver ese estado es ver que
    // el apunte con signo se escribió.
    await expect(fila.getByText("Pagado en parte")).toBeVisible({ timeout: 20_000 });
  });

  test("CONSULTAR y GESTIONAR EQUIPO · desde el teléfono", async ({ page }) => {
    await entrar(page, PROPIETARIA, new RegExp(`/espacios/${ESPACIO}$`));
    await cabeEnElTelefono(page, "el inicio del espacio");

    // Consultar: los dos restaurantes del espacio, con su código y estado.
    await expect(page.getByText("EST-0001")).toBeVisible();
    await expect(page.getByText("EST-0002")).toBeVisible();

    // Gestionar equipo: la lista y la acción de invitar, disponibles en
    // móvil. No se envía la invitación —crearía filas en cada ejecución—,
    // se comprueba que el flujo está disponible y cabe.
    await expect(page.getByText("Elena Ruiz (propietaria)")).toBeVisible();
    await expect(page.getByText("Marta Gil (trabajadora)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Invitar/i })).toBeVisible();
  });
});
