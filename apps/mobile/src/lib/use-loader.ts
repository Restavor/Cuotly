import { useCallback, useEffect, useRef, useState } from "react";

import { readCache, writeCache } from "./cache";
import { useOnline } from "./connectivity";

/**
 * Cargar algo del servidor y, si no se puede, enseñar lo último que se
 * cargó **con su hora** (RN-MOV-09). El resultado dice de dónde viene:
 * la pantalla pinta la banda de "sin conexión · datos de …" cuando
 * `fromCache` es verdadero, y nunca deja actuar sobre datos de caché como
 * si fueran de ahora.
 */
export interface Loaded<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  readonly fromCache: boolean;
  readonly fetchedAt: string | null;
  readonly reload: () => void;
}

export function useLoader<T>(userId: string | null, key: string, load: () => Promise<T>, deps: readonly unknown[]): Loaded<T> {
  const online = useOnline();
  const [state, setState] = useState<Omit<Loaded<T>, "reload">>({
    data: null,
    error: null,
    loading: true,
    fromCache: false,
    fetchedAt: null,
  });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (userId === null) return;

    async function run() {
      const uid = userId as string;
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await loadRef.current();
        if (cancelled) return;
        await writeCache(uid, key, data);
        setState({ data, error: null, loading: false, fromCache: false, fetchedAt: new Date().toISOString() });
      } catch (fallo) {
        if (cancelled) return;
        const cached = await readCache<T>(uid, key);
        if (cancelled) return;
        if (cached) {
          setState({ data: cached.data, error: null, loading: false, fromCache: true, fetchedAt: cached.fetchedAt });
        } else {
          setState({
            data: null,
            error: fallo instanceof Error ? fallo.message : String(fallo),
            loading: false,
            fromCache: false,
            fetchedAt: null,
          });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // `deps` es la lista que la pantalla declara; `online` fuerza una
    // recarga al recuperar la conexión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, tick, online, ...deps]);

  return { ...state, reload };
}
