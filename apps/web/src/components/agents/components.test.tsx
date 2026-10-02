import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { RESERVATION_ORIGINS } from "@/core/reservations/types";

import { AgentStateCard, AgentStatusPill, CapacityMeter, NewBadge, OriginChip, PinPad, ReservationRow, StatusChip } from "./index";

afterEach(cleanup);

const t = es.agents.components;

describe("AGT-03 · el origen de una reserva (PRD de agents §6.1 y §12.2)", () => {
  it("los cuatro orígenes llevan icono y nombre: nunca solo color", () => {
    for (const origin of RESERVATION_ORIGINS) {
      const { container, unmount } = render(<OriginChip origin={origin} />);
      const chip = container.querySelector('[data-chip="origin"]') as HTMLElement;
      expect(chip.textContent, origin).toBe(origin === "platform" ? t.origins.platform : t.origins[origin]);
      expect(chip.querySelector("svg"), `${origin} sin icono`).not.toBeNull();
      expect(chip.getAttribute("data-origin")).toBe(origin);
      unmount();
    }
  });

  it("la plataforma se llama por su nombre («TheFork») y el resto, no", () => {
    render(<OriginChip origin="platform" platformName="TheFork" />);
    expect(screen.getByText("TheFork")).toBeTruthy();
    cleanup();
    // El nombre de plataforma no se cuela en otros orígenes.
    render(<OriginChip origin="web" platformName="TheFork" />);
    expect(screen.queryByText("TheFork")).toBeNull();
    expect(screen.getByText(t.origins.web)).toBeTruthy();
  });

  it("el agente se llama «Agente», no «Agente IA»", () => {
    expect(t.origins.agent).toBe("Agente");
  });

  it("cada origen usa sus tokens y ninguno usa un color suelto", () => {
    const clases = RESERVATION_ORIGINS.map((origin) => {
      const { container, unmount } = render(<OriginChip origin={origin} />);
      const c = (container.querySelector("[data-chip]") as HTMLElement).className;
      unmount();
      return c;
    });
    expect(clases[0]).toContain("bg-origin-agent-bg");
    expect(clases[0]).toContain("text-origin-agent");
    expect(clases[1]).toContain("bg-origin-platform-bg");
    expect(clases[2]).toContain("bg-origin-web-bg");
    expect(clases[3]).toContain("bg-origin-manual-bg");
    for (const c of clases) expect(c).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe("AGT-03 · los estados que llevan insignia", () => {
  it("Pendiente, Posible duplicada y No vino", () => {
    render(
      <>
        <StatusChip kind="pending" />
        <StatusChip kind="duplicate" />
        <StatusChip kind="noShow" />
        <NewBadge />
      </>,
    );
    expect(screen.getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText("Posible duplicada")).toBeTruthy();
    expect(screen.getByText("No vino")).toBeTruthy();
    expect(screen.getByText("Nueva")).toBeTruthy();
  });
});

function fila(props: Partial<React.ComponentProps<typeof ReservationRow>> = {}) {
  return render(
    <ul>
      <ReservationRow time="14:00" name="Javier Ruiz" partySize={4} origin="agent" status="confirmed" {...props} />
    </ul>,
  );
}

describe("AGT-03 · la fila de reserva (PRD de agents §6.1, HojaReservas)", () => {
  it("lleva hora, nombre, nota, personas y origen", () => {
    fila({ note: "Una trona", platformName: null });
    expect(screen.getByText("14:00")).toBeTruthy();
    expect(screen.getByText("Javier Ruiz")).toBeTruthy();
    expect(screen.getByText("Una trona")).toBeTruthy();
    expect(screen.getByText(t.people(4))).toBeTruthy(); // para el lector de pantalla
    expect(screen.getByText(t.origins.agent)).toBeTruthy();
  });

  it("«Nueva» va dentro del nombre y solo si se pide", () => {
    fila({ isNew: true });
    expect(screen.getByText("Nueva")).toBeTruthy();
    cleanup();
    fila();
    expect(screen.queryByText("Nueva")).toBeNull();
  });

  it("una pendiente va en caja amarilla con su insignia y sus botones en la segunda línea", () => {
    const { container } = fila({
      time: "14:30",
      name: "Andrés Martínez",
      partySize: 12,
      status: "pending",
      largeGroup: true,
      actions: (
        <>
          <button type="button">Rechazar</button>
          <button type="button">Confirmar</button>
        </>
      ),
    });
    const caja = container.querySelector('[data-row="pending"]') as HTMLElement;
    expect(caja).not.toBeNull();
    expect(caja.className).toContain("bg-pending-row");
    expect(caja.className).toContain("border-pending-border");
    expect(screen.getByText("Pendiente")).toBeTruthy();
    expect(screen.getByText(t.largeGroup)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
  });

  it("una posible duplicada también va en caja, con su insignia", () => {
    const { container } = fila({ duplicate: true });
    expect(container.querySelector('[data-row="pending"]')).not.toBeNull();
    expect(screen.getByText("Posible duplicada")).toBeTruthy();
  });

  it("una cancelada NO es una insignia: hora y nombre tachados, en gris, con su nota y el origen al 75 %", () => {
    const { container } = fila({
      time: "15:00",
      name: "Elena Castro",
      status: "cancelled",
      origin: "platform",
      platformName: "CoverManager",
      cancelledNote: t.cancelledBy("CoverManager", "14:20"),
    });
    const hora = screen.getByText("15:00");
    const nombre = screen.getByText("Elena Castro");
    expect(hora.className).toContain("line-through");
    expect(nombre.className).toContain("line-through");
    expect(hora.className).toContain("text-status-muted");
    expect(screen.getByText("Cancelada por CoverManager · 14:20")).toBeTruthy();
    expect(screen.queryByText("Pendiente")).toBeNull();
    expect(container.querySelector('[data-chip="status"]')).toBeNull();
    expect((container.querySelector('[data-chip="origin"]') as HTMLElement).className).toContain("opacity-75");
  });

  it("«No vino» es una insignia gris y la fila va en gris, sin tachar", () => {
    fila({ status: "no_show", name: "Raúl Moreno" });
    expect(screen.getByText("No vino")).toBeTruthy();
    expect(screen.getByText("Raúl Moreno").className).not.toContain("line-through");
    expect(screen.getByText("Raúl Moreno").className).toContain("text-status-muted");
  });
});

describe("RN-RES-02 · la barra de aforo (PRD de agents §6.3)", () => {
  it("normal: 23 de 40, barra verde y sin aviso", () => {
    const { container } = render(<CapacityMeter name="Comida" range="13:00 – 16:00" capacity={40} occupied={23} />);
    expect(screen.getByText("Comida")).toBeTruthy();
    expect(screen.getByText("13:00 – 16:00")).toBeTruthy();
    expect(screen.getByText("23")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Comida: 23 de 40 personas");
    expect(container.querySelector("[data-meter]")?.getAttribute("data-meter")).toBe("ok");
    expect((screen.getByRole("img").firstElementChild as HTMLElement).className).toContain("bg-primary");
    expect(screen.queryByText(t.meter.almostFull)).toBeNull();
    expect(screen.queryByText(t.meter.over)).toBeNull();
    // 23 de 40 = 57,5 %
    expect((screen.getByRole("img").firstElementChild as HTMLElement).style.width).toBe(`${(23 / 40) * 100}%`);
  });

  it("casi lleno: 54 de 60 en mostaza y con el texto «Casi lleno» (no solo color)", () => {
    const { container } = render(<CapacityMeter name="Cena" range="20:00 – 23:30" capacity={60} occupied={54} />);
    expect(container.querySelector("[data-meter]")?.getAttribute("data-meter")).toBe("warn");
    expect((screen.getByRole("img").firstElementChild as HTMLElement).className).toContain("bg-meter-warn");
    expect(screen.getByText(t.meter.almostFull)).toBeTruthy();
  });

  it("superado: 64 de 60 en rojo, con «Aforo superado» y la barra recortada al 100 %", () => {
    const { container } = render(<CapacityMeter name="Cena" range="20:00 – 23:30" capacity={60} occupied={64} />);
    expect(container.querySelector("[data-meter]")?.getAttribute("data-meter")).toBe("over");
    const relleno = screen.getByRole("img").firstElementChild as HTMLElement;
    expect(relleno.className).toContain("bg-danger");
    expect(relleno.style.width).toBe("100%");
    expect(screen.getByText(t.meter.over)).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
  });
});

describe("AGT-03 · la tarjeta de estado del agente (PRD de agents §7.1)", () => {
  it("encendido: verde, con su título y el botón que se le pasa", () => {
    const { container } = render(
      <AgentStateCard
        state="on"
        description="Coge las llamadas que no contestáis en 4 tonos."
        action={<button type="button">Apagar agente</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Agente encendido" })).toBeTruthy();
    expect(screen.getByText("Coge las llamadas que no contestáis en 4 tonos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apagar agente" })).toBeTruthy();
    const tarjeta = container.querySelector("[data-agent-state]") as HTMLElement;
    expect(tarjeta.getAttribute("data-agent-state")).toBe("on");
    expect(tarjeta.className).toContain("bg-agent-on-bg");
  });

  it("apagado: gris, con un título propio («hasta las 15:10»)", () => {
    const { container } = render(<AgentStateCard state="off" title="Agente apagado hasta las 15:10" />);
    expect(screen.getByRole("heading", { name: "Agente apagado hasta las 15:10" })).toBeTruthy();
    const tarjeta = container.querySelector("[data-agent-state]") as HTMLElement;
    expect(tarjeta.className).toContain("bg-agent-off-bg");
    expect(tarjeta.className).not.toContain("bg-agent-on-bg");
  });

  it("la píldora de la cabecera dice el estado con texto", () => {
    render(
      <>
        <AgentStatusPill state="on" />
        <AgentStatusPill state="off">Agente apagado · hasta 15:10</AgentStatusPill>
      </>,
    );
    expect(screen.getByText("Agente encendido")).toBeTruthy();
    expect(screen.getByText("Agente apagado · hasta 15:10")).toBeTruthy();
  });
});

function Teclado({ onSubmit = () => {}, disabled = false }: { onSubmit?: () => void; disabled?: boolean }) {
  const [pin, setPin] = useState("");
  return <PinPad value={pin} onChange={setPin} onSubmit={onSubmit} disabled={disabled} />;
}

describe("AGT-03 · el teclado de PIN (PRD de agents §3.3, PinTablet)", () => {
  it("tiene los diez dígitos, «Borrar» y «OK», con el texto de lector de pantalla de la maqueta", () => {
    render(<Teclado />);
    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      expect(screen.getByRole("button", { name: d })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: t.pin.deleteAria })).toBeTruthy();
    expect(screen.getByRole("button", { name: t.pin.confirmAria })).toBeTruthy();
    expect(screen.getByRole("img", { name: t.pin.dots(0, 4) })).toBeTruthy();
  });

  it("los puntos cuentan lo escrito y no pasan de cuatro cifras", () => {
    render(<Teclado />);
    for (const d of ["1", "2"]) fireEvent.click(screen.getByRole("button", { name: d }));
    expect(screen.getByRole("img", { name: t.pin.dots(2, 4) })).toBeTruthy();
    for (const d of ["3", "4", "5", "6"]) fireEvent.click(screen.getByRole("button", { name: d }));
    expect(screen.getByRole("img", { name: t.pin.dots(4, 4) })).toBeTruthy();
  });

  it("«Borrar» quita la última cifra y se apaga sin nada escrito", () => {
    render(<Teclado />);
    const borrar = screen.getByRole("button", { name: t.pin.deleteAria }) as HTMLButtonElement;
    expect(borrar.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "8" }));
    fireEvent.click(borrar);
    expect(screen.getByRole("img", { name: t.pin.dots(1, 4) })).toBeTruthy();
  });

  it("«OK» solo se pulsa con las cuatro cifras, y avisa; el componente no comprueba el PIN", () => {
    const enviar = vi.fn();
    render(<Teclado onSubmit={enviar} />);
    const ok = screen.getByRole("button", { name: t.pin.confirmAria }) as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    for (const d of ["1", "2", "3", "4"]) fireEvent.click(screen.getByRole("button", { name: d }));
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("deshabilitado (el dispositivo bloqueado) no escribe nada", () => {
    render(<Teclado disabled />);
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByRole("img", { name: t.pin.dots(0, 4) })).toBeTruthy();
    expect((screen.getByRole("button", { name: "1" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
