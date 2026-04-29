/** Lightweight class merger. The inspector PWA doesn't pull tailwind-merge —
 * the component surface is small enough that a string join is enough. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
