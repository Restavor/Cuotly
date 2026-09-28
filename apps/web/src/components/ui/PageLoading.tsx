import { Card } from "./Card";
import { LoadingState } from "./States";

/**
 * Lo que se pinta dentro del armazón mientras el servidor prepara una
 * pantalla que no tiene su propio `loading.tsx`. Sin él, pulsar un enlace
 * dejaba la pantalla anterior congelada hasta que llegaba la nueva entera,
 * y eso se leía como "la app no responde".
 *
 * Es solo la forma de una pantalla —el hueco del título y dos tarjetas—
 * con bloques grises y "Cargando…" debajo. No lleva ni una cifra ni un
 * nombre: se enseña el hueco, no un dato inventado (CLAUDE.md MUST NOT).
 */
export function PageLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2" aria-hidden="true">
        <span className="block h-7 w-56 animate-pulse rounded-full bg-soft-surface" />
        <span className="block h-4 w-80 max-w-full animate-pulse rounded-full bg-soft-surface" />
      </div>
      <Card>
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map((fila) => (
            <span key={fila} className="block h-3 w-full animate-pulse rounded-full bg-soft-surface" />
          ))}
        </div>
      </Card>
      <Card>
        <LoadingState />
      </Card>
    </div>
  );
}
