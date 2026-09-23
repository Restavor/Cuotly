import { describe, expect, it } from "vitest";

import {
  approvedDetail,
  filterMyRequests,
  myRequestAction,
  myRequestDate,
  readMyRequestFilters,
} from "./my-space-requests";

const fila = (business_name: string, status: string, extra: { tax_name?: string; contact_name?: string } = {}) => ({
  business_name,
  status,
  tax_name: extra.tax_name ?? null,
  contact_name: extra.contact_name ?? "Responsable",
});

describe("G04 · los filtros de Mis solicitudes", () => {
  it("lee la búsqueda y el estado de la dirección", () => {
    expect(readMyRequestFilters({ q: " costa ", estado: "approved" })).toEqual({ q: "costa", state: "approved" });
  });

  it("un estado que no existe no filtra nada", () => {
    expect(readMyRequestFilters({ estado: "cualquiera" }).state).toBeNull();
    expect(readMyRequestFilters({}).q).toBeNull();
  });

  it("busca sin acentos en negocio, razón social y responsable", () => {
    const filas = [
      fila("Estudio Centro", "draft"),
      fila("Proyecto Costa", "approved", { tax_name: "Gestión Norte SL" }),
      fila("Otro", "draft", { contact_name: "Ramón" }),
    ];
    expect(filterMyRequests(filas, { q: "estudio", state: null }).map((f) => f.business_name)).toEqual([
      "Estudio Centro",
    ]);
    expect(filterMyRequests(filas, { q: "gestion", state: null }).map((f) => f.business_name)).toEqual([
      "Proyecto Costa",
    ]);
    expect(filterMyRequests(filas, { q: "RAMON", state: null }).map((f) => f.business_name)).toEqual(["Otro"]);
  });

  it("el estado recorta a la vez que la búsqueda", () => {
    const filas = [fila("A", "draft"), fila("B", "approved")];
    expect(filterMyRequests(filas, { q: null, state: "approved" }).map((f) => f.business_name)).toEqual(["B"]);
  });
});

describe("G04 · la acción que toca en cada fila (RN-GLO-04)", () => {
  it("RN-GLO-04 · un borrador se continúa", () => {
    expect(myRequestAction("draft", null)).toEqual({ action: "continue", primary: false });
  });

  it("enviada o en revisión: solo se puede mirar", () => {
    expect(myRequestAction("submitted", null).action).toBe("view");
    expect(myRequestAction("in_review", null).action).toBe("view");
  });

  it("RN-PLA-06 · necesita información es la única acción principal", () => {
    expect(myRequestAction("needs_information", null)).toEqual({ action: "complete", primary: true });
  });

  it("RN-GLO-04 · RN-SUB-05 · aprobada sin pagar: las instrucciones de pago", () => {
    expect(myRequestAction("approved", "trial").action).toBe("payment");
    expect(myRequestAction("approved", "archived_trial_ended").action).toBe("payment");
    expect(myRequestAction("approved", "archived_nonpayment").action).toBe("payment");
  });

  it("aprobada y con el espacio activo: se entra en él", () => {
    expect(myRequestAction("approved", "active").action).toBe("enter");
  });

  it("aprobada sin espacio que leer, o archivada por su dueño: se mira la solicitud", () => {
    expect(myRequestAction("approved", null).action).toBe("view");
    expect(myRequestAction("approved", "archived_by_owner").action).toBe("view");
  });

  it("RN-PLA-06 · rechazada: el motivo", () => {
    expect(myRequestAction("rejected", null).action).toBe("reason");
  });

  it("lo que acompaña a Aprobada sale del estado del espacio", () => {
    expect(approvedDetail("trial")).toBe("payment_pending");
    expect(approvedDetail("active")).toBe("active");
    expect(approvedDetail("archived_by_owner")).toBe("archived");
    expect(approvedDetail(null)).toBeNull();
  });

  it("un borrador sin enviar se fecha por su creación", () => {
    expect(myRequestDate({ submitted_at: null, created_at: "2026-09-08T10:00:00Z" })).toBe("2026-09-08T10:00:00Z");
    expect(myRequestDate({ submitted_at: "2026-09-14T09:00:00Z", created_at: "2026-09-08T10:00:00Z" })).toBe(
      "2026-09-14T09:00:00Z",
    );
  });
});
