import { createContext, useContext, useEffect, useState } from "react";

import type { ShellRole } from "@/components/shell/navigation";

import { useAuth } from "./auth-context";
import { readCache, writeCache } from "./cache";
import { supabase } from "./supabase";

/**
 * Quién está mirando dentro de un espacio: su rol y, si es un
 * restaurante, cuál es el suyo. Es la misma resolución que
 * `apps/web/src/components/shell/viewer.ts` (RN-MOV-02: el rol sale de
 * la membresía real, no de nada que mande el teléfono), sin Modo soporte:
 * no está en la app (RN-MOV-08).
 *
 * **No autoriza nada.** Decide qué se pinta; quién puede leer qué lo
 * siguen decidiendo RLS y las funciones del servidor.
 */
export type SpaceViewer = {
  readonly userId: string;
  readonly spaceId: string | null;
  readonly spaceName: string;
  readonly slug: string;
  readonly timezone: string;
  readonly role: ShellRole;
  /** Para un restaurante con exactamente uno; `null` si tiene varios o es del equipo. */
  readonly establishmentId: string | null;
  readonly establishments: readonly { id: string; name: string }[];
};

type SpaceContextValue = {
  readonly viewer: SpaceViewer | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly fromCache: boolean;
};

const SpaceContext = createContext<SpaceContextValue>({ viewer: null, loading: true, error: null, fromCache: false });

async function resolveViewer(userId: string, slug: string): Promise<SpaceViewer> {
  const { data: space } = await supabase
    .from("spaces")
    .select("id, name, slug, timezone")
    .eq("slug", slug)
    .maybeSingle();

  // Un restaurante no puede leer `spaces` —no es miembro— pero sí sus
  // restaurantes. Sin espacio legible se sigue adelante.
  const spaceId = space?.id ?? null;

  const { data: membership } = spaceId
    ? await supabase
        .from("space_memberships")
        .select("role")
        .eq("space_id", spaceId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };

  const { data: establishments } = await supabase.from("establishments").select("id, name, space_id");
  const mine = (establishments ?? []).filter((e) => spaceId === null || e.space_id === spaceId);

  let role: ShellRole = (membership?.role as ShellRole | undefined) ?? "client";
  let establishmentId: string | null = null;

  if (role === "client") {
    if (mine.length === 1) {
      establishmentId = mine[0].id;
      // §20.3 · "Restaurante con Menú Diario" es otra barra: se sabe
      // preguntando por el saldo del servicio.
      const { data: balance } = await supabase.rpc("menu_update_balance", { p_establishment_id: establishmentId });
      if (balance && balance.length > 0) role = "client_daily_menu";
    }
    if (mine.length === 0 && spaceId === null) {
      throw new Error("not_found");
    }
  }

  return {
    userId,
    spaceId,
    spaceName: space?.name ?? mine[0]?.name ?? slug,
    slug,
    timezone: space?.timezone ?? "Europe/Madrid",
    role,
    establishmentId,
    establishments: mine.map((e) => ({ id: e.id, name: e.name })),
  };
}

export function SpaceProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<SpaceContextValue>({ viewer: null, loading: true, error: null, fromCache: false });

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    const key = `viewer:${slug}`;
    void (async () => {
      try {
        const viewer = await resolveViewer(userId, slug);
        if (cancelled) return;
        await writeCache(userId, key, viewer);
        setState({ viewer, loading: false, error: null, fromCache: false });
      } catch (fallo) {
        if (cancelled) return;
        const message = fallo instanceof Error ? fallo.message : String(fallo);
        if (message === "not_found") {
          setState({ viewer: null, loading: false, error: message, fromCache: false });
          return;
        }
        const cached = await readCache<SpaceViewer>(userId, key);
        if (cancelled) return;
        setState(
          cached
            ? { viewer: cached.data, loading: false, error: null, fromCache: true }
            : { viewer: null, loading: false, error: message, fromCache: false },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, slug]);

  return <SpaceContext.Provider value={state}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceContextValue {
  return useContext(SpaceContext);
}

/** Dentro de una pantalla del espacio, el `viewer` ya está resuelto. */
export function useViewer(): SpaceViewer {
  const { viewer } = useContext(SpaceContext);
  if (!viewer) throw new Error("useViewer fuera de un espacio resuelto");
  return viewer;
}
