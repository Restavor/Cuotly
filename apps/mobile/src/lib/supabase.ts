import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

// En la app móvil no hay cookies de navegador: la sesión se guarda en el
// almacenamiento del propio dispositivo (AsyncStorage). Las variables de
// entorno aquí llevan el prefijo EXPO_PUBLIC_ (equivalente al NEXT_PUBLIC_
// de la web) — es la convención de Expo para variables visibles en la app.
//
// El cliente va tipado con los MISMOS tipos generados que la web
// (RN-MOV-01: la misma API): una función que cambie de firma en la base se
// nota aquí en el typecheck, no en el teléfono de alguien.
export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * La dirección de la web de Cuotly, para lo que la app no hace por sí
 * misma: subir archivos pasa por `/api/movil/archivos` (RN-MOV-07) y las
 * pantallas que no están en la app dicen dónde están (RN-MOV-03).
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "").replace(/\/+$/, "");
