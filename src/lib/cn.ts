import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and resolve Tailwind conflicts.
 *
 * Combines `clsx` (conditional/variadic class joining) with `tailwind-merge`
 * (de-duplicates conflicting Tailwind utilities, last one wins).
 *
 * Every primitive in this library calls it with the caller's `className` in
 * last position. That ordering is the whole contract: it is what lets a
 * consumer override any built-in class without fighting specificity.
 *
 * @param inputs - Class values: strings, arrays, or conditional objects.
 * @returns A single merged, conflict-free className string.
 *
 * @example
 * cn("px-2", isActive && "bg-app-accent", "px-4") // -> "bg-app-accent px-4"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
