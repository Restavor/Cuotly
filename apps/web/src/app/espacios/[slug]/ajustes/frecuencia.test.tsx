import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";
import { digestHourLabel } from "@/core/notifications";
import { NotificationFrequencyForm } from "./SettingsForms";

/**
 * RN-NOT-06 (decisión 65) · el formulario de "cuándo recibirlos".
 *
 * Lo que vigila, por orden de importancia:
 *
 *   · Que **diga la hora y de quién es esa hora**. "Resumen diario" a
 *     secas obliga a adivinar cuándo, y la hora es la del ESPACIO, no la
 *     de quien mira: quien esté de viaje tiene que poder entender por qué
 *     le llegó a las nueve.
 *   · Que **avise de lo que NO espera al resumen**. Quien elige un resumen
 *     tiene derecho a saber que un incidente de seguridad o un impago
 *     grave le van a llegar igualmente al momento (RN-NOT-03).
 *   · Que sean **dos radios y no dos casillas**: con casillas se pueden
 *     apagar las dos y quedarse sin avisos sin haberlo pedido.
 *   · Que la opción que tiene ahora salga **marcada**, y que sin haber
 *     elegido nunca la marcada sea "al momento", que es lo que de verdad
 *     ocurre.
 *   · Que la hora escrita sea la del dominio y no una copia a mano.
 */
vi.mock("./actions", () => ({
  saveNotificationFrequency: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  changeSpacePaymentTerm: vi.fn(),
  changeSpaceTimezone: vi.fn(),
  saveSpaceDetails: vi.fn(),
  saveSpaceTaxRate: vi.fn(),
  saveSpaceLogo: vi.fn(),
  saveSpaceName: vi.fn(),
}));

const t = es.settings;

function pintar(frequency: string) {
  return render(
    <NotificationFrequencyForm
      spaceId="sp-1"
      frequency={frequency}
      digestHour={digestHourLabel()}
      timeZone="Europe/Madrid"
    />,
  );
}

afterEach(cleanup);

describe("RN-NOT-06 · cuándo llegan los avisos", () => {
  it("dice la hora del resumen Y de qué zona es", () => {
    const { container } = pintar("instant");

    expect(container.textContent).toContain("08:00");
    expect(container.textContent).toContain("Europe/Madrid");
  });

  it("avisa de que lo obligatorio NO espera al resumen (RN-NOT-03)", () => {
    const { container } = pintar("daily_digest");

    expect(container.textContent).toMatch(/seguridad/i);
    expect(container.textContent).toMatch(/al momento/i);
  });

  it("son dos radios, no dos casillas que se puedan apagar las dos", () => {
    const { container } = pintar("instant");

    expect(container.querySelectorAll("input[type='checkbox']")).toHaveLength(0);
    const radios = container.querySelectorAll("input[type='radio'][name='frequency']");
    expect(radios).toHaveLength(2);
  });

  it("sin haber elegido nunca, sale marcado «al momento»", () => {
    pintar("instant");

    expect(screen.getByRole("radio", { name: new RegExp(t.frequencyInstant) })).toBeChecked();
    expect(screen.getByRole("radio", { name: new RegExp(t.frequencyDigest) })).not.toBeChecked();
  });

  it("con resumen diario elegido, sale marcado el resumen", () => {
    pintar("daily_digest");

    expect(screen.getByRole("radio", { name: new RegExp(t.frequencyDigest) })).toBeChecked();
  });

  it("dice que esto no cambia QUÉ avisos llegan, solo cuándo", () => {
    const { container } = pintar("instant");

    // Es la confusión más fácil de esta pantalla: la tarjeta de arriba
    // decide qué avisos, esta cuándo.
    expect(container.textContent).toContain(t.frequencyHint);
  });

  it("la frecuencia de ahora viaja al servidor, para poder decir «ya lo tenías así»", () => {
    const { container } = pintar("daily_digest");

    const previo = container.querySelector("input[name='previous']");
    expect(previo).toHaveValue("daily_digest");
  });
});
