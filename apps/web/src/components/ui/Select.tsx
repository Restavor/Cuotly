import { type SelectHTMLAttributes, forwardRef, useId } from "react";

type Option = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  error?: string;
  /** Texto de ayuda bajo la etiqueta, como en `Field`. Se enlaza con aria-describedby. */
  hint?: string;
};

/**
 * Selector con etiqueta y error, hermano de `Field` pero para listas
 * cerradas de opciones (plan, rol, categoría...).
 */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, options, error, hint, id, className = "", ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="mb-4">
      <label htmlFor={fieldId} className="mb-1.5 block text-sm font-semibold text-text">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mb-1.5 text-sm text-text-secondary">
          {hint}
        </p>
      ) : null}
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className={`w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text outline-none transition-colors focus:border-cuotly-green focus:ring-3 focus:ring-cuotly-green/15 ${className}`}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
