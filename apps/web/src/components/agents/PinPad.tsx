"use client";

import { Icon } from "@/components/ui/Icon";
import { es } from "@/i18n/es";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * El teclado de PIN de la tablet del local (PRD de agents §3.3, `PinTablet`): cuatro
 * puntos que se rellenan y una rejilla de 3×4 con 1 a 9, «Borrar», 0 y «OK».
 *
 * **Solo es la parte visible.** No comprueba nada: no sabe qué PIN es el bueno, ni
 * cuántos fallos lleva el dispositivo, ni quién es la persona. Eso es del servidor
 * (HMAC con `AGENTS_PIN_SECRET`, bloqueo tras 5 PIN erróneos, Fase D). El componente
 * es controlado: quien lo usa guarda el valor y decide qué hacer al confirmar.
 *
 * Teclas de 64 px de alto, números tabulares y el texto de lector de pantalla de la
 * maqueta («Borrar último número», «Confirmar PIN», «2 de 4 números»).
 */
export function PinPad({
  value,
  onChange,
  onSubmit,
  length = 4,
  disabled = false,
}: {
  /** Las cifras escritas hasta ahora (solo dígitos). */
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  length?: number;
  disabled?: boolean;
}) {
  const t = es.agents.components.pin;
  const base =
    "flex h-16 w-20 items-center justify-center rounded-2xl border font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
  const digitKey = `${base} border-border bg-surface text-2xl text-text hover:bg-soft-surface`;
  const deleteKey = `${base} gap-0.5 border-border bg-surface text-sm text-text hover:bg-soft-surface`;
  const confirmKey = `${base} border-primary bg-primary text-base text-surface hover:bg-primary-dark`;

  function press(digit: string) {
    if (disabled || value.length >= length) return;
    onChange(value + digit);
  }

  return (
    <div data-pin-pad="" className="mx-auto w-fit space-y-6">
      <div
        role="img"
        aria-label={t.dots(value.length, length)}
        className="flex items-center justify-center gap-3"
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`h-3.5 w-3.5 rounded-full border-2 border-origin-manual ${
              i < value.length ? "bg-origin-manual" : "bg-surface"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3" style={{ gridAutoRows: "4rem" }}>
        {DIGITS.map((digit) => (
          <button key={digit} type="button" className={digitKey} disabled={disabled} onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <button
          type="button"
          className={deleteKey}
          disabled={disabled || value.length === 0}
          aria-label={t.deleteAria}
          onClick={() => onChange(value.slice(0, -1))}
        >
          <Icon name="backspace" className="h-4 w-4" />
          {t.delete}
        </button>
        <button type="button" className={digitKey} disabled={disabled} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          className={confirmKey}
          disabled={disabled || value.length !== length}
          aria-label={t.confirmAria}
          onClick={onSubmit}
        >
          {t.confirm}
        </button>
      </div>
    </div>
  );
}
