import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Restavor agents · los avisos a los comensales (Fase F; PRD de agents §6.11, §10.3 y §15, AVI-01 a AVI-06;
 * migración 179; RN-RES-10 y RN-AGT-07), recorridos con el sembrado de `supabase/seed/reservas-demo.sql` y el proveedor
 * FALSO de mensajes (`ENABLE_FAKE_MESSAGING=true` en el servidor del test; fuera de producción).
 *
 *   · Casa Pepe (jose@ es su Propietario): saldo con tarifas de prueba de España (WhatsApp 0,016 €, SMS 0,08 €).
 *   · admin@cuotly.test gestiona clientes en el espacio y ve Pruebas › Mensajes con lo que «salió».
 *
 * Qué se comprueba: lo que solo se ve de punta a punta —alta con correo, solo teléfono, número sin WhatsApp (`…0404`,
 * que cae a SMS), un fijo español que no recibe nada, el inglés, el enlace del comensal (abrirlo no cancela, cancelar
 * dos veces cancela una, el historial de la ficha lo cuenta, enlace no válido) y los tres interruptores de canal de
 * Ajustes › Conexiones—. Lo que no se ve desde aquí (Resend, Meta y el proveedor de SMS de verdad) lo cubren los tests
 * de los adaptadores con transporte inyectable; el cobro, la devolución y la concurrencia, las suites SQL 96 y 97 y
 * `scripts/avisos-concurrency-test.mjs`. El plazo vencido del enlace lo cubren `app/c/[token]/page.test.tsx` y la suite 97.
 *
 * Como `agents-agenda.spec.ts`, NECESITA una base de datos con las migraciones y los sembrados, y se salta —diciéndolo—
 * si no se ha pedido con `E2E_DATOS=1`. Además, el servidor tiene que llevar `ENABLE_FAKE_MESSAGING=true` (CI y
 * `docs/agents/PRUEBAS.md` lo ponen); sin él, los casos que leen Pruebas › Mensajes se saltan. Los casos van en serie.
 * Gastan un poco del saldo de Casa Pepe, y `agents-saldo.spec.ts` espera el saldo sembrado: por eso `test:e2e:datos` los lanza
 * DESPUÉS, en una ejecución aparte. `reservas-demo.sql` deja el saldo como estaba.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";
const CON_FALSO = process.env.ENABLE_FAKE_MESSAGING === "true";
const CLAVE = "Restavor-demo-2026";
const CASA_PEPE = "e5200000-0000-0000-0000-000000000001";
const AGENDA = `/agents/${CASA_PEPE}/reservas`;
const CONEXIONES = `${AGENDA}/ajustes/conexiones`;
const MENSAJES = "/espacios/demo/reservas/pruebas/mensajes";
const CAPTURAS = "test-results/capturas-avisos";

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar en Restavor" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

/** Como en la agenda: una fecha de aquí a `dias` días, en Madrid, de martes a sábado (Casa Pepe abre esos días). */
function fechaFutura(dias: number): string {
  const madrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
  for (let extra = 0; extra < 7; extra += 1) {
    const iso = madrid(new Date(Date.now() + (dias + extra) * 86_400_000));
    const diaSemana = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (diaSemana >= 2 && diaSemana <= 6) return iso;
  }
  throw new Error("no hay un martes a sábado en una semana");
}

/** Un nombre único por ejecución: los avisos de Pruebas › Mensajes se encuentran por él. */
function nombreUnico(prefijo: string): string {
  return `${prefijo} ${Date.now() % 1_000_000}`;
}

/**
 * Un móvil español único por ejecución, para encontrar sus avisos por el «Para:» (un SMS no lleva el nombre del cliente).
 * `final` son las cuatro últimas cifras, que el proveedor falso usa para simular casos (`0404`: sin WhatsApp).
 */
function movil(final: string): { readonly escrito: string; readonly e164: string } {
  const unico = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return { escrito: `6${unico} ${final}`, e164: `+346${unico}${final}` };
}

interface Alta {
  readonly nombre: string;
  readonly telefono: string;
  readonly email?: string;
  readonly ingles?: boolean;
  /** Días hasta la reserva (se ajusta a un día abierto). */
  readonly dias: number;
}

