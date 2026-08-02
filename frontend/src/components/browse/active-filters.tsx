'use client';

/**
 * The applied filters, shown above the results as individually removable chips.
 *
 * Without this row a seeker who lands on "No listings match those filters" has
 * to reopen the sheet to find out what they asked for. Each chip undoes exactly
 * one constraint, so widening a search doesn't mean starting over.
 */

import { X } from 'lucide-react';

import type { ActiveFilter } from '@/lib/browse-url';

interface Props {
  chips: ActiveFilter[];
  onRemove: (chip: ActiveFilter) => void;
  onClearAll: () => void;
}

export function ActiveFilters({ chips, onRemove, onClearAll }: Props) {
  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={`${chip.key}:${chip.item ?? ''}`}
          type="button"
          onClick={() => onRemove(chip)}
          className="inline-flex items-center gap-1 rounded-full border border-hairline bg-white px-2.5 py-1 text-caption text-ink transition-colors hover:bg-nectar"
          aria-label={`Remove filter ${chip.label}`}
        >
          <span className="max-w-[14rem] truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0 text-ink-muted" aria-hidden />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="rounded-full px-2.5 py-1 text-caption font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
