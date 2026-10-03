/**
 * `src/services/agents/xlsx.ts` · escribir un `.xlsx` sin dependencias (Fase E, COB-02:
 * «Descargar todas las reservas en Excel», PRD de agents §6.13 y §11.1).
 *
 * Un `.xlsx` es un zip con unos cuantos XML. Aquí se escribe uno sencillo —una hoja, texto y
 * números, la cabecera en negrita— con un zip «almacenado» (sin comprimir), que Excel, Numbers y
 * LibreOffice abren sin problema. Los textos van en línea (`inlineStr`), nunca como fórmula, así
 * que una nota que empiece por `=` se queda en texto (no hay inyección de fórmulas).
 *
 * No hay librería de Excel en el repositorio y la necesidad es esta sola; si algún día hacen falta
 * varias hojas, formatos o fórmulas, se cambia por una (decisión 139).
 */

export type XlsxCell = string | number | null;

export interface XlsxColumn {
  readonly header: string;
  /** Ancho aproximado en caracteres. */
  readonly width?: number;
}

export interface XlsxSheet {
  readonly sheetName: string;
  readonly columns: readonly XlsxColumn[];
  readonly rows: readonly (readonly XlsxCell[])[];
}

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// CRC-32 (el del zip)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------
/** Escapa el texto y quita los caracteres que XML 1.0 no admite. */
export function xmlText(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** El nombre de una hoja: hasta 31 caracteres y sin `: \ / ? * [ ]`. */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned === "" ? "Hoja1" : cleaned;
}

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join("");
  const cell = (value: XlsxCell, col: number, row: number, style?: number): string => {
    const ref = `${columnName(col)}${row}`;
    const s = style === undefined ? "" : ` s="${style}"`;
    if (value === null || value === "") return style === undefined ? "" : `<c r="${ref}"${s}/>`;
    if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
  };
  const header = `<row r="1">${sheet.columns.map((c, i) => cell(c.header, i, 1, 1)).join("")}</row>`;
  const body = sheet.rows
    .map((row, r) => `<row r="${r + 2}">${row.map((v, i) => cell(v, i, r + 2)).join("")}</row>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// ---------------------------------------------------------------------------
// Zip «almacenado»
// ---------------------------------------------------------------------------
interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

// 01/01/2026 00:00: una fecha fija, para que el mismo contenido dé siempre los mismos bytes.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

function zip(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true); // sin compresión
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, 0x0800, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, DOS_TIME, true);
    header.setUint16(14, DOS_DATE, true);
    header.setUint32(16, crc, true);
    header.setUint32(20, size, true);
    header.setUint32(24, size, true);
    header.setUint16(28, name.length, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), name);

    push(new Uint8Array(local.buffer));
    push(name);
    push(entry.data);
  }

  const centralStart = offset;
  for (const part of central) push(part);
  const centralSize = offset - centralStart;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Un libro de una hoja, listo para descargar como `.xlsx`. */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  const name = xmlText(safeSheetName(sheet.sheetName));
  const files: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: encoder.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`,
      ),
    },
    { name: "xl/styles.xml", data: encoder.encode(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml(sheet)) },
  ];
  return zip(files);
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
