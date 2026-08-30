import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;
};

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-surface hover:bg-primary-dark disabled:hover:bg-primary",
  secondary:
    "bg-surface text-text border border-border hover:bg-soft-surface",
  danger: "bg-danger text-surface hover:opacity-90",
};

/**
 * Botón base del sistema. Todos los botones de la aplicación pasan por aquí
 * — nunca un `<button>` suelto con clases propias.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", pending = false, disabled, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
