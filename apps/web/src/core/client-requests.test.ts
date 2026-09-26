import { describe, expect, it } from "vitest";

import {
  UNCLASSIFIED,
  filterClientRequests,
  paginate,
  presentValues,
  readClientRequestFilters,
  requestTimeline,
  type TimelineInput,
} from "./client-requests";

const AHORA = new Date("2026-09-22T10:00:00Z");

const filas = [
  { id: "a", state: "draft", validated_category: null, sentAt: "2026-09-20T10:00:00Z" },
  { id: "b", state: "needs_information", validated_category: null, sentAt: "2026-09-10T10:00:00Z" },
  { id: "c", state: "in_progress", validated_category: "small", sentAt: "2026-07-01T10:00:00Z" },
  { id: "d", state: "published", validated_category: "photo", sentAt: "2025-12-01T10:00:00Z" },
];

describe("R05 · los filtros del listado de solicitudes", () => {
  it("lee la dirección y descarta lo que no es un filtro válido", () => {
    expect(readClientRequestFilters({ estado: "published", tipo: "small", fecha: "90", pagina: "2" })).toEqual({
      kind: null,
      state: "published",
      category: "small",
      period: "90",
      page: 2,
    });
    expect(readClientRequestFilters({ estado: "", fecha: "7", pagina: "-3" })).toEqual({
      kind: null,
      state: null,
      category: null,
      period: null,
      page: 1,
    });
  });

  it("filtra por estado, por tipo (con «sin clasificar») y por fecha de envío", () => {
    const sin = { kind: null, state: null, category: null, period: null, page: 1 } as const;
    expect(filterClientRequests(filas, { ...sin, state: "draft" }, AHORA).map((f) => f.id)).toEqual(["a"]);
    expect(filterClientRequests(filas, { ...sin, category: UNCLASSIFIED }, AHORA).map((f) => f.id)).toEqual(["a", "b"]);
    expect(filterClientRequests(filas, { ...sin, category: "photo" }, AHORA).map((f) => f.id)).toEqual(["d"]);
    expect(filterClientRequests(filas, { ...sin, period: "30" }, AHORA).map((f) => f.id)).toEqual(["a", "b"]);
    expect(filterClientRequests(filas, { ...sin, period: "365" }, AHORA).map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("pagina de diez en diez y una página de más es la última", () => {
    const muchas = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(muchas, 1).rows).toHaveLength(10);
    const ultima = paginate(muchas, 9);
    expect(ultima.page).toBe(3);
    expect(ultima.rows).toEqual([20, 21, 22]);
    expect(paginate([], 1)).toEqual({ rows: [], page: 1, pages: 1, total: 0 });
  });

  it("las opciones salen de lo que el restaurante tiene", () => {
    expect(presentValues(["small", null, "small", "photo"], UNCLASSIFIED)).toEqual(["small", UNCLASSIFIED, "photo"]);
  });
});

const base: TimelineInput = {
  state: "received",
  createdAt: "2026-09-01T08:00:00Z",
  submittedAt: "2026-09-03T09:15:00Z",
  validatedAt: null,
  acceptedAt: null,
  rejectedAt: null,
  startedAt: null,
  publishedAt: null,
  closedAt: null,
  cancelledAt: null,
};

const resumen = (input: TimelineInput) => requestTimeline(input).map((p) => `${p.key}:${p.status}`);

describe("R08 y R11 · el camino de la solicitud", () => {
  it("R08 · recibida: la fecha es la de envío, no la del borrador, y la revisión es el paso actual", () => {
    const pasos = requestTimeline(base);
    expect(pasos[0]).toEqual({ key: "received", status: "done", at: "2026-09-03T09:15:00Z" });
    expect(resumen(base)).toEqual([
      "received:done",
      "review:current",
      "accepted:pending",
      "in_progress:pending",
      "published:pending",
    ]);
  });

  it("R08 · falta información: «A la espera de tu respuesta» después de la revisión", () => {
    expect(resumen({ ...base, state: "needs_information" })).toEqual([
      "received:done",
      "review:done",
      "waiting:waiting",
      "accepted:pending",
      "in_progress:pending",
      "published:pending",
    ]);
  });

  it("R09 · pendiente de aceptar espera también al restaurante", () => {
    expect(resumen({ ...base, state: "pending_client_acceptance", validatedAt: "2026-09-04T10:00:00Z" })).toContain(
      "waiting:waiting",
    );
  });

  it("R11 · publicada: los cuatro pasos hechos con su fecha", () => {
    const pasos = requestTimeline({
      ...base,
      state: "published",
      validatedAt: "2026-09-04T10:00:00Z",
      acceptedAt: "2026-09-04T11:30:00Z",
      startedAt: "2026-09-05T16:20:00Z",
      publishedAt: "2026-09-06T09:40:00Z",
    });
    expect(pasos.every((p) => p.status === "done")).toBe(true);
    expect(pasos.at(-1)).toEqual({ key: "published", status: "done", at: "2026-09-06T09:40:00Z" });
  });

  it("una fecha que no se guarda sale vacía, no inventada", () => {
    // Sin apunte de envío (una solicitud nacida de un presupuesto), vale la de creación.
    const pasos = requestTimeline({ ...base, submittedAt: null, state: "in_progress" });
    expect(pasos[0].at).toBe("2026-09-01T08:00:00Z");
    expect(pasos.find((p) => p.key === "review")?.at).toBeNull();
    expect(pasos.find((p) => p.key === "in_progress")?.status).toBe("current");
  });

  it("R12 · la corrección pedida va después de publicada", () => {
    expect(resumen({ ...base, state: "correction_requested" }).at(-1)).toBe("correction:current");
  });

  it("R12 · cancelada: solo lo que llegó a pasar, y el final", () => {
    expect(
      resumen({ ...base, state: "cancelled_before_start", cancelledAt: "2026-09-04T10:00:00Z" }),
    ).toEqual(["received:done", "cancelled:stopped"]);
    const rechazada = requestTimeline({ ...base, state: "rejected", rejectedAt: "2026-09-04T10:00:00Z" });
    expect(rechazada.at(-1)).toEqual({ key: "rejected", status: "stopped", at: "2026-09-04T10:00:00Z" });
  });
});
