/**
 * Los resultados de las acciones de la tablet. Viven aquí y no junto a las acciones: un archivo `"use server"`
 * solo puede exportar funciones asíncronas (`src/app/use-server-exports.test.ts`).
 */
import type { DeviceAuthFailure } from "@/core/reservations/device";

export type DeviceFeedback =
  | { readonly ok: true; readonly message: string | null; readonly href?: string }
  | { readonly ok: false; readonly message: string; readonly device?: DeviceAuthFailure };
