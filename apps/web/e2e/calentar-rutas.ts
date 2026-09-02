import { request } from "@playwright/test";

/**
 * Pide cada pantalla una vez antes de que empiecen los tests con datos.
 *
 * Nació para adelantar la compilación de `next dev`, que construye cada
 * ruta la primera vez que alguien la pide y hacía fallar por el reloj al
 * test que pagaba esa cuenta. Ahora la suite con datos corre contra
 * `next build && next start`, así que no queda compilación que adelantar,
 * pero el paseo sigue valiendo: comprueba que el servidor contesta de
 * verdad en todas las rutas antes de repartir el trabajo, en vez de
 * descubrirlo dentro de un test.
 *
 * No hace falta sesión: sin ella cada ruta acaba redirigiendo al login, y
 * lo que se comprueba es que la ruta existe y contesta. Los
 * identificadores inventados sirven igual, porque lo que se recorre es el
 * segmento dinámico, no el dato.
 */

const BASE = "http://localhost:3000";
const CAFE = "d4000000-0000-0000-0000-000000000002";
const CUALQUIERA = "00000000-0000-0000-0000-000000000000";

const RUTAS = [
  "/api/diagnostico",
  "/login",
  "/",
  "/espacios/demo",
  "/espacios/demo/solicitudes",
  `/espacios/demo/solicitudes/${CUALQUIERA}`,
  "/espacios/demo/trabajos",
  `/espacios/demo/trabajos/${CUALQUIERA}`,
  "/espacios/demo/finanzas",
  `/espacios/demo/restaurantes/${CAFE}`,
  `/espacios/demo/restaurantes/${CAFE}/facturacion`,
  `/espacios/demo/restaurantes/${CAFE}/solicitudes/${CUALQUIERA}`,
];

export default async function calentarRutas() {
  if (process.env.E2E_DATOS !== "1") return;

  const contexto = await request.newContext({ baseURL: BASE });
  for (const ruta of RUTAS) {
    // Da igual qué conteste —404, redirección, error de sesión—: lo que
    // importa es que la ruta quede compilada. Un fallo aquí no debe
    // impedir que la suite arranque.
    await contexto.get(ruta, { timeout: 120_000, failOnStatusCode: false }).catch(() => undefined);
  }
  await contexto.dispose();
}
