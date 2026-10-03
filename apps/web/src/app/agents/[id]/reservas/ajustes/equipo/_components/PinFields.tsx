"use client";

import { Field } from "@/components/ui";
import { normalizePin } from "@/core/reservations/device";
import { es } from "@/i18n/es";

/**
 * Los dos campos del PIN de 4 cifras (PRD de agents §3.3): se escribe y se repite. Solo admite cifras; el teclado
 * de un móvil o tablet saca el numérico. El PIN no se enseña mientras se escribe.
 */
export function PinFields({
  pin,
  pinRepeat,
  onChange,
  pinLabel,
  errors,
}: {
  pin: string;
  pinRepeat: string;
  onChange: (next: { pin: string; pinRepeat: string }) => void;
  pinLabel?: string;
  errors?: { pin?: string; pinRepeat?: string };
}) {
  const t = es.agents.team;
  const common = {
    type: "password",
    inputMode: "numeric" as const,
    pattern: "[0-9]*",
    maxLength: 4,
    autoComplete: "off",
    required: true,
  };
  return (
    <>
      <Field
        {...common}
        label={pinLabel ?? t.pinLabel}
        value={pin}
        error={errors?.pin}
        onChange={(event) => onChange({ pin: normalizePin(event.target.value), pinRepeat })}
      />
      <Field
        {...common}
        label={t.pinRepeatLabel}
        value={pinRepeat}
        error={errors?.pinRepeat}
        onChange={(event) => onChange({ pin, pinRepeat: normalizePin(event.target.value) })}
      />
    </>
  );
}
