import { expect, test, type Page } from "@playwright/test";

/**
 * Restavor agents · la agenda de Reservas (Fase C; PRD de agents §6 y §11.1), recorrida con
 * el sembrado de `supabase/seed/reservas-demo.sql`: Casa Pepe, con las 12 reservas del
 * sábado 26/09/2026 de la maqueta `AgentsHoy`, y sus dueños y encargados.
 *
 * Como `flujos-espacio-demo.spec.ts`, NECESITA una base de datos con las migraciones y los
 * sembrados, y se salta —diciéndolo— si no se ha pedido con `E2E_DATOS=1`.
 *
 * Qué se comprueba: lo que solo se ve con datos reales y varias identidades —el día de la
 * maqueta con sus cifras, crear, editar, cancelar, «No vino», confirmar un grupo, «No es
 * duplicada», buscar, el calendario, los horarios con su regla de no quitar turnos con
 * reservas futuras— y que quien no es del restaurante no entra. El día 26/09 es fijo (el
 * sembrado lo trae); lo que se crea va a fechas que se calculan desde hoy.
 *
 * Los casos de este archivo se ejecutan en serie y en este orden: los de lectura primero y
 * los que cambian el sembrado después, porque comparten restaurante.
 */
const CON_DATOS = process.env.E2E_DATOS === "1";
const CLAVE = "Restavor-demo-2026";
const CASA_PEPE = "e5200000-0000-0000-0000-000000000001";
const HOY_AGENDA = `/agents/${CASA_PEPE}/reservas`;

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar en Restavor" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
}

/** Una fecha de aquí a `dias` días, en Madrid, que caiga de martes a sábado (Casa Pepe cierra los lunes y no abre el domingo de la cena de la maqueta: abre de martes a domingo). */
function fechaFutura(dias: number): string {
  const madrid = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
  for (let extra = 0; extra < 7; extra += 1) {
    const d = new Date(Date.now() + (dias + extra) * 86_400_000);
    const iso = madrid(d);
    const diaSemana = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 domingo … 6 sábado
    if (diaSemana >= 2 && diaSemana <= 6) return iso;
  }
  throw new Error("no hay un martes a sábado en una semana");
}

