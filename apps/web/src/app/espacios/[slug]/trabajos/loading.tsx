import { Card, LoadingState, PageHeader } from "@/components/ui";
import { es } from "@/i18n/es";

/**
 * A15 · "Trabajos · Cargando". Mientras el servidor lee la bandeja se
 * pinta su forma —la cabecera, la barra de filtros y las filas— con
 * bloques grises, y debajo "Cargando trabajos…". No lleva ni una cifra ni
 * un nombre: lo que se enseña es el hueco, no un dato inventado.
 *
 * Next la usa también mientras carga la ficha de un trabajo, que por eso
 * tiene su propio `loading.tsx`.
 */
export default function JobsLoading() {
  const t = es.teamArea.jobs;
  const columnas = [t.loadingColumns.id, t.loadingColumns.title, t.establishmentColumn, t.categoryColumn, t.stateColumn, t.assigneeColumn];
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <Card>
        <div className="flex flex-wrap gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-10 w-40 animate-pulse rounded-[10px] bg-soft-surface" />
          ))}
        </div>
      </Card>
      <Card className="p-0! overflow-hidden">
        <div className="relative overflow-x-auto" aria-hidden="true">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-soft-surface text-left text-xs font-medium text-text-secondary">
                {columnas.map((c) => (
                  <th key={c} className="whitespace-nowrap px-4 py-3 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[0, 1, 2, 3].map((fila) => (
                <tr key={fila}>
                  {columnas.map((c) => (
                    <td key={c} className="px-4 py-4">
                      <span className="block h-3 w-full min-w-12 animate-pulse rounded-full bg-soft-surface" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LoadingState title={t.loading} />
      </Card>
    </div>
  );
}
