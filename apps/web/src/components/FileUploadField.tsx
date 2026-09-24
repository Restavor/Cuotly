"use client";

import { useId, useRef, useState } from "react";
import { megabytesMaximos } from "@/core/files";

import { ALLOWED_MIME_TYPES } from "@/core/files";
import { Icon } from "@/components/ui/Icon";
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
  onUploaded,
  compact = false,
  visibility,
}: {
  establishmentId: string;
  category: string;
  /** Nombre del campo oculto por el que el formulario envía el archivo. */
  name: string;
  label?: string;
  /**
   * R28 · para quien sube un archivo suelto, sin formulario detrás: el
   * archivo ya está registrado y solo hay que refrescar la pantalla.
   */
  onUploaded?: (fileId: string) => void;
  /**
   * La caja de escribir de una conversación: un botón de clip en vez del
   * bloque con rótulo y pista. El rótulo sigue ahí para el lector de
   * pantalla, y la pista viaja como título del botón.
   */
  compact?: boolean;
  /**
   * M77 · el adjunto de una solicitud que el equipo crea en nombre del
   * restaurante es del restaurante, y se sube compartido con él. Sin esto,
   * `registerFile` lo deja interno. Quién puede marcarlo así lo vuelve a
   * decidir el servidor.
   */
  visibility?: "internal" | "shared_with_client";
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
        visibility,
      });

      if (!registro.ok) {
        setError(registro.motivo);
        limpiarEntrada();
        return;
      }

      setFileId(registro.fileId);
      setFileName(archivo.name);
      onUploaded?.(registro.fileId);
    } finally {
      setSubiendo(false);
    }
  }

  if (compact) {
    return (
      <div className="flex shrink-0 flex-col items-start">
        <input type="hidden" name={name} value={fileId} />
        <label
          htmlFor={inputId}
          title={es.files.hint(megabytesMaximos())}
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-[10px] border border-border text-text-secondary transition-colors hover:bg-soft-surface hover:text-text has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cuotly-green ${
            subiendo || fileId ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Icon name="upload" className="h-5 w-5" />
          <span className="sr-only">{label}</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            disabled={subiendo || fileId !== ""}
            accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              if (archivo) void alElegir(archivo);
            }}
            className="sr-only"
          />
        </label>
        {fileId ? (
          <p className="mt-1 flex max-w-48 items-center gap-2 text-xs text-text">
            <span role="status" className="truncate">
              {fileName}
            </span>
            <button
              type="button"
              className="shrink-0 text-cuotly-green underline"
              onClick={() => {
                setFileId("");
                setFileName("");
                limpiarEntrada();
              }}
            >
              {es.files.remove}
            </button>
          </p>
        ) : null}
        {subiendo ? (
          <p role="status" className="mt-1 text-xs text-text-secondary">
            {es.files.uploading}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-1 max-w-48 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <input type="hidden" name={name} value={fileId} />

      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-text">
        {label}
      </label>
      <p className="mb-1.5 text-sm text-text-secondary">{es.files.hint(megabytesMaximos())}</p>

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
        /*
          Un `<input type="file">` disfrazado de botón, como la foto del
          restaurante (PhotoForm): el campo suelto lo pinta el navegador en
          su idioma —"Choose File · No file chosen" en uno en inglés— y no
          admite los tokens del sistema. El `<label>` es el control: se
          llega con el tabulador y se abre con Enter.
        */
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-soft-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cuotly-green ${
            subiendo ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <Icon name="upload" className="h-4 w-4" />
          {es.files.choose}
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
            className="sr-only"
          />
        </label>
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