/** Crea una reserva a mano en Casa Pepe como su Propietario, con los pasos del formulario de «Nueva reserva». */
async function crearReserva(page: Page, alta: Alta): Promise<void> {
  const fecha = fechaFutura(alta.dias);
  await page.goto(`${AGENDA}/nueva`);
  await page.getByRole("button", { name: "Otro día" }).click();
  await page.locator('input[type="date"]').fill(fecha);
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "Cena" }).click();
  await page.getByRole("button", { name: "21:00" }).click();
  await page.getByLabel("Nombre").fill(alta.nombre);
  await page.getByLabel("Teléfono").fill(alta.telefono);
  if (alta.email) await page.getByLabel(/^Email/).fill(alta.email);
  if (alta.ingles) await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "Guardar reserva" }).click();
  await expect(page).toHaveURL(new RegExp(`fecha=${fecha}`), { timeout: 30_000 });
  await expect(page.getByText(alta.nombre)).toBeVisible();
}

/** Los avisos de una reserva, en Pruebas › Mensajes (como el administrador del espacio). Procesa lo pendiente antes de mirar. */
async function avisosDe(page: Page, nombre: string): Promise<Locator> {
  await page.goto(MENSAJES);
  await page.getByRole("button", { name: "Procesar avisos pendientes ahora" }).click();
  await expect(page.getByRole("status").first()).toBeVisible({ timeout: 30_000 });
  await page.reload();
  return page.getByRole("listitem").filter({ hasText: nombre });
}

