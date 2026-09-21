"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { EstablishmentPhoto } from "@/components/establishment/EstablishmentPhoto";
import { Button } from "@/components/ui";
import { es } from "@/i18n/es";
import { createClient } from "@/lib/supabase/client";
import { FILES_BUCKET } from "@/services/file-storage";

import { prepararSubida, registrarArchivo } from "@/app/archivos/actions";
import { setEstablishmentPhoto } from "@/app/espacios/[slug]/restaurantes/[id]/actions";

const t = es.teamArea.establishments;

/**
 * RN-EST-18 · subir o quitar la foto del restaurante (decisión 62).
 *
 * **Son tres pasos y uno solo se ve.** Quien pulsa "Subir una foto" elige
 * un archivo y ya está; por debajo se firma un vale para una ruta
 * concreta, el navegador manda los bytes al bucket privado y
 * `register_file()` los registra, y solo entonces
 * `set_establishment_photo()` la designa. Cada uno de los tres comprueba
 * el permiso por su cuenta, y el último además comprueba que el archivo
 * sea de este restaurante, esté compartido y sea una imagen.
 *
 * **Se registra como compartida con el restaurante**, sin preguntar, y no
 * es un atajo: RN-EST-18 dice que la foto la ven los dos lados, así que
 * una foto interna sería una contradicción — y el servidor la rechazaría.
 * Por eso aquí no hay desplegable de visibilidad como en "Subir archivo":
 * una elección cuya única respuesta válida es una no es una elección.
 *
 * **Quitarla no borra nada.** El archivo se queda donde estaba, con sus
 * versiones, y deja de ser la cara del local. Por eso el botón dice
 * "Quitar la foto" y no "Eliminar".
 *
 * **Esto necesita JavaScript** y el resto de la ficha no. Es el mismo
 * precio que paga "Subir archivo" en Gestión · Archivos y por el mismo
 * motivo (los bytes no caben en el cuerpo de una acción de servidor), así
 * que sin él se dice, en vez de dejar un botón que no hace nada (CA-20).
 */
export function PhotoForm({
  establishmentId,
  photoUrl,
}: {
  readonly establishmentId: string;
  /** El enlace firmado de la foto de ahora, o `null` si no tiene. */
  readonly photoUrl: string | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  function limpiar() {
    if (entrada.current) entrada.current.value = "";
  }

  async function alElegir(archivo: File) {
    setError(null);
    setHecho(null);
    setTrabajando(true);

    try {
      const preparacion = await prepararSubida({
        establishmentId,
        // RN-ARC-01 · la foto del local es una fotografía, no un
        // documento: metida en "Documentos" se escondería de quien la
        // busque entre las fotos.
        category: "photos",
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
        category: "photos",
        name: archivo.name,
        path: preparacion.path,
        fileName: archivo.name,
        visibility: "shared_with_client",
      });
      if (!registro.ok) {
        setError(registro.motivo);
        return;
      }

      const designada = await setEstablishmentPhoto(establishmentId, registro.fileId);
      if (!designada.ok) {
        /*
          El archivo quedó subido y registrado —está en sus archivos, no se
          ha perdido— pero no llegó a ser la foto. Se dice tal cual: el
          motivo lo da el servidor, y borrarlo por nuestra cuenta iría
          contra CLAUDE.md.
        */
        setError(designada.motivo);
        return;
      }

      setHecho(t.photoSaved);
      router.refresh();
    } finally {
      setTrabajando(false);
      limpiar();
    }
  }

  async function alQuitar() {
    setError(null);
    setHecho(null);
    setTrabajando(true);
    try {
      const resultado = await setEstablishmentPhoto(establishmentId, null);
      if (!resultado.ok) {
        setError(resultado.motivo);
        return;
      }
      setHecho(t.photoRemoved);
      router.refresh();
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{t.photoHint}</p>

      <div className="flex flex-wrap items-center gap-4">
        <EstablishmentPhoto photoUrl={photoUrl} size={72} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {photoUrl === null ? (
            <p className="text-sm text-text-secondary">{t.noPhoto}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {/*
              Un `<input type="file">` disfrazado de botón: el campo suelto
              se ve distinto en cada navegador y no hay forma de darle los
              tokens del sistema. El `<label>` ES el control —se llega con
              el tabulador y se activa con Enter—, así que no se pierde
              nada por el camino.

              El `accept` es **cortesía para el navegador**, no una
              barrera: el tipo lo rechaza el bucket, lo vuelve a mirar
              `registrarArchivo()` sobre el objeto real y lo comprueba otra
              vez `set_establishment_photo()` (CLAUDE.md).
            */}
            <label
              className={`inline-flex cursor-pointer items-center rounded-field bg-primary px-4 py-2 text-sm font-medium text-surface transition-opacity focus-within:outline focus-within:outline-2 focus-within:outline-cuotly-green ${
                trabajando ? "pointer-events-none opacity-60" : "hover:opacity-90"
              }`}
            >
              {trabajando ? t.photoUploading : photoUrl === null ? t.photoChoose : t.photoReplace}
              <input
                ref={entrada}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={trabajando}
                className="sr-only"
                onChange={(evento) => {
                  const archivo = evento.target.files?.[0];
                  if (archivo) void alElegir(archivo);
                }}
              />
            </label>

            {photoUrl === null ? null : (
              <Button type="button" variant="secondary" disabled={trabajando} onClick={() => void alQuitar()}>
                {t.photoRemove}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error === null ? null : (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {hecho === null ? null : (
        <p role="status" className="text-sm text-success">
          {hecho}
        </p>
      )}
    </div>
  );
}
