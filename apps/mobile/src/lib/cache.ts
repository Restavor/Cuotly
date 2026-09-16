import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * RN-MOV-09 · "consultar lo reciente": lo último que el servidor devolvió
 * a **esta sesión**, guardado en el dispositivo y marcado con su hora.
 *
 * La caché es de quien mira: cada clave lleva el id de la persona, así que
 * no contiene nada que el servidor no le haya devuelto a ella (no puede
 * filtrar identidad del equipo al restaurante), y se borra entera al
 * cerrar sesión. No es una fuente de verdad: la pantalla la enseña con su
 * hora y el motivo "sin conexión", y nunca deja actuar sobre ella.
 */
const PREFIX = "cuotly:cache:";

export interface CachedValue<T> {
  readonly data: T;
  readonly fetchedAt: string;
}

function keyFor(userId: string, key: string): string {
  return `${PREFIX}${userId}:${key}`;
}

export async function readCache<T>(userId: string, key: string): Promise<CachedValue<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, key));
    if (!raw) return null;
    return JSON.parse(raw) as CachedValue<T>;
  } catch {
    return null;
  }
}

export async function writeCache<T>(userId: string, key: string, data: T, now: Date = new Date()): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId, key), JSON.stringify({ data, fetchedAt: now.toISOString() }));
  } catch {
    // Sin sitio para la caché la app sigue: solo pierde el "lo reciente".
  }
}

/** Al cerrar sesión (RN-MOV-09): todo lo de esta persona, y solo lo suyo. */
export async function clearUserCache(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(keyFor(userId, "")));
    for (const k of mine) await AsyncStorage.removeItem(k);
  } catch {
    // Igual que arriba.
  }
}
