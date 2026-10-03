import { describe, expect, it, vi } from "vitest";
import { checkPruebasProjectUrl, PRODUCCION_PROJECT_REF, PRUEBAS_PROJECT_REF } from "./projects.ts";
import { assessRequest, createReadOnlyGate, ReadOnlyViolation } from "./read-only-gate.ts";

const BASE = `https://${PRUEBAS_PROJECT_REF}.supabase.co`;
const u = (path: string) => new URL(`${BASE}${path}`);

function verdict(method: string, path: string): "permitida" | string {
  const v = assessRequest(method, u(path));
  return v.ok ? "permitida" : v.why;
}

describe("seco · puerta de solo lectura: lo que SÍ deja pasar", () => {
  const permitidas: [string, string, string][] = [
    ["GET", "/rest/v1/spaces?select=id%2Cslug%2Ctimezone&id=in.(a,b)", "leer los espacios que le tocan"],
    ["GET", "/rest/v1/worker_establishments?select=establishment_id%2Cuser_id%2Crevoked_at&user_id=eq.abc&revoked_at=is.null", "leer sus autorizaciones"],
    ["GET", "/rest/v1/establishments?select=id%2Cspace_id%2Ccode%2Cname%2Cstatus%2Cweb_platform%2Cwebsite_url%2Cpermanently_deleted_at&id=in.(x,y)", "leer sus restaurantes"],
    ["GET", "/rest/v1/menus?select=id%2Cestablishment_id%2Ckind%2Cname%2Ctarget_date%2Cstate%2Cpublished_at&establishment_id=in.(x)&state=neq.cancelled", "leer los menús"],
    ["GET", "/rest/v1/menus?select=id,state&order=target_date.asc&limit=10&offset=0", "ordenar y paginar por columnas permitidas"],
    ["GET", "/rest/v1/rpc/team_menu_queue?p_space_id=abc", "la cola de menús"],
    ["POST", "/auth/v1/token?grant_type=password", "iniciar sesión con contraseña"],
    ["POST", "/auth/v1/logout?scope=global", "cerrar sesión"],
  ];
  it.each(permitidas)("%s %s → permitida (%s)", (method, path) => {
    expect(verdict(method, path)).toBe("permitida");
  });
});

