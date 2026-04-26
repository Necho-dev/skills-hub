import { Download, Star, Key, Loader2, GitFork, ExternalLink } from 'lucide-react';
import type { SourceSkillItem } from '@/types';
import { cn } from '@/lib/utils';
import { PlatformIcon } from '@/lib/platformIcons';
import { openUrl } from '@tauri-apps/plugin-opener';

interface Props {
  item: SourceSkillItem;
  installing: boolean;
  onInstall: (item: SourceSkillItem) => void;
}

interface SourceMeta {
  label: string;
  color: string;
  btnClass: string;
  detailUrl?: (item: SourceSkillItem) => string | null;
}

const SOURCE_META: Record<string, SourceMeta> = {
  skillhub: {
    label: 'SkillHub',
    color: 'bg-purple-50 text-purple-600 border border-purple-200',
    btnClass: 'bg-purple-600 text-white hover:bg-purple-700',
    detailUrl: (item) => `https://skillhub.cn/skills/${item.slug}`,
  },
  clawhub: {
    label: 'ClawHub',
    color: 'bg-pink-50 text-pink-600 border border-pink-200',
    btnClass: 'bg-pink-600 text-white hover:bg-pink-700',
    detailUrl: (item) => `https://clawhub.ai/skills/${item.slug}`,
  },
  official: {
    label: '官方源',
    color: 'bg-purple-50 text-purple-600 border border-purple-200',
    btnClass: 'bg-purple-600 text-white hover:bg-purple-700',
  },
  skillsmp: {
    label: 'Skillsmp',
    color: 'bg-orange-50 text-orange-600 border border-orange-200',
    btnClass: 'bg-orange-500 text-white hover:bg-orange-600',
    detailUrl: (item) => item.github_url ?? null,
  },
};

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch {
    // no-op
  }
}

export function SourceSkillCard({ item, installing, onInstall }: Props) {
  const sourceMeta = SOURCE_META[item.source_id] ?? {
    label: item.source_id,
    color: 'bg-gray-100 text-gray-600 border border-gray-200',
    btnClass: 'bg-gray-600 text-white hover:bg-gray-700',
  };
  const externalUrl = typeof sourceMeta.detailUrl === 'function'
    ? sourceMeta.detailUrl(item)
    : null;

  return (
    <div className="border rounded-xl p-4 bg-white hover:shadow-sm hover:border-gray-300 transition-all flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {item.author_avatar ? (
            <img
              src={item.author_avatar}
              alt={item.author ?? ''}
              className="w-6 h-6 rounded-full shrink-0"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
              {(item.author ?? item.name)[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-xs text-gray-500 truncate">{item.author ?? '未知作者'}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.requires_api_key && (
            <span className="flex items-center gap-0.5 text-xs text-amber-600">
              <Key size={10} />
              需要密钥
            </span>
          )}
          {externalUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void openExternal(externalUrl);
              }}
              title="在浏览器中查看详情"
              className="p-1 text-gray-300 hover:text-gray-500 rounded transition-colors"
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Name */}
      <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">
        {item.name}
      </h3>

      {/* Description */}
      {item.description && (
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
          {item.description}
        </p>
      )}

      {/* Tags */}
      {Array.isArray(item.tags) && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1 gap-2">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
              sourceMeta.color
            )}
          >
            <PlatformIcon iconKey={item.source_id} size={12} />
            {sourceMeta.label}
          </span>

          {item.stars != null && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <Star size={10} />
              {item.stars >= 1000
                ? `${(item.stars / 1000).toFixed(1)}k`
                : item.stars}
            </span>
          )}
          {item.forks != null && (
            <span className="flex items-center gap-0.5 text-xs text-gray-400">
              <GitFork size={10} />
              {item.forks >= 1000
                ? `${(item.forks / 1000).toFixed(1)}k`
                : item.forks}
            </span>
          )}
          {item.version && !item.forks && (
            <span className="text-xs text-gray-400">v{item.version}</span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInstall(item);
          }}
          disabled={installing}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors shrink-0 whitespace-nowrap',
            installing
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : sourceMeta.btnClass
          )}
        >
          {installing ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Download size={11} />
          )}
          {installing ? '安装中' : '安装'}
        </button>
      </div>
    </div>
  );
}
