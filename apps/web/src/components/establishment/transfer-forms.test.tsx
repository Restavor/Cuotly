import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import { TransferBlock, type PendingTransfer } from "./TransferForms";

/**
 * Decisión 100 y 149 · «Transferir también Reservas», pintada.
 *
 * Lo que vigila: que la opción esté **desactivada por defecto**, que solo se ofrezca a un restaurante con
 * Reservas, que no se pueda marcar si Reservas no está activa, y que quien recibe la propuesta vea que incluye Reservas
 * antes de aceptar.
 */
vi.mock("./service-status-actions", () => ({
  acceptEstablishmentTransfer: vi.fn(),
  proposeEstablishmentTransfer: vi.fn(),
  rejectEstablishmentTransfer: vi.fn(),
  withdrawEstablishmentTransfer: vi.fn(),
}));

const t = es.establishmentSheet;

afterEach(cleanup);

describe("decisión 100 · la opción «Transferir también Reservas» al proponer", () => {
  it("un restaurante sin Reservas no la ve", () => {
    render(<TransferBlock establishmentId="e1" pending={null} canPropose reservationsStatus={null} />);
    expect(screen.queryByTestId("transfer-with-reservations")).toBeNull();
  });

  it("con Reservas activa sale desactivada por defecto y se puede marcar", () => {
    render(<TransferBlock establishmentId="e1" pending={null} canPropose reservationsStatus="active" />);
    const option = screen.getByTestId("transfer-with-reservations");
    expect(option).not.toBeChecked();
    expect(option).toBeEnabled();
    expect(screen.getByText(t.transferReservationsLabel)).toBeInTheDocument();
  });

  it("con Reservas en pausa, de baja o sin pagar no se puede marcar y dice por qué", () => {
    for (const status of ["paused", "past_due", "ending", "approved_pending_payment"]) {
      cleanup();
      render(<TransferBlock establishmentId="e1" pending={null} canPropose reservationsStatus={status} />);
      expect(screen.getByTestId("transfer-with-reservations")).toBeDisabled();
      expect(screen.getByText(t.transferReservationsOnlyActive)).toBeInTheDocument();
    }
  });

  it("quien no es propietario del espacio no propone nada, con o sin Reservas", () => {
    render(<TransferBlock establishmentId="e1" pending={null} canPropose={false} reservationsStatus="active" />);
    expect(screen.queryByTestId("transfer-with-reservations")).toBeNull();
    expect(screen.getByText(t.transferOnlyOwner)).toBeInTheDocument();
  });
});

describe("decisión 149 · la propuesta abierta dice si incluye Reservas", () => {
  const base: PendingTransfer = { id: "t1", reason: "Cambia de proveedor", proposedAt: "2026-10-03T10:00:00Z", iProposed: false, withReservations: false };

  it("el destino ve que incluye Reservas antes de aceptar", () => {
    render(<TransferBlock establishmentId="e1" pending={{ ...base, withReservations: true }} canPropose={false} />);
    expect(screen.getByTestId("transfer-includes-reservations")).toHaveTextContent("Incluye Reservas");
  });

  it("sin la opción no dice nada de Reservas", () => {
    render(<TransferBlock establishmentId="e1" pending={base} canPropose={false} />);
    expect(screen.queryByTestId("transfer-includes-reservations")).toBeNull();
  });

  it("quien propuso también lo ve mientras espera", () => {
    render(<TransferBlock establishmentId="e1" pending={{ ...base, iProposed: true, withReservations: true }} canPropose />);
    expect(screen.getByTestId("transfer-includes-reservations")).toBeInTheDocument();
  });
});
