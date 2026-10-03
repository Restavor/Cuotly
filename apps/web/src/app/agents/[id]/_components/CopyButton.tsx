"use client";

import { useState } from "react";

import { es } from "@/i18n/es";

/** «Copiar» junto a un dato de pago (`AgentsPendientePago`): el IBAN, el Bizum o el concepto, al portapapeles. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = es.agents.billing.pending;
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`${t.copy}: ${label}`}
      className="inline-flex min-h-11 items-center rounded-field px-3 text-sm font-semibold text-cuotly-green underline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Sin permiso del navegador no se copia: el dato sigue a la vista para seleccionarlo a mano.
          setCopied(false);
        }
      }}
    >
      {copied ? t.copied : t.copy}
    </button>
  );
}
