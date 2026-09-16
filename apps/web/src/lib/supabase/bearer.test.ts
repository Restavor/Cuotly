import { describe, expect, it } from "vitest";

import { bearerToken } from "./bearer";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc-DEF_123";

function peticion(cabecera?: string): Request {
  return new Request("https://cuotly.test/api/movil/archivos", {
    headers: cabecera === undefined ? {} : { Authorization: cabecera },
  });
}

describe("RN-MOV-01 · la sesión del teléfono viaja como Bearer y solo como Bearer", () => {
  it("devuelve el token de una cabecera bien formada", () => {
    expect(bearerToken(peticion(`Bearer ${JWT}`))).toBe(JWT);
    expect(bearerToken(peticion(`bearer   ${JWT}`))).toBe(JWT);
  });

  it("sin cabecera, con otro esquema o con algo que no es un JWT, no hay sesión", () => {
    expect(bearerToken(peticion())).toBeNull();
    expect(bearerToken(peticion(`Basic ${JWT}`))).toBeNull();
    expect(bearerToken(peticion("Bearer"))).toBeNull();
    expect(bearerToken(peticion("Bearer no-es-un-jwt"))).toBeNull();
    expect(bearerToken(peticion(`Bearer ${JWT} extra`))).toBeNull();
  });
});
