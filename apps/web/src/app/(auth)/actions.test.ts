import { describe, expect, it, vi, beforeEach } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const signInWithPasswordMock = vi.hoisted(() => vi.fn());
const signUpMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
    },
  }),
}));

import { signIn, signUp } from "./actions";

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
});

describe("signUp", () => {
  it("no llama a Supabase si falta el correo o la contraseña", async () => {
    const result = await signUp(
      { error: null },
      formData({ email: "bosco@restavor.com", password: "" }),
    );

    expect(result.error).toBe("Rellena correo y contraseña.");
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("redirige a la página principal cuando el registro funciona", async () => {
    signUpMock.mockResolvedValue({ error: null });

    await signUp(
      { error: null },
      formData({ email: "nuevo@restavor.com", password: "supersegura123" }),
    );

    expect(signUpMock).toHaveBeenCalledWith({
      email: "nuevo@restavor.com",
      password: "supersegura123",
    });
    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("propaga el mensaje de error de Supabase (por ejemplo, correo ya registrado)", async () => {
    signUpMock.mockResolvedValue({
      error: { message: "User already registered" },
    });

    const result = await signUp(
      { error: null },
      formData({ email: "bosco@restavor.com", password: "supersegura123" }),
    );

    expect(result.error).toBe("User already registered");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
