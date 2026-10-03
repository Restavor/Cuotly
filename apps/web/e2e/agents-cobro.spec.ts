import { expect, test, type Page } from "@playwright/test";

/**
 * Restavor agents · contratación, cobro y ciclo de vida de Reservas (Fase E1; PRD de agents §4.4, §6.12 y §11.1;
 * migraciones 172 a 174; RN-APP-03 y RN-RES-11), recorrido con el sembrado de `supabase/seed/reservas-demo.sql`:
 *
 *   · Taberna Levante: solicitud pendiente de aprobar (la aprueba un administrador del espacio).
 *   · Bodega Norte: aprobada y sin pagar; su Propietario ve las condiciones, luego los datos para pagar, y al registrarse
 *     el pago desde Finanzas entra en Reservas.
 *   · Mesón del Puerto (pago pendiente, quedan 4 días), Cervecería Roma (en pausa), Asador Vega (de baja) y Casa Mar
 *     (cerrada: descarga su Excel).
 *
 * Como `agents-agenda.spec.ts`, NECESITA una base de datos con las migraciones y los sembrados, y se salta —diciéndolo—
 * si no se ha pedido con `E2E_DATOS=1`. Los recorridos cambian datos (aprobar, pagar, darse de baja): para repetirlos
 * se vuelve a ejecutar `reservas-demo.sql`, que es idempotente y deja cada restaurante como estaba. `AGENTS_PIN_SECRET` del
 * servidor tiene que valer `restavor-pruebas-pin-secret`.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";
const CLAVE = "Restavor-demo-2026";

const BODEGA_NORTE = "e5200000-0000-0000-0000-000000000005";
const MESON = "e5200000-0000-0000-0000-000000000006";
const CERVECERIA = "e5200000-0000-0000-0000-000000000007";
const ASADOR = "e5200000-0000-0000-0000-000000000008";
const CASA_MAR = "e5200000-0000-0000-0000-000000000009";
const CASA_PEPE = "e5200000-0000-0000-0000-000000000001";
const COBRO_BODEGA = "e5700000-0000-0000-0000-000000000050";

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar en Restavor" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

test.describe("Restavor agents · contratación, cobro y ciclo de vida", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!CON_DATOS, "Necesita base de datos y los sembrados. Ejecuta con E2E_DATOS=1 (ver docs/agents/PRUEBAS.md).");
  test.use({ viewport: { width: 1180, height: 820 } });

  test("COB-01 · un administrador del espacio aprueba una solicitud y el restaurante queda pendiente de pago", async ({ page }) => {
    await entrar(page, "admin@cuotly.test");
    await page.goto("/espacios/demo/reservas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reservas");
    // Los botones de decidir existen (antes decía «llega con la fase de contratación»).
    await expect(page.getByText("todavía no se puede hacer desde aquí")).toHaveCount(0);

    const fila = page.locator("li", { hasText: "Taberna Levante" }).filter({ hasText: "Pendiente de revisar" });
    await fila.getByTestId("approve-request").click();
    await expect(page.getByText("Solicitud aprobada. Hemos avisado al restaurante con los datos para pagar.")).toBeVisible({ timeout: 45_000 });

    // Ya está entre los restaurantes con Reservas, pendiente de pago, con lo que debe y el enlace a Finanzas.
    const enMarcha = page.locator("[data-testid^='running-']", { hasText: "Taberna Levante" });
    await expect(enMarcha).toContainText("Pendiente: 58,08");
    await expect(enMarcha.getByRole("link", { name: "Registrar el pago" })).toBeVisible();
  });

  test("COB-01 · rechazar pide un motivo, que queda en la solicitud", async ({ page }) => {
    await entrar(page, "admin@cuotly.test");
    await page.goto("/espacios/demo/reservas");
    // Una solicitud nueva en nombre de un restaurante sin Reservas ni solicitud abierta (Café Rechazado: la anterior
    // se rechazó). Es del sembrado, así que `reservas-demo.sql` lo limpia al repetirse.
    await page.getByLabel("Restaurante").selectOption({ label: "Café Rechazado" });
    await page.getByRole("button", { name: "Crear solicitud para este restaurante" }).click();
    await expect(page.getByText("Solicitud creada.")).toBeVisible({ timeout: 45_000 });

    await page.reload();
    const fila = page.locator("li", { hasText: "Creada en nombre del restaurante" }).filter({ hasText: "Pendiente de revisar" }).first();
    await fila.getByTestId("reject-request").click();
    await fila.getByTestId("reject-confirm").click();
    await expect(page.getByText("Escribe el motivo del rechazo.")).toBeVisible();
    await fila.getByTestId("reject-reason").fill("Datos de contacto incompletos");
    await fila.getByTestId("reject-confirm").click();
    await expect(page.getByText("Solicitud rechazada. Hemos avisado al restaurante.")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("li", { hasText: "Datos de contacto incompletos" }).first()).toContainText("Rechazada");
  });

  test("COB-01 · el Propietario acepta las condiciones y ve los datos para pagar; el Encargado no los ve", async ({ page }) => {
    await entrar(page, "estados@casapepe.test");
    // Sin la aceptación hecha, los datos de pago van detrás de las condiciones.
    await page.goto(`/agents/${BODEGA_NORTE}/pendiente-de-pago`);
    await expect(page).toHaveURL(new RegExp(`/agents/${BODEGA_NORTE}/condiciones$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acepta las condiciones de Reservas");
    await expect(page.getByTestId("conditions-text")).toContainText("48 € + IVA al mes");
    await expect(page.getByTestId("billing-steps").locator("[aria-current='step']")).toContainText("Condiciones");
    await expect(page.getByText("Solo lo puede aceptar el propietario del restaurante.")).toBeVisible();

    // Sin marcar la casilla no avanza.
    await page.getByTestId("accept-conditions-button").click();
    await expect(page.getByText("Marca la casilla para aceptar las condiciones.")).toBeVisible();
    await page.getByTestId("accept-conditions").check();
    await page.getByTestId("accept-conditions-button").click();
    await page.waitForURL(new RegExp(`/agents/${BODEGA_NORTE}/pendiente-de-pago$`), { timeout: 45_000 });

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Aprobado: datos para pagar");
    await expect(page.getByText("Aprobado. Solo falta pagar el primer mes")).toBeVisible();
    // Los cuatro pasos: Aprobado y Condiciones hechos, «Pagar el primer mes» es el actual.
    await expect(page.getByTestId("billing-steps").locator("[aria-current='step']")).toContainText("Pagar el primer mes");
    await expect(page.getByTestId("pay-fee")).toHaveText("48,00 €");
    await expect(page.getByTestId("pay-tax")).toHaveText("10,08 €");
    await expect(page.getByTestId("pay-amount")).toHaveText("58,08 €");
    await expect(page.getByTestId("pay-due")).toContainText("quedan");
    // «A nombre de <razón social>» solo sale si el espacio la tiene cargada (el de la demostración, no): no se inventa.
    await expect(page.getByText("A nombre de")).toHaveCount(0);
    await expect(page.getByTestId("pay-iban")).toHaveText("ES91 2100 0418 4502 0005 1332");
    await expect(page.getByTestId("pay-bizum")).toHaveText("+34 600 000 000");
    await expect(page.getByTestId("pay-concept")).toContainText("Reservas Bodega Norte ");
    await expect(page.getByText("Subir justificante")).toBeVisible();
    // Una vez aceptadas, ya no vuelve a las condiciones.
    await page.goto(`/agents/${BODEGA_NORTE}/condiciones`);
    await expect(page).toHaveURL(new RegExp(`/agents/${BODEGA_NORTE}/pendiente-de-pago$`));
  });

  test("COB-01 · al registrar el pago desde Finanzas, Reservas se activa al momento", async ({ page }) => {
    await entrar(page, "admin@cuotly.test");
    await page.goto(`/espacios/demo/finanzas/cobros/${COBRO_BODEGA}`);
    await page.getByRole("button", { name: "Registrar el pago" }).click();
    // El formulario desaparece al saldarse el cobro: la señal es que ya no queda nada pendiente.
    await expect(page.getByText("Este cobro no tiene nada pendiente: no hay pago que registrar.")).toBeVisible({ timeout: 45_000 });

    // El Propietario ya no ve los datos para pagar: entra en Reservas (que le lleva a configurarla, Primer uso).
    await page.context().clearCookies();
    await entrar(page, "estados@casapepe.test");
    await page.goto(`/agents/${BODEGA_NORTE}`);
    await expect(page).toHaveURL(new RegExp(`/agents/${BODEGA_NORTE}/reservas`));
    await page.goto(`/agents/${BODEGA_NORTE}/pendiente-de-pago`);
    await expect(page).toHaveURL(new RegExp(`/agents/${BODEGA_NORTE}/reservas`));
  });

  test("RN-RES-11 · con el pago pendiente: la barra «quedan N días» en Hoy y los datos para pagar en Plan y pagos", async ({ page }) => {
    await entrar(page, "estados@casapepe.test");
    await page.goto(`/agents/${MESON}/reservas`);
    // Primer uso no está terminado en los restaurantes de estado: se salta si lo pide.
    if (/primer-uso/.test(page.url())) await page.goto(`/agents/${MESON}/plan`);
    else {
      await expect(page.getByTestId("pay-bar")).toContainText("Pago pendiente, quedan");
      await page.getByRole("link", { name: "Ver cómo pagar" }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/agents/${MESON}/plan$`));
    await expect(page.getByTestId("plan-status")).toContainText("Pago pendiente, quedan");
    await expect(page.getByTestId("payment-details")).toContainText("58,08");
    const cobros = page.getByTestId("plan-charges");
    await expect(cobros).toContainText("Vencido");
    await expect(cobros).toContainText("Pagado");
    await expect(page.getByTestId("cancel-service")).toBeVisible();
  });

  test("RN-RES-11 · en pausa: el aviso de Hoy dice que se paga y se reactiva al momento", async ({ page }) => {
    await entrar(page, "estados@casapepe.test");
    await page.goto(`/agents/${CERVECERIA}/plan`);
    await expect(page.getByTestId("plan-status")).toContainText("Reservas está en pausa por un pago pendiente. Paga y se reactiva al momento.");
    await expect(page.getByTestId("payment-details")).toBeVisible();
  });

  test("RN-RES-11 · de baja: se anula y se vuelve a pedir, con confirmación", async ({ page }) => {
    await entrar(page, "estados@casapepe.test");
    await page.goto(`/agents/${ASADOR}/plan`);
    await expect(page.getByTestId("plan-status")).toContainText("Baja confirmada. Reservas funciona hasta el");
    await page.getByTestId("undo-cancellation").click();
    await expect(page.getByTestId("plan-status")).toContainText("Reservas está activa.", { timeout: 45_000 });

    // Darse de baja pide confirmación antes.
    await page.getByTestId("cancel-service").click();
    await expect(page.getByText("¿Seguro que quieres darte de baja?")).toBeVisible();
    await page.getByRole("button", { name: "Mejor no" }).click();
    await expect(page.getByText("¿Seguro que quieres darte de baja?")).toHaveCount(0);
    await page.getByTestId("cancel-service").click();
    await page.getByTestId("cancel-service-confirm").click();
    await expect(page.getByTestId("plan-status")).toContainText("Baja confirmada. Reservas funciona hasta el", { timeout: 45_000 });
  });

  test("COB-02 · Reservas cerrada: el Propietario descarga su Excel con todas las reservas, y nadie más", async ({ page }) => {
    await entrar(page, "estados@casapepe.test");
    await page.goto(`/agents/${CASA_MAR}/cuenta-cerrada`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reservas cerrada");
    await expect(page.getByTestId("closed-days-left")).toContainText("Quedan 21 días para descargar tus reservas.");
    // Cerrada, la agenda y el plan no se abren: lleva siempre a «Reservas cerrada».
    await page.goto(`/agents/${CASA_MAR}/reservas`);
    await expect(page).toHaveURL(new RegExp(`/agents/${CASA_MAR}/cuenta-cerrada$`));

    const respuesta = await page.request.get(`/agents/${CASA_MAR}/reservas/exportar`);
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["content-type"]).toContain("spreadsheetml.sheet");
    expect(respuesta.headers()["content-disposition"]).toMatch(/attachment; filename="reservas-\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect(respuesta.headers()["cache-control"]).toBe("no-store");
    const cuerpo = await respuesta.body();
    expect(cuerpo.subarray(0, 2).toString("latin1")).toBe("PK");

    // Quien no es del restaurante, ni se entera de que existe; el Encargado de otro restaurante, tampoco.
    await page.context().clearCookies();
    const anonimo = await page.request.get(`/agents/${CASA_MAR}/reservas/exportar`);
    expect([401, 404]).toContain(anonimo.status());

    await entrar(page, "luis@casapepe.test");
    const encargado = await page.request.get(`/agents/${CASA_PEPE}/reservas/exportar`);
    expect(encargado.status()).toBe(403);
    const ajeno = await page.request.get(`/agents/${CASA_MAR}/reservas/exportar`);
    expect(ajeno.status()).toBe(404);
  });

  test("RN-APP-04 · el Encargado no abre Plan y pagos ni los datos de pago por la dirección", async ({ page }) => {
    await entrar(page, "luis@casapepe.test");
    await page.goto(`/agents/${CASA_PEPE}/plan`);
    await expect(page.getByText("Sin acceso")).toBeVisible();
    await expect(page.getByTestId("payment-details")).toHaveCount(0);
    await expect(page.getByTestId("cancel-service")).toHaveCount(0);
  });

  test("CA-19 · en el móvil (390 px) las pantallas de dinero no se salen y sus botones miden 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page, "estados@casapepe.test");
    for (const ruta of [
      `/agents/${MESON}/plan`,
      `/agents/${CERVECERIA}/plan`,
      `/agents/${ASADOR}/plan`,
      `/agents/${CASA_MAR}/cuenta-cerrada`,
    ]) {
      await page.goto(ruta);
      await expect(page.getByRole("main")).toBeVisible();
      const medidas = await page.evaluate(() => {
        const ancho = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const chicos = [...document.querySelectorAll("main button, main a")]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({ texto: (el.textContent ?? "").trim().slice(0, 30), alto: el.getBoundingClientRect().height }))
          .filter((b) => b.alto > 0 && b.alto < 43);
        return { ancho, chicos };
      });
      expect(medidas.ancho, `${ruta} se sale ${medidas.ancho}px de la pantalla`).toBeLessThanOrEqual(1);
      expect(medidas.chicos, `${ruta} tiene botones de menos de 44 px`).toEqual([]);
    }
  });
});
