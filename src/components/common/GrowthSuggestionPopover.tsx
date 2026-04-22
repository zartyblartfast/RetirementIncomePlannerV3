/**
 * GrowthSuggestionPopover.tsx
 *
 * Inline popover that computes Low / Mid / High real-return suggestions from
 * historical data and lets the user click a chip to apply the rate.
 *
 * No external popover library required — uses useState + a click-outside ref.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { suggestGrowthRates } from '../../engine/growthSuggestions';
import type { GrowthSuggestion } from '../../engine/growthSuggestions';
import type { AllocationConfig } from '../../engine/types';

// -------------------------------------------------------------------------- //
//  Props
// -------------------------------------------------------------------------- //

export interface GrowthSuggestionPopoverProps {
  allocation: AllocationConfig | undefined;
  onSelect: (rate: number) => void;
}

// -------------------------------------------------------------------------- //
//  Helpers
// -------------------------------------------------------------------------- //

/** Format a decimal rate as a signed percentage string, e.g. 0.095 → "+9.5%" */
function fmtRate(r: number): string {
  const pct = (r * 100).toFixed(1);
  return r >= 0 ? `+${pct}%` : `${pct}%`;
}

// -------------------------------------------------------------------------- //
//  Component
// -------------------------------------------------------------------------- //

export default function GrowthSuggestionPopover({
  allocation,
  onSelect,
}: GrowthSuggestionPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute suggestions whenever allocation changes (memoised for perf)
  const suggestion = useMemo<GrowthSuggestion>(
    () => suggestGrowthRates({ allocation }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(allocation)],
  );

  // Close on click-outside
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleChipClick(rate: number) {
    onSelect(rate);
    setOpen(false);
  }

  // ---- Chip definitions -------------------------------------------------- //

  const chips: Array<{
    label: string;
    rate: number;
    colorClasses: string;
  }> = [
    {
      label: 'Low',
      rate: suggestion.low,
      colorClasses:
        'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-400',
    },
    {
      label: 'Mid',
      rate: suggestion.mid,
      colorClasses:
        'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:border-green-400',
    },
    {
      label: 'High',
      rate: suggestion.high,
      colorClasses:
        'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-400',
    },
  ];

  // ---- Render ------------------------------------------------------------ //

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'px-2 py-0.5 text-xs font-medium rounded border transition-colors',
          open
            ? 'bg-gray-100 border-gray-400 text-gray-800'
            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400',
        ].join(' ')}
        aria-haspopup="true"
        aria-expanded={open}
        title="Show historical growth rate suggestions"
      >
        Suggest
      </button>

      {/* Popover panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Growth rate suggestions"
          className={[
            'absolute left-0 top-full mt-1 z-50',
            'w-72 rounded-lg border border-gray-200 bg-white shadow-lg',
            'p-3 space-y-2',
          ].join(' ')}
        >
          {/* Chips row */}
          <div className="flex items-center gap-2">
            {chips.map(({ label, rate, colorClasses }) => (
              <button
                key={label}
                type="button"
                onClick={() => handleChipClick(rate)}
                className={[
                  'flex-1 flex flex-col items-center gap-0.5',
                  'px-2 py-1.5 rounded-full border text-xs font-semibold',
                  'transition-colors cursor-pointer',
                  colorClasses,
                ].join(' ')}
                title={`Apply ${label} rate: ${fmtRate(rate)}`}
              >
                <span className="font-normal opacity-70">{label}</span>
                <span>{fmtRate(rate)}</span>
              </button>
            ))}
          </div>

          {/* Description */}
          <p className="text-xs text-gray-400 leading-snug">
            {suggestion.description}
          </p>

          {/* Fallback notice */}
          {suggestion.usingFallback && (
            <p className="text-xs text-amber-600 leading-snug">
              (No allocation set — using Diversified Growth default)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