describe("seco · puerta de solo lectura: lo que BLOQUEA antes de salir", () => {
  const bloqueadas: [string, string, string][] = [
    // escrituras a la base
    ["POST", "/rest/v1/menus", "insertar un menú"],
    ["PATCH", "/rest/v1/menus?id=eq.abc", "cambiar un menú"],
    ["PUT", "/rest/v1/menus?id=eq.abc", "reemplazar un menú"],
    ["DELETE", "/rest/v1/menus?id=eq.abc", "borrar un menú"],
    ["POST", "/rest/v1/rpc/team_menu_queue", "llamar a la cola por POST (una escritura disfrazada)"],
    // escrituras con una forma que pasaría todas las demás comprobaciones: solo las para el método
    ["POST", "/rest/v1/menus?select=id", "insertar un menú pidiendo una columna permitida"],
    ["PATCH", "/rest/v1/menus?select=id,state&id=eq.abc", "cambiar un menú con select y filtro permitidos"],
    ["PUT", "/rest/v1/menus?select=id&id=eq.abc", "reemplazar un menú con select y filtro permitidos"],
    ["DELETE", "/rest/v1/menus?select=id&id=eq.abc", "borrar un menú con select y filtro permitidos"],
    ["PATCH", "/rest/v1/establishments?select=id&id=eq.abc", "cambiar un restaurante con select y filtro permitidos"],
    ["DELETE", "/rest/v1/worker_establishments?select=user_id&user_id=eq.abc", "quitar una autorización con select y filtro permitidos"],
    ["HEAD", "/rest/v1/menus?select=id", "un HEAD (solo se permiten GET)"],
    ["OPTIONS", "/rest/v1/menus?select=id", "un OPTIONS (solo se permiten GET)"],
    // funciones que escriben
    ["POST", "/rest/v1/rpc/register_menu_download", "registrar una descarga"],
    ["GET", "/rest/v1/rpc/register_menu_download?p_menu_id=abc", "registrar una descarga por GET"],
    ["POST", "/rest/v1/rpc/mark_menu_published", "marcar publicado"],
    ["POST", "/rest/v1/rpc/report_menu_publication_error", "reportar un error de publicación"],
    ["GET", "/rest/v1/rpc/menu_deadlines?p_menu_id=abc", "una función de lectura que no está en la lista"],
    ["GET", "/rest/v1/rpc/team_menu_queue?menu=abc", "un argumento que no empieza por p_"],
    // tablas y columnas fuera de la lista
    ["GET", "/rest/v1/charges?select=id", "una tabla de finanzas"],
    ["GET", "/rest/v1/audit_log?select=id", "la auditoría"],
    ["GET", "/rest/v1/profiles?select=id", "los perfiles del equipo"],
    ["GET", "/rest/v1/menus?select=*", "select=*"],
    ["GET", "/rest/v1/menus", "sin enumerar columnas"],
    ["GET", "/rest/v1/menus?select=id,template_id", "una columna que no está en la lista"],
    ["GET", "/rest/v1/spaces?select=id,payment_iban", "los datos de pago del espacio"],
    ["GET", "/rest/v1/spaces?select=id,tax_id", "el CIF del espacio"],
    ["GET", "/rest/v1/establishments?select=id,tax_id,contact_email", "datos fiscales y de contacto del restaurante"],
    ["GET", "/rest/v1/menus?select=id,establishments(name)", "una consulta con tabla incrustada"],
    ["GET", "/rest/v1/menus?select=id&template_id=eq.abc", "filtrar por una columna que no está en la lista"],
    ["GET", "/rest/v1/menus?select=id&order=template_id.asc", "ordenar por una columna que no está en la lista"],
    ["GET", "/rest/v1/menus?select=id&or=(state.eq.draft,state.eq.published)", "un filtro compuesto"],
    ["GET", "/rest/v1/menus/otra?select=id", "una ruta con barra"],
    // otros puntos del servidor
    ["PUT", "/auth/v1/user", "cambiar los datos o la contraseña del usuario"],
    ["POST", "/auth/v1/token?grant_type=refresh_token", "renovar la sesión (no se permite: no se guarda)"],
    ["POST", "/auth/v1/signup", "crear una cuenta"],
    ["POST", "/auth/v1/recover", "recuperar la contraseña"],
    ["GET", "/auth/v1/token?grant_type=password", "iniciar sesión por GET"],
    ["POST", "/storage/v1/object/agente-menu/x.png", "subir un archivo"],
    ["POST", "/functions/v1/algo", "llamar a una Edge Function"],
    ["GET", "/graphql/v1", "GraphQL"],
  ];
  it.each(bloqueadas)("%s %s → bloqueada (%s)", (method, path) => {
    expect(verdict(method, path)).not.toBe("permitida");
  });
});