test.describe("Restavor agents · la agenda", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!CON_DATOS, "Necesita base de datos y los sembrados. Ejecuta con E2E_DATOS=1 (ver docs/agents/PRUEBAS.md).");
  test.use({ viewport: { width: 1180, height: 820 } });

  test("RES-01 · Hoy del 26/09 enseña lo de la maqueta: resumen, contadores y aforo de cada turno", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sábado, 26 de septiembre");
    await expect(page.getByText("10 reservas · 42 personas · 1 pendiente")).toBeVisible();
    const grupo = page.getByRole("group", { name: "Filtrar por origen" });
    await expect(grupo.getByRole("button", { name: /Todas\s*10/ })).toBeVisible();
    await expect(grupo.getByRole("button", { name: /Agente\s*3/ })).toBeVisible();
    await expect(grupo.getByRole("button", { name: /Plataformas\s*3/ })).toBeVisible();
    await expect(grupo.getByRole("button", { name: /Web\s*2/ })).toBeVisible();
    await expect(grupo.getByRole("button", { name: /Manual\s*2/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Comida: 23 de 40 personas" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Cena: 19 de 60 personas" })).toBeVisible();
    // La cancelada va tachada y al final de su hora; «No vino» en gris con su insignia.
    await expect(page.getByText("Cancelada por CoverManager")).toBeVisible();
    await expect(page.getByText("No vino", { exact: true }).first()).toBeVisible();
    // El grupo pendiente lleva su barra con «Revisar» y sus botones.
    await expect(page.getByText("1 grupo pendiente de confirmar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar" })).toBeVisible();
  });

  test("RES-01 · el filtro por origen deja solo ese origen y se recuerda al volver", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await page.getByRole("button", { name: /Web\s*2/ }).click();
    await expect(page.getByText("Pablo Serrano")).toBeVisible();
    await expect(page.getByText("Nuria Vidal")).toBeVisible();
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);
    // El aforo del turno sigue siendo el del día entero, no el del filtro.
    await expect(page.getByRole("img", { name: "Comida: 23 de 40 personas" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /Web\s*2/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);
    await page.getByRole("button", { name: /Todas\s*10/ }).click();
    await expect(page.getByText("Lucía Fernández")).toBeVisible();
  });

  test("RES-03 · la ficha: hora, personas, origen, nota, «Llamar» y el historial", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await page.getByRole("link", { name: /Sergio Gil/ }).click();
    await expect(page.getByRole("heading", { name: "Reserva", level: 1 })).toBeVisible();
    await expect(page.getByText("21:00", { exact: true })).toBeVisible();
    await expect(page.getByText("Alergia al marisco")).toBeVisible();
    await expect(page.getByText("TheFork").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Llamar" })).toHaveAttribute("href", /^tel:\+34\d{9}$/);
    await expect(page.getByText("Historial")).toBeVisible();
  });

  test("RES-09 · buscar por nombre resalta la coincidencia y por los 3 últimos números encuentra al cliente", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}/buscar?q=gar`);
    await expect(page.locator("mark").first()).toHaveText(/gar/i);
    await page.goto(`${HOY_AGENDA}/buscar?q=${encodeURIComponent("109")}`);
    await expect(page.getByText(/resultado/)).toBeVisible();
    await page.goto(`${HOY_AGENDA}/buscar?q=${encodeURIComponent("zzzzqq")}`);
    await expect(page.getByText(/No hay reservas que coincidan/)).toBeVisible();
    await page.goto(`${HOY_AGENDA}/buscar?q=1`);
    await expect(page.getByText("Escribe al menos 2 letras o 3 números.")).toBeVisible();
  });

  test("RES-10 · el calendario: días cerrados rayados, punto de pendientes, total del mes y tocar un día abre Hoy", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}/calendario?mes=2026-09`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Septiembre 2026");
    await expect(page.getByText(/Septiembre 2026: \d+ reservas · \d+ personas/)).toBeVisible();
    await expect(page.getByLabel(/lun 7 sept: cerrado|Lun 7 sept: cerrado/i)).toBeVisible();
    await expect(page.getByRole("img", { name: "Hay reservas pendientes" })).toBeVisible();
    await page.getByRole("link", { name: /Sáb 26 sept: 10 reservas, 42 personas/ }).click();
    await expect(page).toHaveURL(/fecha=2026-09-26/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sábado, 26 de septiembre");
  });

  test("RN-RES-12 · quien no es del restaurante no entra: ni por la dirección", async ({ page }) => {
    await entrar(page, "carla@barlaplaza.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await expect(page.getByText("No tienes acceso a Reservas en este restaurante")).toBeVisible();
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);
    await page.goto(`${HOY_AGENDA}/buscar?q=lucia`);
    await expect(page.getByText("Lucía Fernández")).toHaveCount(0);
  });

  test("RES-12 · quitar el turno de Cena con reservas futuras no se guarda y dice cuántas son", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}/ajustes/horarios`);
    await page.getByRole("button", { name: "Quitar turno" }).nth(1).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.locator('[role="alert"]:visible:not(#__next-route-announcer__)')).toContainText(/reservas? futuras? afectadas?/);
    // Y el turno sigue ahí: se recarga y Cena está.
    await page.reload();
    await expect(page.getByLabel("Nombre del turno").nth(1)).toHaveValue("Cena");
  });

  test("RES-02, RES-04, RES-05 · crear una reserva a mano, editarla y cancelarla", async ({ page }) => {
    const fecha = fechaFutura(45);
    const nombre = `Prueba E2E ${Date.now() % 100000}`;
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}/nueva`);

    await page.getByRole("button", { name: "Otro día" }).click();
    await page.locator('input[type="date"]').fill(fecha);
    await page.getByRole("button", { name: "4", exact: true }).click();
    await page.getByRole("button", { name: "Cena" }).click();
    await page.getByRole("button", { name: "21:00" }).click();
    await expect(page.getByText(/Quedan \d+ de 60 plazas/)).toBeVisible();

    // Sin nombre ni contacto no se guarda, y lo dice junto al campo.
    await page.getByRole("button", { name: "Guardar reserva" }).click();
    await expect(page.getByText("Escribe el nombre.")).toBeVisible();

    await page.getByLabel("Nombre").fill(nombre);
    await page.getByLabel("Teléfono").fill("12345");
    await page.getByRole("button", { name: "Guardar reserva" }).click();
    await expect(page.getByText("El teléfono no es válido.")).toBeVisible();
    await page.getByLabel("Teléfono").fill("611 222 333");
    await page.getByRole("button", { name: "+ Trona" }).click();
    await page.getByRole("button", { name: "Guardar reserva" }).click();

    // Aterriza en Hoy de ese día, con la reserva en la cena.
    await expect(page).toHaveURL(new RegExp(`fecha=${fecha}`), { timeout: 30_000 });
    await expect(page.getByText(nombre)).toBeVisible();
    await expect(page.getByText("Trona")).toBeVisible();

    // Editar: más personas.
    await page.getByRole("link", { name: new RegExp(nombre) }).click();
    await page.getByRole("link", { name: "Editar" }).click();
    await page.getByRole("button", { name: "6", exact: true }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("6 personas")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Reserva modificada · personas 4 → 6/)).toBeVisible();

    // Cancelar con motivo.
    await page.getByRole("button", { name: "Cancelar reserva" }).click();
    await page.getByLabel("Error al apuntarla").check();
    await page.getByRole("button", { name: "Sí, cancelar reserva" }).click();
    await expect(page).toHaveURL(new RegExp(`fecha=${fecha}`), { timeout: 30_000 });
    await expect(page.getByText("Cancelada por error al apuntarla")).toBeVisible();
  });

  test("RN-RES-02 · una reserva manual que se pasa del aforo avisa y pide guardar igualmente", async ({ page }) => {
    const fecha = fechaFutura(60);
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}/nueva?fecha=${fecha}`);
    await page.getByRole("button", { name: "Otro día" }).click();
    await page.getByRole("button", { name: "7+" }).click();
    await page.getByRole("spinbutton", { name: "¿Cuántas personas?" }).fill("70");
    await page.getByRole("button", { name: "Cena" }).click();
    await page.getByRole("button", { name: "21:30" }).click();
    await page.getByLabel("Nombre").fill("Banquete E2E");
    await page.getByLabel("Teléfono").fill("622 333 444");
    await page.getByRole("button", { name: "Guardar reserva" }).click();
    await expect(page.getByRole("dialog")).toContainText("Te pasas del aforo en 10 personas");
    await page.getByRole("button", { name: "Revisar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("RES-07 · confirmar un grupo pendiente", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("0 pendientes")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
    await expect(page.getByText("Pendiente", { exact: true })).toHaveCount(0);
  });

  test("RES-07 · rechazar un grupo pendiente pide confirmación y lo deja como «Grupo rechazado»", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(HOY_AGENDA);
    // «Revisar» lleva a la primera pendiente de hoy en adelante (la copia de Andrés Martínez del sembrado).
    await page.getByRole("link", { name: "Revisar" }).click();
    await page.getByRole("link", { name: "Rechazar" }).click();
    await expect(page.getByRole("dialog")).toContainText("¿Rechazar este grupo?");
    await page.getByRole("button", { name: "Sí, rechazar grupo" }).click();
    await expect(page.getByText(/Grupo rechazado · \d{2}:\d{2}/)).toBeVisible({ timeout: 30_000 });
  });

  test("RES-11 · una reserva nueva avisa a las demás pantallas abiertas del mismo navegador, sin datos personales", async ({ browser }) => {
    const fecha = fechaFutura(75);
    const contexto = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const pantallaA = await contexto.newPage();
    await entrar(pantallaA, "jose@casapepe.test");
    const pantallaB = await contexto.newPage();
    await pantallaB.goto(`${HOY_AGENDA}?fecha=${fecha}`);
    await expect(pantallaB.getByRole("heading", { level: 1 })).toBeVisible();

    await pantallaA.goto(`${HOY_AGENDA}/nueva`);
    await pantallaA.getByRole("button", { name: "Otro día" }).click();
    await pantallaA.locator('input[type="date"]').fill(fecha);
    await pantallaA.getByRole("button", { name: "Cena" }).click();
    await pantallaA.getByRole("button", { name: "22:00" }).click();
    await pantallaA.getByLabel("Nombre").fill("Aviso E2E");
    await pantallaA.getByLabel("Teléfono").fill("633 444 555");
    await pantallaA.getByRole("button", { name: "Guardar reserva" }).click();
    await expect(pantallaA).toHaveURL(new RegExp(`fecha=${fecha}`), { timeout: 30_000 });

    // La otra pantalla se entera sola: barra con el aviso y la reserva ya en la lista.
    await expect(pantallaB.getByRole("status").filter({ hasText: "Hay una reserva nueva" })).toBeVisible({ timeout: 30_000 });
    await expect(pantallaB.getByText("Aviso E2E")).toBeVisible({ timeout: 30_000 });
    await contexto.close();
  });

  test("RES-06 · «No vino» en una reserva ya pasada, y deshacerlo otro día no se deja", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await page.getByRole("link", { name: /Carmen Ortiz/ }).click();
    await page.getByRole("button", { name: "Marcar «No vino»" }).click();
    await expect(page.getByRole("button", { name: "Deshacer «No vino»" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Deshacer «No vino»" }).click();
    await expect(page.getByText("«No vino» solo se puede deshacer el mismo día.")).toBeVisible();
  });

  test("RES-08 · «No es duplicada» quita la marca de las dos reservas", async ({ page }) => {
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-27`);
    await expect(page.getByText("Posible duplicada")).toHaveCount(2);
    await page.getByRole("button", { name: "No es duplicada" }).first().click();
    await expect(page.getByText("Posible duplicada")).toHaveCount(0, { timeout: 30_000 });
  });

  test("RES-01 · en el teléfono nada se sale de la pantalla y los botones llegan a 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page, "jose@casapepe.test");
    await page.goto(`${HOY_AGENDA}?fecha=2026-09-26`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde).toBeLessThanOrEqual(0);
    const destinos = [
      page.getByRole("button", { name: /Todas/ }),
      page.getByRole("button", { name: /Agente\s*\d/ }),
      page.getByRole("link", { name: /Nueva reserva/ }),
      page.getByRole("link", { name: /Buscar reserva/ }),
    ];
    for (const destino of destinos) {
      const caja = await destino.first().boundingBox({ timeout: 10_000 });
      expect(caja, "el destino existe").not.toBeNull();
      expect(caja!.height).toBeGreaterThanOrEqual(43.5);
    }
  });
});
