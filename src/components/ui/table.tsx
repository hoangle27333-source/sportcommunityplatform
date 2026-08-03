import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Table primitives for the data-dense pages (channels, posts, engagement).
 *
 * Density 8/10: rows are 40px tall (px-3 py-2 at 14px text) which stays above
 * the 44px touch target only for the row's own click affordance — any per-row
 * action must be a Button with its own min-h-9, never a bare 12px icon.
 *
 * `<TableRoot>` owns the horizontal scroll container so wide tables never blow
 * out the page width on mobile (no horizontal page scroll — UX rule 5).
 */

function TableRoot({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "scrollbar-thin w-full overflow-x-auto rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full border-collapse text-left text-sm", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-border bg-muted/60 text-2xs uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-muted/40", className)}
      {...props}
    />
  );
}

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Right-align + tabular figures for numeric columns. */
  numeric?: boolean;
}

function TableHead({ className, numeric, ...props }: TableHeadProps) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-2 font-medium",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

function TableCell({ className, numeric, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle",
        numeric && "tabular text-right",
        className,
      )}
      {...props}
    />
  );
}

/** Full-width message row for the "no data" case inside a table body. */
function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-10 text-center text-sm text-muted-foreground"
      >
        {children}
      </td>
    </tr>
  );
}

export {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
};
