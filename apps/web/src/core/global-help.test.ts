import { describe, expect, it } from "vitest";

import { helpFaq, helpTopicCounts, readHelpParams } from "./global-help";

const hit = (id: string, topic: string, mine = true) => ({ id, topic, for_my_role: mine });

describe("RN-GLO-07 · la Ayuda global", () => {
  it("lee la búsqueda y el tema; un tema que no existe no filtra", () => {
    expect(readHelpParams({ q: " bizum ", tema: "payments" })).toEqual({ q: "bizum", topic: "payments" });
    expect(readHelpParams({ tema: "inventado" }).topic).toBeNull();
  });

  it("los temas con artículos, en el orden del catálogo y con cuántos tienen", () => {
    const hits = [hit("a", "payments"), hit("b", "first_steps"), hit("c", "payments")];
    expect(helpTopicCounts(hits)).toEqual([
      { topic: "first_steps", count: 1 },
      { topic: "payments", count: 2 },
    ]);
  });

  it("RN-SOP-11 · primero las guías del rol de quien mira", () => {
    const hits = [hit("otra", "requests", false), hit("mia", "requests")];
    expect(helpFaq(hits, { q: "", topic: null }).map((h) => h.id)).toEqual(["mia", "otra"]);
  });

  it("el tema recorta la lista, y con tema o búsqueda no hay tope", () => {
    const hits = Array.from({ length: 8 }, (_, i) => hit(`p${i}`, "payments")).concat(hit("r", "requests"));
    expect(helpFaq(hits, { q: "", topic: "requests" }).map((h) => h.id)).toEqual(["r"]);
    expect(helpFaq(hits, { q: "", topic: "payments" })).toHaveLength(8);
    expect(helpFaq(hits, { q: "pago", topic: null })).toHaveLength(9);
  });

  it("la portada, sin búsqueda ni tema, enseña seis", () => {
    const hits = Array.from({ length: 10 }, (_, i) => hit(`h${i}`, "first_steps"));
    expect(helpFaq(hits, { q: "", topic: null })).toHaveLength(6);
  });
});
