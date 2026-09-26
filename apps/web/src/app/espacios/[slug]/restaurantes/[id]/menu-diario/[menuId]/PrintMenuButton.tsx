"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

const p = es.panelMenus;

/**
 * Imprimir el menú (RN-MEN-04): manda a la impresora **el mismo PDF que
 * se descarga**, no la vista previa de la pantalla. Así lo que sale en
 * papel es la plantilla generada, y la impresión queda en el historial de
 * descargas como cualquier PDF (RN-MEN-10): quien decide si se puede es
 * `register_menu_download()`, en el servidor, no este botón.
 *
 * Es un enlace a `descargar?formato=pdf&imprimir=1`, que la ruta entrega
 * `inline`. Con puntero fino (escritorio) se intercepta: se pide el PDF,
 * se carga en un marco invisible y se abre el diálogo de impresión sin
 * salir de la pantalla. Con puntero grueso (móvil, tableta) se deja que el
 * enlace abra el PDF en una pestaña nueva, porque imprimir un marco en
 * Safari de iOS imprime la página de fuera; desde el visor del sistema se
 * imprime o se comparte. Sin JavaScript, el enlace hace lo mismo.
 */
export function PrintMenuButton({ href, className }: { href: string; className: string }) {
  const [estado, setEstado] = useState<"idle" | "pending" | "error">("idle");
  const marco = useRef<HTMLIFrameElement | null>(null);
  const enlaceBlob = useRef<string | null>(null);

  // El marco se queda puesto hasta la siguiente impresión o hasta salir:
  // quitarlo al volver de `print()` cancela el diálogo en algunos
  // navegadores.
  function limpiar() {
    marco.current?.remove();
    marco.current = null;
    if (enlaceBlob.current) URL.revokeObjectURL(enlaceBlob.current);
    enlaceBlob.current = null;
  }

  useEffect(() => limpiar, []);

  async function imprimir(event: MouseEvent<HTMLAnchorElement>) {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    event.preventDefault();
    if (estado === "pending") return;
    setEstado("pending");

    try {
      const respuesta = await fetch(href, { cache: "no-store", credentials: "same-origin" });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const pdf = await respuesta.blob();

      limpiar();
      const url = URL.createObjectURL(pdf);
      enlaceBlob.current = url;
      const iframe = document.createElement("iframe");
      iframe.className = "fixed bottom-0 right-0 h-0 w-0 border-0";
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setEstado("idle");
        } catch {
          setEstado("error");
        }
      };
      iframe.src = url;
      marco.current = iframe;
      document.body.appendChild(iframe);
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="grid gap-2">
      <a
        href={href}
        target="_blank"
        rel="noopener"
        onClick={imprimir}
        aria-busy={estado === "pending"}
        className={className}
      >
        <Icon name="printer" className="h-4 w-4" />
        {estado === "pending" ? p.printPending : p.print}
      </a>
      {estado === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {p.printError}
        </p>
      ) : null}
    </div>
  );
}
