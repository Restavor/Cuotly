import { es } from "@/i18n/es";

/**
 * RN-CIC-10/11 · el enlace de descarga de una exportación.
 *
 * Es un enlace y no un formulario con acción de servidor a propósito: lo
 * que se descarga puede pesar megabytes, y devolverlo a la pantalla para
 * armar un `data:` URL lo metería entero en el HTML. La ruta
 * `/api/exportacion` lo sirve como archivo.
 *
 * El alcance lo fija la pantalla que monta esto —el espacio entero en
 * Ajustes, el establecimiento en la ficha del restaurante—, y quien lo
 * decide de verdad es `can_export_scope()`, en el servidor. Un enlace
 * manipulado a mano no se lleva nada que su dueño no pudiera ver.
 */
export function ExportForm({
  spaceId,
  scope,
  groupId,
  establishmentId,
  label,
}: {
  spaceId: string;
  scope: "space" | "group" | "establishment";
  groupId?: string;
  establishmentId?: string;
  label: string;
}) {
  const params = new URLSearchParams({ espacio: spaceId, alcance: scope });
  if (groupId) params.set("grupo", groupId);
  if (establishmentId) params.set("establecimiento", establishmentId);

  return (
    <div>
      <a
        href={`/api/exportacion?${params.toString()}`}
        className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-primary-dark"
      >
        {label}
      </a>
      <p className="mt-3 text-sm text-text-secondary">{es.spaceExport.downloadHint}</p>
    </div>
  );
}
