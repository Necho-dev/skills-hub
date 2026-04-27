import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, FingerprintPattern } from 'lucide-react';
import { parseFrontmatter } from '@/lib/markdown';

interface FrontmatterPanelProps {
  markdown: string | null;
}

interface FieldRowProps {
  label: string;
  value: string | string[];
}

function FieldRow({ label, value }: FieldRowProps) {
  const isArray = Array.isArray(value);
  const isEmpty = isArray ? value.length === 0 : !value;
  if (isEmpty) return null;

  return (
    <div className="flex items-start gap-3 py-1.5 leading-[14px] text-[11px]">
      <span className="shrink-0 w-20 font-semibold text-gray-500 dark:text-gray-400 mt-px">
        {label}
      </span>
      <div className="flex-1 min-w-0">
        {isArray ? (
          <div className="flex flex-wrap gap-1">
            {(value as string[]).map((tag) => (
              <span
                key={tag}
                className="inline-block text-[10px] bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (value as string).startsWith('http') ? (
          <a
            href={value as string}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); window.open(value as string, '_blank'); }}
            className="text-purple-500 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 break-all block"
            title={value as string}
          >
            {value as string}
          </a>
        ) : (
          <span className="text-gray-700 dark:text-gray-300 wrap-break-word">{value as string}</span>
        )}
      </div>
    </div>
  );
}

function getAllFields(fm: Record<string, string | string[]>) {
  return Object.entries(fm).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== '';
  });
}

export function FrontmatterPanel({ markdown }: FrontmatterPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 用 ref 持久保存上一次有效的 fm，避免 markdown=null 时字段数清零导致组件闪动
  const fmRef = useRef<Record<string, string | string[]>>({});
  const fm = markdown ? parseFrontmatter(markdown) : null;
  if (fm !== null) fmRef.current = fm;
  const stableFm = fmRef.current;

  const allFields = getAllFields(stableFm);
  const totalFields = allFields.length;

  // 点击外部关闭悬浮层
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  // totalFields === 0 时保持占位（不 return null），避免挂载/卸载导致闪动
  // 用 opacity + pointer-events 控制可见性
  const visible = totalFields > 0;

  return (
    <div
      className="relative border-t border-dashed border-gray-200 transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* 折叠触发行 */}
      <button
        ref={triggerRef}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <FingerprintPattern size={11} className="text-gray-400" />
          <span className="text-[10px] text-gray-500 font-medium">元数据</span>
          <span className="text-[9px] text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500 rounded px-1">
            共 {totalFields} 个字段
          </span>
        </div>
        {expanded
          ? <ChevronUp size={14} className="text-gray-400" />
          : <ChevronDown size={14} className="text-gray-400" />
        }
      </button>

      {/* 悬浮弹出层 */}
      {expanded && (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-b-lg shadow-lg"
          style={{ top: '100%' }}
        >
          <div className="px-4 py-1.5 max-h-60 overflow-y-auto leading-[14px]">
            {allFields.map(([key, value]) => (
              <FieldRow key={key} label={key} value={value} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
