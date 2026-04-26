import { useState, useMemo } from 'react';
import {
  X, Copy, FolderOutput, Link, CheckCircle2, XCircle,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { PlatformIcon } from '@/lib/platformIcons';
import { cn } from '@/lib/utils';
import {
  importSkillToCentral,
  moveSkillToCentral,
  linkProjectSkillToCentral,
} from '@/lib/tauri';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import type { NativeSkill } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportMode = 'copy' | 'move' | 'link';

type ItemStatus = 'pending' | 'running' | 'done' | 'error' | 'overwritten';

interface ItemState {
  status: ItemStatus;
  error?: string;
}

interface Props {
  skills: NativeSkill[];
  /** 是否显示「链接」模式选项（仅项目库场景开放） */
  allowLink?: boolean;
  onClose: (anyImported: boolean) => void;
}

// ── Mode descriptions ─────────────────────────────────────────────────────────

const MODE_OPTIONS: { id: ImportMode; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'copy',
    label: '复制',
    desc: '技能目录仍然保留在原始目录中，中央技能库获得独立副本，但不同步更新',
    icon: <Copy size={13} />,
  },
  {
    id: 'move',
    label: '迁移',
    desc: '技能移动到中央技能库，原位置自动创建符号链接，不影响原平台使用',
    icon: <FolderOutput size={13} />,
  },
  {
    id: 'link',
    label: '链接',
    desc: '技能保留在原项目目录内，中央技能库仅持有符号链接，可管理分发（项目目录变化将失效）',
    icon: <Link size={13} />,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportToCentralModal({ skills, allowLink = false, onClose }: Props) {
  const { load: reloadCentral } = useCentralSkillsStore();

  const [mode, setMode] = useState<ImportMode>('copy');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(skills.map((s) => s.sourcePath))
  );
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [showPathMap, setShowPathMap] = useState<Set<string>>(new Set());

  const visibleModes = useMemo(
    () => MODE_OPTIONS.filter((m) => m.id !== 'link' || allowLink),
    [allowLink]
  );

  const selectedSkills = useMemo(
    () => skills.filter((s) => selected.has(s.sourcePath)),
    [skills, selected]
  );

  const allSelected = selected.size === skills.length;

  const toggleAll = () => {
    setSelected(
      allSelected ? new Set() : new Set(skills.map((s) => s.sourcePath))
    );
  };

  const toggleItem = (sourcePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(sourcePath) ? next.delete(sourcePath) : next.add(sourcePath);
      return next;
    });
  };

  const togglePathVisible = (sourcePath: string) => {
    setShowPathMap((prev) => {
      const next = new Set(prev);
      next.has(sourcePath) ? next.delete(sourcePath) : next.add(sourcePath);
      return next;
    });
  };

  const setItemState = (sourcePath: string, state: ItemState) => {
    setItemStates((prev) => ({ ...prev, [sourcePath]: state }));
  };

  const handleConfirm = async () => {
    if (selectedSkills.length === 0) return;
    setRunning(true);

    let successCount = 0;
    let failCount = 0;

    for (const skill of selectedSkills) {
      setItemState(skill.sourcePath, { status: 'running' });
      try {
        if (mode === 'copy') {
          try {
            await importSkillToCentral(skill.sourcePath, undefined, false);
            setItemState(skill.sourcePath, { status: 'done' });
          } catch (e) {
            const msg = String(e);
            if (msg.includes('already exists')) {
              // 自动以 overwrite=true 重试
              await importSkillToCentral(skill.sourcePath, undefined, true);
              setItemState(skill.sourcePath, { status: 'overwritten' });
            } else {
              throw e;
            }
          }
        } else if (mode === 'move') {
          await moveSkillToCentral(skill.sourcePath, skill.platformSkillsPath, undefined, false);
          setItemState(skill.sourcePath, { status: 'done' });
        } else {
          // link
          await linkProjectSkillToCentral(skill.sourcePath, undefined, false);
          setItemState(skill.sourcePath, { status: 'done' });
        }
        successCount++;
      } catch (e) {
        setItemState(skill.sourcePath, { status: 'error', error: String(e) });
        failCount++;
      }
    }

    setRunning(false);
    setDone(true);

    const anyImported = successCount > 0;
    if (anyImported) {
      await reloadCentral();
    }

    if (failCount === 0) {
      toast.success(`成功导入 ${successCount} 个技能`);
    } else {
      toast.error(`成功 ${successCount} 个，失败 ${failCount} 个`);
    }

    // 短暂显示结果后关闭
    setTimeout(() => onClose(anyImported), 1200);
  };

  const handleSkip = () => {
    if (!running) onClose(false);
  };

  const statusSummary = useMemo(() => {
    const total = selectedSkills.length;
    const doneCount = Object.values(itemStates).filter(
      (s) => s.status === 'done' || s.status === 'overwritten'
    ).length;
    const errCount = Object.values(itemStates).filter((s) => s.status === 'error').length;
    return { total, doneCount, errCount };
  }, [itemStates, selectedSkills.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {skills.length === 1 ? '导入到中央技能库' : `扫描发现 ${skills.length} 个本地技能`}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {skills.length === 1
                ? '选择如何将此技能纳入中央技能库管理'
                : '选择本地技能和导入方式，这将统一纳入到中央技能库管理'}
            </p>
          </div>
          <button
            onClick={handleSkip}
            disabled={running}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        {/* Mode selector */}
        <div className="px-5 pt-4 pb-3 border-b bg-gray-50/60">
          <p className="text-[11px] font-medium text-gray-500 mb-2 uppercase tracking-wide">导入方式</p>
          <div className="flex flex-col gap-1.5">
            {visibleModes.map((opt) => (
              <label
                key={opt.id}
                className={cn(
                  'flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors',
                  mode === opt.id
                    ? 'border-purple-300 bg-purple-50'
                    : 'border-gray-200 bg-white hover:border-purple-200 hover:bg-purple-50/30',
                  (running || done) && 'pointer-events-none opacity-60'
                )}
              >
                <input
                  type="radio"
                  name="import-mode"
                  value={opt.id}
                  checked={mode === opt.id}
                  onChange={() => setMode(opt.id)}
                  className="mt-0.5 accent-purple-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-gray-500', mode === opt.id && 'text-purple-600')}>
                      {opt.icon}
                    </span>
                    <span className={cn(
                      'text-xs font-medium',
                      mode === opt.id ? 'text-purple-700' : 'text-gray-700'
                    )}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* 链接模式警告 */}
          {mode === 'link' && (
            <div className="mt-2 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 leading-relaxed">
                注意：您当前选择的是链接模式，若项目目录
                <span className='font-bold'>被删除、移动或重命名</span>
                ，中央技能库中的技能将变为
                <span className='font-bold text-amber-700'>「悬空链接」并显示警告状态</span>
                ，已分发的其他平台也将<span className='font-bold text-red-600'>无法使用该技能</span>。
              </p>
            </div>
          )}
        </div>

        {/* Skill list */}
        <div className="flex-1 overflow-y-auto">
          {/* 全选控制（多技能时显示） */}
          {skills.length > 1 && !done && (
            <div className="flex items-center justify-between px-5 py-2.5 border-b bg-gray-50/40">
              <span className="text-xs text-gray-500">
                已选 {selected.size} / {skills.length} 个
              </span>
              <button
                onClick={toggleAll}
                disabled={running}
                className="text-[11px] text-purple-600 hover:text-purple-700 disabled:opacity-40"
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
            </div>
          )}

          <ul className="divide-y">
            {skills.map((skill) => {
              const isSelected = selected.has(skill.sourcePath);
              const state = itemStates[skill.sourcePath];
              const pathVisible = showPathMap.has(skill.sourcePath);

              return (
                <li
                  key={skill.sourcePath}
                  className={cn(
                    'px-5 py-3 flex items-start gap-3 transition-colors',
                    isSelected && !done ? 'bg-white' : 'bg-gray-50/30',
                    !running && !done && 'cursor-pointer hover:bg-purple-50/20'
                  )}
                  onClick={() => !running && !done && toggleItem(skill.sourcePath)}
                >
                  {/* 复选框 / 状态图标 */}
                  <div className="mt-0.5 shrink-0 w-4 flex items-center justify-center">
                    {state?.status === 'running' ? (
                      <Loader2 size={14} className="animate-spin text-purple-500" />
                    ) : state?.status === 'done' || state?.status === 'overwritten' ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : state?.status === 'error' ? (
                      <XCircle size={14} className="text-red-500" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItem(skill.sourcePath)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={running || done}
                        className="w-3.5 h-3.5 accent-purple-600 cursor-pointer"
                      />
                    )}
                  </div>

                  {/* Platform icon */}
                  <div className="shrink-0 mt-0.5">
                    <PlatformIcon iconKey={skill.platformId} size={16} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-gray-900 truncate">
                        {skill.skillName}
                      </span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {skill.platformName}
                      </span>
                      {state?.status === 'overwritten' && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          已覆盖
                        </span>
                      )}
                    </div>
                    {skill.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 leading-snug">
                        {skill.description}
                      </p>
                    )}
                    {/* 路径展开 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePathVisible(skill.sourcePath); }}
                      className="flex items-center gap-0.5 mt-0.5 text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      {pathVisible ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                      <span>路径</span>
                    </button>
                    {pathVisible && (
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5 break-all leading-relaxed">
                        {skill.sourcePath}
                      </p>
                    )}
                    {/* 错误信息 */}
                    {state?.status === 'error' && state.error && (
                      <p className="text-[11px] text-red-500 mt-1 leading-snug wrap-break-word">
                        {state.error}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t bg-gray-50/50 flex items-center justify-between gap-3">
          {done ? (
            <p className="text-xs text-gray-500">
              {statusSummary.errCount === 0
                ? `全部完成，共导入 ${statusSummary.doneCount} 个技能`
                : `完成：成功 ${statusSummary.doneCount} 个，失败 ${statusSummary.errCount} 个`}
            </p>
          ) : (
            <p className="text-xs text-gray-400">
              {selected.size === 0 ? '请选择至少 1 个技能' : `将导入 ${selected.size} 个技能`}
            </p>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {!done && (
              <button
                onClick={handleSkip}
                disabled={running}
                className="px-3.5 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                跳过
              </button>
            )}
            {!done && (
              <button
                onClick={handleConfirm}
                disabled={running || selected.size === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg text-white transition-colors',
                  'bg-purple-600 hover:bg-purple-700',
                  'disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                {running && <Loader2 size={12} className="animate-spin" />}
                {running ? '导入中...' : `确认导入（${selected.size} 个）`}
              </button>
            )}
            {done && (
              <button
                onClick={() => onClose(statusSummary.doneCount > 0)}
                className="px-3.5 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
