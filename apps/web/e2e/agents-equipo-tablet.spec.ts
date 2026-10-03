import { expect, test, type Page } from "@playwright/test";

import { codigoTotp } from "./totp";

/**
 * Restavor agents · Equipo con PIN, tablet del local y soporte (Fase D; PRD de agents §3.3, §3.4 y §11.1; migración 170),
 * recorrido con el sembrado de `supabase/seed/reservas-demo.sql`: Casa Pepe, sus Propietarios (José 4321, María sin PIN),
 * su Encargado (Luis 8765) y su Equipo (Ana 1234, Diego 5678); y `soporte@cuotly.test`, con el segundo paso sembrado.
 *
 * Como `agents-agenda.spec.ts`, NECESITA una base de datos con las migraciones y los sembrados, y se salta —diciéndolo—
 * si no se ha pedido con `E2E_DATOS=1`. Además, `AGENTS_PIN_SECRET` del servidor tiene que valer
 * `restavor-pruebas-pin-secret` (el secreto con el que el sembrado cifra los PIN) y, en el Supabase real, el TOTP tiene que
 * estar activado en `supabase/config.toml`.
 *
 * Cada test que usa una tablet activa la suya, así que el bloqueo por PIN erróneo de uno no afecta a los demás.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";
const CLAVE = "Restavor-demo-2026";
const CASA_PEPE = "e5200000-0000-0000-0000-000000000001";
const CASA_PEPE_CENTRO = "e5200000-0000-0000-0000-000000000002";
const HOY = `/agents/${CASA_PEPE}/reservas`;
const EQUIPO = `${HOY}/ajustes/equipo`;

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar en Restavor" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

/** Un PIN en el teclado de la tablet (`PinPad`): cada cifra y «OK». */
async function teclear(page: Page, pin: string) {
  const teclado = page.locator("[data-pin-pad]");
  for (const cifra of pin) await teclado.getByRole("button", { name: cifra, exact: true }).click();
  await teclado.getByRole("button", { name: "Confirmar PIN" }).click();
}

/** Una fecha de aquí a `dias` días, en Madrid, de martes a sábado (Casa Pepe cierra los lunes). */
function fechaFutura(dias: number): string {
  const madrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
  for (let extra = 0; extra < 7; extra += 1) {
    const iso = madrid(new Date(Date.now() + (dias + extra) * 86_400_000));
    const diaSemana = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (diaSemana >= 2 && diaSemana <= 6) return iso;
  }
  throw new Error("no hay un martes a sábado en una semana");
}

/** Entra como José, activa ESTE navegador como tablet del local y deja la tablet en Hoy. */
async function activarTablet(page: Page, nombre: string) {
  await entrar(page, "jose@casapepe.test");
  await page.goto(EQUIPO);
  await page.getByLabel("Nombre del dispositivo").fill(nombre);
  await page.getByRole("button", { name: "Usar este dispositivo como tablet del local" }).click();
  await page.waitForURL(new RegExp(`${HOY}$`), { timeout: 45_000 });
  await expect(page.getByTestId("device-badge")).toContainText(nombre);
}

