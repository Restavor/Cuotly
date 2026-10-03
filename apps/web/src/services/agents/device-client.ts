/**
 * `src/services/agents/device-client.ts` · el cliente de Supabase de una tablet del local
 * (RN-APP-08; PRD de agents §3.3 y §8.8).
 *
 * Un dispositivo no es un usuario de Supabase: sus peticiones pasan por el servidor, que ya validó el
 * token de su cookie. Este cliente se parece a un `SupabaseClient` para que TODA la agenda de la Fase C
 * (`reservations-gateway.ts` y las acciones) funcione igual con una tablet que con una persona con
 * cuenta, sin repetir ni una función:
 *
 * - Las **lecturas** (`from(...)`, y las funciones que solo leen) van con la clave de servicio y SIEMPRE
 *   acotadas por quien las pide con `.eq("establishment_id", …)` — una prueba lo vigila en cada lectura de
 *   la agenda. Las funciones que reciben el restaurante lo reciben de aquí, no de quien llama.
 * - Las **escrituras** no se hacen con la clave de servicio a pelo: pasan por `reservation_device_act`,
 *   que valida el dispositivo y el PIN y llama a la MISMA función de la agenda, de modo que el aforo, el
 *   bloqueo y la idempotencia son idénticos y el evento anota quién fue.
 * - Lo que la tablet no puede pedir (el saldo, abrir soporte, activar dispositivos…) se rechaza aquí y,
 *   además, la base de datos no se lo permitiría.
 *
 * Un PIN malo, un dispositivo bloqueado o un rol que no alcanza viajan como el mensaje de un `Error`
 * (`encodeDeviceAuthFailure`), que es lo único que la agenda ya sabe propagar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { encodeDeviceAuthFailure, parseActingResult, routeDeviceRpc } from "@/core/reservations/device";
import type { Database, Json } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Quién llama desde la tablet: su dispositivo y, para una acción, la persona (PIN) o la prueba del servidor. */
export interface DeviceCaller {
  readonly tokenHash: string;
  readonly establishmentId: string;
  /** El HMAC del PIN que acaba de teclear alguien, o `null` si no hay PIN en esta petición. */
  readonly pinHmac: string | null;
  /** La persona de «Ajustes abiertos» (cookie firmada), si no hay PIN en esta petición. */
  readonly staffId: string | null;
}

interface FakeResponse {
  readonly data: unknown;
  readonly error: { readonly message: string; readonly details: string; readonly hint: string; readonly code: string } | null;
  readonly count: null;
  readonly status: number;
  readonly statusText: string;
}

function failure(message: string, code: string, status: number): FakeResponse {
  return { data: null, error: { message, details: "", hint: "", code }, count: null, status, statusText: "" };
}

/**
 * Un cliente que se comporta como el de una persona para la agenda, pero entra por la puerta de la tablet.
 * Es un envoltorio de `admin`: todo lo que no es `rpc` pasa tal cual (las lecturas de tabla).
 */
export function createDeviceClient(admin: Client, caller: DeviceCaller): Client {
  const rpc = async (fn: string, args?: Record<string, unknown>): Promise<FakeResponse> => {
    const route = routeDeviceRpc(fn, args);
    if (route.kind === "refused") {
      return failure("Operación no permitida desde el dispositivo del local", "42501", 403);
    }
    if (route.kind === "read") {
      // El restaurante lo pone la tablet, no quien llama.
      const scoped = args && "p_establishment_id" in args ? { ...args, p_establishment_id: caller.establishmentId } : (args ?? {});
      const response = await (admin.rpc as unknown as (name: string, a: Record<string, unknown>) => Promise<FakeResponse>)(fn, scoped);
      return response;
    }
    const { data, error } = await admin.rpc("reservation_device_act", {
      p_token_hash: caller.tokenHash,
      p_pin_hmac: caller.pinHmac,
      p_staff_id: caller.pinHmac === null ? caller.staffId : null,
      p_operation: route.operation,
      p_args: route.args as Json,
    });
    if (error) return failure(error.message, error.code, 400);
    const parsed = parseActingResult(data);
    if (!parsed.ok) return failure(encodeDeviceAuthFailure(parsed.failure), "DEVICE_AUTH", 401);
    return { data: parsed.result, error: null, count: null, status: 200, statusText: "OK" };
  };

  return new Proxy(admin, {
    get(target, property) {
      if (property === "rpc") return rpc;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}
