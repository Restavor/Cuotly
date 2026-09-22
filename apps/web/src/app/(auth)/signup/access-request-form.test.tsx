import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

import type { AccessRequestFormState } from "../form-states";

const requestAccessMock = vi.fn<(prev: AccessRequestFormState, data: FormData) => Promise<AccessRequestFormState>>();
const pushMock = vi.fn();

vi.mock("@/app/(auth)/actions", () => ({
  requestAccess: (prev: AccessRequestFormState, data: FormData) => requestAccessMock(prev, data),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import { AccessRequestForm } from "./AccessRequestForm";

const t = es.auth.access;

const valores = {
  contact_name: "",
  business_name: "Restaurante Oliva",
  phone: "+34600000000",
  email: "ana@",
  tax_id: "b-12345674",
  tax_country: "ES",
  comments: "",
};

const paises = [
  { code: "ES", name: "España" },
  { code: "PT", name: "Portugal" },
];

function ponerEnLinea(enLinea: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => enLinea });
}

beforeEach(() => {
  ponerEnLinea(true);
  requestAccessMock.mockReset();
  pushMock.mockReset();
});

afterEach(() => {
  cleanup();
  ponerEnLinea(true);
});

function enviar() {
  const boton = screen.getByRole("button", { name: t.submit });
  fireEvent.submit(boton.closest("form") as HTMLFormElement);
}

describe("F01 · el formulario de acceso con el diseño definitivo", () => {
  it("RN-ACC-02 · los seis campos (decisión 67) y la columna «¿Qué ocurre después?»", () => {
    render(<AccessRequestForm countries={paises} />);

    for (const etiqueta of [
      t.contactNameLabel,
      t.businessNameLabel,
      t.phoneLabel,
      t.emailLabel,
      t.taxIdLabel,
      t.taxCountryLabel,
      t.commentsLabel,
    ]) {
      expect(screen.getByLabelText(new RegExp(etiqueta.replace(/[()]/g, "\\$&")))).toBeInTheDocument();
    }
    expect(screen.getByText(t.firstAccess)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.nextTitle })).toBeInTheDocument();
    for (const paso of t.nextSteps) expect(screen.getByText(paso.title)).toBeInTheDocument();
    expect(screen.getByText(t.privacyNote)).toBeInTheDocument();
  });
});

describe("A09 · RN-ACC-02 · cada campo con su frase, todos a la vez", () => {
  it("marca el nombre y el correo, y conserva lo escrito en los demás", async () => {
    requestAccessMock.mockResolvedValue({
      error: es.auth.signup.validationRequired,
      fields: ["contact_name", "email"],
      problems: { contact_name: "missing", email: "invalid" },
      done: false,
      values: valores,
    });
    render(<AccessRequestForm countries={paises} />);
    await act(async () => enviar());

    await waitFor(() => expect(screen.getByText(t.fieldErrors.contact_name)).toBeInTheDocument());
    expect(screen.getByText(t.fieldErrors.emailInvalid)).toBeInTheDocument();
    expect(screen.getByText(t.reviewFields)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(t.contactNameLabel))).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(new RegExp(t.businessNameLabel))).toHaveValue("Restaurante Oliva");
  });
});

