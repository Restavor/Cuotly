"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { compartirArchivo } from "@/app/archivos/actions";
import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

/**
 * RN-ARC-04 · "un trabajador puede compartir después uno interno, y queda
 * auditado".
 *
 * El botón es lo único que faltaba: `share_file_with_client()` existe
 * desde el Hito 7 con su capacidad, su idempotencia y su apunte de
 * auditoría, y no la llamaba ninguna pantalla.
 *
 * Es un botón y no un formulario porque no hay nada que rellenar. Que se
 * pinte no autoriza nada: quien decide es el servidor, y cuando dice que
 * no —un trabajador con un archivo de facturación (RN-ARC-05), alguien a
 * quien le han quitado el establecimiento entre que cargó la pantalla y
 * pulsó— se enseña **su** motivo, en vez de esconder el botón y dejar a
 * quien mira sin saber por qué no puede.
 *
 * Al terminar se refresca la ruta: la marca de visibilidad sale de una
 * consulta con RLS, y pintar aquí lo que creemos haber cambiado sería una
 * segunda verdad que puede discrepar de la del servidor.
 */
export function ShareFileButton({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [compartiendo, setCompartiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = es.establishmentSheet;

  async function alPulsar() {
    setError(null);
    setCompartiendo(true);

    try {
      const resultado = await compartirArchivo(fileId);

      if (!resultado.ok) {
        setError(resultado.motivo);
        return;
      }

      // Sin `setCompartido(true)`: lo que dice si está compartido es la
      // fila, y la fila la vuelve a traer el refresco. El aviso de "ya lo
      // tiene el restaurante" lo pinta la pantalla de servidor con la
      // visibilidad nueva.
      router.refresh();
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void alPulsar()}
        disabled={compartiendo}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-field px-4 py-2.5 text-sm font-semibold text-surface transition-colors focus:outline focus:outline-2 focus:outline-cuotly-green ${
          compartiendo ? "bg-text-secondary" : "bg-primary hover:bg-cuotly-green"
        }`}
      >
        <Icon name="share" className="h-4 w-4" />
        {compartiendo ? t.sharePending : t.shareButton}
      </button>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}
