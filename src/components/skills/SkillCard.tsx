import { FolderOpen, PackagePlus, Trash2 } from 'lucide-react';
import type { Skill } from '@/types';
import { cn } from '@/lib/utils';

interface SkillCardProps {
  skill: Skill;
  selected?: boolean;
  installedPlatforms?: string[];
  onSelect?: () => void;
  onInstall?: () => void;
  onDelete?: () => void;
  onOpen?: () => void;
  showActions?: boolean;
  compact?: boolean;
  platformHint?: string;
}

export function SkillCard({
  skill,
  selected,
  installedPlatforms = [],
  onSelect,
  onInstall,
  onDelete,
  onOpen,
  showActions = true,
  compact = false,
  platformHint,
}: SkillCardProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col rounded-lg border p-3 transition-all cursor-pointer',
        selected
          ? 'border-purple-300 bg-purple-50/50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      )}
    >
      {/* 内容区：全宽展示，标题为操作按钮留出右侧空间 */}
      <h3 className={cn(
        'text-sm font-medium text-gray-900 truncate leading-snug',
        showActions ? 'pr-14' : ''
      )}>
        {skill.name}
      </h3>
      {!compact && skill.description && (
        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{skill.description}</p>
      )}
      {platformHint && (
            <span className="inline-block mt-1.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 font-medium">
              {platformHint}
            </span>
          )}
      {installedPlatforms.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {installedPlatforms.map((p) => (
            <span
              key={p}
              className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      {/* 操作按钮：hover 时绝对定位在右上角，不占据布局空间 */}
      {showActions && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onOpen && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
              title="在 Finder 中显示"
            >
              <FolderOpen size={12} />
            </button>
          )}
          {onInstall && (
            <button
              onClick={(e) => { e.stopPropagation(); onInstall(); }}
              className="p-1 rounded bg-purple-100 text-purple-600 hover:bg-purple-200 hover:text-purple-700"
              title="导入到中央库"
            >
              <PackagePlus size={12} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
