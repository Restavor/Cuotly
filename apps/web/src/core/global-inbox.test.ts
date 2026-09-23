import { describe, expect, it } from "vitest";

import {
  filterInbox,
  groupInbox,
  inboxContexts,
  readInboxParams,
  unreadBySide,
  type InboxRow,
} from "./global-inbox";

const fila = (id: string, extra: Partial<InboxRow> = {}): InboxRow => ({
  id,
  side: "maintenance",
  space_id: "s1",
  space_name: "Espacio Uno",
  establishment_id: "e1",
  establishment_name: "Restaurante Uno",
  request_code: null,
  job_code: null,
  last_message_preview: null,
  unread_count: 0,
  ...extra,
});

describe("RN-GLO-05 · la bandeja global", () => {
  it("sin pestaña en la dirección abre la de mantenimiento si hay algo de ese lado", () => {
    expect(readInboxParams({}, [fila("a")]).side).toBe("maintenance");
    expect(readInboxParams({}, [fila("a", { side: "restaurant" })]).side).toBe("restaurant");
    expect(readInboxParams({ lado: "restaurantes" }, [fila("a")]).side).toBe("restaurant");
  });

  it("lee el contexto, la búsqueda, el filtro de no leídas y la elegida", () => {
    expect(readInboxParams({ contexto: "s1", q: " sol ", sinleer: "1", c: "x" }, [])).toMatchObject({
      context: "s1",
      q: "sol",
      unreadOnly: true,
      selected: "x",
    });
  });

  it("cada pestaña enseña solo su lado", () => {
    const filas = [fila("a"), fila("b", { side: "restaurant" })];
    const params = readInboxParams({ lado: "restaurantes" }, filas);
    expect(filterInbox(filas, params).map((f) => f.id)).toEqual(["b"]);
  });

  it("el contexto de Mantenimiento es el espacio; el de Restaurantes, el restaurante", () => {
    const filas = [
      fila("a", { space_id: "s1" }),
      fila("b", { space_id: "s2", space_name: "Espacio Dos" }),
      fila("c", { side: "restaurant", establishment_id: "e9", establishment_name: "Otro" }),
    ];
    expect(inboxContexts(filas, "maintenance")).toEqual([
      { key: "s1", name: "Espacio Uno" },
      { key: "s2", name: "Espacio Dos" },
    ]);
    expect(inboxContexts(filas, "restaurant")).toEqual([{ key: "e9", name: "Otro" }]);
    const params = readInboxParams({ contexto: "s2" }, filas);
    expect(filterInbox(filas, params).map((f) => f.id)).toEqual(["b"]);
  });

  it("RN-MSG-06 · 'Sin leer' deja solo las que el servidor cuenta sin leer", () => {
    const filas = [fila("a", { unread_count: 2 }), fila("b")];
    expect(filterInbox(filas, readInboxParams({ sinleer: "1" }, filas)).map((f) => f.id)).toEqual(["a"]);
  });

  it("busca sin acentos en el restaurante, el código y el último mensaje", () => {
    const filas = [
      fila("a", { request_code: "SOL-0003" }),
      fila("b", { last_message_preview: "Te adjunto la versión nueva" }),
      fila("c", { establishment_name: "Magariños" }),
    ];
    const buscar = (q: string) => filterInbox(filas, readInboxParams({ q }, filas)).map((f) => f.id);
    expect(buscar("sol-0003")).toEqual(["a"]);
    expect(buscar("version")).toEqual(["b"]);
    expect(buscar("magarinos")).toEqual(["c"]);
  });

  it("agrupa por contexto y conserva el orden en que llegan", () => {
    const filas = [
      fila("a", { space_id: "s2", space_name: "Espacio Dos" }),
      fila("b"),
      fila("c", { space_id: "s2", space_name: "Espacio Dos" }),
    ];
    expect(groupInbox(filas, "maintenance").map((g) => [g.name, g.rows.map((r) => r.id)])).toEqual([
      ["Espacio Dos", ["a", "c"]],
      ["Espacio Uno", ["b"]],
    ]);
  });

  it("el número de cada pestaña es lo que hay sin leer de ese lado", () => {
    const filas = [
      fila("a", { unread_count: 2 }),
      fila("b", { unread_count: null }),
      fila("c", { side: "restaurant", unread_count: 1 }),
    ];
    expect(unreadBySide(filas)).toEqual({ maintenance: 2, restaurant: 1 });
  });
});
