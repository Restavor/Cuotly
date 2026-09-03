"use client";

import { useId, useRef, useState } from "react";

import { ALLOWED_MIME_TYPES } from "@/core/files";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET } from "@/services/file-storage";

import { prepararSubida, registrarArchivo } from "@/app/archivos/actions";

/**
 * Adjuntar un archivo dentro de un formulario que envía otra cosa: un
 * pago con su justificante (HU-26), un mensaje con sus adjuntos (HU-35).
 *
 * El archivo se sube **antes** de enviar el formulario, y lo que el
 * formulario acaba enviando es el identificador del archivo ya
 * registrado. Es lo que permite que los 25 MB de RN-ARC-06 no pasen por
 * la server action: los bytes van del navegador al bucket con una URL
 * firmada, y por la acción solo viaja un uuid.
 *
 * Lo que se comprueba aquí —tipo y tamaño— es una cortesía para no
 * empezar una subida condenada, nunca el control: el control está en
 * `prepararSubida()`, en `registrarArchivo()`, en el propio bucket y en
 * el CHECK de `file_versions` (CLAUDE.md MUST).
 */
export function FileUploadField({
  establishmentId,
  category,
  name,
  label = es.files.label,
}: {
  establishmentId: string;
  category: string;
  /** Nombre del campo oculto por el que el formulario envía el archivo. */
  name: string;
  label?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileId, setFileId] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function limpiarEntrada() {
    if (inputRef.current) inputRef.current.value = "";
  }

  async function alElegir(archivo: File) {
    setError(null);
    setFileId("");
    setFileName("");
    setSubiendo(true);

    try {
      const preparacion = await prepararSubida({
        establishmentId,
        category,
        fileName: archivo.name,
        mimeType: archivo.type,
        sizeBytes: archivo.size,
      });

      if (!preparacion.ok) {
        setError(preparacion.motivo);
        limpiarEntrada();
        return;
      }

      // La subida no lleva sesión: la URL firmada autoriza por sí misma
      // esa ruta y nada más.
      const supabase = createClient();
      const { error: fallo } = await supabase.storage
        .from(FILES_BUCKET)
        .uploadToSignedUrl(preparacion.path, preparacion.token, archivo, {
          contentType: archivo.type,
        });

      if (fallo) {
        setError(es.files.transferFailed);
        limpiarEntrada();
        return;
      }

      const registro = await registrarArchivo({
        establishmentId,
        category,
        name: archivo.name,
        path: preparacion.path,
        fileName: archivo.name,
      });

      if (!registro.ok) {
        setError(registro.motivo);
        limpiarEntrada();
        return;
      }

      setFileId(registro.fileId);
      setFileName(archivo.name);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="mb-4">
      <input type="hidden" name={name} value={fileId} />

      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-text">
        {label}
      </label>
      <p className="mb-1.5 text-sm text-text-secondary">{es.files.hint}</p>

      {fileId ? (
        <p className="flex items-center gap-3 text-sm text-text">
          <span role="status">{fileName}</span>
          <button
            type="button"
            className="text-cuotly-green underline"
            onClick={() => {
              setFileId("");
              setFileName("");
              limpiarEntrada();
            }}
          >
            {es.files.remove}
          </button>
        </p>
      ) : (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          disabled={subiendo}
          accept={ALLOWED_MIME_TYPES.join(",")}
          onChange={(evento) => {
            const archivo = evento.target.files?.[0];
            if (archivo) void alElegir(archivo);
          }}
          className="block w-full text-sm text-text file:mr-3 file:rounded-[10px] file:border file:border-border file:bg-soft-surface file:px-3 file:py-2 file:text-sm file:text-text"
        />
      )}

      {subiendo ? (
        <p role="status" className="mt-1.5 text-sm text-text-secondary">
          {es.files.uploading}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
