import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import { PrintMenuButton } from "./PrintMenuButton";

/**
 * El botón Imprimir del Menú Diario. Lo que se prueba es el lado del
 * navegador: que pida a la ruta de descarga el PDF para imprimir y lo
 * cargue en un marco, que en móvil deje abrir el PDF en una pestaña y que
 * un fallo se diga. Que imprimir registre la descarga y no consuma lo
 * prueba `descargar/route.test.ts`.
 */

const HREF = "/espacios/demo/restaurantes/est-1/menu-diario/m-1/descargar?formato=pdf&imprimir=1";
const fetchMock = vi.fn();

function puntero(grueso: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: grueso }) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn().mockReturnValue("blob:menu");
  URL.revokeObjectURL = vi.fn();
  puntero(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.querySelectorAll("iframe").forEach((marco) => marco.remove());
});

describe("RN-MEN-04 · imprimir el menú", () => {
  it("sin JavaScript o en móvil es un enlace que abre el PDF para imprimir en una pestaña nueva", () => {
    render(<PrintMenuButton href={HREF} className="" />);

    const enlace = screen.getByRole("link", { name: es.panelMenus.print });
    expect(enlace).toHaveAttribute("href", HREF);
    expect(enlace).toHaveAttribute("target", "_blank");
  });

  it("en escritorio pide ese mismo PDF y lo carga en un marco para imprimirlo sin salir", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) });
    render(<PrintMenuButton href={HREF} className="" />);

    const clic = fireEvent.click(screen.getByRole("link", { name: es.panelMenus.print }));

    expect(clic).toBe(false); // se impidió la navegación
    expect(fetchMock).toHaveBeenCalledWith(HREF, expect.objectContaining({ cache: "no-store" }));
    await waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    expect(document.querySelector("iframe")).toHaveAttribute("src", "blob:menu");
  });

  it("en móvil no intercepta: deja que el enlace abra el PDF", () => {
    puntero(true);
    render(<PrintMenuButton href={HREF} className="" />);

    const clic = fireEvent.click(screen.getByRole("link", { name: es.panelMenus.print }));

    expect(clic).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el servidor no entrega el PDF, lo dice y no imprime nada", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob([]) });
    render(<PrintMenuButton href={HREF} className="" />);

    fireEvent.click(screen.getByRole("link", { name: es.panelMenus.print }));

    expect(await screen.findByRole("alert")).toHaveTextContent(es.panelMenus.printError);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
