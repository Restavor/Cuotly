import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { EstablishmentCard } from "./EstablishmentCard";
import { EstablishmentPhoto } from "./EstablishmentPhoto";
import { EstablishmentSheet } from "./Sheet";
import { sheetFixture } from "./sheet-fixture";
import { MANAGEMENT_BLOCKS, SHEET_TABS } from "./tabs";
import type { EstablishmentCardData } from "./EstablishmentCard";

/**
 * RN-EST-18 · la foto del restaurante (decisión 62).
 *
 * Lo que vigila, y lo primero es lo que más:
 *
 *   · Que **sin foto no se pinte un marco vacío**. Es literalmente lo que
 *     RN-EST-18 dice y lo que CA-20 exige: un restaurante sin foto es un
 *     estado normal, y un hueco gris esperando una imagen se lee como que
 *     algo falló. Lo que se pinta es el mismo icono de local de siempre.
 *   · Que la foto sea **decoración para un lector de pantalla**: el nombre
 *     del restaurante está escrito al lado, así que describirla haría que
 *     se leyera el nombre dos veces por fila.
 *   · Que el hueco **mida lo mismo** haya foto o no, o la lista daría
 *     saltos mientras cargan las imágenes.
 *   · Que **solo se le ofrezcan los botones a quien puede cambiarla**, y
 *     que a los demás la foto se les siga viendo.
 */
vi.mock("@/app/espacios/[slug]/restaurantes/[id]/actions", () => ({
  setEstablishmentManager: vi.fn(),
  setEstablishmentPhoto: vi.fn(),
}));
vi.mock("@/app/archivos/actions", () => ({
  prepararSubida: vi.fn(),
  registrarArchivo: vi.fn(),
}));
/*
 * `PhotoForm` refresca la ruta al terminar, porque lo que se pinta sale de
 * una consulta del servidor y no de lo que creamos haber subido. Fuera de
 * Next no hay enrutador que montar, así que se dobla: lo que este archivo
 * comprueba es qué se ofrece y a quién, no la navegación.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const t = es.teamArea.establishments;
const GESTION = SHEET_TABS.find((tab) => tab.key === "management")!;
const DATOS = MANAGEMENT_BLOCKS.find((block) => block.key === "establishmentData")!;

const FOTO = "https://bucket.test/firmada/fachada.jpg?token=abc";

afterEach(cleanup);

describe("RN-EST-18 · la foto del restaurante", () => {
  it("sin foto NO pinta una imagen: pinta el icono de local", () => {
    const { container } = render(<EstablishmentPhoto photoUrl={null} size={40} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("el hueco mide lo mismo con foto y sin ella", () => {
    const { container: sin } = render(<EstablishmentPhoto photoUrl={null} size={44} />);
    const hueco = sin.firstElementChild as HTMLElement;

    cleanup();

    const { container: con } = render(<EstablishmentPhoto photoUrl={FOTO} size={44} />);
    const imagen = con.querySelector("img")!;

    expect(hueco.style.width).toBe("44px");
    expect(hueco.style.height).toBe("44px");
    expect(imagen.style.width).toBe("44px");
    expect(imagen.style.height).toBe("44px");
  });

  it("la foto es decoración: no repite el nombre para un lector de pantalla", () => {
    const { container } = render(<EstablishmentPhoto photoUrl={FOTO} size={40} />);
    const imagen = container.querySelector("img")!;

    expect(imagen.getAttribute("alt")).toBe("");
  });

  it("el hueco sin foto está oculto para un lector de pantalla", () => {
    const { container } = render(<EstablishmentPhoto photoUrl={null} size={40} />);

    expect(container.firstElementChild!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("RN-EST-18 · la foto en la lista de restaurantes (página 23)", () => {
  const fila: EstablishmentCardData = {
    id: "est-1",
    name: "Magariños",
    code: "EST-001",
    city: "Santiago",
    status: "active",
    groupName: "Grupo",
    planName: "Premium",
    openRequests: 0,
    manager: null,
    photoUrl: null,
    attention: [],
  };

  it("un restaurante sin foto sale igual, con su nombre y sin imagen", () => {
    const { container } = render(<EstablishmentCard row={fila} href="/x" />);

    expect(screen.getByText("Magariños")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("con foto, la pinta con el enlace firmado que le llega", () => {
    const { container } = render(
      <EstablishmentCard row={{ ...fila, photoUrl: FOTO }} href="/x" />,
    );

    // `next/image` reescribe `src` salvo con `unoptimized`, que es lo que
    // este componente usa porque el enlace caduca: si alguien se lo quita,
    // aquí llegaría una URL de `/_next/image` y este test lo caza.
    expect(container.querySelector("img")!.getAttribute("src")).toBe(FOTO);
  });
});

describe("RN-EST-18 · la foto en la ficha (página 24) y en Gestión", () => {
  function pintar(photoUrl: string | null, canEditData = true) {
    return render(
      <EstablishmentSheet
        base="/espacios/demo/restaurantes/est-1"
        slug="demo"
        tab={GESTION}
        block={DATOS}
        data={{ ...sheetFixture(), canEditData, photoUrl }}
      />,
    );
  }

  it("quien puede editar los datos ve el control para subirla", () => {
    pintar(null);

    expect(screen.getByText(t.photoChoose)).toBeInTheDocument();
    // Sin foto se dice que no la hay, y no se deja el hueco mudo (CA-20).
    expect(screen.getByText(t.noPhoto)).toBeInTheDocument();
  });

  it("con foto, el control dice «cambiar» y aparece el de quitarla", () => {
    pintar(FOTO);

    expect(screen.getByText(t.photoReplace)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.photoRemove })).toBeInTheDocument();
    expect(screen.queryByText(t.photoChoose)).not.toBeInTheDocument();
  });

  it("quien NO puede editar los datos no ve ningún control, pero sí la foto", () => {
    const { container } = pintar(FOTO, false);

    expect(screen.queryByText(t.photoReplace)).not.toBeInTheDocument();
    expect(screen.queryByText(t.photoChoose)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.photoRemove })).not.toBeInTheDocument();

    // La cabecera la sigue enseñando: no verla no es no poder cambiarla.
    const fotos = [...container.querySelectorAll("img")].filter(
      (img) => img.getAttribute("src") === FOTO,
    );
    expect(fotos.length).toBeGreaterThan(0);
  });

  it("no se dice que la foto del local esté pendiente: ya está", () => {
    const { container } = pintar(FOTO);
    expect(container.textContent).not.toMatch(/foto de archivo|pendiente de foto/i);
  });
});
