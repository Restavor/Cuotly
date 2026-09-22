import type { ReactNode } from "react";

/**
 * La tarjeta blanca sobre el degradado verde de las pantallas de entrar y
 * de poner la contraseña. Era el `layout.tsx` de `(auth)`; ahora lo pone
 * cada pantalla, porque en el mismo grupo viven la solicitud de acceso y
 * los estados de acceso, que el diseño definitivo (F01, A01 a A12) pinta
 * con la cabecera pública y no dentro de esta tarjeta.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_30%,var(--color-primary)_0%,var(--color-primary-dark)_45%,var(--color-primary-darkest)_100%)] p-6">
      <div className="w-full max-w-md rounded-[20px] bg-surface p-10 shadow-[0_30px_60px_-20px_rgba(5,21,16,0.5)]">
        {children}
      </div>
    </main>
  );
}
