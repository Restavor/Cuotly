import { describe, expect, it, vi, beforeEach } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
    },
    rpc: rpcMock,
  }),
}));

// Decisión 68 · la solicitud va con el cliente de administración (la
// función de la base es solo de `service_role`) y consulta VIES.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));
const viesMock = vi.hoisted(() => vi.fn());
vi.mock("@/services/vies", () => ({ checkVies: viesMock }));

import { requestAccess, signIn } from "./actions";
import { accessRequestInitialState } from "./form-states";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signIn", () => {
  it("no llama a Supabase si falta el correo o la contraseña", async () => {
    const result = await signIn(
      { error: null },
      formData({ email: "", password: "" }),
    );

    expect(result.error).toBe("Rellena correo y contraseña.");
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("redirige a la página principal cuando las credenciales son correctas", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });

    await signIn(
      { error: null },
      formData({ email: "bosco@restavor.com", password: "supersegura123" }),
    );

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "bosco@restavor.com",
      password: "supersegura123",
    });
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("devuelve un error legible si Supabase rechaza las credenciales", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    const result = await signIn(
      { error: null },
      formData({ email: "bosco@restavor.com", password: "incorrecta" }),
    );

    expect(result.error).toBe("Correo o contraseña incorrectos.");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("NO culpa a la contraseña cuando no se ha podido conectar", () => {
    // El caso que costó una tarde: con la salida de red bloqueada, la
    // pantalla decía "Correo o contraseña incorrectos" con la contraseña
    // correcta, y el mensaje mandó a mirar la semilla, los hashes y las
    // identidades de GoTrue. Todo estaba bien; no había línea.
    return (async () => {
      signInWithPasswordMock.mockResolvedValue({
        error: { name: "AuthRetryableFetchError", message: "Failed to fetch" },
      });

      const result = await signIn(
        { error: null },
        formData({ email: "bosco@restavor.com", password: "la-correcta" }),
      );

      expect(result.error).toContain("no de tu contraseña");
      expect(result.error).not.toContain("incorrectos");
      expect(redirectMock).not.toHaveBeenCalled();
    })();
  });

  it("demasiados intentos se dice como lo que es, no como una clave mala", () => {
    return (async () => {
      signInWithPasswordMock.mockResolvedValue({
        error: { status: 429, message: "too many requests" },
      });

      const result = await signIn(
        { error: null },
        formData({ email: "bosco@restavor.com", password: "la-correcta" }),
      );

      expect(result.error).toContain("Demasiados intentos");
      expect(redirectMock).not.toHaveBeenCalled();
    })();
  });
});

/*
 * PRD §37 (RN-ACC) · aquí había `signUp`. Ya no existe: desde la decisión
 * 41 nadie se crea una cuenta por su cuenta, y lo que ocupa su sitio es la
 * solicitud de acceso. Que no vuelva a aparecer lo vigila
 * `src/core/registro-cerrado.test.ts` por el lado de la configuración.
 */
