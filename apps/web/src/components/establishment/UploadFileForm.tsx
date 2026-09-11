"use client";

import { useRouter } from "next/navigation";
import { megabytesMaximos } from "@/core/files";
import { useId, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { ALLOWED_MIME_TYPES, FILE_CATEGORIES, FILE_VISIBILITIES } from "@/core/files";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET } from "@/services/file-storage";

import { prepararSubida, registrarArchivo } from "@/app/archivos/actions";

/**
 * §15.2 · subir un archivo directamente al catálogo del restaurante.
 *
 * Hasta ahora un archivo solo entraba colgado de otra cosa —un mensaje o
 * el justificante de un cobro—, así que la maqueta enseñaba un botón
 * "Subir archivo" que no existía. Este lo es de verdad: los bytes van del
 * navegador al bucket con una URL firmada y el registro lo hace
 * `register_file()`, que comprueba `can_write_file(establecimiento,
 * categoría)`. Que el botón se pinte no autoriza nada — a quien no pueda,
 * el servidor le dice que no (CLAUDE.md MUST).
 *
 * La categoría se elige, no se adivina: RN-ARC-01 tiene ocho y meter una
 * fotografía en "Documentos" la esconde de quien la busque. La lista es la
 * de `src/core/files.ts`, la misma que valida el servidor.
 *
 * Y la marca de RN-ARC-04 también se elige, aquí y no después: la regla
 * dice que "cada archivo se marca Interno o Compartido con el
 * restaurante", y quien sube una fotografía retocada para el cliente sabe
 * en ese momento para quién es. Por defecto **interno**, que es lo
 * prudente: compartir de más ya no se deshace, y lo que falte se comparte
 * luego desde el panel del archivo.
 *
 * Al terminar se refresca la ruta en vez de añadir la fila a mano: la
 * tabla sale de una consulta con RLS, y pintar aquí lo que creemos haber
 * creado sería una segunda verdad que puede discrepar de la del servidor.
 */
export function UploadFileForm({ establishmentId }: { establishmentId: string }) {
  const router = useRouter();
  const categoriaId = useId();
  const visibilidadId = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState<string>(FILE_CATEGORIES[0]);
  const [visibilidad, setVisibilidad] = useState<string>(FILE_VISIBILITIES[0]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subido, setSubido] = useState<string | null>(null);

  const t = es.establishmentSheet;

  function limpiarEntrada() {
    if (entrada.current) entrada.current.value = "";
  }

  async function alElegir(archivo: File) {
    setError(null);
    setSubido(null);
    setSubiendo(true);

    try {
      const preparacion = await prepararSubida({
        establishmentId,
        category: categoria,
        fileName: archivo.name,
        mimeType: archivo.type,
        sizeBytes: archivo.size,
      });

      if (!preparacion.ok) {
        setError(preparacion.motivo);
        return;
      }

      const supabase = createClient();
      const { error: fallo } = await supabase.storage
        .from(FILES_BUCKET)
        .uploadToSignedUrl(preparacion.path, preparacion.token, archivo, {
          contentType: archivo.type,
        });

      if (fallo) {
        setError(es.files.transferFailed);
        return;
      }

      const registro = await registrarArchivo({
        establishmentId,
        category: categoria,
        name: archivo.name,
        path: preparacion.path,
        fileName: archivo.name,
        visibility: visibilidad,
      });

      if (!registro.ok) {
        setError(registro.motivo);
        return;
      }

      setSubido(archivo.name);
      router.refresh();
    } finally {
      setSubiendo(false);
      limpiarEntrada();
    }
  }

  return (
    <div className="rounded-[14px] border border-border bg-soft-surface p-4">
      <p className="mb-3 text-sm text-text-secondary">{t.uploadHint}</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={categoriaId} className="text-sm font-semibold text-text">
            {t.uploadCategoryLabel}
          </label>
          <select
            id={categoriaId}
            value={categoria}
            onChange={(evento) => setCategoria(evento.target.value)}
            disabled={subiendo}
            className="rounded-field border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            {FILE_CATEGORIES.map((opcion) => (
              <option key={opcion} value={opcion}>
                {es.space.files.categories[opcion]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={visibilidadId} className="text-sm font-semibold text-text">
            {t.uploadVisibilityLabel}
          </label>
          <select
            id={visibilidadId}
            value={visibilidad}
            onChange={(evento) => setVisibilidad(evento.target.value)}
            disabled={subiendo}
            className="rounded-field border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-colors focus:border-cuotly-green focus:outline focus:outline-2 focus:outline-cuotly-green"
          >
            <option value="internal">{es.space.files.internal}</option>
            <option value="shared_with_client">{es.space.files.sharedWithClient}</option>
          </select>
        </div>

        {/*
          El `<input type="file">` de verdad, tapado pero no escondido del
          teclado: la etiqueta es su nombre accesible y lo activa con Intro,
          así que esto es un control real con el aspecto del botón de la
          maqueta, no un `<div>` que solo entiende el ratón (CA-22).
        */}
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-field px-4 py-2.5 text-sm font-semibold text-surface transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-cuotly-green ${
            subiendo ? "bg-text-secondary" : "bg-primary hover:bg-cuotly-green"
          }`}
        >
          <Icon name="upload" className="h-4 w-4" />
          {subiendo ? t.uploadPending : t.uploadButton}
          <input
            ref={entrada}
            type="file"
            className="sr-only"
            disabled={subiendo}
            accept={ALLOWED_MIME_TYPES.join(",")}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              if (archivo) void alElegir(archivo);
            }}
          />
        </label>
      </div>

      <p className="mt-2 text-xs text-text-secondary">
        {es.files.hint(megabytesMaximos())} {t.uploadVisibilityHint}
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {subido ? (
        <p role="status" className="mt-2 text-sm text-text-secondary">
          {t.uploadDone(subido)}
        </p>
      ) : null}
    </div>
  );
}
