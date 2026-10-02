import { expect, test } from "@playwright/test";

test.describe("Humo — Hito 1", () => {
  test("la página de estilos muestra todos los componentes base", async ({ page }) => {
    await page.goto("/styleguide");

    await expect(page.getByTestId("buttons")).toBeVisible();
    await expect(page.getByTestId("fields")).toBeVisible();
    await expect(page.getByTestId("badges")).toBeVisible();
    await expect(page.getByTestId("table")).toBeVisible();
    await expect(page.getByTestId("overlays")).toBeVisible();
    await expect(page.getByTestId("states")).toBeVisible();

    // Restavor agents (Fase B): las piezas de la agenda.
    for (const id of ["agents-chips", "agents-rows", "agents-meter", "agents-state", "agents-pin"]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // El teclado de PIN responde y no deja pasar de cuatro cifras.
    const pin = page.getByTestId("agents-pin");
    for (const digito of ["1", "2", "3", "4", "5"]) {
      await pin.getByRole("button", { name: digito, exact: true }).click();
    }
    await expect(pin.getByRole("img", { name: "4 de 4 números" })).toBeVisible();

    // El modal no está abierto hasta que se pulsa el botón.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Abrir modal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // El toast aparece al pulsar el botón correspondiente.
    await page.getByRole("button", { name: "Lanzar toast" }).click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();
  });

  test("el login pide correo y contraseña antes de intentar entrar", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
  });
});
