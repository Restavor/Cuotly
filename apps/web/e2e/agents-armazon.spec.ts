import { expect, test } from "@playwright/test";

/**
 * Restavor agents · el armazón (Fase B, AGT-03; PRD de agents §3.2, §5.1 y §12.1).
 *
 * Se comprueba contra `/armazon/agents`, la hermana de `/armazon` para agents: el armazón
 * real, sin sesión y sin ningún dato. Lo que aquí se mira es lo que se rompe sin que falle
 * nada más: qué ve cada actor en el menú, que la barra de teléfono es la del PRD (Hoy ·
 * Calendario · (+) Nueva · Agente · Más) y que nada se desborda ni se queda por debajo de
 * los 44 px táctiles.
 *
 * Quién puede abrir de verdad cada pantalla lo comprueban `guardAgentsPage()` y su test, y
 * en el servidor las políticas y las RPC (suite 90). Esto no autoriza nada.
 */
const TABLET = { width: 1180, height: 820 };
const TELEFONO = { width: 390, height: 844 };

const menu = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Menú del espacio" }).first();

test.describe("Restavor agents · menú de escritorio y tablet", () => {
  test.use({ viewport: TABLET });

  test("el Propietario ve la sección «Reservas» y, abajo, Saldo, Plan y pagos y Ayuda", async ({ page }) => {
    await page.goto("/armazon/agents");
    const nav = menu(page);
    await expect(nav.getByText("Reservas", { exact: true })).toBeVisible();
    for (const nombre of ["Hoy", "Calendario", "Agente de llamadas", "Ajustes", "Saldo", "Plan y pagos", "Ayuda"]) {
      await expect(nav.getByRole("link", { name: nombre })).toBeVisible();
    }
    // La marca del producto y la salida a la puerta común.
    await expect(page.getByRole("link", { name: /Volver al inicio de Restavor/ }).first()).toBeVisible();
    // La ficha del restaurante, sin datos inventados.
    await expect(page.getByTestId("agents-restaurant-card")).toContainText("Restaurante de referencia");
  });

  test("RN-APP-05 · la tablet sin PIN no enseña Ajustes, Saldo ni Plan y pagos", async ({ page }) => {
    await page.goto("/armazon/agents?actor=device");
    const nav = menu(page);
    for (const nombre of ["Hoy", "Calendario", "Agente de llamadas", "Ayuda"]) {
      await expect(nav.getByRole("link", { name: nombre })).toBeVisible();
    }
    for (const nombre of ["Ajustes", "Saldo", "Plan y pagos"]) {
      await expect(nav.getByRole("link", { name: nombre })).toHaveCount(0);
    }
  });

  test("el Encargado no ve Plan y pagos", async ({ page }) => {
    await page.goto("/armazon/agents?actor=manager");
    await expect(menu(page).getByRole("link", { name: "Ajustes" })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Plan y pagos" })).toHaveCount(0);
  });

  test("aprobada y sin pagar, la agenda no sale en el menú", async ({ page }) => {
    await page.goto("/armazon/agents?estado=approved_pending_payment");
    await expect(menu(page).getByRole("link", { name: "Hoy" })).toHaveCount(0);
    await expect(menu(page).getByRole("link", { name: "Plan y pagos" })).toBeVisible();
  });

  test("cerrada, no queda ningún destino en el menú", async ({ page }) => {
    await page.goto("/armazon/agents?estado=closed");
    await expect(menu(page).getByRole("link")).toHaveCount(0);
  });

  test("cada destino lleva a una dirección de /agents/<restaurante>", async ({ page }) => {
    await page.goto("/armazon/agents");
    const hrefs = await menu(page).getByRole("link").evaluateAll((links) => links.map((l) => l.getAttribute("href")));
    expect(hrefs.length).toBe(7);
    for (const href of hrefs) expect(href).toMatch(/^\/agents\/00000000-0000-4000-8000-00000000a9e1\//);
  });

  test("ningún destino de agents lleva la insignia «Próximamente» del agente de Restavor web", async ({ page }) => {
    await page.goto("/armazon/agents");
    await expect(page.getByText("Próximamente")).toHaveCount(0);
  });
});

test.describe("Restavor agents · barra de teléfono", () => {
  test.use({ viewport: TELEFONO });

  test("Hoy · Calendario · (+) Nueva · Agente · Más, y sin desbordamiento horizontal", async ({ page }) => {
    await page.goto("/armazon/agents");
    const barra = page.getByTestId("mobile-nav");
    await expect(barra).toBeVisible();
    // Cuatro enlaces más el (+) «Nueva», que va directo a la nueva reserva (no es un menú).
    await expect(barra.getByRole("link")).toHaveCount(5);
    await expect(barra.getByTestId("mobile-create-menu")).toHaveCount(0);
    const nueva = barra.getByTestId("mobile-create-direct");
    await expect(nueva).toContainText("Nueva");
    await expect(nueva).toHaveAttribute("href", /\/reservas\/nueva$/);

    const textos = await barra.getByRole("link").allInnerTexts();
    expect(textos.map((t) => t.trim())).toEqual(["Hoy", "Calendario", "Nueva", "Agente", "Más"]);

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desbordamiento, "la página se desborda a lo ancho").toBe(false);
  });

  test("zonas táctiles de 44 px como mínimo", async ({ page }) => {
    await page.goto("/armazon/agents");
    for (const enlace of await page.getByTestId("mobile-nav").getByRole("link").all()) {
      const caja = await enlace.boundingBox();
      expect(caja).not.toBeNull();
      expect(caja!.height, "alto del destino").toBeGreaterThanOrEqual(44);
      expect(caja!.width, "ancho del destino").toBeGreaterThanOrEqual(44);
    }
  });

  test("la tablet sin PIN no tiene el (+) y su barra son tres destinos y Más", async ({ page }) => {
    await page.goto("/armazon/agents?actor=device");
    const barra = page.getByTestId("mobile-nav");
    await expect(barra.getByTestId("mobile-create-direct")).toHaveCount(0);
    await expect(barra.getByRole("link")).toHaveCount(4);
  });
});
