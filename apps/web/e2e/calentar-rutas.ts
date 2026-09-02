import { request } from "@playwright/test";

/**
 * Compila las rutas antes de que empiecen los tests con datos.
 *
 * `next dev` compila cada ruta la primera vez que alguien la pide. Con
 * doce tests en paralelo pidiéndolas a la vez, esa primera compilación
 * puede tardar más que el tiempo que un test está dispuesto a esperar, y
 * entonces falla el que la pagó — no el que está mal. Fue exactamente eso:
 * un `waitForURL` de veinte segundos se agotó esperando a que
 * `/espacios/[slug]` compilara, y el error decía "se quedó en la portada",
 * que es cierto y no es la avería.
 *
 * Subir el tiempo de espera lo habría tapado a veces. Compilarlas antes lo
 * quita: cuando el primer test entra, las pantallas ya están construidas.
 *
 * No hace falta sesión. Sin ella cada ruta acaba redirigiendo al login,
 * pero para llegar a esa decisión Next ha tenido que compilar el módulo,
 * que es justo lo que se busca. Los identificadores inventados sirven
 * igual: lo que se compila es el segmento dinámico, no el dato.
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
