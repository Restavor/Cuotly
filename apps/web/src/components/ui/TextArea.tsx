import { type TextareaHTMLAttributes, forwardRef, useId } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
};

/**
 * La hermana de `Field` para texto largo. Misma anatomía —etiqueta, ayuda,
 * error— para que un formulario no mezcle dos maneras de presentar lo
 * mismo (CA-21: la misma cosa se llama y se ve igual en todas partes).
 */
export const TextArea = forwardRef<HTMLTextAreaElement, Props>(function TextArea(
  { label, error, hint, id, className = "", rows = 4, ...rest },
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
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
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
