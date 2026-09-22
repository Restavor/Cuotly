"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FileUploadField } from "@/components/FileUploadField";
import { Card, Select } from "@/components/ui";
import { es } from "@/i18n/es";

const t = es.panelFiles;

/** Las carpetas que tiene sentido ofrecer al restaurante al subir. */
const CARPETAS = ["photos", "logos", "menus", "documents", "other"] as const;

/**
 * R28 · "Subir archivo". Los bytes van del navegador al bucket con una URL
 * firmada y el archivo queda registrado por `register_file()`, que decide
 * si esta persona puede subir a esa carpeta (`can_write_file()`: el permiso
 * "Subir archivos", RN-EST-15). Aquí solo se elige la carpeta y se refresca
 * la pantalla al terminar.
 */
export function UploadFileCard({ establishmentId, initialCategory }: { establishmentId: string; initialCategory: string }) {
  const router = useRouter();
  const inicial = (CARPETAS as readonly string[]).includes(initialCategory) ? initialCategory : "photos";
  const [categoria, setCategoria] = useState(inicial);
  const [hecho, setHecho] = useState(false);

  return (
    <Card title={t.upload}>
      <Select
        label={t.uploadCategory}
        name="category"
        value={categoria}
        onChange={(e) => {
          setCategoria(e.target.value);
          setHecho(false);
        }}
        options={CARPETAS.map((c) => ({ value: c, label: es.space.files.categories[c] }))}
      />
      <FileUploadField
        key={categoria}
        establishmentId={establishmentId}
        category={categoria}
        name="fileId"
        onUploaded={() => {
          setHecho(true);
          router.refresh();
        }}
      />
      {hecho ? (
        <p role="status" className="text-sm text-success">
          {t.uploadDone}
        </p>
      ) : null}
      <p className="text-xs text-text-secondary">{t.uploadHint}</p>
    </Card>
  );
}
