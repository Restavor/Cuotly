import { expect, test, type Page } from "@playwright/test";

import { codigoTotp } from "./totp";

/**
 * Restavor agents · el saldo, las recargas y el lado de Restavor (Fase E2; PRD de agents §5.2, §10.5 y §11.2;
 * migración 176; RN-AGT-01 a RN-AGT-09), con el sembrado de `supabase/seed/reservas-demo.sql`:
 *
 *   · Casa Pepe: saldo 7,40 € (jose@ es su Propietario y luis@ su Encargado) · Bar La Plaza: 1,80 € (carla@), saldo bajo.
 *   · admin@cuotly.test (administrador del espacio, sin segundo paso) y soporte@cuotly.test (administrador con
 *     segundo paso, TOTP de prueba) llevan el saldo desde la ficha del restaurante.
 *
 * Recargar con tarjeta está «Próximamente» mientras Stripe no esté configurado (decisión 144). Con `E2E_STRIPE=1` el
 * servidor del test lleva claves FALSAS de Stripe (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`) y
 * se comprueba el otro lado: el formulario, el importe con IVA y la puerta del webhook. Pagar de verdad no se prueba
 * aquí (no hay red hacia Stripe): el apunte, el IVA y la idempotencia los prueba la suite SQL 94 y su script de
 * concurrencia, y el webhook entero, los tests de `stripe-webhook`.
 *
 * Como `agents-cobro.spec.ts`, NECESITA una base de datos con las migraciones y los sembrados, y se salta —diciéndolo—
 * si no se ha pedido con `E2E_DATOS=1`. Los recorridos del equipo cambian el saldo de Casa Pepe: para repetirlos se
 * vuelve a ejecutar `reservas-demo.sql`, que es idempotente y deja cada restaurante como estaba.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";
const CON_STRIPE = process.env.E2E_STRIPE === "1";
const CLAVE = "Restavor-demo-2026";

const CASA_PEPE = "e5200000-0000-0000-0000-000000000001";
const BAR_LA_PLAZA = "e5200000-0000-0000-0000-000000000004";
const SALDO = `/agents/${CASA_PEPE}/saldo`;
const FICHA = `/espacios/demo/restaurantes/${CASA_PEPE}`;

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar en Restavor" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

async function entrarConSegundoPaso(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar en Restavor" }).click();
  await page.getByLabel("Código de seis cifras").fill(codigoTotp());
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByLabel("Código de seis cifras")).toHaveCount(0, { timeout: 45_000 });
  await page.waitForLoadState("networkidle");
}

test.describe("Restavor agents · saldo, recargas y lado de Restavor", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!CON_DATOS, "Necesita base de datos y los sembrados. Ejecuta con E2E_DATOS=1 (ver docs/agents/PRUEBAS.md).");
  test.use({ viewport: { width: 1180, height: 820 } });

  test("SAL-01 · el Propietario ve su saldo, sus movimientos y el gasto del mes; recargar con tarjeta está «Próximamente» sin Stripe", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(SALDO);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saldo");
    await expect(page.getByTestId("balance-amount")).toContainText("7,40");
    // «Unos N minutos» solo sale si hay llamadas con coste en los últimos 30 días: depende de la fecha en que se mire.
    const minutos = page.getByTestId("balance-minutes");
    if ((await minutos.count()) > 0) await expect(minutos).toContainText("minutos de llamadas");
    await expect(page.getByText(/Te avisamos cuando queden menos de/)).toBeVisible();

    // Los apuntes más recientes; «Ver todos» enseña más.
    const movimientos = page.getByTestId("movement");
    await expect(movimientos.first()).toBeVisible();
    expect(await movimientos.count()).toBeLessThanOrEqual(10);
    await page.getByRole("link", { name: "Ver todos" }).click();
    await expect(page).toHaveURL(/todos=1/);
    expect(await page.getByTestId("movement").count()).toBeGreaterThan(10);
    await expect(page.getByTestId("balance-download")).toBeVisible();

    if (CON_STRIPE) {
      await expect(page.getByTestId("topup-soon")).toHaveCount(0);
      await expect(page.getByTestId("topup-pay")).toBeVisible();
    } else {
      await expect(page.getByTestId("topup-soon")).toContainText("Próximamente");
      await expect(page.getByTestId("topup-pay")).toHaveCount(0);
    }
    // El saldo no es un contador editable: nada en la pantalla deja escribirlo.
    await expect(page.getByTestId("balance-amount")).not.toHaveAttribute("contenteditable", /.*/);
  });

  test("SAL-02 · con Stripe configurado, el formulario enseña el importe con IVA y exige 10 € como mínimo", async ({ page }) => {
    test.skip(!CON_STRIPE, "Necesita claves de Stripe (falsas) en el servidor del test: E2E_STRIPE=1.");
    await entrar(page, "jose@casapepe.test");
    await page.goto(SALDO);
    // 20 € + 21 % de IVA = 24,20 €: el IVA no es saldo, sube lo que se elige.
    await page.getByTestId("topup-20").check({ force: true });
    await expect(page.getByTestId("topup-summary")).toContainText("24,20");
    await expect(page.getByTestId("topup-summary")).toContainText("20,00");
    await page.getByTestId("topup-50").check({ force: true });
    await expect(page.getByTestId("topup-summary")).toContainText("60,50");

    await page.getByTestId("topup-other").check({ force: true });
    await expect(page.getByTestId("topup-pay")).toBeDisabled();
    await page.getByTestId("topup-custom").fill("5");
    await expect(page.getByTestId("topup-pay")).toBeDisabled();
    await page.getByTestId("topup-custom").fill("12,5");
    // 12,50 € + 21 % = 2,63 € de IVA (2,625 redondea hacia arriba) → 15,13 €.
    await expect(page.getByTestId("topup-summary")).toContainText("15,13");
    await expect(page.getByTestId("topup-pay")).toBeEnabled();
  });

  test("SAL-02 · el webhook de Stripe rechaza una firma falsa y no sube ningún saldo", async ({ request }) => {
    test.skip(!CON_STRIPE, "Necesita el secreto del webhook (falso) en el servidor del test: E2E_STRIPE=1.");
    const cuerpo = JSON.stringify({
      id: "evt_e2e",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_nunca_vista", amount_total: 2420, currency: "eur", payment_status: "paid" } },
    });
    const sinFirma = await request.post("/api/agents/webhooks/stripe", { data: cuerpo, headers: { "content-type": "application/json" } });
    expect(sinFirma.status()).toBe(400);
    const falsa = await request.post("/api/agents/webhooks/stripe", {
      data: cuerpo,
      headers: { "content-type": "application/json", "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` },
    });
    expect(falsa.status()).toBe(400);
  });

  test("RN-AGT-01 · el Encargado ve el saldo pero no recarga; el Propietario de otro restaurante no ve el de Casa Pepe", async ({ page }) => {
    await entrar(page, "luis@casapepe.test");
    await page.goto(SALDO);
    await expect(page.getByTestId("balance-amount")).toContainText("7,40");
    await expect(page.getByTestId("topup-owner-only")).toBeVisible();
    await expect(page.getByTestId("topup-pay")).toHaveCount(0);
    await expect(page.getByTestId("topup-soon")).toHaveCount(0);
  });

  test("RN-AGT-05 · Bar La Plaza (1,80 €) está por debajo del umbral de 5 €: lo dice su saldo", async ({ page }) => {
    await entrar(page, "carla@barlaplaza.test");
    await page.goto(`/agents/${BAR_LA_PLAZA}/saldo`);
    await expect(page.getByTestId("balance-amount")).toContainText("1,80");
    await expect(page.getByTestId("balance-low-bar")).toContainText("1,80");
    await expect(page.getByTestId("balance-empty-bar")).toHaveCount(0);
  });

  test("SAL-01 · el Excel de movimientos: lo descargan el Propietario y el Encargado; un anónimo, no; otro restaurante, tampoco", async ({ page, browser }) => {
    await entrar(page, "jose@casapepe.test");
    const propio = await page.request.get(`${SALDO}/exportar`);
    expect(propio.status()).toBe(200);
    expect(propio.headers()["content-type"]).toContain("spreadsheetml");
    expect(propio.headers()["content-disposition"]).toContain("saldo-reservas-");
    expect(propio.headers()["cache-control"]).toContain("no-store");
    const cuerpo = await propio.body();
    expect(cuerpo.subarray(0, 2).toString()).toBe("PK");
    expect(cuerpo.length).toBeGreaterThan(2000);

    const anonimo = await browser.newContext();
    const sinSesion = await anonimo.request.get(new URL(`${SALDO}/exportar`, page.url()).toString());
    expect(sinSesion.status()).toBe(401);
    await anonimo.close();

    const otro = await browser.newContext();
    const paginaOtro = await otro.newPage();
    await entrar(paginaOtro, "carla@barlaplaza.test");
    const ajeno = await paginaOtro.request.get(`${SALDO}/exportar`);
    expect(ajeno.status()).toBe(404);
    await otro.close();
  });

  test("RVR-01 · un administrador del espacio ve la ficha de Reservas de Casa Pepe, registra una recarga a mano y el saldo sube", async ({ page }) => {
    await entrar(page, "admin@cuotly.test");
    await page.goto(FICHA);
    const acceso = page.getByTestId("reservas-access");
    await expect(acceso).toContainText("Reservas");
    await acceso.getByRole("link", { name: "Abrir Reservas de este restaurante" }).click();
    await expect(page).toHaveURL(new RegExp(`${FICHA}/reservas$`));

    await expect(page.getByTestId("sheet-balance")).toContainText("7,40");
    await expect(page.getByTestId("sheet-events")).toBeVisible();
    // Nunca datos de comensales: ni nombres ni teléfonos en esta pantalla.
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);

    await page.getByTestId("manual-topup-amount").fill("20");
    await page.getByTestId("manual-topup-method").selectOption("bizum");
    await page.getByTestId("manual-topup-submit").click();
    await expect(page.getByTestId("sheet-feedback").first()).toContainText("Recarga registrada.", { timeout: 45_000 });
    await expect(page.getByTestId("sheet-balance")).toContainText("27,40", { timeout: 45_000 });
    await expect(page.getByTestId("sheet-movements")).toContainText("Recarga registrada por Restavor");

    // Un importe que no es un importe se dice, no se guarda.
    await page.getByTestId("manual-topup-amount").fill("veinte");
    await page.getByTestId("manual-topup-submit").click();
    await expect(page.getByTestId("sheet-feedback").first()).toContainText("Escribe un importe en euros");

    // Lo que se escribe como nota o motivo lo ve el restaurante: se avisa antes de escribirlo.
    await expect(page.getByTestId("note-visible-warning")).toContainText("la verá el restaurante");
    await expect(page.getByTestId("reason-visible-warning")).toContainText("lo verá el restaurante");

    // El aviso de saldo bajo lo cambia Restavor (RN-AGT-05): vale 5 € y se pone en 8.
    await expect(page.getByTestId("threshold-amount")).toHaveValue("5");
    await page.getByTestId("threshold-amount").fill("8");
    await page.getByTestId("threshold-submit").click();
    await expect(page.getByTestId("sheet-feedback").last()).toContainText("Aviso de saldo bajo guardado.", { timeout: 45_000 });
    await page.getByTestId("threshold-amount").fill("-3");
    await page.getByTestId("threshold-submit").click();
    await expect(page.getByTestId("sheet-feedback").last()).toContainText("Escribe un importe en euros");
    await page.reload();
    await expect(page.getByTestId("threshold-amount")).toHaveValue("8");
    await page.getByTestId("threshold-amount").fill("5");
    await page.getByTestId("threshold-submit").click();
    await expect(page.getByTestId("sheet-feedback").last()).toContainText("Aviso de saldo bajo guardado.", { timeout: 45_000 });

    // El ajuste pide el segundo paso: sin él, el botón está parado y lo dice.
    await expect(page.getByTestId("adjust-needs-2fa")).toBeVisible();
    await expect(page.getByTestId("adjust-submit")).toBeDisabled();
  });

  test("RVR-01 · el propietario del restaurante no ve la ficha de Restavor ni el acceso a ella", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${FICHA}/reservas`);
    // La ruta existe para el equipo del espacio; para el restaurante, RLS no le devuelve el espacio ni los datos.
    await expect(page.getByTestId("manual-topup-submit")).toHaveCount(0);
    await expect(page.getByTestId("adjust-submit")).toHaveCount(0);
  });

  test("RN-AGT-02 · con el segundo paso, el soporte ajusta el saldo con un motivo y queda en los movimientos", async ({ page }) => {
    await entrarConSegundoPaso(page, "soporte@cuotly.test");
    await page.goto(`${FICHA}/reservas`);
    await expect(page.getByTestId("adjust-needs-2fa")).toHaveCount(0);
    await page.getByTestId("adjust-amount").fill("-1,50");
    // Sin motivo no se guarda.
    await page.getByTestId("adjust-submit").click();
    await expect(page.getByTestId("sheet-feedback").first()).toContainText("Escribe el motivo");
    await page.getByTestId("adjust-reason").fill("Llamada de prueba contada dos veces");
    await page.getByTestId("adjust-submit").click();
    await expect(page.getByTestId("sheet-feedback").first()).toContainText("Ajuste registrado.", { timeout: 45_000 });
    await expect(page.getByTestId("sheet-movements")).toContainText("Ajuste de Restavor", { timeout: 45_000 });
    await expect(page.getByTestId("sheet-movements")).toContainText("Llamada de prueba contada dos veces");
    // El saldo es el de antes más 20 € de la recarga a mano, menos 1,50 €.
    await expect(page.getByTestId("sheet-balance")).toContainText("25,90");
  });

  test("RVR-01 · la entrada Reservas del espacio enseña el saldo de cada restaurante y lleva a su ficha", async ({ page }) => {
    await entrar(page, "admin@cuotly.test");
    await page.goto("/espacios/demo/reservas");
    const casaPepe = page.getByTestId(`balance-${CASA_PEPE}`);
    await expect(casaPepe).toContainText("Saldo:");
    await expect(page.getByTestId(`balance-${BAR_LA_PLAZA}`)).toContainText("1,80");
    await page.getByTestId(`open-sheet-${CASA_PEPE}`).click();
    await expect(page).toHaveURL(new RegExp(`${FICHA}/reservas$`));
  });
});
