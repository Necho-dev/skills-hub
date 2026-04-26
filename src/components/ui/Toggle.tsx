import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * iOS-style capsule toggle switch.
 * – ON  → purple track, circle on the right
 * – OFF → gray track, circle on the left, reduced opacity
 */
export function Toggle({ checked, onChange, disabled = false, size = 'md', className }: ToggleProps) {
  const isSm = size === 'sm';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent',
        'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400',
        isSm ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-600',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm',
          'transform transition-transform duration-200 ease-in-out',
          isSm ? 'h-3 w-3' : 'h-4 w-4',
          checked
            ? isSm ? 'translate-x-3' : 'translate-x-4'
            : 'translate-x-0'
        )}
      />
    </button>
  );
}
