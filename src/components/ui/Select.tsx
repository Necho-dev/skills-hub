import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
}

/**
 * Custom styled Select that matches the design language of other inputs in the app.
 * Supports icon + label + optional description per option.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
          'border rounded-lg bg-white outline-none',
          'transition-shadow hover:border-gray-300',
          open
            ? 'ring-2 ring-purple-300 border-purple-300'
            : 'border-gray-200 focus:ring-2 focus:ring-purple-300'
        )}
      >
        {selected?.icon && (
          <span className="shrink-0">{selected.icon}</span>
        )}
        <span className="flex-1 truncate text-gray-700">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={13}
          className={cn(
            'shrink-0 text-gray-400 transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg overflow-hidden">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left',
                'hover:bg-purple-50 transition-colors',
                option.value === value && 'bg-purple-50 text-purple-700'
              )}
            >
              {option.icon && (
                <span className="shrink-0">{option.icon}</span>
              )}
              <span className="flex-1 min-w-0">
                <span className={cn('block font-medium truncate', option.value === value ? 'text-purple-700' : 'text-gray-800')}>
                  {option.label}
                </span>
                {option.description && (
                  <span className="block text-xs text-gray-400 truncate mt-0.5">
                    {option.description}
                  </span>
                )}
              </span>
              {option.value === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-purple-600">
                  <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
