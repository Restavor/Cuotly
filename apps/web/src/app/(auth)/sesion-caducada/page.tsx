import { SessionExpired } from "@/components/access/AccessStates";

/**
 * A08 · "Tu sesión ha caducado". Llega aquí `proxy.ts` cuando el navegador
 * trae una sesión que el servidor ya no acepta, en vez de mandar a entrar
 * sin decir por qué (`src/core/session-expiry.ts`).
 */
export default function SesionCaducadaPage() {
  return <SessionExpired />;
}