describe("Decisión 67 · RN-ACC-02 · el DNI, CIF o NIF se marca como los demás", () => {
  it("sin documento, su frase debajo del campo", async () => {
    requestAccessMock.mockResolvedValue({
      error: es.auth.signup.validationRequired,
      fields: ["tax_id"],
      problems: { tax_id: "missing" },
      done: false,
      values: { ...valores, contact_name: "Ana", email: "ana@example.com", tax_id: "" },
    });
    render(<AccessRequestForm countries={paises} />);
    await act(async () => enviar());

    await waitFor(() => expect(screen.getByText(t.fieldErrors.tax_id)).toBeInTheDocument());
    expect(screen.getByLabelText(new RegExp(t.taxIdLabel))).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Decisión 68 · RN-ACC-02 · el documento se comprueba con su país", () => {
  it("RN-ACC-02 · el país sale con España elegida y el documento falso se marca como tal", async () => {
    requestAccessMock.mockResolvedValue({
      error: t.fieldErrors.taxIdInvalid,
      fields: ["tax_id"],
      problems: { tax_id: "invalid" },
      done: false,
      values: { ...valores, contact_name: "Ana", email: "ana@example.com", tax_id: "12345678A", tax_country: "PT" },
    });
    render(<AccessRequestForm countries={paises} />);
    expect(screen.getByLabelText(new RegExp(t.taxCountryLabel))).toHaveValue("ES");

    await act(async () => enviar());
    await waitFor(() => expect(screen.getByText(t.fieldErrors.taxIdInvalid)).toBeInTheDocument());
    // Lo elegido vuelve con la respuesta, como lo escrito.
    expect(screen.getByLabelText(new RegExp(t.taxCountryLabel))).toHaveValue("PT");
  });
});

describe("A10 · si el envío falla, lo escrito sigue y el botón dice «Reintentar envío»", () => {
  it("pinta el aviso arriba y repone los datos", async () => {
    requestAccessMock.mockResolvedValue({
      error: es.auth.signup.unreachable,
      fields: [],
      problems: {},
      done: false,
      values: { ...valores, contact_name: "Ana García", email: "ana@example.com" },
    });
    render(<AccessRequestForm countries={paises} />);
    await act(async () => enviar());

    await waitFor(() => expect(screen.getByText(t.sendFailed)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: t.retry })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(t.emailLabel))).toHaveValue("ana@example.com");
  });
});

describe("A12 · sin conexión no se puede enviar", () => {
  it("avisa, apaga el botón y ofrece «Comprobar conexión»", async () => {
    ponerEnLinea(false);
    render(<AccessRequestForm countries={paises} />);

    await waitFor(() => expect(screen.getByText(t.offline)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: t.submit })).toBeDisabled();
    expect(screen.getByText(t.offlineNote)).toBeInTheDocument();

    ponerEnLinea(true);
    fireEvent.click(screen.getByRole("button", { name: t.checkConnection }));
    expect(screen.queryByText(t.offline)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.submit })).toBeEnabled();
  });
});

describe("A11 · salir con cambios sin enviar pregunta antes", () => {
  it("un enlace de la página abre el aviso; «Seguir editando» se queda y «Salir sin enviar» se va", () => {
    render(<AccessRequestForm countries={paises} />);
    fireEvent.change(screen.getByLabelText(new RegExp(t.contactNameLabel)), { target: { value: "Ana" } });

    fireEvent.click(screen.getByRole("link", { name: t.signIn }));
    const aviso = screen.getByRole("dialog", { name: t.leaveTitle });
    fireEvent.click(within(aviso).getByRole("button", { name: t.leaveStay }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: t.signIn }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.leaveGo }));
    expect(pushMock).toHaveBeenCalledWith("/login");
  });

  it("sin nada escrito no pregunta", () => {
    render(<AccessRequestForm countries={paises} />);
    fireEvent.click(screen.getByRole("link", { name: t.signIn }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("A01 · RN-ACC-12 · al terminar, siempre lo mismo", () => {
  it("«Hemos recibido tu solicitud», «En revisión» y lo que la persona escribió", async () => {
    requestAccessMock.mockResolvedValue({
      error: null,
      fields: [],
      problems: {},
      done: true,
      values: { ...valores, contact_name: "Ana García", email: "ana@example.com" },
    });
    render(<AccessRequestForm countries={paises} />);
    await act(async () => enviar());

    await waitFor(() => expect(screen.getByRole("heading", { name: t.sentTitle })).toBeInTheDocument());
    expect(screen.getByText(t.inReview)).toBeInTheDocument();
    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("Restaurante Oliva")).toBeInTheDocument();
    // Decisión 67 · el documento, como se va a guardar.
    expect(screen.getByText("B12345674 · España")).toBeInTheDocument();
    // El enlace de seguimiento solo viaja por correo: no hay botón que lo enseñe.
    expect(screen.queryByRole("link", { name: /ver solicitud/i })).not.toBeInTheDocument();
    expect(screen.getByText(t.followUpByMail("ana@example.com"))).toBeInTheDocument();
  });
});
