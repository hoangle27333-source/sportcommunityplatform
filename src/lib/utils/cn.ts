import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names, with later Tailwind utilities winning over
 * earlier ones in the same group (so a caller's `className` can always override
 * a component's defaults).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
