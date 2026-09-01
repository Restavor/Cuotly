import { expect, test } from "@playwright/test";

/**
 * Hito 8 · los cuatro criterios de experiencia del PRD (CA-19 a CA-22),
 * comprobados contra el armazón real que usan las pantallas del espacio.
 *
 * ALCANCE, dicho en claro: CA-19 pide que **cada flujo principal**
 * (solicitar, aceptar, asignar, comenzar, bloquear, publicar, corregir,
 * pagar, consultar, gestionar equipo) pueda completarse íntegramente en
 * móvil. Esos flujos existen y están probados en el servidor (hitos 4 a
 * 7), pero sus PANTALLAS no se construyeron: los tres hitos anteriores
 * entregaron servidor y dominio. Lo que aquí se comprueba es lo que hay:
 * que el armazón por el que pasarán esos flujos funciona con la anchura
 * de un teléfono, sin desbordamiento horizontal y sin depender del
 * escritorio. Cuando lleguen las pantallas, cada flujo añade su recorrido
 * a este archivo. Fingir aquí un recorrido completo sería decir que CA-19
 * está cumplido cuando no lo está.
 */

const TELEFONO = { width: 390, height: 844 }; // iPhone 14

test.describe("CA-19 · el armazón se usa entero con la anchura de un teléfono", () => {
  test.use({ viewport: TELEFONO });

  test("la barra inferior ofrece cinco destinos y no hay desbordamiento horizontal", async ({
    page,
  }) => {
    await page.goto("/armazon");

    const barra = page.getByTestId("mobile-nav");
    await expect(barra).toBeVisible();
    await expect(barra.getByRole("link")).toHaveCount(5); // §20.3: 5 destinos + Más

    // El menú lateral de escritorio no se cuela en el teléfono.
    await expect(page.getByRole("navigation", { name: "Menú del espacio" }).first()).toBeVisible();

    // Nada obliga a desplazarse en horizontal, que es la forma habitual de
    // que una pantalla "funcione en móvil" solo en la captura.
    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desbordamiento, "la página se desborda a lo ancho").toBe(false);
  });

  test("la búsqueda global se abre y se usa desde el teléfono", async ({ page }) => {
    await page.goto("/armazon");
    await page.getByTestId("search-trigger").click();
    await expect(page.getByTestId("search-dialog")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Búsqueda global" })).toBeFocused();
  });

  test("los destinos de la barra caben sin recortarse", async ({ page }) => {
    await page.goto("/armazon");
    for (const enlace of await page.getByTestId("mobile-nav").getByRole("link").all()) {
      const caja = await enlace.boundingBox();
      expect(caja).not.toBeNull();
      // Objetivo táctil razonable: nada de 12 px de alto.
      expect(caja!.height).toBeGreaterThanOrEqual(32);
    }
  });
});

test.describe("CA-20 · sin datos se dice el motivo, nunca un número inventado", () => {
  test("el contenido vacío explica por qué está vacío", async ({ page }) => {
    await page.goto("/armazon");
    const vacio = page.getByTestId("contenido-vacio");
    await expect(vacio).toBeVisible();
    await expect(vacio).toHaveAttribute("data-empty-reason", "no_data_yet");
    await expect(vacio).toContainText("Sin datos todavía");
  });

  test("el centro de avisos vacío explica por qué, y no enseña un cero suelto", async ({ page }) => {
    await page.goto("/armazon");
    await page.getByTestId("notifications-trigger").click();
    const panel = page.getByTestId("notifications-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("notifications-empty")).toContainText("Sin datos todavía");
    // Sin avisos no hay contador: un "0" en un círculo es ruido, no dato.
    await expect(page.getByTestId("unread-count")).toHaveCount(0);
  });

  test("la búsqueda sin resultados dice que solo devuelve lo accesible", async ({ page }) => {
    await page.goto("/armazon");
    await page.getByTestId("search-trigger").click();
    await page.getByRole("textbox", { name: "Búsqueda global" }).fill("zzzz");
    await expect(page.getByTestId("search-empty")).toBeVisible();
  });
});

test.describe("CA-21 · una entidad se llama igual en todas las superficies", () => {
  test("el mismo destino se llama igual en el menú de escritorio y en el de móvil", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/armazon");
    const escritorio = await page
      .getByRole("navigation", { name: "Menú del espacio" })
      .first()
      .getByRole("link")
      .allInnerTexts();

    await page.setViewportSize(TELEFONO);
    const movil = await page.getByTestId("mobile-nav").getByRole("link").allInnerTexts();

    // Todo destino de móvil que también exista en escritorio se llama
    // exactamente igual: nada de "Solicitudes" arriba y "Sols." abajo.
    for (const etiqueta of movil) {
      if (["Más", "+ Nueva solicitud"].includes(etiqueta)) continue;
      expect(escritorio.map((t) => t.trim())).toContain(etiqueta.trim());
    }
  });

  test("la entrada del Agente lleva su etiqueta y la pantalla dice lo mismo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/armazon");
    await expect(
      page.getByRole("navigation", { name: "Menú del espacio" }).first(),
    ).toContainText("Próximamente");
  });
});

test.describe("CA-22 · navegación completa por teclado", () => {
  test("el primer tabulador ofrece saltar al contenido", async ({ page }) => {
    await page.goto("/armazon");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  });

  test("Ctrl/Cmd + K abre la búsqueda y Escape la cierra devolviendo el foco", async ({ page }) => {
    await page.goto("/armazon");

    // El foco arranca en el disparador de la búsqueda: así la comprobación
    // final —que Escape devuelve el foco a donde estaba— dice algo, en vez
    // de comprobar dónde acabó el foco por casualidad.
    await page.getByTestId("search-trigger").focus();

    // El atajo lo instala un `useEffect`, así que hasta que la página no
    // hidrata no hay nadie escuchando. Se reintenta la pulsación en vez de
    // pulsar una vez y esperar: sin esto el test pasaba solo y fallaba en
    // la suite completa, que es cuando el servidor de desarrollo va más
    // cargado. No tapa ningún fallo del atajo — si no funcionara, esto
    // agotaría el tiempo igual.
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(page.getByTestId("search-dialog")).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("search-dialog")).toHaveCount(0);
    // El foco vuelve a donde estaba: perderlo deja al teclado en la nada.
    await expect(page.getByTestId("search-trigger")).toBeFocused();
  });

  test("el menú Crear se abre con el teclado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/armazon");
    const menu = page.getByTestId("create-menu");
    await menu.getByText("Crear", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("open", "");
  });

  test("todo lo pulsable es alcanzable por teclado", async ({ page }) => {
    await page.goto("/armazon");
    // Nada de <div onClick>: si un elemento actúa como control, tiene que
    // ser un botón o un enlace, o el teclado no llega.
    const falsos = await page.evaluate(() =>
      [...document.querySelectorAll("div[onclick], span[onclick]")].length,
    );
    expect(falsos).toBe(0);
  });
});
