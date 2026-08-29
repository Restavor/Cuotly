import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// En la app móvil no hay cookies de navegador: la sesión se guarda en el
// almacenamiento del propio dispositivo (AsyncStorage). Las variables de
// entorno aquí llevan el prefijo EXPO_PUBLIC_ (equivalente al NEXT_PUBLIC_
// de la web) — es la convención de Expo para variables visibles en la app.
export const supabase = createClient(
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
