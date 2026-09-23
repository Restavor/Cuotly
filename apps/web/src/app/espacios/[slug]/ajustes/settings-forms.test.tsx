import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { es } from "@/i18n/es";

vi.mock("./actions", () => ({
  saveSpaceName: vi.fn(),
  changeSpaceTimezone: vi.fn(),
  changeSpacePaymentTerm: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  saveSpaceDetails: vi.fn(),
  saveSpaceTaxRate: vi.fn(),
  saveSpaceLogo: vi.fn(),
  saveNotificationFrequency: vi.fn(),
}));
vi.mock("./suscripcion/actions", () => ({
  changeCuotlyPlan: vi.fn(),
  cancelCuotlyPlanChange: vi.fn(),
  declareCuotlyPayment: vi.fn(),
}));

import { NotificationPreferencesForm } from "./SettingsForms";
import { ChangeCuotlyPlanForm } from "./suscripcion/PlanChangeForms";

afterEach(cleanup);

describe("M63 · Notificaciones en tabla", () => {
  it("una fila por aviso con sus dos casillas, y los obligatorios bloqueados (RN-NOT-03)", () => {
    const eventos = Object.keys(es.notifications.events) as (keyof typeof es.notifications.events)[];
    render(
      <NotificationPreferencesForm
        spaceId="sp"
        preferences={[
          { eventType: eventos[0], inApp: true, email: false, mandatory: false },
          { eventType: eventos[1], inApp: true, email: true, mandatory: true },
        ]}
      />,
    );
    const inApp = screen.getByRole("checkbox", {
      name: `${es.notifications.events[eventos[0]]} · ${es.settings.notificationsInApp}`,
    }) as HTMLInputElement;
    const email = screen.getByRole("checkbox", {
      name: `${es.notifications.events[eventos[0]]} · ${es.settings.notificationsEmail}`,
    }) as HTMLInputElement;
    expect(inApp.checked).toBe(true);
    expect(email.checked).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: `${es.notifications.events[eventos[1]]} · ${es.settings.notificationsEmail}`,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(es.settings.notificationsMandatory)).toBeTruthy();
  });
});

describe("RN-SUB-10 · cambiar el plan de Cuotly", () => {
  it("pasar a Pro propone los adicionales que pide el uso de hoy", () => {
    render(<ChangeCuotlyPlanForm spaceId="sp" target="pro" minExtraEstablishments={2} minExtraUsers={1} />);
    const t = es.cuotlySubscription.change;
    expect((screen.getByLabelText(t.extraEstablishments) as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText(t.extraUsers) as HTMLInputElement).value).toBe("1");
    expect(screen.getByRole("button", { name: t.toPro })).toBeTruthy();
  });

  it("pasar a Agency no pide adicionales", () => {
    render(<ChangeCuotlyPlanForm spaceId="sp" target="agency" minExtraEstablishments={0} minExtraUsers={0} />);
    const t = es.cuotlySubscription.change;
    expect(screen.queryByLabelText(t.extraEstablishments)).toBeNull();
    expect(screen.getByRole("button", { name: t.toAgency })).toBeTruthy();
  });
});
