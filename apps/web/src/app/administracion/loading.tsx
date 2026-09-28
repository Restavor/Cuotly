import { PageLoading } from "@/components/ui";

/**
 * Mientras llega la pantalla, el armazón se queda y dentro se pinta su
 * forma con "Cargando…" (ver `PageLoading`). Las pantallas que tienen un
 * `loading.tsx` propio, más parecido a lo que van a enseñar, lo usan en
 * vez de este.
 */
export default function Loading() {
  return <PageLoading />;
}
