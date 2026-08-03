import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Form controls.
 *
 * Every control is label-associated (NFR5) — `Field` generates an id when the
 * caller doesn't pass one and wires label/description/error via
 * aria-describedby + aria-invalid, so screen readers announce the error text
 * rather than relying on the red border alone.
 *
 * Inputs stay at 16px on mobile (text-base md:text-sm) to stop iOS Safari from
 * auto-zooming the viewport on focus.
 */

const CONTROL = cn(
  "w-full rounded border border-input bg-card px-2.5 py-2 text-base md:text-sm",
  "text-foreground placeholder:text-muted-foreground/70",
  "transition-colors duration-150",
  "hover:border-ring/40",
  "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/25",
);

export interface FieldProps {
  label: string;
  /** Rendered under the control; also announced via aria-describedby. */
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Visually hide the label but keep it for assistive tech. */
  srOnlyLabel?: boolean;
  className?: string;
  /** Receives the wiring to spread onto the control. */
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => React.ReactNode;
  id?: string;
}

export function Field({
  label,
  hint,
  error,
  required,
  srOnlyLabel,
  className,
  children,
  id: providedId,
}: FieldProps) {
  const autoId = React.useId();
  const id = providedId ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // Error takes precedence in the announcement order, but both are linked.
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "block text-xs font-medium text-foreground",
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
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        className: CONTROL,
      })}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(CONTROL, "min-h-24 resize-y leading-relaxed", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(CONTROL, "cursor-pointer pr-8", className)}
      {...props}
    >
      {children}
    </select>
  );
});

/**
 * Checkbox with a 44px-tall hit area (touch target rule) achieved by padding
 * the wrapping label rather than scaling the box itself.
 */
export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: React.ReactNode;
  description?: string;
}) {
  const id = React.useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded px-1 py-2.5",
        "transition-colors duration-150 hover:bg-muted/60",
        props.disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        className,
      )}
    >
      <input
        type="checkbox"
        id={props.id ?? id}
        className={cn(
          "mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm border-input",
          "text-primary accent-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        {...props}
      />
      <span className="min-w-0 text-sm leading-tight">
        <span className="block text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/** Inline label above a value — the read-only counterpart of Field. */
export function ReadonlyField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}