test.describe("Restavor agents · Equipo, tablet y soporte", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!CON_DATOS, "Necesita base de datos y los sembrados. Ejecuta con E2E_DATOS=1 (ver docs/agents/PRUEBAS.md).");
  test.use({ viewport: { width: 1180, height: 820 } });

  test("EQU-01 · el Propietario ve a las personas, añade a alguien del Equipo, repite un PIN, lo cambia y lo quita", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(EQUIPO);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Equipo y tablet del local");
    const filas = page.getByTestId("person-row");
    await expect(filas.filter({ hasText: "José García" })).toContainText("Propietario · entra con email · PIN puesto");
    await expect(filas.filter({ hasText: "María García" })).toContainText("Sin PIN todavía");
    await expect(filas.filter({ hasText: "Luis Martín" })).toContainText("Encargado · entra con email");
    // Decisión 131: un Propietario quita a otro Propietario (y al Encargado); al Equipo, con «Quitar».
    await expect(filas.filter({ hasText: "María García" }).getByRole("button", { name: "Quitar propietario" })).toBeVisible();
    await expect(filas.filter({ hasText: "Luis Martín" }).getByRole("button", { name: "Quitar de Reservas" })).toBeVisible();
    await expect(filas.filter({ hasText: "Ana Ruiz" })).toContainText("Equipo · PIN en la tablet");
    await expect(filas.filter({ hasText: "Diego Navas" })).toContainText("Equipo · PIN en la tablet");

    // Añadir: el PIN tiene que ser de 4 cifras, repetido y no estar en uso.
    await page.getByRole("button", { name: "+ Añadir persona" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Nombre").fill("Marta E2E");
    await dialogo.getByLabel("PIN de 4 cifras").fill("1234");
    await dialogo.getByLabel("Repite el PIN").fill("1234");
    await dialogo.getByRole("button", { name: "Añadir" }).click();
    await expect(dialogo).toContainText("Ese PIN ya lo usa otra persona de este restaurante");
    await dialogo.getByLabel("PIN de 4 cifras").fill("2468");
    await dialogo.getByLabel("Repite el PIN").fill("2469");
    await dialogo.getByRole("button", { name: "Añadir" }).click();
    await expect(dialogo).toContainText("Los dos PIN no coinciden");
    await dialogo.getByLabel("Repite el PIN").fill("2468");
    await dialogo.getByRole("button", { name: "Añadir" }).click();
    await expect(page.getByText("Persona añadida.")).toBeVisible({ timeout: 30_000 });
    await expect(filas.filter({ hasText: "Marta E2E" })).toContainText("Equipo · PIN en la tablet");

    // Cambiar su PIN y quitarla (se desactiva; su PIN se libera).
    await filas.filter({ hasText: "Marta E2E" }).getByRole("button", { name: "Cambiar PIN" }).click();
    await dialogo.getByLabel("PIN nuevo").fill("1357");
    await dialogo.getByLabel("Repite el PIN").fill("1357");
    await dialogo.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("PIN cambiado.")).toBeVisible({ timeout: 30_000 });
    await filas.filter({ hasText: "Marta E2E" }).getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(dialogo).toContainText("Su PIN dejará de valer y se conserva su historial");
    await dialogo.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(page.getByText("Persona quitada. Su PIN ya no vale.")).toBeVisible({ timeout: 30_000 });
    await expect(filas.filter({ hasText: "Marta E2E" })).toHaveCount(0);
  });

  test("RN-APP-06 · el Encargado gestiona el Equipo pero no invita ni quita Encargados; «Mi PIN» solo con cuenta", async ({ page }) => {
    await entrar(page, "luis@casapepe.test");
    await page.goto(EQUIPO);
    await expect(page.getByTestId("person-row").filter({ hasText: "Ana Ruiz" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Añadir persona" })).toBeVisible();
    await expect(page.getByText("Invitar a un Propietario o a un Encargado")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quitar de Reservas" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Quitar propietario" })).toHaveCount(0);
    await expect(page.getByText("Mi PIN para la tablet")).toBeVisible();
    await expect(page.getByTestId("my-pin-state")).toHaveText("Tienes PIN.");
  });

  test("RN-APP-06 · el Propietario invita; quien no es del restaurante no abre el Equipo", async ({ page }) => {
    await entrar(page, "carla@barlaplaza.test");
    await page.goto(EQUIPO);
    await expect(page.getByText("No tienes acceso a Reservas en este restaurante")).toBeVisible();
    await expect(page.getByText("Ana Ruiz")).toHaveCount(0);
  });

  test("EQU-02 · activar la tablet: abre Reservas › Hoy, sin cuenta, sin búsqueda y sin Ajustes en el menú", async ({ page }) => {
    await activarTablet(page, "Tablet e2e 1");
    // La tablet no es una cuenta: ni «Mi cuenta», ni búsqueda global, ni avisos, ni volver a la puerta de Restavor.
    await expect(page.getByRole("link", { name: /Mi cuenta/ })).toHaveCount(0);
    await expect(page.getByTestId("search-trigger")).toHaveCount(0);
    await expect(page.getByTestId("notifications-trigger")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Volver al inicio de Restavor" })).toHaveCount(0);
    // Menú de la tablet sin PIN: Hoy, Calendario, Agente; nada de Ajustes, Saldo ni Plan (RN-APP-05).
    const menu = page.getByRole("navigation", { name: /Menú/i }).first();
    await expect(menu.getByRole("link", { name: "Hoy" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Ajustes", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: /Saldo/ })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Plan y pagos" })).toHaveCount(0);
    await expect(page.getByTestId("device-unlock-link")).toBeVisible();
    // Abre siempre Hoy: la raíz y /agents la llevan ahí.
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`${HOY}$`));
    await page.goto("/agents");
    await expect(page).toHaveURL(new RegExp(`${HOY}$`));
  });

  test("RN-APP-08 · al activar la tablet se cierra la sesión personal de quien la activó: sin cuenta ni Restavor web, solo su agenda", async ({ page, context }) => {
    await activarTablet(page, "Tablet e2e 2");
    // En un dispositivo activado se ignora la sesión personal (PRD §3.3): no queda ninguna en este navegador.
    const cookies = await context.cookies();
    expect(cookies.filter((c) => /^sb-.*auth-token/.test(c.name))).toHaveLength(0);
    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page).toHaveURL(new RegExp(`${HOY}\\?fecha=2026-09-26$`));
    await expect(page.getByTestId("device-badge")).toContainText("Tablet e2e 2");
    await expect(page.getByText("Lucía Fernández")).toBeVisible();
    // Restavor web no es de la tablet: sin sesión personal la lleva a su agenda, no a una cuenta.
    await page.goto("/web");
    await expect(page).toHaveURL(new RegExp(`${HOY}$`));
    await page.goto("/cuenta");
    await expect(page).toHaveURL(new RegExp(`${HOY}$`));
  });

  test("RN-APP-08 · una tablet solo abre su restaurante, aunque la dirección diga otro", async ({ page }) => {
    await activarTablet(page, "Tablet e2e 3");
    await page.goto(`/agents/${CASA_PEPE_CENTRO}/reservas`);
    // No hay acceso a otro restaurante: vuelve a Hoy en el suyo.
    await expect(page).toHaveURL(new RegExp(`${HOY}$`));
    await expect(page.getByTestId("device-badge")).toContainText("Tablet e2e 3");
  });

  test("RN-APP-08 · cada acción pide «¿Quién eres?» + PIN y queda a nombre de quien lo puso", async ({ page }) => {
    const fecha = fechaFutura(50);
    const nombre = `Tablet E2E ${Date.now() % 100000}`;
    await activarTablet(page, "Tablet e2e 4");
    await page.goto(`${HOY}/nueva`);
    await page.getByRole("button", { name: "Otro día" }).click();
    await page.locator('input[type="date"]').fill(fecha);
    await page.getByRole("button", { name: "2", exact: true }).click();
    await page.getByRole("button", { name: "Cena" }).click();
    await page.getByRole("button", { name: "21:00" }).click();
    await page.getByLabel("Nombre").fill(nombre);
    await page.getByLabel("Teléfono").fill("644 555 666");
    await page.getByRole("button", { name: "Guardar reserva" }).click();

    // Pide el PIN. Uno malo no guarda y dice cuántos intentos quedan.
    await expect(page.getByRole("dialog")).toContainText("¿Quién eres?");
    await expect(page.getByTestId("pin-gate")).toContainText("Para guardar la reserva");
    await teclear(page, "0000");
    await expect(page.getByTestId("pin-gate-error")).toContainText("PIN incorrecto. Te quedan 4 intentos.");
    await teclear(page, "1234");
    await expect(page).toHaveURL(new RegExp(`fecha=${fecha}`), { timeout: 30_000 });
    await expect(page.getByText(nombre)).toBeVisible();

    // La ficha dice quién la creó: Ana Ruiz, no «Restavor» ni «Sistema».
    await page.getByRole("link", { name: new RegExp(nombre) }).click();
    await expect(page.getByText(/Ana Ruiz/)).toBeVisible();

    // Cancelar pide el PIN otra vez, y con el de Diego queda a su nombre.
    await page.getByRole("button", { name: "Cancelar reserva" }).click();
    await page.getByLabel("Error al apuntarla").check();
    await page.getByRole("button", { name: "Sí, cancelar reserva" }).click();
    await expect(page.getByRole("dialog").filter({ hasText: "¿Quién eres?" })).toContainText("Para cancelar la reserva");
    await teclear(page, "5678");
    await expect(page).toHaveURL(new RegExp(`fecha=${fecha}`), { timeout: 30_000 });
    await expect(page.getByRole("link", { name: new RegExp(nombre) })).toContainText("Cancelada por error al apuntarla");
  });

  test("RN-APP-07 · 5 PIN erróneos bloquean la tablet y ni el PIN bueno entra", async ({ page }) => {
    await activarTablet(page, "Tablet e2e 5");
    await page.goto(`${HOY}?fecha=2026-09-26`);
    await page.getByRole("link", { name: /Sergio Gil/ }).click();
    await page.getByRole("button", { name: "Cancelar reserva" }).click();
    await page.getByRole("button", { name: "Sí, cancelar reserva" }).click();
    for (let i = 0; i < 5; i += 1) await teclear(page, "9999");
    await expect(page.getByTestId("pin-gate-error")).toContainText("Demasiados intentos. La tablet está bloqueada 1 minuto.");
    // Bloqueada, el teclado está desactivado.
    await expect(page.locator("[data-pin-pad]").getByRole("button", { name: "1", exact: true })).toBeDisabled();
    await page.getByTestId("pin-gate").getByRole("button", { name: "Cerrar" }).click();
    // La reserva sigue sin cancelar.
    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page.getByText("Sergio Gil")).toBeVisible();
  });

  test("RN-APP-08 · «Ajustes con PIN»: el del Equipo no abre; el de un Propietario sí, 2 minutos, y se puede salir", async ({ page }) => {
    await activarTablet(page, "Tablet e2e 6");
    // Sin PIN, la dirección de Ajustes lleva a la puerta del PIN.
    await page.goto(`${HOY}/ajustes/horarios`);
    await expect(page).toHaveURL(/desbloquear/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ajustes con PIN");
    await teclear(page, "1234");
    await expect(page.getByTestId("device-unlock-error")).toContainText("Ese PIN es del Equipo");
    await teclear(page, "4321");
    await expect(page).toHaveURL(/ajustes\/horarios/, { timeout: 30_000 });
    await expect(page.getByTestId("device-elevation-bar")).toContainText("Ajustes abiertos con el PIN de José García");
    // Con los Ajustes abiertos, el menú los enseña y se abren Equipo e Historial.
    await expect(page.getByRole("navigation", { name: /Menú/i }).first().getByRole("link", { name: "Ajustes", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Equipo", exact: true }).click();
    await expect(page.getByTestId("person-row").filter({ hasText: "Ana Ruiz" })).toBeVisible();
    // «Mi PIN» y activar dispositivos no se hacen desde la tablet.
    await expect(page.getByText("Mi PIN para la tablet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Usar este dispositivo como tablet del local" })).toHaveCount(0);
    await page.getByRole("link", { name: "Historial", exact: true }).click();
    await expect(page.getByTestId("history-list")).toBeVisible();
    // Salir cierra los Ajustes: vuelve a Hoy y sin Ajustes en el menú.
    await page.getByRole("button", { name: "Salir de Ajustes" }).click();
    await expect(page).toHaveURL(new RegExp(`${HOY}$`), { timeout: 30_000 });
    await expect(page.getByTestId("device-elevation-bar")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /Menú/i }).first().getByRole("link", { name: "Ajustes", exact: true })).toHaveCount(0);
  });

  test("RN-APP-08 · desactivar la tablet la corta y se dice, con salida a entrar con la cuenta", async ({ page, browser }) => {
    await activarTablet(page, "Tablet e2e 7");
    // Desde otra sesión, el Propietario la desactiva.
    const otro = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const cuenta = await otro.newPage();
    await entrar(cuenta, "maria@casapepe.test");
    await cuenta.goto(EQUIPO);
    const fila = cuenta.getByTestId("device-row").filter({ hasText: "Tablet e2e 7" });
    await fila.getByRole("button", { name: "Desactivar" }).click();
    await cuenta.getByRole("dialog").getByRole("button", { name: "Desactivar" }).click();
    await expect(cuenta.getByText("Dispositivo desactivado.")).toBeVisible({ timeout: 30_000 });
    await otro.close();

    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page.getByText("Este dispositivo se ha desactivado")).toBeVisible();
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);
    await page.getByRole("button", { name: "Entrar con mi cuenta" }).click();
    await expect(page).toHaveURL(/login/);
  });

  test("SOP-01 · el soporte abre Reservas con motivo y segundo paso, ve a los comensales, sale, y el restaurante lo ve en el Historial", async ({ page, browser }) => {
    const motivo = `Revisar una duda de aforo ${Date.now() % 100000}`;
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("soporte@cuotly.test");
    await page.getByLabel("Contraseña").fill(CLAVE);
    await page.getByRole("button", { name: "Entrar en Restavor" }).click();
    // Tiene el segundo paso: `proxy.ts` le enseña la pantalla de verificar y no ve nada más hasta pasarlo. (Se espera al
    // campo y no a la dirección: la redirección de la acción de entrar deja la dirección en `/` con esa pantalla dentro.)
    await page.getByLabel("Código de seis cifras").fill(codigoTotp());
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByLabel("Código de seis cifras")).toHaveCount(0, { timeout: 45_000 });

    // Sin sesión de soporte no se ve a los comensales, ni por la dirección.
    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);

    // Desde el espacio: «Abrir como soporte» con motivo.
    await page.goto("/espacios/demo/reservas");
    const candidato = page.getByTestId("support-candidate").filter({ hasText: "Casa Pepe" }).first();
    await candidato.getByRole("button", { name: "Abrir como soporte" }).click();
    await page.getByRole("dialog").getByLabel("Motivo").fill(motivo);
    await page.getByRole("dialog").getByRole("button", { name: "Abrir", exact: true }).click();
    await page.waitForURL(new RegExp(`${HOY}$`), { timeout: 45_000 });
    await expect(page.getByTestId("reservations-support-bar")).toContainText("Estás viendo Reservas de Casa Pepe como Restavor (soporte)");

    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page.getByText("Lucía Fernández")).toBeVisible();
    await expect(page.getByTestId("reservations-support-bar")).toBeVisible();

    // Salir: cierra la sesión y vuelve al espacio; ya no se ven los comensales.
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await page.waitForURL(/espacios\/demo\/reservas/, { timeout: 30_000 });
    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);

    // El restaurante lo ve en el Historial, como «Restavor (soporte)» y con el motivo, nunca con quién fue.
    const dueño = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const pantalla = await dueño.newPage();
    await entrar(pantalla, "jose@casapepe.test");
    await pantalla.goto(`${HOY}/ajustes/historial`);
    const lista = pantalla.getByTestId("history-list");
    await expect(lista).toContainText(`Restavor entró como soporte · ${motivo}`);
    await expect(lista).not.toContainText("soporte@cuotly.test");
    await expect(lista).not.toContainText("Soporte de Reservas");
    await dueño.close();
  });

  test("RN-APP-09 · un administrador del espacio sin la marca de soporte no abre Reservas ni ve a los comensales", async ({ page }) => {
    await entrar(page, "admin@cuotly.test");
    await page.goto("/espacios/demo/reservas");
    await expect(page.getByTestId("support-not-marked")).toBeVisible();
    await expect(page.getByTestId("support-candidate")).toHaveCount(0);
    await page.goto(`${HOY}?fecha=2026-09-26`);
    await expect(page.getByText("No tienes acceso a Reservas en este restaurante")).toBeVisible();
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);
  });
});