/** Abre la ficha de una reserva desde Hoy de su día. */
async function abrirFicha(page: Page, nombre: string): Promise<void> {
  await page.getByRole("link", { name: new RegExp(nombre) }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reserva");
  await expect(page.getByText(nombre).first()).toBeVisible();
}

test.describe("Restavor agents · avisos a los comensales", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!CON_DATOS, "Necesita base de datos y los sembrados. Ejecuta con E2E_DATOS=1 (ver docs/agents/PRUEBAS.md).");
  test.use({ viewport: { width: 1180, height: 820 } });

  test("AVI-01 · una reserva con correo avisa por correo, gratis, y el aviso sale en el historial de la ficha", async ({ browser }) => {
    test.skip(!CON_FALSO, "Necesita ENABLE_FAKE_MESSAGING=true en el servidor del test.");
    const nombre = nombreUnico("Correo");
    const jose = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(jose, "jose@casapepe.test");
    await crearReserva(jose, { nombre, telefono: "611 222 301", email: "correo@correo.invalido-e2e.com", dias: 46 });

    const admin = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(admin, "admin@cuotly.test");
    const avisos = await avisosDe(admin, nombre);
    await expect(avisos).toHaveCount(1);
    await expect(avisos.getByText("Correo", { exact: true })).toBeVisible();
    await expect(avisos).toContainText("Tu reserva en Casa Pepe está confirmada");
    await expect(avisos).not.toContainText("Coste:");

    // El historial de la ficha cuenta el aviso sin datos personales.
    await abrirFicha(jose, nombre);
    await expect(jose.getByText(/Aviso «reserva confirmada» enviado por email/)).toBeVisible();
  });

  test("AVI-02 · solo con teléfono sale por WhatsApp y cuesta su tarifa; sin WhatsApp (…0404) cae a SMS", async ({ browser }) => {
    test.skip(!CON_FALSO, "Necesita ENABLE_FAKE_MESSAGING=true en el servidor del test.");
    const wa = nombreUnico("Whats");
    const sinWa = nombreUnico("Sinwa");
    const movilSinWa = movil("0404");
    const jose = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(jose, "jose@casapepe.test");
    await crearReserva(jose, { nombre: wa, telefono: "611 222 302", dias: 47 });
    await crearReserva(jose, { nombre: sinWa, telefono: movilSinWa.escrito, dias: 47 });

    const admin = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(admin, "admin@cuotly.test");

    const porWhatsApp = await avisosDe(admin, wa);
    await expect(porWhatsApp).toHaveCount(1);
    await expect(porWhatsApp.getByText("WhatsApp", { exact: true })).toBeVisible();
    await expect(porWhatsApp).toContainText("Coste: 0,016 €");

    // El número que no tiene WhatsApp: el WhatsApp no se entrega y el mismo aviso sale por SMS (a 0,08 €). El
    // WhatsApp que no llegó a salir no es un mensaje: Pruebas › Mensajes solo enseña lo que el proveedor falso aceptó.
    const respaldo = await avisosDe(admin, movilSinWa.e164);
    await expect(respaldo).toHaveCount(1);
    const sms = respaldo.filter({ has: admin.getByText("SMS", { exact: true }) });
    await expect(sms).toHaveCount(1);
    await expect(sms).toContainText("Coste: 0,08 €");
    // Un SMS va sin tildes ni eñes.
    await expect(sms.locator("pre")).not.toContainText(/[áéíóúñ]/);

    await abrirFicha(jose, sinWa);
    await expect(jose.getByText(/WhatsApp no disponible en ese número: se envía por SMS/)).toBeVisible();
    await expect(jose.getByText(/enviado por SMS/)).toBeVisible();
  });

  test("AVI-03 · el idioma de la reserva manda: en inglés, el aviso sale en inglés; y un fijo español no recibe nada", async ({ browser }) => {
    test.skip(!CON_FALSO, "Necesita ENABLE_FAKE_MESSAGING=true en el servidor del test.");
    const ingles = nombreUnico("English");
    const fijo = nombreUnico("Fijo");
    const fijoTelefono = "955 123 456";
    const jose = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(jose, "jose@casapepe.test");
    await crearReserva(jose, { nombre: ingles, telefono: "611 222 303", email: "english@correo.invalido-e2e.com", ingles: true, dias: 48 });
    await crearReserva(jose, { nombre: fijo, telefono: fijoTelefono, dias: 48 });

    const admin = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(admin, "admin@cuotly.test");
    const enIngles = await avisosDe(admin, ingles);
    await expect(enIngles).toHaveCount(1);
    await expect(enIngles).toContainText("Your booking at Casa Pepe is confirmed");

    // El fijo no tiene WhatsApp ni SMS: no sale ningún mensaje y la ficha dice por qué.
    await expect(admin.getByRole("listitem").filter({ hasText: fijo })).toHaveCount(0);
    await expect(admin.getByRole("listitem").filter({ hasText: "+34955123456" })).toHaveCount(0);
    await abrirFicha(jose, fijo);
    await expect(jose.getByText(/Aviso no enviado: no hay correo ni un móvil al que escribir/)).toBeVisible();
  });

  test("AVI-05 · el enlace del propio aviso: abrirlo no cancela, cancelar dos veces cancela una, y la ficha lo cuenta", async ({ browser }) => {
    test.skip(!CON_FALSO, "Necesita ENABLE_FAKE_MESSAGING=true en el servidor del test.");
    const nombre = nombreUnico("Enlace");
    const jose = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(jose, "jose@casapepe.test");
    await crearReserva(jose, { nombre, telefono: "611 222 304", email: "enlace@correo.invalido-e2e.com", dias: 49 });

    const admin = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(admin, "admin@cuotly.test");
    const avisos = await avisosDe(admin, nombre);
    const enlace = await avisos.getByRole("link", { name: "Enlace del cliente" }).getAttribute("href");
    expect(enlace).toMatch(/\/c\/[0-9a-f]{32}$/);

    // El comensal no tiene sesión: contexto nuevo, sin cookies.
    const comensal = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await comensal.goto(enlace!);
    await expect(comensal.getByRole("heading", { level: 1 })).toHaveText("Tu reserva");
    await expect(comensal.getByText("Casa Pepe")).toBeVisible();
    await expect(comensal.getByText(new RegExp(`a nombre de ${nombre}`))).toBeVisible();
    await expect(comensal.getByText(/Puedes cancelar aquí hasta el/)).toBeVisible();
    await comensal.screenshot({ path: `${CAPTURAS}/enlace-movil.png`, fullPage: true });
    expect(await comensal.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await comensal.setViewportSize({ width: 1180, height: 820 });
    await comensal.screenshot({ path: `${CAPTURAS}/enlace-escritorio.png` });
    await comensal.setViewportSize({ width: 390, height: 844 });

    // Abrir el enlace otra vez (un escáner de correo, una vista previa) no cancela nada.
    await comensal.reload();
    await expect(comensal.getByRole("button", { name: "Cancelar mi reserva" })).toBeVisible();

    // El selector de idioma cambia el texto.
    await comensal.getByRole("link", { name: "EN" }).click();
    await expect(comensal.getByRole("heading", { level: 1 })).toHaveText("Your booking");
    await expect(comensal.getByRole("button", { name: "Cancel my booking" })).toBeVisible();
    await comensal.getByRole("link", { name: "ES" }).click();

    // Doble envío: un solo cancelado.
    const boton = comensal.getByRole("button", { name: "Cancelar mi reserva" });
    await boton.dblclick();
    await expect(comensal.getByText("Reserva cancelada")).toBeVisible({ timeout: 30_000 });
    await expect(comensal.getByText("Gracias por avisar. El restaurante ya lo sabe.")).toBeVisible();
    await comensal.screenshot({ path: `${CAPTURAS}/enlace-cancelada-movil.png`, fullPage: true });

    // Recargar no la cancela otra vez ni da error.
    await comensal.reload();
    await expect(comensal.getByText("Reserva cancelada")).toBeVisible();

    // La ficha cuenta quién canceló y por qué vía; y el aviso de cancelación sale una sola vez.
    await jose.goto(`${AGENDA}?fecha=${fechaFutura(49)}`);
    await abrirFicha(jose, nombre);
    await expect(jose.getByText(/Reserva cancelada · desde el enlace del cliente/)).toBeVisible();
    await expect(jose.getByText(/Aviso «reserva cancelada» enviado por email/)).toHaveCount(1);
  });

  test("AVI-05 · un enlace que no es válido no enseña nada y no da pistas", async ({ page }) => {
    for (const mala of ["0123", "z".repeat(32), "0".repeat(32)]) {
      await page.goto(`/c/${mala}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Este enlace no es válido");
      await expect(page.getByRole("button", { name: /Cancelar/ })).toHaveCount(0);
    }
    await page.screenshot({ path: `${CAPTURAS}/enlace-no-valido.png` });
    // No se indexa, no se guarda en caché y no manda referrer.
    const respuesta = await page.goto(`/c/${"0".repeat(32)}`);
    expect(respuesta?.headers()["cache-control"]).toMatch(/no-store/);
    expect(respuesta?.headers()["x-robots-tag"]).toMatch(/noindex/);
    expect(respuesta?.headers()["referrer-policy"]).toBe("no-referrer");
  });

  test("AVI-06 · Ajustes › Conexiones: con WhatsApp apagado, el que solo da teléfono recibe un SMS; se vuelve a encender", async ({ browser }) => {
    test.skip(!CON_FALSO, "Necesita ENABLE_FAKE_MESSAGING=true en el servidor del test.");
    const nombre = nombreUnico("Interruptor");
    const movilInterruptor = movil("0301");
    const jose = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    await entrar(jose, "jose@casapepe.test");

    await jose.goto(CONEXIONES);
    await expect(jose.getByText("Avisos a tus clientes")).toBeVisible();
    const whatsapp = jose.getByRole("switch", { name: /^WhatsApp/ });
    await expect(whatsapp).toBeChecked();
    await jose.screenshot({ path: `${CAPTURAS}/conexiones.png`, fullPage: true });
    await jose.setViewportSize({ width: 390, height: 844 });
    await jose.screenshot({ path: `${CAPTURAS}/conexiones-movil.png`, fullPage: true });
    expect(await jose.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await jose.setViewportSize({ width: 1180, height: 820 });

    try {
      await whatsapp.uncheck();
      await jose.getByRole("button", { name: "Guardar", exact: true }).click();
      await expect(jose.getByText("Guardado.")).toBeVisible({ timeout: 30_000 });

      await crearReserva(jose, { nombre, telefono: movilInterruptor.escrito, dias: 50 });
      const admin = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
      await entrar(admin, "admin@cuotly.test");
      const avisos = await avisosDe(admin, movilInterruptor.e164);
      await expect(avisos).toHaveCount(1);
      await expect(avisos.getByText("SMS", { exact: true })).toBeVisible();
      await expect(avisos.getByText("WhatsApp", { exact: true })).toHaveCount(0);
      await admin.screenshot({ path: `${CAPTURAS}/pruebas-mensajes.png`, fullPage: true });
    } finally {
      // Deja el restaurante como estaba aunque el caso falle a medias.
      await jose.goto(CONEXIONES);
      const otra = jose.getByRole("switch", { name: /^WhatsApp/ });
      if (!(await otra.isChecked())) {
        await otra.check();
        await jose.getByRole("button", { name: "Guardar", exact: true }).click();
        await expect(jose.getByText("Guardado.")).toBeVisible({ timeout: 30_000 });
      }
    }
  });

  test("RN-RES-12 · quien no es del restaurante no ve ni cambia los avisos de otro restaurante", async ({ page }) => {
    await entrar(page, "carla@barlaplaza.test");
    await page.goto(CONEXIONES);
    await expect(page.getByText("No tienes acceso a Reservas en este restaurante")).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("AVI-04 · Pruebas › Mensajes en móvil: se lee sin desbordar la pantalla", async ({ browser }) => {
    test.skip(!CON_FALSO, "Necesita ENABLE_FAKE_MESSAGING=true en el servidor del test.");
    const admin = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await entrar(admin, "admin@cuotly.test");
    await admin.goto(MENSAJES);
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText("Mensajes de prueba");
    const ancho = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ancho).toBeLessThanOrEqual(1);
    await admin.screenshot({ path: `${CAPTURAS}/pruebas-mensajes-movil.png`, fullPage: true });
  });
});
