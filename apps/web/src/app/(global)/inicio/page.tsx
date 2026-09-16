import { redirect } from "next/navigation";

/**
 * `/inicio` fue el Inicio global durante unas horas del 16/09/2026,
 * mientras la raíz seguía entrando directa a tu único contexto. Con la
 * decisión 42 el Inicio global **es** la raíz, así que esta ruta se queda
 * como puerta: los enlaces que ya se hubieran repartido siguen llevando a
 * donde tienen que llevar en vez de dar un 404.
 */
export default function InicioRedirect() {
  redirect("/");
}
