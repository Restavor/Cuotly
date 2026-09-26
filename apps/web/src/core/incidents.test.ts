import { describe, expect, it } from "vitest";

import { filterClientRequests, readClientRequestFilters } from "./client-requests";
import {
  INCIDENT_NOTE_MAX,
  canChangeKind,
  canResolveIncident,
  isRequestKind,
  outcomeNeedsCategory,
  readIncidentResolution,
  spendsFromPlan,
} from "./incidents";

/**
 * Cambios e incidencias (decisión 83). La autoridad es la migración 147;
 * esto es lo que la pantalla anticipa.
 */

function formulario(datos: Record<string, string>) {
  return { get: (name: string) => datos[name] ?? null };
}

describe("RN-REQ-09 · cambio o incidencia", () => {
  it("RN-REQ-09 · solo hay dos tipos", () => {
    expect(isRequestKind("change")).toBe(true);
    expect(isRequestKind("incident")).toBe(true);
    expect(isRequestKind("averia")).toBe(false);
  });

  it("RN-REQ-09 · el restaurante lo elige en su borrador; el equipo, antes de validar", () => {
    expect(canChangeKind({ state: "draft", incidentOutcome: null }, "client")).toBe(true);
    expect(canChangeKind({ state: "received", incidentOutcome: null }, "client")).toBe(false);
    expect(canChangeKind({ state: "pending_internal_validation", incidentOutcome: null }, "team")).toBe(true);
    expect(canChangeKind({ state: "pending_client_acceptance", incidentOutcome: null }, "team")).toBe(false);
    // Resuelta, no vuelve atrás.
    expect(canChangeKind({ state: "pending_internal_validation", incidentOutcome: "change" }, "team")).toBe(false);
  });
});

describe("RN-REQ-10 · una incidencia no gasta nunca del plan", () => {
  it("RN-REQ-10 · solo un cambio gasta de la bolsa", () => {
    expect(spendsFromPlan("change")).toBe(true);
    expect(spendsFromPlan("incident")).toBe(false);
  });
});

describe("RN-REQ-11 · el diagnóstico", () => {
  it("RN-REQ-11 · se diagnostica pendiente de validación y sin salida", () => {
    expect(canResolveIncident({ kind: "incident", state: "pending_internal_validation", incidentOutcome: null })).toBe(true);
    expect(canResolveIncident({ kind: "incident", state: "analyzing", incidentOutcome: null })).toBe(false);
    expect(canResolveIncident({ kind: "incident", state: "closed", incidentOutcome: "external" })).toBe(false);
    expect(canResolveIncident({ kind: "change", state: "pending_internal_validation", incidentOutcome: null })).toBe(false);
  });

  it("RN-REQ-11 · el arreglo y el presupuesto piden el tamaño; lo externo y el cambio, no", () => {
    expect(outcomeNeedsCategory("restavor_error")).toBe(true);
    expect(outcomeNeedsCategory("quote")).toBe(true);
    expect(outcomeNeedsCategory("external")).toBe(false);
    expect(outcomeNeedsCategory("change")).toBe(false);
  });

  it("RN-REQ-11 · lee el formulario y dice qué falta", () => {
    expect(readIncidentResolution(formulario({ outcome: "external", note: "  Es del proveedor  " }))).toEqual({
      ok: true,
      value: { outcome: "external", note: "Es del proveedor", category: null },
    });
    expect(
      readIncidentResolution(formulario({ outcome: "restavor_error", note: "Lo rompimos", category: "small" })),
    ).toEqual({ ok: true, value: { outcome: "restavor_error", note: "Lo rompimos", category: "small" } });

    expect(readIncidentResolution(formulario({ outcome: "otra", note: "x" }))).toEqual({ ok: false, error: "outcome" });
    expect(readIncidentResolution(formulario({ outcome: "external", note: "   " }))).toEqual({ ok: false, error: "note" });
    expect(
      readIncidentResolution(formulario({ outcome: "external", note: "x".repeat(INCIDENT_NOTE_MAX + 1) })),
    ).toEqual({ ok: false, error: "noteTooLong" });
    expect(readIncidentResolution(formulario({ outcome: "quote", note: "Hay que rehacerlo" }))).toEqual({
      ok: false,
      error: "category",
    });
  });
});

describe("RN-REQ-12 · el historial de incidencias", () => {
  const filas = [
    { id: "a", kind: "incident", state: "closed", validated_category: null, sentAt: "2026-09-20T10:00:00Z" },
    { id: "b", kind: "change", state: "published", validated_category: "small", sentAt: "2026-09-21T10:00:00Z" },
    // Una fila de antes de la migración 147 no trae tipo: es un cambio.
    { id: "c", state: "published", validated_category: "small", sentAt: "2026-09-22T10:00:00Z" },
  ];
  const ahora = new Date("2026-09-26T10:00:00Z");

  it("RN-REQ-12 · el listado se filtra por incidencias o por cambios", () => {
    const incidencias = readClientRequestFilters({ clase: "incidencias" });
    expect(incidencias.kind).toBe("incident");
    expect(filterClientRequests(filas, incidencias, ahora).map((f) => f.id)).toEqual(["a"]);

    const cambios = readClientRequestFilters({ clase: "cambios" });
    expect(filterClientRequests(filas, cambios, ahora).map((f) => f.id)).toEqual(["b", "c"]);

    expect(readClientRequestFilters({ clase: "otra" }).kind).toBeNull();
  });
});
