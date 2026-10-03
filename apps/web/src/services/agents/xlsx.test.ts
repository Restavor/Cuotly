import { describe, expect, it } from "vitest";

import { buildXlsx, columnName, crc32, safeSheetName, xmlText } from "./xlsx";

/** Lee el zip «almacenado» que escribe `buildXlsx` y devuelve sus archivos, comprobando los CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, string>();
  // Fin del directorio central
  const endAt = bytes.byteLength - 22;
  expect(view.getUint32(endAt, true)).toBe(0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    const dataAt = localAt + 30 + view.getUint16(localAt + 26, true) + view.getUint16(localAt + 28, true);
    const data = bytes.subarray(dataAt, dataAt + size);
    expect(crc32(data), `CRC de ${name}`).toBe(crc);
    files.set(name, new TextDecoder().decode(data));
    at += 46 + nameLength;
  }
  return files;
}

describe("COB-02 · el Excel de las reservas", () => {
  const book = buildXlsx({
    sheetName: "Reservas",
    columns: [{ header: "Fecha", width: 12 }, { header: "Nombre" }, { header: "Personas" }],
    rows: [
      ["2026-09-26", "Lucía & Hijos <b>", 4],
      ["2026-09-27", "=SUMA(1;1)", null],
    ],
  });
  const files = unzip(book);

  it("COB-02 · es un zip con las seis partes de un libro de Excel y los CRC bien", () => {
    expect([...files.keys()].sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(String.fromCharCode(...book.subarray(0, 2))).toBe("PK");
  });

  it("COB-02 · la cabecera va en negrita y las filas tras ella, con los números como números", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Fecha</t></is></c>');
    expect(sheet).toContain('<c r="C2"><v>4</v></c>');
    expect(sheet).toContain('<row r="3">');
  });

  it("COB-02 · el texto se escapa y una nota que empieza por = es texto, no una fórmula", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("Lucía &amp; Hijos &lt;b&gt;");
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=SUMA(1;1)</t>');
    expect(sheet).not.toContain("<f>");
  });

  it("COB-02 · una celda vacía no ocupa sitio", () => {
    expect(files.get("xl/worksheets/sheet1.xml")).not.toContain('r="C3"');
  });

  it("COB-02 · el mismo contenido da siempre los mismos bytes (fecha fija en el zip)", () => {
    const again = buildXlsx({ sheetName: "Reservas", columns: [{ header: "Fecha", width: 12 }, { header: "Nombre" }, { header: "Personas" }], rows: [["2026-09-26", "Lucía & Hijos <b>", 4], ["2026-09-27", "=SUMA(1;1)", null]] });
    expect(Buffer.from(again).equals(Buffer.from(book))).toBe(true);
  });

  it("COB-02 · piezas: CRC-32 conocido, letras de columna, nombre de hoja y XML sin caracteres prohibidos", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(safeSheetName("Reservas: [2026]/más?")).toBe("Reservas   2026  más");
    expect(safeSheetName("   ")).toBe("Hoja1");
    expect(safeSheetName("x".repeat(60))).toHaveLength(31);
    expect(xmlText("a\u0000b\u0008c")).toBe("abc");
  });
});
