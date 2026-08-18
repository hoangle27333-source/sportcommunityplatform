import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Field — accessible form control primitives, redesign v2.
 *
 * Rounded 10px, Blue focus ring, consistent label/hint/error pattern.
 * Render-prop pattern: Field wraps controls via children(props).
 * Error messaging uses role="alert" + aria-live for screen readers.
 */

// ─── Field wrapper ────────────────────────────────────────────────────────────

export interface FieldProps {
  label: string;
  /** Visually hidden label (still announced by screen readers). */
  srOnlyLabel?: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
    className?: string;
  }) => React.ReactNode;
}

export function Field({
  label,
  srOnlyLabel,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "text-sm font-semibold text-foreground",
          srOnlyLabel && "sr-only",
        )}
      >
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required,
      })}

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

const INPUT_BASE = [
  "w-full rounded-[10px] border border-input bg-card px-3 py-2",
  "text-sm text-foreground placeholder:text-muted-foreground/60",
  "transition-colors duration-150",
  "hover:border-primary/40",
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
].join(" ");

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(INPUT_BASE, className)} {...props} />
));
Input.displayName = "Input";

// ─── Textarea ─────────────────────────────────────────────────────────────────

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(INPUT_BASE, "min-h-[80px] resize-y leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// ─── Select ───────────────────────────────────────────────────────────────────

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(INPUT_BASE, "cursor-pointer appearance-none pr-8", className)}
    {...props}
  />
));
Select.displayName = "Select";

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  /** Alias for hint — backward compatibility. */
  description?: string;
}

export function Checkbox({ label, hint, description, className, id: externalId, ...props }: CheckboxProps) {
  const generatedId = React.useId();
  const id = externalId ?? generatedId;
  const helpText = hint ?? description;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 py-1"
    >
      <input
        type="checkbox"
        id={id}
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 rounded border-border",
          "accent-primary cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-primary/40",
          className,
        )}
        {...props}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {helpText && <span className="text-xs text-muted-foreground">{helpText}</span>}
      </span>
    </label>
  );
}
