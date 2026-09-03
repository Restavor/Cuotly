#!/usr/bin/env node
// Comprueba de punta a punta el bucket privado de archivos (PRD §19
// RN-ARC), que es la única parte de la tanda de archivos que no se puede
// verificar con SQL: los permisos están en la base de datos y se prueban
// desde `supabase/tests/`, pero **mover bytes** necesita hablar con
// Storage.
//
// Qué comprueba, en este orden:
//   1. El bucket existe, es privado y trae el límite de 25 MB y la lista
//      blanca de RN-ARC-06.
//   2. El camino real de una subida: URL firmada (servidor) → subida
//      directa desde un cliente sin sesión (navegador) → metadatos del
//      objeto guardado → enlace firmado de descarga → los bytes que
//      vuelven son los que se subieron.
//   3. Que el bucket está cerrado: con la clave pública, y con sesión o
//      sin ella, no se puede listar ni descargar un objeto. Si esto
//      pasara, RN-ARC-04, RN-ARC-05 y RN-FIN-07 dejarían de significar
//      nada, porque bastaría con saber la ruta.
//   4. Limpia lo que ha subido.
//
// Cómo ejecutarlo, desde `apps/web`:
//   SUPABASE_SERVICE_ROLE_KEY="<la clave secreta>" node scripts/comprobar-storage.mjs
//
// La URL y la clave pública salen de `.env.local`. La clave de servicio
// NO se guarda en ningún archivo del repositorio: se pasa a mano.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "files";
const TIPOS_ESPERADOS = 11;
const LIMITE_ESPERADO = 26214400;

function leerEnvLocal() {
  try {
    const texto = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return Object.fromEntries(
      texto
        .split("\n")
        .map((linea) => linea.trim())
        .filter((linea) => linea && !linea.startsWith("#"))
        .map((linea) => {
          const corte = linea.indexOf("=");
          return [linea.slice(0, corte), linea.slice(corte + 1).replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...leerEnvLocal(), ...process.env };
const URL_SUPABASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE_PUBLICA = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CLAVE_SERVICIO = env.SUPABASE_SERVICE_ROLE_KEY;

let fallos = 0;
function comprobar(descripcion, condicion, detalle = "") {
  if (condicion) {
    console.log(`  ok   ${descripcion}`);
  } else {
    fallos += 1;
    console.log(`  FALLA ${descripcion}${detalle ? ` — ${detalle}` : ""}`);
  }
}

if (!URL_SUPABASE || !CLAVE_PUBLICA) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(2);
}
if (!CLAVE_SERVICIO) {
  console.error(
    "Falta SUPABASE_SERVICE_ROLE_KEY. Pásala en la línea de comandos:\n" +
      '  SUPABASE_SERVICE_ROLE_KEY="…" node scripts/comprobar-storage.mjs',
  );
  process.exit(2);
}

const admin = createClient(URL_SUPABASE, CLAVE_SERVICIO, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publico = createClient(URL_SUPABASE, CLAVE_PUBLICA, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Un PDF mínimo de verdad: el bucket comprueba el tipo declarado, y así
// además el contenido se corresponde con él.
const CONTENIDO = Buffer.from("%PDF-1.4\n% comprobación de Cuotly\n%%EOF\n", "utf8");
const RUTA = `comprobacion/${crypto.randomUUID()}/comprobacion.pdf`;

console.log("\n1 · El bucket");
const { data: buckets, error: errorBuckets } = await admin.storage.listBuckets();
if (errorBuckets) {
  console.error(`No se pudo listar los buckets: ${errorBuckets.message}`);
  process.exit(1);
}
const bucket = (buckets ?? []).find((b) => b.id === BUCKET);
comprobar(`existe el bucket "${BUCKET}"`, Boolean(bucket));
comprobar("RN-ARC-08: es privado", bucket?.public === false, `public=${bucket?.public}`);
comprobar(
  "RN-ARC-06: el límite son 25 MB",
  bucket?.file_size_limit === LIMITE_ESPERADO,
  `limite=${bucket?.file_size_limit}`,
);
comprobar(
  "RN-ARC-06: la lista blanca tiene los 11 tipos",
  bucket?.allowed_mime_types?.length === TIPOS_ESPERADOS,
  `tipos=${bucket?.allowed_mime_types?.length}`,
);

console.log("\n2 · El camino de una subida");
const { data: firma, error: errorFirma } = await admin.storage
  .from(BUCKET)
  .createSignedUploadUrl(RUTA);
comprobar("el servidor firma la subida", Boolean(firma?.token), errorFirma?.message);

if (firma?.token) {
  // Sin sesión: es lo que hace el navegador. La URL firmada autoriza sola.
  const { error: errorSubida } = await publico.storage
    .from(BUCKET)
    .uploadToSignedUrl(RUTA, firma.token, CONTENIDO, { contentType: "application/pdf" });
  comprobar("el navegador sube con esa firma, sin sesión", !errorSubida, errorSubida?.message);

  const { data: info, error: errorInfo } = await admin.storage.from(BUCKET).info(RUTA);
  comprobar("el servidor lee los metadatos del objeto guardado", !errorInfo, errorInfo?.message);
  comprobar(
    "el tamaño real es el del archivo",
    info?.size === CONTENIDO.length,
    `size=${info?.size} esperado=${CONTENIDO.length}`,
  );
  comprobar(
    "el tipo real es el que se subió",
    info?.contentType?.startsWith("application/pdf"),
    `contentType=${info?.contentType}`,
  );

  const { data: descarga, error: errorDescarga } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(RUTA, 60, { download: "comprobacion.pdf" });
  comprobar("se firma un enlace de descarga", Boolean(descarga?.signedUrl), errorDescarga?.message);

  if (descarga?.signedUrl) {
    const respuesta = await fetch(descarga.signedUrl);
    const bytes = Buffer.from(await respuesta.arrayBuffer());
    comprobar("el enlace firmado devuelve 200", respuesta.status === 200, `status=${respuesta.status}`);
    comprobar("los bytes que vuelven son los que se subieron", bytes.equals(CONTENIDO));
  }
}

console.log("\n3 · Que el bucket esté cerrado");
const { data: listado, error: errorListado } = await publico.storage.from(BUCKET).list("");
comprobar(
  "con la clave pública no se puede listar el bucket",
  Boolean(errorListado) || (listado ?? []).length === 0,
  `filas=${listado?.length}`,
);

const directa = await fetch(`${URL_SUPABASE}/storage/v1/object/${BUCKET}/${RUTA}`, {
  headers: { apikey: CLAVE_PUBLICA, authorization: `Bearer ${CLAVE_PUBLICA}` },
});
comprobar(
  "con la clave pública no se puede descargar por ruta",
  directa.status === 400 || directa.status === 401 || directa.status === 403 || directa.status === 404,
  `status=${directa.status}`,
);

const publica = await fetch(`${URL_SUPABASE}/storage/v1/object/public/${BUCKET}/${RUTA}`);
comprobar(
  "no hay URL pública del objeto",
  publica.status !== 200,
  `status=${publica.status}`,
);

console.log("\n4 · Limpieza");
const { error: errorBorrado } = await admin.storage.from(BUCKET).remove([RUTA]);
comprobar("se retira el objeto de prueba", !errorBorrado, errorBorrado?.message);

console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobación(es) fallida(s).\n`);
process.exit(fallos === 0 ? 0 : 1);
