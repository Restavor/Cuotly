import Link from "next/link";

import { es } from "@/i18n/es";

/**
 * El aviso de "estás viendo solo las de este restaurante" de los tres
 * listados del equipo —solicitudes, trabajos y tareas—, que es a donde
 * llevan los enlaces "Ver todas" de la Operación de la ficha (vista 04).
 *
 * Sin él, "Ver todas" y el listado completo se ven igual y quien llega
 * cree que el espacio entero tiene tres solicitudes. Por eso el aviso dice
 * de quién son y ofrece el camino de vuelta a todas.
 *
 * **El filtro no controla nada.** Recorta filas que RLS ya dejó pasar; un
 * uuid ajeno en la dirección no enseña nada nuevo, porque la fila del
 * restaurante ajeno no llega hasta aquí. Y como no llega, tampoco se
 * puede resolver su nombre: entonces el aviso dice eso —no existe o no lo
 * puedes ver— en vez de dejar una lista vacía sin explicación (CA-20).
 */
export function ListFilterNotice({
  establishmentName,
  allHref,
}: {
  establishmentName: string | null;
  allHref: string;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-[10px] bg-soft-surface px-3 py-2 text-sm text-text-secondary">
      <span>
        {establishmentName === null
          ? es.teamArea.listFilter.unknown
          : es.teamArea.listFilter.only(establishmentName)}
      </span>
      <Link href={allHref} className="text-cuotly-green underline">
        {es.teamArea.listFilter.clear}
      </Link>
    </p>
  );
}