describe("seco · el fetch con puerta", () => {
  function fakeInner(dateHeader: string | null = "Sat, 03 Oct 2026 19:30:00 GMT") {
    return vi.fn(async () => new Response("[]", { status: 200, headers: dateHeader === null ? {} : { date: dateHeader } }));
  }

  it("lo permitido sale y se anota; lo bloqueado no sale NUNCA (el fetch de dentro no se llama) y se anota aparte", async () => {
    const inner = fakeInner();
    const gate = createReadOnlyGate(inner as unknown as typeof fetch);
    await gate.fetch(`${BASE}/rest/v1/menus?select=id,state`, { method: "GET" });
    await expect(gate.fetch(`${BASE}/rest/v1/menus`, { method: "POST", body: "{}" })).rejects.toBeInstanceOf(ReadOnlyViolation);
    await expect(gate.fetch(`${BASE}/rest/v1/menus?id=eq.1`, { method: "DELETE" })).rejects.toThrow(/Bloqueado por solo lectura/);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(gate.requests).toEqual([{ method: "GET", path: "/rest/v1/menus", kind: "read" }]);
    expect(gate.blocked.map((b) => `${b.method} ${b.path}`)).toEqual(["POST /rest/v1/menus", "DELETE /rest/v1/menus"]);
  });

  it("sin método explícito es un GET, y el método se compara sin importar mayúsculas", async () => {
    const inner = fakeInner();
    const gate = createReadOnlyGate(inner as unknown as typeof fetch);
    await gate.fetch(`${BASE}/rest/v1/menus?select=id`);
    await expect(gate.fetch(`${BASE}/rest/v1/menus`, { method: "post" })).rejects.toBeInstanceOf(ReadOnlyViolation);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("acepta una URL o una Request y las trata igual", async () => {
    const inner = fakeInner();
    const gate = createReadOnlyGate(inner as unknown as typeof fetch);
    await gate.fetch(new URL(`${BASE}/rest/v1/menus?select=id`));
    await gate.fetch(new Request(`${BASE}/rest/v1/menus?select=id`));
    await expect(gate.fetch(new Request(`${BASE}/rest/v1/menus`, { method: "DELETE" }))).rejects.toBeInstanceOf(ReadOnlyViolation);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("guarda la hora del servidor de la cabecera Date, y una cabecera ilegible no cuenta", async () => {
    const gate = createReadOnlyGate(fakeInner() as unknown as typeof fetch);
    expect(gate.serverDate()).toBeNull();
    await gate.fetch(`${BASE}/rest/v1/menus?select=id`);
    expect(gate.serverDate()?.toISOString()).toBe("2026-10-03T19:30:00.000Z");

    const roto = createReadOnlyGate(fakeInner("no es una fecha") as unknown as typeof fetch);
    await roto.fetch(`${BASE}/rest/v1/menus?select=id`);
    expect(roto.serverDate()).toBeNull();

    const sin = createReadOnlyGate(fakeInner(null) as unknown as typeof fetch);
    await sin.fetch(`${BASE}/rest/v1/menus?select=id`);
    expect(sin.serverDate()).toBeNull();
  });
});

describe("seco · el agente solo trabaja contra «Restavor pruebas» (hasta la Fase 7)", () => {
  it("acepta la dirección de pruebas", () => {
    const r = checkPruebasProjectUrl(`https://${PRUEBAS_PROJECT_REF}.supabase.co`);
    expect(r.ok).toBe(true);
  });

  it("rechaza PRODUCCIÓN con su propio error, también con rutas y mayúsculas", () => {
    expect(checkPruebasProjectUrl(`https://${PRODUCCION_PROJECT_REF}.supabase.co`)).toEqual({ ok: false, error: "production_project" });
    expect(checkPruebasProjectUrl(`https://${PRODUCCION_PROJECT_REF.toUpperCase()}.supabase.co/rest/v1/`)).toEqual({
      ok: false,
      error: "production_project",
    });
  });

  it.each([
    "https://otro-proyecto.supabase.co",
    `http://${PRUEBAS_PROJECT_REF}.supabase.co`,
    `https://${PRUEBAS_PROJECT_REF}.supabase.co.malo.example`,
    `https://malo.example/${PRUEBAS_PROJECT_REF}.supabase.co`,
    "http://127.0.0.1:54321",
  ])("rechaza %s", (url) => {
    expect(checkPruebasProjectUrl(url)).toEqual({ ok: false, error: "not_pruebas_project" });
  });

  it("una dirección que no es una dirección es un error explícito", () => {
    expect(checkPruebasProjectUrl("no es una url")).toEqual({ ok: false, error: "invalid_url" });
    expect(checkPruebasProjectUrl("")).toEqual({ ok: false, error: "invalid_url" });
  });
});
