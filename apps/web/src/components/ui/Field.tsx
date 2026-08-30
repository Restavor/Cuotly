import { type InputHTMLAttributes, forwardRef, useId } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

/**
 * Campo de texto con su etiqueta y su mensaje de error, siempre juntos —
 * evita que cada pantalla reinvente el mismo bloque de label+input+error.
 */
export const Field = forwardRef<HTMLInputElement, Props>(function Field(
  { label, error, id, className = "", ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="mb-4">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold text-text">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text outline-none transition-colors focus:border-cuotly-green focus:ring-3 focus:ring-cuotly-green/15 ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
