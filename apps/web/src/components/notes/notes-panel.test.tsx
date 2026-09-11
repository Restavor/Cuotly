import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import type { EstablishmentNotes } from "@/app/espacios/[slug]/mensajes/[id]/notes-load";
import { NotesPanel } from "./NotesPanel";

/**
 * Maqueta 18 · el panel de notas internas, pintado.
 *
 * Lo que vigila, y las dos primeras son de RN-MSG-04 ("un fallo aquí es un
 * fallo grave"):
 *
 *   · Que a quien no tiene nada que ver con las notas **no se le pinte ni
 *     el panel vacío**. Una caja titulada "Notas internas" diciendo "no
 *     hay ninguna" ya le cuenta al cliente que existen.
 *   · Que la insignia "Solo equipo" esté, porque el panel vive al lado de
 *     una conversación que el restaurante sí lee.
 *   · Que el interruptor de "reservarla" solo se le ofrezca a quien puede
 *     moverlo: enseñárselo a un trabajador sería ofrecerle escribir una
 *     nota y perderla de vista en el acto.
 */
const t = es.notes;

afterEach(cleanup);

vi.mock("./NewNoteForm", () => ({
  NewNoteForm: ({ canRestrict }: { canRestrict: boolean }) => (
    <div data-testid="nueva-nota" data-can-restrict={String(canRestrict)}>
      nueva nota
    </div>
  ),
}));
vi.mock("./ArchiveNoteButton", () => ({
  ArchiveNoteButton: ({ noteId }: { noteId: string }) => (
    <div data-testid={`archivar-${noteId}`}>archivar</div>
  ),
}));

const operativa = {
  id: "n-1",
  body: "El botón de la carta no abre en algunos navegadores. Revisar.",
  operational: true,
  authorName: "Rocío Pérez",
  createdAt: "2026-09-15T11:02:00.000Z",
  mine: false,
};

const reservada = {
  id: "n-2",
  body: "Renegociar el plan en la próxima renovación.",
  operational: false,
  authorName: "David López",
  createdAt: "2026-09-14T16:20:00.000Z",
  mine: true,
};

function pintar(notes: EstablishmentNotes) {
  return render(<NotesPanel establishmentId="est-1" notes={notes} />);
}

describe("maqueta 18 · el panel de notas internas", () => {
  it("a quien no tiene nada que ver con ellas NO se le pinta ni vacío", () => {
    const { container } = pintar({ canRead: false, canRestrict: false, notes: [] });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(t.title)).not.toBeInTheDocument();
  });

  it("lleva la insignia 'Solo equipo' (RN-MSG-04)", () => {
    pintar({ canRead: true, canRestrict: true, notes: [operativa] });
    expect(screen.getByText(t.teamOnly)).toBeInTheDocument();
  });

  it("una nota reservada se marca; una operativa no", () => {
    // Sin la marca, quien la escribió no sabría si su compañero la está
    // leyendo, que es justo lo que el interruptor decide (RN-EST-13).
    pintar({ canRead: true, canRestrict: true, notes: [operativa, reservada] });
    expect(screen.getAllByText(t.restrictedBadge)).toHaveLength(1);
  });

  it("el interruptor solo se le ofrece a quien puede moverlo", () => {
    pintar({ canRead: true, canRestrict: false, notes: [] });
    expect(screen.getByTestId("nueva-nota")).toHaveAttribute("data-can-restrict", "false");
  });

  it("archivar se ofrece en la propia y, a quien gestiona clientes, en todas", () => {
    pintar({ canRead: true, canRestrict: false, notes: [operativa, reservada] });
    // Un trabajador solo archiva la suya.
    expect(screen.queryByTestId("archivar-n-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("archivar-n-2")).toBeInTheDocument();

    cleanup();
    pintar({ canRead: true, canRestrict: true, notes: [operativa, reservada] });
    expect(screen.getByTestId("archivar-n-1")).toBeInTheDocument();
  });

  it("sin notas dice que el cliente no ve ninguna, nunca", () => {
    pintar({ canRead: true, canRestrict: true, notes: [] });
    expect(screen.getByText(t.emptyReason)).toBeInTheDocument();
  });

  it("enseña autor y cuerpo de cada nota", () => {
    pintar({ canRead: true, canRestrict: true, notes: [operativa] });
    const lista = within(screen.getByRole("list"));
    expect(lista.getByText("Rocío Pérez")).toBeInTheDocument();
    expect(lista.getByText(/El botón de la carta no abre/)).toBeInTheDocument();
  });
});