describe("requestAccess", () => {
  const completo = {
    contact_name: "Nuria Vela",
    business_name: "Bar Nuevo",
    phone: "600111222",
    email: "nuria@bar-nuevo.test",
    tax_id: "b-12.345.674",
    tax_country: "ES",
  };

  it("RN-ACC-02: señala uno a uno los obligatorios que faltan y no llama a la base", async () => {
    const result = await requestAccess(
      accessRequestInitialState,
      formData({ contact_name: "Nuria", business_name: "", phone: "", email: "" }),
    );

    expect(result.fields).toEqual(["business_name", "phone", "email", "tax_id", "tax_country"]);
    expect(result.done).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-ACC-02: un correo mal escrito se señala como tal, no como campo vacío", async () => {
    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, email: "esto-no-es-un-correo" }),
    );

    expect(result.fields).toEqual(["email"]);
    expect(result.error).toContain("correo");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RN-ACC-02: envía los seis campos, el país y cómo se comprobó el documento", async () => {
    rpcMock.mockResolvedValue({ error: null });

    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, contact_name: "  Nuria Vela  ", comments: "" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("submit_access_request", {
      p_contact_name: "Nuria Vela",
      p_business_name: "Bar Nuevo",
      p_phone: "600111222",
      p_email: "nuria@bar-nuevo.test",
      p_tax_id: "B12345674",
      p_tax_id_country: "ES",
      p_tax_id_verification: "checksum",
      p_tax_id_registry_name: undefined,
      p_comments: undefined,
    });
    // España no se pregunta a VIES: su cálculo de control basta.
    expect(viesMock).not.toHaveBeenCalled();
    expect(result.done).toBe(true);
    expect(result.error).toBeNull();
  });

  it("RN-ACC-12: termina igual pase lo que pase por detrás, y no redirige nunca", async () => {
    // La función de la base devuelve `void` a propósito, así que esta
    // acción no tiene nada distinto que contar. Si algún día alguien le
    // hace decir "ese correo ya existe", el formulario se convierte en un
    // oráculo de direcciones y este test se pone rojo.
    rpcMock.mockResolvedValue({ error: null });

    const result = await requestAccess(
      accessRequestInitialState,
      formData({
        contact_name: "Intrusa",
        business_name: "Lo que sea",
        phone: "600000000",
        email: "info@restavor.com",
        tax_id: "X1234567L",
        tax_country: "ES",
      }),
    );

    // Lo único que vuelve además es lo que la persona escribió (A01 lo
    // enseña en "Datos de tu solicitud"): nada que conteste la base.
    expect(result).toEqual({
      error: null,
      fields: [],
      problems: {},
      done: true,
      values: {
        contact_name: "Intrusa",
        business_name: "Lo que sea",
        phone: "600000000",
        email: "info@restavor.com",
        tax_id: "X1234567L",
        tax_country: "ES",
        comments: "",
      },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("A11: si el envío falla, lo dice y no pierde lo escrito (no redirige)", async () => {
    rpcMock.mockResolvedValue({ error: { message: "network error" } });

    const result = await requestAccess(accessRequestInitialState, formData(completo));

    expect(result.done).toBe(false);
    expect(result.error).toContain("No hemos podido enviar");
    expect(redirectMock).not.toHaveBeenCalled();
    // A10 · React 19 vacía el formulario tras enviar: lo escrito vuelve
    // en la respuesta para que la pantalla lo reponga.
    expect(result.values.business_name).toBe("Bar Nuevo");
    expect(result.values.email).toBe("nuria@bar-nuevo.test");
  });

  it("Decisión 67 · RN-ACC-02: sin DNI, CIF o NIF no llama a la base", async () => {
    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, tax_id: "" }),
    );

    expect(result.problems).toEqual({ tax_id: "missing" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("A09 · RN-ACC-02: el nombre vacío y el correo mal escrito se señalan a la vez", async () => {
    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, contact_name: "", business_name: "Oliva", email: "ana@" }),
    );

    expect(result.problems).toEqual({ contact_name: "missing", email: "invalid" });
    expect(result.values.business_name).toBe("Oliva");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Decisión 68 · RN-ACC-02: un DNI inventado (la letra no cuadra) se rechaza sin llamar a la base", async () => {
    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, tax_id: "12345678A" }),
    );

    expect(result.problems).toEqual({ tax_id: "invalid" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("Decisión 68 · RN-ACC-02: una empresa de la UE que VIES confirma entra comprobada, con su nombre", async () => {
    rpcMock.mockResolvedValue({ error: null });
    viesMock.mockResolvedValue({ kind: "found", name: "OLIVA LDA" });

    await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, tax_id: "PT501964843", tax_country: "PT" }),
    );

    expect(viesMock).toHaveBeenCalledWith("PT", "501964843");
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_access_request",
      expect.objectContaining({
        p_tax_id_country: "PT",
        p_tax_id_verification: "registry",
        p_tax_id_registry_name: "OLIVA LDA",
      }),
    );
  });

  it("Decisión 68 · RN-ACC-02: sin nada que lo respalde entra, marcado para el equipo", async () => {
    rpcMock.mockResolvedValue({ error: null });
    viesMock.mockResolvedValue({ kind: "unavailable" });

    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, tax_id: "FR40303265045", tax_country: "FR" }),
    );

    expect(result.done).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_access_request",
      expect.objectContaining({ p_tax_id_country: "FR", p_tax_id_verification: "registry_unavailable" }),
    );
  });

  it("Decisión 68 · RN-ACC-02: un país que no existe no se acepta", async () => {
    const result = await requestAccess(
      accessRequestInitialState,
      formData({ ...completo, tax_country: "XX" }),
    );

    expect(result.problems).toEqual({ tax_country: "missing" });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

