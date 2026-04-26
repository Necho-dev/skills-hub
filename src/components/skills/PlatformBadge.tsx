import { cn } from '@/lib/utils';
import { PlatformIcon } from '@/lib/platformIcons';
import { CheckCircle2, Plus, Loader2 } from 'lucide-react';

interface PlatformBadgeProps {
  platformId: string;
  platformName: string;
  platformIcon?: string;
  installed: boolean;
  onToggle: (installed: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function PlatformBadge({
  platformId, platformName, platformIcon,
  installed, onToggle, disabled, loading,
}: PlatformBadgeProps) {
  const isDisabled = disabled || loading;
  const iconKey = platformIcon ?? platformId;

  return (
    <button
      onClick={() => !isDisabled && onToggle(!installed)}
      disabled={isDisabled}
      title={
        loading ? '处理中...'
        : installed ? `已分发到 ${platformName} · 点击撤销`
        : `分发到 ${platformName}`
      }
      className={cn(
        'group inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-all select-none',
        installed
          ? 'bg-purple-600 text-white border-purple-600 hover:bg-red-500 hover:border-red-400'
          : 'bg-white text-gray-500 border-gray-200 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50',
        isDisabled && 'opacity-60 cursor-not-allowed pointer-events-none'
      )}
    >
      {/* 状态指示图标 */}
      {loading ? (
        <Loader2 size={10} className="animate-spin shrink-0" />
      ) : installed ? (
        <CheckCircle2 size={10} className="shrink-0 group-hover:hidden" />
      ) : (
        <Plus size={10} className="shrink-0" />
      )}

      {/* 平台图标 */}
      <PlatformIcon iconKey={iconKey} size={11} />

      {/* 平台名 / hover 时变为"撤销" */}
      <span className={installed ? 'group-hover:hidden' : ''}>{platformName}</span>
      {installed && <span className="hidden group-hover:inline">撤销分发</span>}
    </button>
  );
}
