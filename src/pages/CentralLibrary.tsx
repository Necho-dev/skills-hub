import { useEffect, useState, useMemo, useRef } from 'react';
import {
  RefreshCw, Search,
  CheckSquare, Square, Send, X, ChevronDown, LayoutGrid,
} from 'lucide-react';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { usePlatformStore } from '@/stores/platformStore';
import { SkillDetailPanel } from '@/components/skills/SkillDetailPanel';
import { PlatformIcon } from '@/lib/platformIcons';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { SOURCE_CONFIG, type SkillSourceConfig } from '@/lib/skillSource';

export function CentralLibrary() {
  const {
    skills, selectedSkillId, markdown, markdownLoading,
    loading, error, platformInstalls, load, selectSkill,
    installToPlatform, uninstallFromPlatform,
  } = useCentralSkillsStore();
  const { platforms, load: loadPlatforms } = usePlatformStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatformId, setFilterPlatformId] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [showMorePlatforms, setShowMorePlatforms] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const PLATFORM_TAG_LIMIT = 5;

  // 多选模式
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  // 两步式批量操作状态
  const [batchAction, setBatchAction] = useState<'install' | 'uninstall' | null>(null);
  const [batchTargetPlatformId, setBatchTargetPlatformId] = useState<string | null>(null);

  useEffect(() => {
    load();
    loadPlatforms();
  }, []);

  // 退出多选时清空所有状态
  const exitMultiSelect = () => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
    setBatchAction(null);
    setBatchTargetPlatformId(null);
  };

  const enabledPlatforms = useMemo(
    () => platforms.filter((p) => p.enabled),
    [platforms]
  );

  // 每个平台已分发的技能数，用于 Tag 排序
  const platformSkillCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const installs of Object.values(platformInstalls)) {
      for (const pid of installs) {
        counts[pid] = (counts[pid] ?? 0) + 1;
      }
    }
    return counts;
  }, [platformInstalls]);

  // 按分发数量降序排列的平台列表
  const sortedPlatforms = useMemo(
    () => [...enabledPlatforms].sort((a, b) => (platformSkillCount[b.id] ?? 0) - (platformSkillCount[a.id] ?? 0)),
    [enabledPlatforms, platformSkillCount]
  );

  // 当前列表中实际存在的来源集合及每个来源的技能数量
  const { existingSources, sourceSkillCount } = useMemo(() => {
    const set = new Set<string>();
    const counts: Record<string, number> = {};
    for (const sw of skills) {
      set.add(sw.skill.source);
      counts[sw.skill.source] = (counts[sw.skill.source] ?? 0) + 1;
    }
    return { existingSources: set, sourceSkillCount: counts };
  }, [skills]);

  const filtered = useMemo(() => {
    return skills.filter((sw) => {
      // 文字筛选
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          sw.skill.name.toLowerCase().includes(q) ||
          (sw.skill.description?.toLowerCase().includes(q) ?? false);
        if (!match) return false;
      }
      // 平台筛选：只显示已/未分发到该平台的
      if (filterPlatformId) {
        const installedIds = platformInstalls[sw.skill.id] ?? [];
        if (!installedIds.includes(filterPlatformId)) return false;
      }
      // 来源筛选
      if (filterSource && sw.skill.source !== filterSource) return false;
      return true;
    });
  }, [skills, searchQuery, filterPlatformId, filterSource, platformInstalls]);

  const selectedSkillData = skills.find((sw) => sw.skill.id === selectedSkillId);

  // 多选：全选/全不选
  const allFilteredSelected = filtered.length > 0 && filtered.every((sw) => selectedIds.has(sw.skill.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((sw) => sw.skill.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 执行批量操作（第二步确认后调用）
  const executeBatchAction = async () => {
    if (!batchAction || !batchTargetPlatformId) return;
    const targets = filtered.filter((sw) => selectedIds.has(sw.skill.id));
    if (targets.length === 0) return;

    const targetPlatforms =
      batchTargetPlatformId === 'all'
        ? enabledPlatforms
        : enabledPlatforms.filter((p) => p.id === batchTargetPlatformId);

    setBatchLoading(true);
    let ok = 0, fail = 0;

    for (const platform of targetPlatforms) {
      await Promise.all(targets.map(async (sw) => {
        if (batchAction === 'install') {
          const alreadyInstalled = (platformInstalls[sw.skill.id] ?? []).includes(platform.id);
          if (alreadyInstalled) { ok++; return; }
          const result = await installToPlatform(sw.skill.id, platform.id, platform.skills_path);
          result.success ? ok++ : fail++;
        } else {
          const isInstalled = (platformInstalls[sw.skill.id] ?? []).includes(platform.id);
          if (!isInstalled) return;
          const result = await uninstallFromPlatform(sw.skill.id, platform.id, platform.skills_path);
          result.success ? ok++ : fail++;
        }
      }));
    }

    setBatchLoading(false);
    const actionLabel = batchAction === 'install' ? '分发' : '撤销';
    const platformLabel = batchTargetPlatformId === 'all'
      ? '全部平台'
      : targetPlatforms[0]?.name ?? batchTargetPlatformId;

    if (ok > 0) {
      toast.success(`批量${actionLabel}到 ${platformLabel}：${ok} 个成功${fail > 0 ? `，${fail} 个失败` : ''}`);
    } else if (fail > 0) {
      toast.error(`批量${actionLabel}失败：${fail} 个`);
    } else {
      toast.info(`无需操作`);
    }
    exitMultiSelect();
  };

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className={cn(
        'flex flex-col border-r transition-all',
        selectedSkillId ? 'w-[400px] shrink-0' : 'flex-1'
      )}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div>
            <h1 className="text-base font-semibold text-gray-900">中央技能库</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              共 {skills.length} 个技能
              {filtered.length !== skills.length && `，筛选后 ${filtered.length} 个`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* 多选模式切换 */}
            <button
              onClick={() => multiSelectMode ? exitMultiSelect() : setMultiSelectMode(true)}
              className={cn(
                'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                multiSelectMode
                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              )}
            >
              <CheckSquare size={12} />
              {multiSelectMode ? `已选 ${selectedIds.size}` : '多选'}
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              扫描
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-1.5 shrink-0">
          <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-1.5">
            <Search size={12} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索技能..."
              className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400 min-w-0"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Platform filter tags */}
        <div className={cn('px-3 pt-1.5 pb-1.5 shrink-0', existingSources.size <= 1 && 'border-b')}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400 shrink-0">平台</span>

            {/* 平台 tag */}
            {sortedPlatforms.slice(0, PLATFORM_TAG_LIMIT).map((p) => {
              const cnt = platformSkillCount[p.id] ?? 0;
              const active = filterPlatformId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setFilterPlatformId(active ? null : p.id)}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                    active
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600 bg-white'
                  )}
                >
                  <PlatformIcon iconKey={p.icon ?? p.id} size={10} />
                  {p.name}
                  {cnt > 0 && (
                    <span className={cn(
                      'text-[9px] rounded-full px-1 font-medium',
                      active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                    )}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}

            {/* 超出 PLATFORM_TAG_LIMIT 时显示"其他"下拉 */}
            {sortedPlatforms.length > PLATFORM_TAG_LIMIT && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setShowMorePlatforms((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                    sortedPlatforms.slice(PLATFORM_TAG_LIMIT).some((p) => p.id === filterPlatformId)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600 bg-white'
                  )}
                >
                  其他
                  <ChevronDown size={9} />
                </button>
                {showMorePlatforms && (
                  <div className="absolute left-0 top-full mt-1 w-44 bg-white border rounded-lg shadow-lg z-20 py-1">
                    {sortedPlatforms.slice(PLATFORM_TAG_LIMIT).map((p) => {
                      const cnt = platformSkillCount[p.id] ?? 0;
                      const active = filterPlatformId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setFilterPlatformId(active ? null : p.id);
                            setShowMorePlatforms(false);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2',
                            active ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'
                          )}
                        >
                          <PlatformIcon iconKey={p.icon ?? p.id} size={11} />
                          <span className="flex-1">{p.name}</span>
                          {cnt > 0 && <span className="text-[10px] text-gray-400">{cnt}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Source filter tags */}
        {existingSources.size > 1 && (
          <div className="px-3 pb-2 border-b shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400 shrink-0">来源</span>
              {Object.keys(SOURCE_CONFIG)
                .filter((src) => existingSources.has(src))
                .map((src) => {
                  const cfg = SOURCE_CONFIG[src];
                  const active = filterSource === src;
                  const cnt = sourceSkillCount[src] ?? 0;
                  return (
                    <button
                      key={src}
                      onClick={() => setFilterSource(active ? null : src)}
                      className={cn(
                        'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                        active
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600 bg-white'
                      )}
                    >
                      {cfg.icon}
                      {cfg.label}
                      {cnt > 0 && (
                        <span className={cn(
                          'text-[9px] rounded-full px-1 font-medium',
                          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                        )}>
                          {cnt}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* 多选批量操作栏（两步式） */}
        {multiSelectMode && (
          <div className="border-b bg-purple-50/60 shrink-0">
            {/* 第一行：全选 + 已选数 + 退出 */}
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900"
              >
                {allFilteredSelected ? <CheckSquare size={12} /> : <Square size={12} />}
                {allFilteredSelected ? '取消全选' : '全选'}
              </button>
              <span className="text-xs text-gray-500">已选 <span className="font-medium text-purple-700">{selectedIds.size}</span> 个</span>
              <button
                onClick={exitMultiSelect}
                className="ml-auto shrink-0 p-0.5 text-gray-400 hover:text-gray-600"
                title="退出多选"
              >
                <X size={13} />
              </button>
            </div>

            {/* 第二行：选操作类型（仅有选中项时显示） */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 px-3 pb-2">
                <span className="text-xs text-gray-500 shrink-0">操作：</span>
                <button
                  onClick={() => { setBatchAction('install'); setBatchTargetPlatformId(null); }}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    batchAction === 'install'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400 hover:text-purple-600'
                  )}
                >
                  <Send size={11} />分发
                </button>
                <button
                  onClick={() => { setBatchAction('uninstall'); setBatchTargetPlatformId(null); }}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    batchAction === 'uninstall'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-500'
                  )}
                >
                  <X size={11} />撤销
                </button>
              </div>
            )}

            {/* 第三行：选目标平台（选完操作类型后展开） */}
            {selectedIds.size > 0 && batchAction && (
              <div className="flex items-center gap-2 px-3 pb-2 flex-wrap">
                <span className="text-xs text-gray-500 shrink-0">目标平台：</span>
                {/* 全部平台选项 */}
                <button
                  onClick={() => setBatchTargetPlatformId(batchTargetPlatformId === 'all' ? null : 'all')}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                    batchTargetPlatformId === 'all'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600'
                  )}
                >
                  <LayoutGrid size={9} />全部
                </button>
                {enabledPlatforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setBatchTargetPlatformId(batchTargetPlatformId === p.id ? null : p.id)}
                    className={cn(
                      'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                      batchTargetPlatformId === p.id
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600'
                    )}
                  >
                    <PlatformIcon iconKey={p.icon ?? p.id} size={10} />
                    {p.name}
                  </button>
                ))}
                {/* 确认执行 */}
                {batchTargetPlatformId && (
                  <button
                    onClick={executeBatchAction}
                    disabled={batchLoading}
                    className={cn(
                      'ml-auto inline-flex items-center gap-1 text-xs px-3 py-1 rounded-lg font-medium transition-colors disabled:opacity-50',
                      batchAction === 'install'
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-red-500 text-white hover:bg-red-600'
                    )}
                  >
                    {batchLoading ? '执行中...' : '确认执行'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto" onClick={() => setShowMorePlatforms(false)}>
          {error && (
            <div className="m-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <p className="text-sm">{searchQuery || filterPlatformId ? '无匹配技能' : '中央技能库为空'}</p>
              {!searchQuery && !filterPlatformId && (
                <p className="text-xs mt-1">将 skills 安装到 ~/.agent/skills/ 后重新扫描</p>
              )}
            </div>
          )}
          {filtered.map((sw) => {
            const installedPlatformIds = platformInstalls[sw.skill.id] ?? [];
            const isSelected = selectedSkillId === sw.skill.id;
            const isChecked = selectedIds.has(sw.skill.id);
            const srcCfg: SkillSourceConfig = SOURCE_CONFIG[sw.skill.source] ?? SOURCE_CONFIG.local;

            return (
              <div
                key={sw.skill.id}
                onClick={() => {
                  if (multiSelectMode) {
                    toggleSelectOne(sw.skill.id);
                  } else {
                    selectSkill(isSelected ? null : sw.skill.id);
                  }
                }}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 border-b cursor-pointer transition-colors',
                  isSelected && !multiSelectMode
                    ? 'bg-purple-50 border-l-2 border-l-purple-500'
                    : isChecked
                    ? 'bg-purple-50/60'
                    : 'hover:bg-gray-50'
                )}
              >
                {/* 多选 checkbox */}
                {multiSelectMode && (
                  <div className="shrink-0 mt-0.5">
                    {isChecked
                      ? <CheckSquare size={15} className="text-purple-600" />
                      : <Square size={15} className="text-gray-300" />
                    }
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* 标题行：技能名 + 版本号 */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate leading-snug">{sw.skill.name}</p>
                    {sw.skill.version && (
                      <span className="shrink-0 text-[9px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono leading-snug">
                        {sw.skill.version}
                      </span>
                    )}
                  </div>

                  {sw.skill.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{sw.skill.description}</p>
                  )}

                  {/* 平台分发状态 + 来源徽章 */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {/* 来源 Tag */}
                    <span className={cn(
                      'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md border',
                      srcCfg.className
                    )}>
                      {srcCfg.icon}{srcCfg.label}
                    </span>
                    {/* 分发状态 Tag */}
                    {installedPlatformIds.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border bg-green-50 border-green-200 text-green-700">
                        {/* 叠加平台图标，最多显示 3 个 */}
                        <span className="flex items-center">
                          {installedPlatformIds.slice(0, 3).map((pid, idx) => {
                            const p = enabledPlatforms.find((pl) => pl.id === pid);
                            return p ? (
                              <span
                                key={pid}
                                title={p.name}
                                className="inline-flex rounded overflow-hidden ring-1 ring-white"
                                style={{ marginLeft: idx === 0 ? 0 : -4 }}
                              >
                                <PlatformIcon iconKey={p.icon ?? p.id} size={11} />
                              </span>
                            ) : null;
                          })}
                        </span>
                        {installedPlatformIds.length} 个平台
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-gray-400">
                        未分发
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: detail */}
      {selectedSkillId && selectedSkillData && !multiSelectMode && (
        <div className="flex-1 min-w-0 flex flex-col">
          <SkillDetailPanel
            skill={selectedSkillData.skill}
            markdown={markdown}
            markdownLoading={markdownLoading}
            installedPlatformIds={platformInstalls[selectedSkillId] ?? []}
            onClose={() => selectSkill(null)}
          />
        </div>
      )}
    </div>
  );
}
