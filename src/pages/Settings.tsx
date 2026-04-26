import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus, Trash2, RefreshCw, Shield, ChevronDown, ChevronUp,
  AlertTriangle, Cpu, GitBranch, Database, Info,
  ScanLine, CheckCircle2, XCircle, ExternalLink, Eye, EyeOff,
  Send, Loader2, Pencil, Check, GripVertical,
  Archive, Link, ShoppingBag, Layers,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getScanPaths, addScanPath, removeScanPath,
  getMarketplaceSources, addMarketplaceSource, toggleMarketplaceSource, deleteMarketplaceSource,
  getAllPlatforms, addPlatform, togglePlatform, deletePlatform,
  getAutoDeployRules, upsertAutoDeployRule, deleteAutoDeployRule,
  getPlatforms, getPlatformGroups, updatePlatformGroup,
  getGroupOrders, upsertGroupOrder, batchUpdatePlatformSortOrder,
} from '@/lib/db';
import type { AutoDeployRule } from '@/lib/db';
import { initCentralDir, scanPlatformNativeSkills } from '@/lib/tauri';
import { ImportToCentralModal } from '@/components/skills/ImportToCentralModal';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import type { NativeSkill, SourceConfig, SourceType, Platform } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { Toggle } from '@/components/ui/Toggle';
import { Select } from '@/components/ui/Select';
import { PlatformIcon, getPlatformIcon } from '@/lib/platformIcons';
import { usePlatformStore } from '@/stores/platformStore';
import { cn } from '@/lib/utils';

interface ScanPathRow {
  id: string;
  path: string;
  label?: string;
  enabled: number;
}

// ── Tab definition ────────────────────────────────────────────────────────────

type TabId = 'general' | 'market' | 'platforms' | 'about';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general',   label: '基础设置', icon: <Database size={13} /> },
  { id: 'market',    label: '技能市场', icon: <GitBranch size={13} /> },
  { id: 'platforms', label: '平台管理', icon: <Cpu size={13} /> },
  { id: 'about',     label: '关于',     icon: <Info size={13} /> },
];

// ── Confirm Dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ title, description, confirmLabel = '确认', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[340px] p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle size={15} className="text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">取消</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Source type options ───────────────────────────────────────────────────────

const SOURCE_TYPE_OPTIONS = [
  {
    value: 'skillhub' as SourceType,
    label: '兼容 SkillHub API 技能源',
    description: '自托管部署 iflytek/skillhub 的技能源，通过 SkillHub API 获取技能索引',
    icon: <PlatformIcon iconKey="skillhub-iflytek" size={14} />,
  },
  {
    value: 'official_registry' as SourceType,
    label: '官方技能源',
    description: '官方技能源，通过 registry.json 文件提供技能索引',
    icon: <PlatformIcon iconKey="github" size={14} />,
  },
];

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  official_registry: '官方源',
  skillhub: 'SkillHub',
  clawhub: 'ClawHub',
  skillsmp: 'Skillsmp',
};

const SOURCE_HOMEPAGE: Partial<Record<SourceType, string>> = {
  skillhub: 'https://skillhub.cn',
  clawhub: 'https://clawhub.ai',
  skillsmp: 'https://skillsmp.com',
};

function getSourceIcon(type: string) {
  const Icon = getPlatformIcon(type);
  return <Icon size={16} />;
}

// ── Builtin platform IDs ──────────────────────────────────────────────────────

const BUILTIN_PLATFORM_IDS = new Set([
  'cursor', 'claude-code', 'codex-cli', 'gemini-cli',
  'trae', 'trae-cn', 'windsurf', 'qoder', 'codebuddy',
  'qwen', 'opencode', 'kiro', 'hermes',
]);

// ── Section wrapper ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-800 mb-3">{children}</h2>
  );
}

// ── Auto Deploy Section ───────────────────────────────────────────────────────

function AutoDeploySection({ enabledPlatforms }: { enabledPlatforms: Platform[] }) {
  const { load: reloadCentral } = useCentralSkillsStore();
  const [rules, setRules] = useState<AutoDeployRule[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const loadRules = async (platforms: Platform[] = enabledPlatforms) => {
    const r = await getAutoDeployRules();
    setRules(r);
    const active = r.filter((x) => x.enabled);
    if (active.length === 0) {
      setEnabled(false);
      setSelectedPlatformIds(new Set());
    } else if (active.some((x) => x.platform_id === 'all')) {
      setEnabled(true);
      setSelectedPlatformIds(new Set(platforms.map((p) => p.id)));
    } else {
      setEnabled(true);
      setSelectedPlatformIds(new Set(active.map((x) => x.platform_id)));
    }
  };

  useEffect(() => { void loadRules(enabledPlatforms); }, []);

  const handleToggle = async (on: boolean) => {
    setEnabled(on);
    if (!on) {
      for (const r of rules) await deleteAutoDeployRule(r.platform_id);
      setSelectedPlatformIds(new Set());
      await loadRules();
    } else {
      // 开启时默认全选，写 all 规则
      await upsertAutoDeployRule('all', true);
      setSelectedPlatformIds(new Set(enabledPlatforms.map((p) => p.id)));
      const r = await getAutoDeployRules();
      setRules(r);
    }
  };

  const togglePlatformId = async (pid: string) => {
    const next = new Set(selectedPlatformIds);
    next.has(pid) ? next.delete(pid) : next.add(pid);
    setSelectedPlatformIds(next);

    const allSelected = enabledPlatforms.length > 0 && enabledPlatforms.every((p) => next.has(p.id));
    if (allSelected) {
      // 全选 → 写 all 规则，删其他 specific 规则
      for (const r of rules.filter((x) => x.platform_id !== 'all')) await deleteAutoDeployRule(r.platform_id);
      await upsertAutoDeployRule('all', true);
    } else {
      // 非全选 → 删 all 规则，写具体平台规则
      await deleteAutoDeployRule('all');
      for (const p of enabledPlatforms) {
        if (next.has(p.id)) await upsertAutoDeployRule(p.id, true);
        else await deleteAutoDeployRule(p.id);
      }
    }
    const r = await getAutoDeployRules();
    setRules(r);
  };

  const handleSelectAll = async () => {
    const allSelected = enabledPlatforms.length > 0 && enabledPlatforms.every((p) => selectedPlatformIds.has(p.id));
    if (allSelected) {
      // 当前全选 → 全不选（清除所有规则，但保持开关开启）
      for (const r of rules) await deleteAutoDeployRule(r.platform_id);
      setSelectedPlatformIds(new Set());
      const r = await getAutoDeployRules();
      setRules(r);
    } else {
      // 非全选 → 全选，写 all 规则
      for (const r of rules.filter((x) => x.platform_id !== 'all')) await deleteAutoDeployRule(r.platform_id);
      await upsertAutoDeployRule('all', true);
      setSelectedPlatformIds(new Set(enabledPlatforms.map((p) => p.id)));
      const r = await getAutoDeployRules();
      setRules(r);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await reloadCentral();
      toast.success('已触发一次全量自动分发同步');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSyncing(false);
    }
  };

  const allSelected = enabledPlatforms.length > 0 && enabledPlatforms.every((p) => selectedPlatformIds.has(p.id));
  const noneSelected = selectedPlatformIds.size === 0;

  return (
    <div className="border rounded-xl bg-white overflow-hidden">
      {/* 标题行 + 主开关 */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800 mb-0.5">自动分发</p>
          <p className="text-xs text-gray-500">将中央技能库中的技能自动分发到指定平台（包括后续新安装的技能）</p>
        </div>
        <Toggle size="sm" checked={enabled} onChange={handleToggle} />
      </div>

      {/* 平台选择区（开启后展开） */}
      {enabled && (
        <div className="px-4 pb-4 border-t pt-3 flex flex-col gap-2.5">
          {/* 全选控制行 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {noneSelected
                ? <span className="text-amber-500 font-medium">未选择任何平台，自动分发不会生效</span>
                : `已选 ${selectedPlatformIds.size} / ${enabledPlatforms.length} 个平台`}
            </span>
            <button
              onClick={handleSelectAll}
              className={cn(
                'text-[11px] px-2 py-0.5 rounded border transition-colors',
                allSelected
                  ? 'border-purple-200 text-purple-600 bg-purple-50 hover:bg-purple-100'
                  : 'border-gray-200 text-gray-500 hover:border-purple-200 hover:text-purple-600'
              )}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>

          {/* 平台胶囊列表 */}
          <div className="flex flex-wrap gap-2">
            {enabledPlatforms.map((p) => {
              const active = selectedPlatformIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => { void togglePlatformId(p.id); }}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    active
                      ? 'bg-purple-100 text-purple-700 border-purple-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-purple-200 hover:text-purple-600'
                  )}
                >
                  <PlatformIcon iconKey={p.icon ?? p.id} size={12} />
                  {p.name}
                  {active && <CheckCircle2 size={11} className="text-purple-600" />}
                </button>
              );
            })}
            {enabledPlatforms.length === 0 && (
              <p className="text-xs text-gray-400">暂无启用的平台，请先在平台管理中启用平台</p>
            )}
          </div>
        </div>
      )}

      {/* 底栏：立即执行 */}
      <div className="px-4 py-3 border-t bg-gray-50/50 flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={syncing || !enabled || noneSelected}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg text-gray-700 hover:bg-white hover:border-purple-300 hover:text-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          立即执行
        </button>
      </div>
    </div>
  );
}

// ── Tab: 基础设置 ─────────────────────────────────────────────────────────────

function LibraryTab({
  scanPaths,
  onRemovePath,
  onAddPath,
  onInitCentral,
  enabledPlatforms,
}: {
  scanPaths: ScanPathRow[];
  onRemovePath: (id: string) => void;
  onAddPath: (path: string, label: string) => Promise<void>;
  onInitCentral: () => void;
  enabledPlatforms: Platform[];
}) {
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [nativeScanLoading, setNativeScanLoading] = useState(false);
  const [nativeScanSkills, setNativeScanSkills] = useState<NativeSkill[]>([]);
  const { load: reloadCentral } = useCentralSkillsStore();

  const handleAdd = async () => {
    await onAddPath(newPath.trim(), newLabel.trim());
    setNewPath(''); setNewLabel('');
  };

  const handleNativeScan = async () => {
    setNativeScanLoading(true);
    try {
      const natives = await scanPlatformNativeSkills(
        enabledPlatforms.map((p) => ({ id: p.id, path: p.skills_path, name: p.name }))
      );
      if (natives.length === 0) {
        toast.success('暂无新技能，所有平台技能已纳入中央库管理');
      } else {
        setNativeScanSkills(natives);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setNativeScanLoading(false);
    }
  };

  return (
    <>
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>中央技能库</SectionTitle>
        <div className="border rounded-xl p-4 bg-white flex flex-col gap-3">
          <div>
            <p className="text-sm text-gray-600">中央目录</p>
            <code className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-1 rounded mt-1 block">~/.agent/skills/</code>
          </div>
          <button onClick={onInitCentral} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 border rounded-lg px-3 py-2 self-start hover:bg-gray-50">
            <RefreshCw size={13} />
            初始化/检查目录
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>扫描本地平台技能</SectionTitle>
        <div className="border rounded-xl bg-white overflow-hidden">
          <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-800 mb-0.5">导入到中央技能库</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                检测已启用平台目录中未纳入中央技能库管理的原生技能，支持快速复制或者迁移到中央技能库统一管理
              </p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={handleNativeScan}
              disabled={nativeScanLoading || enabledPlatforms.length === 0}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 border rounded-lg px-3 py-2 self-start hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {nativeScanLoading
                ? <Loader2 size={13} className="animate-spin" />
                : <ScanLine size={13} />}
              {nativeScanLoading ? '扫描中...' : '立即扫描'}
            </button>
            {enabledPlatforms.length === 0 && (
              <p className="text-xs text-gray-400 mt-2">暂无启用的平台，请先在平台管理中启用平台</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>自动分发</SectionTitle>
        <AutoDeploySection enabledPlatforms={enabledPlatforms} />
      </section>

      <section>
        <SectionTitle>项目扫描路径</SectionTitle>
        <div className="border rounded-xl bg-white overflow-hidden">
          {scanPaths.length === 0 && (
            <div className="px-4 py-5 text-center text-xs text-gray-400">暂无扫描路径</div>
          )}
          {scanPaths.map((sp) => (
            <div key={sp.id} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0">
              <div>
                {sp.label && <p className="text-xs font-medium text-gray-700">{sp.label}</p>}
                <code className="text-xs text-gray-500 font-mono">{sp.path}</code>
              </div>
              <button onClick={() => onRemovePath(sp.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="px-4 py-3 border-t bg-gray-50/50">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input type="text" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/Users/me/Projects" className="flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
                <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="标签（可选）" className="w-28 border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <button onClick={handleAdd} disabled={!newPath.trim()} className="flex items-center gap-1.5 self-start text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">
                <Plus size={11} />添加路径
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
    {nativeScanSkills.length > 0 && (
      <ImportToCentralModal
        skills={nativeScanSkills}
        onClose={(imported) => {
          setNativeScanSkills([]);
          if (imported) void reloadCentral();
        }}
      />
    )}
    </>
  );
}

// ── Tab: 技能市场 ─────────────────────────────────────────────────────────────

function MarketTab({
  sources,
  onToggleSource,
  onDeleteSource,
  onAddSource,
  githubToken,
  setGithubToken,
  tokenMasked,
  setTokenMasked,
  onSaveToken,
}: {
  sources: SourceConfig[];
  onToggleSource: (s: SourceConfig) => void;
  onDeleteSource: (s: SourceConfig) => void;
  onAddSource: (id: string, name: string, type: SourceType, url: string) => Promise<void>;
  githubToken: string;
  setGithubToken: (v: string) => void;
  tokenMasked: boolean;
  setTokenMasked: (v: boolean) => void;
  onSaveToken: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<SourceType>('skillhub');
  const [newUrl, setNewUrl] = useState('');

  const handleAdd = async () => {
    await onAddSource(newId.trim(), newName.trim(), newType, newUrl.trim());
    setShowAdd(false);
    setNewId(''); setNewName(''); setNewUrl('');
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>技能市场数据源</SectionTitle>
        <div className="border rounded-xl bg-white overflow-hidden">
          {sources.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">暂无数据源配置</div>
          ) : (
            sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between px-4 py-3 border-b last:border-b-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0">{getSourceIcon(source.type)}</div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${source.enabled ? 'text-gray-800' : 'text-gray-400'}`}>{source.name}</p>
                    <p className="text-xs text-gray-400 truncate">{SOURCE_TYPE_LABELS[source.type as SourceType] ?? source.type} · {SOURCE_HOMEPAGE[source.type as SourceType] ?? source.base_url}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <Toggle size="sm" checked={source.enabled} onChange={() => onToggleSource(source)} />
                  {source.is_builtin ? <span className="w-7" /> : (
                    <button onClick={() => onDeleteSource(source)} className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" title="删除数据源">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          <div className="border-t">
            <button onClick={() => setShowAdd(!showAdd)} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <Plus size={13} />添加企业自建源
              {showAdd ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
            </button>
            {showAdd && (
              <div className="px-4 pb-4 flex flex-col gap-3 bg-gray-50/50">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">数据源 ID</label>
                    <input type="text" value={newId} onChange={(e) => setNewId(e.target.value.replace(/\s/g, '-').toLowerCase())} placeholder="my-corp-skills" className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">数据源名称</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="内部技能库" className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">数据源类型</label>
                  <Select value={newType} onChange={(v) => setNewType(v)} options={SOURCE_TYPE_OPTIONS} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    {newType === 'official_registry' ? 'Registry 索引地址' : 'SkillHub 实例地址'}
                  </label>
                  <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder={newType === 'official_registry' ? 'https://raw.githubusercontent.com/org/registry/main/registry.json' : 'https://skills.my-corp.com'} className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
                <button onClick={handleAdd} disabled={!newId.trim() || !newName.trim() || !newUrl.trim()} className="self-start flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <Plus size={11} />添加数据源
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>GitHub Personal Access Token</SectionTitle>
        <p className="text-xs text-gray-500 mb-3">用于提高 GitHub API 速率限制</p>
        <div className="border rounded-xl p-4 bg-white flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-green-500 shrink-0" />
            <span className="text-xs text-gray-500">Token 安全存储于系统 Keychain</span>
          </div>
          <div className="flex gap-2">
            <input type={tokenMasked ? 'password' : 'text'} value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300 font-mono" />
            <button onClick={() => setTokenMasked(!tokenMasked)} className="px-3 py-2 border rounded-lg text-gray-500 hover:bg-gray-50" title={tokenMasked ? '显示' : '隐藏'}>
              {tokenMasked ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
          <button onClick={onSaveToken} disabled={!githubToken.trim()} className="self-start px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50">保存</button>
        </div>
      </section>
    </div>
  );
}

// ── Platform local scan ───────────────────────────────────────────────────────

async function checkPathExists(skillsPath: string): Promise<boolean> {
  try {
    const result = await invoke<boolean>('check_path_exists', { path: skillsPath });
    return result;
  } catch {
    return false;
  }
}

// ── Tab: 平台管理 ─────────────────────────────────────────────────────────────

type SortableHandleProps = {
  listeners: ReturnType<typeof useSortable>['listeners'];
  attributes: ReturnType<typeof useSortable>['attributes'];
};

// 可排序类目 section（用于类目层拖拽，render-prop 模式透传拖拽手柄）
function SortableGroupSection({
  id,
  children,
}: {
  id: string;
  children: (handle: SortableHandleProps) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      {children({ listeners, attributes })}
    </section>
  );
}

// 可排序平台行（用于平台层拖拽）
function SortablePlatformRow({
  id,
  children,
}: {
  id: string;
  children: (handle: { listeners: ReturnType<typeof useSortable>['listeners']; attributes: ReturnType<typeof useSortable>['attributes'] }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      {children({ listeners, attributes })}
    </div>
  );
}

function PlatformsTab({
  platforms,
  onToggle,
  onDelete,
  onAdd,
  onUpdateGroup,
  onReloadPlatforms,
  scanResults,
  scanning,
  onScan,
  reloading,
}: {
  platforms: Platform[];
  onToggle: (p: Platform) => void;
  onDelete: (p: Platform) => void;
  onAdd: (data: { id: string; name: string; path: string; group: string }) => Promise<void>;
  onUpdateGroup: (platformId: string, group: string) => Promise<void>;
  onReloadPlatforms: () => Promise<void>;
  scanResults: Record<string, boolean> | null;
  scanning: boolean;
  onScan: () => Promise<void>;
  reloading: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [addGroupDropdownOpen, setAddGroupDropdownOpen] = useState(false);
  const [addGroupDropdownPos, setAddGroupDropdownPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const addGroupBtnRef = useRef<HTMLButtonElement | null>(null);

  // 类目管理状态
  const [groups, setGroups] = useState<string[]>([]);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  // 每个平台行的类目下拉状态
  const [openDropdownFor, setOpenDropdownFor] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const [newGroupInlineFor, setNewGroupInlineFor] = useState<string | null>(null);
  const [groupDropdownInput, setGroupDropdownInput] = useState('');
  const dropdownBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // 确认变更类目的 pending 状态
  const [pendingGroupChange, setPendingGroupChange] = useState<{ platformId: string; platformName: string; from: string; to: string } | null>(null);

  // 类目顺序（有序列表，对应侧边栏顺序）
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  // 折叠状态
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // 各类目内平台顺序（覆盖 DB 顺序，拖拽时实时更新）
  const [platformOrderOverride, setPlatformOrderOverride] = useState<Record<string, string[]>>({});

  // dnd-kit sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const loadGroups = async () => {
    const [g, orders] = await Promise.all([getPlatformGroups(), getGroupOrders()]);
    setGroups(g);
    const orderMap = new Map(orders.map((o) => [o.group_name, o.sort_order]));
    const allGroups = [...new Set([...orders.map((o) => o.group_name), ...g, '其他'])];
    allGroups.sort((a, b) => (orderMap.get(a) ?? 9999) - (orderMap.get(b) ?? 9999));
    setGroupOrder(allGroups);
    // 将尚未入库的新类目写入 platform_group_orders（确保顺序持久化）
    const maxOrder = orders.reduce((m, o) => Math.max(m, o.sort_order), 0);
    let nextOrder = maxOrder + 1;
    for (const name of allGroups) {
      if (!orderMap.has(name)) {
        await upsertGroupOrder(name, nextOrder++);
      }
    }
  };

  useEffect(() => { void loadGroups(); }, [platforms]);

  // 按 groupOrder 排序的分组（包含 platform 内部排序）
  const platformGroups = platforms.reduce<Record<string, Platform[]>>((acc, p) => {
    const g = p.group_label || '其他';
    acc[g] = acc[g] ?? [];
    acc[g].push(p);
    return acc;
  }, {});

  const sortedGroups: [string, Platform[]][] = groupOrder
    .filter((g) => platformGroups[g])
    .map((g) => {
      const ps = platformGroups[g];
      const override = platformOrderOverride[g];
      if (override) {
        const idMap = new Map(ps.map((p) => [p.id, p]));
        const ordered = override.map((id) => idMap.get(id)).filter(Boolean) as Platform[];
        const rest = ps.filter((p) => !override.includes(p.id));
        return [g, [...ordered, ...rest]];
      }
      return [g, [...ps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))];
    });

  // 未出现在 groupOrder 中的分组兜底追加
  const knownGroups = new Set(groupOrder);
  for (const [g, ps] of Object.entries(platformGroups)) {
    if (!knownGroups.has(g)) {
      sortedGroups.push([g, [...ps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))]);
    }
  }

  // 类目层拖拽结束
  const handleGroupDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupOrder.indexOf(active.id as string);
    const newIndex = groupOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(groupOrder, oldIndex, newIndex);
    setGroupOrder(newOrder);
    // 持久化
    await Promise.all(newOrder.map((name, idx) => upsertGroupOrder(name, idx)));
    usePlatformStore.getState().load();
  };

  // 平台层拖拽结束（单个类目内）
  const handlePlatformDragEnd = async (group: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentList = (platformOrderOverride[group] ?? sortedGroups.find(([g]) => g === group)?.[1].map((p) => p.id)) ?? [];
    const oldIndex = currentList.indexOf(active.id as string);
    const newIndex = currentList.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newList = arrayMove(currentList, oldIndex, newIndex);
    setPlatformOrderOverride((prev) => ({ ...prev, [group]: newList }));
    // 持久化
    await batchUpdatePlatformSortOrder(newList.map((id, idx) => ({ id, sort_order: idx })));
    await onReloadPlatforms();
  };

  const toggleCollapse = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(group) ? next.delete(group) : next.add(group);
      return next;
    });
  };

  const handleAdd = async () => {
    await onAdd({ id: newId, name: newName, path: newPath, group: newGroup });
    setShowAdd(false);
    setNewId(''); setNewName(''); setNewPath(''); setNewGroup('');
  };

  // 新建类目
  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (!groups.includes(name)) setGroups((prev) => [...prev, name]);
    setNewGroupName('');
    setShowNewGroupInput(false);
    toast.success(`已新建类目「${name}」`);
  };

  // 删除类目
  const handleDeleteGroup = async (group: string) => {
    const inGroup = platforms.filter((p) => (p.group_label || '其他') === group);
    if (inGroup.length > 0) {
      toast.error(`「${group}」下还有 ${inGroup.length} 个平台，请先将它们移至其他类目`);
      return;
    }
    setGroups((prev) => prev.filter((g) => g !== group));
    toast.success(`已删除类目「${group}」`);
  };

  // 选择新类目
  const requestGroupChange = (platform: Platform, newGrp: string) => {
    const from = platform.group_label || '其他';
    if (from === newGrp) { setOpenDropdownFor(null); setDropdownPos(null); return; }
    setPendingGroupChange({ platformId: platform.id, platformName: platform.name, from, to: newGrp });
    setOpenDropdownFor(null);
    setDropdownPos(null);
    setNewGroupInlineFor(null);
    setGroupDropdownInput('');
  };

  // 确认变更类目
  const confirmGroupChange = async () => {
    if (!pendingGroupChange) return;
    await onUpdateGroup(pendingGroupChange.platformId, pendingGroupChange.to);
    await onReloadPlatforms();
    await loadGroups();
    toast.success(`已将「${pendingGroupChange.platformName}」移至「${pendingGroupChange.to}」`);
    setPendingGroupChange(null);
  };

  // 提交新建内联类目
  const handleInlineNewGroup = (platform: Platform) => {
    const name = groupDropdownInput.trim();
    if (!name) return;
    if (!groups.includes(name)) setGroups((prev) => [...prev, name]);
    requestGroupChange(platform, name);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <ScanLine size={12} className={scanning ? 'animate-pulse' : ''} />
          {scanning ? '正在扫描...' : '扫描本地应用'}
        </button>
      </div>

      {/* 类目管理 */}
      <div className="border rounded-xl bg-white p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-600">类目管理</p>
          <button
            onClick={() => setShowNewGroupInput((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 px-2 py-0.5 rounded border border-purple-200 hover:bg-purple-50 transition-colors"
          >
            <Plus size={10} />新建类目
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <span
              key={g}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200"
            >
              {g}
              <button
                onClick={() => handleDeleteGroup(g)}
                className="text-gray-300 hover:text-red-400 transition-colors ml-0.5"
                title={`删除类目「${g}」`}
              >
                <XCircle size={10} />
              </button>
            </span>
          ))}
          {groups.length === 0 && <p className="text-[11px] text-gray-400">暂无类目</p>}
        </div>
        {showNewGroupInput && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder="输入新类目名称"
              autoFocus
              className="flex-1 border rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-300"
            />
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <Check size={11} />确认
            </button>
            <button
              onClick={() => { setShowNewGroupInput(false); setNewGroupName(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* Add custom platform */}
      <section>
        <div className="border rounded-xl bg-white overflow-hidden">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Plus size={13} />
            添加自定义平台
            {showAdd ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
          </button>
          {showAdd && (
            <div className="px-4 pb-4 flex flex-col gap-3 bg-gray-50/50 border-t">
              <div className="grid grid-cols-2 gap-2 pt-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">平台 ID</label>
                  <input type="text" value={newId} onChange={(e) => setNewId(e.target.value.replace(/\s/g, '-').toLowerCase())} placeholder="my-ai-tool" className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">显示名称</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My AI Tool" className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Skills 路径</label>
                <input type="text" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="$HOME/.my-ai-tool/skills" className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-purple-300" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">类目</label>
                <button
                  ref={addGroupBtnRef}
                  type="button"
                  onClick={() => {
                    if (addGroupDropdownOpen) {
                      setAddGroupDropdownOpen(false);
                      setAddGroupDropdownPos(null);
                    } else {
                      const btn = addGroupBtnRef.current;
                      if (btn) {
                        const rect = btn.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const estimatedH = 220;
                        if (spaceBelow < estimatedH && rect.top > estimatedH) {
                          setAddGroupDropdownPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width });
                        } else {
                          setAddGroupDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                        }
                      }
                      setAddGroupDropdownOpen(true);
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left border rounded-lg bg-white transition-shadow',
                    addGroupDropdownOpen ? 'ring-2 ring-purple-300 border-purple-300' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <span className="flex-1 truncate text-gray-700">
                    {newGroup}
                  </span>
                  <ChevronDown size={13} className={cn('shrink-0 text-gray-400 transition-transform duration-150', addGroupDropdownOpen && 'rotate-180')} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleAdd} disabled={!newId.trim() || !newName.trim() || !newPath.trim() || reloading} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                  <Plus size={11} />添加平台
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Platform groups — 类目层拖拽排序 */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
        <SortableContext items={sortedGroups.map(([g]) => g)} strategy={verticalListSortingStrategy}>
          {sortedGroups.map(([group, groupPlatforms]) => {
            const isCollapsed = collapsedGroups.has(group);
            return (
              <SortableGroupSection key={group} id={group}>
                {({ listeners: groupListeners, attributes: groupAttrs }) => (
                  <>
                    {/* 类目标题行 */}
                    <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
                      <button
                        {...groupListeners}
                        {...groupAttrs}
                        className="p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
                        title="拖拽排序类目"
                        onClick={(e) => e.preventDefault()}
                      >
                        <GripVertical size={13} />
                      </button>
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">{group}</span>
                      <span className="text-[10px] text-gray-400 mr-1">{groupPlatforms.length}</span>
                      <button
                        onClick={() => toggleCollapse(group)}
                        className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title={isCollapsed ? '展开' : '折叠'}
                      >
                        <ChevronDown size={12} className={cn('transition-transform duration-150', isCollapsed && '-rotate-90')} />
                      </button>
                    </div>

                    {/* 类目内容（可折叠） */}
                    {!isCollapsed && (
                      <div className="border rounded-xl bg-white overflow-hidden">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => { void handlePlatformDragEnd(group, e); }}
                        >
                          <SortableContext items={groupPlatforms.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                            {groupPlatforms.map((platform) => {
                              const isBuiltin = BUILTIN_PLATFORM_IDS.has(platform.id);
                              const isInstalled = scanResults ? scanResults[platform.id] : null;
                              const isDropdownOpen = openDropdownFor === platform.id;
                              return (
                                <SortablePlatformRow key={platform.id} id={platform.id}>
                                  {({ listeners: rowListeners, attributes: rowAttrs }) => (
                                    <div className="flex items-center justify-between px-3 py-3 border-b last:border-b-0">
                                      {/* 平台行拖拽手柄 */}
                                      <button
                                        {...rowListeners}
                                        {...rowAttrs}
                                        className="p-0.5 mr-1 rounded text-gray-200 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none shrink-0"
                                        title="拖拽排序"
                                        onClick={(e) => e.preventDefault()}
                                      >
                                        <GripVertical size={12} />
                                      </button>
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <PlatformIcon iconKey={platform.icon ?? platform.id} size={20} className="shrink-0" />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <p className={`text-sm font-medium ${platform.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
                                              {platform.name}
                                            </p>
                                            {isBuiltin && (
                                              <span className="text-[9px] bg-gray-100 text-gray-400 px-1 py-0.5 rounded font-medium">内置</span>
                                            )}
                                            {isInstalled === true && (
                                              <span className="flex items-center gap-0.5 text-[9px] text-green-600 bg-green-50 px-1 py-0.5 rounded font-medium">
                                                <CheckCircle2 size={9} />已安装
                                              </span>
                                            )}
                                            {isInstalled === false && (
                                              <span className="flex items-center gap-0.5 text-[9px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded font-medium">
                                                <XCircle size={9} />未安装
                                              </span>
                                            )}
                                          </div>
                                          <code className="text-xs text-gray-400 font-mono truncate block">
                                            {platform.skills_path.replace('$HOME', '~')}
                                          </code>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0 ml-3">
                                        {/* 类目自定义下拉 */}
                                        <div className="relative">
                                          <button
                                            ref={(el) => { dropdownBtnRefs.current[platform.id] = el; }}
                                            onClick={() => {
                                              if (isDropdownOpen) {
                                                setOpenDropdownFor(null);
                                                setDropdownPos(null);
                                                setNewGroupInlineFor(null);
                                                setGroupDropdownInput('');
                                              } else {
                                                const btn = dropdownBtnRefs.current[platform.id];
                                                if (btn) {
                                                  const rect = btn.getBoundingClientRect();
                                                  const spaceBelow = window.innerHeight - rect.bottom;
                                                  const estimatedMenuH = 200;
                                                  if (spaceBelow < estimatedMenuH && rect.top > estimatedMenuH) {
                                                    setDropdownPos({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right });
                                                  } else {
                                                    setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                                  }
                                                }
                                                setOpenDropdownFor(platform.id);
                                                setNewGroupInlineFor(null);
                                                setGroupDropdownInput('');
                                              }
                                            }}
                                            className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                            title="更改类目"
                                          >
                                            <Pencil size={9} />
                                            {platform.group_label || '其他'}
                                            <ChevronDown size={9} className={cn('transition-transform', isDropdownOpen && 'rotate-180')} />
                                          </button>
                                        </div>
                                        <Toggle size="sm" checked={!!platform.enabled} onChange={() => onToggle(platform)} />
                                        {!isBuiltin ? (
                                          <button onClick={() => onDelete(platform)} className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500" title="删除平台">
                                            <Trash2 size={13} />
                                          </button>
                                        ) : (
                                          <span className="w-7" />
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </SortablePlatformRow>
                              );
                            })}
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}
                  </>
                )}
              </SortableGroupSection>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* 添加平台的类目选择下拉（fixed 定位） */}
      {addGroupDropdownOpen && addGroupDropdownPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setAddGroupDropdownOpen(false); setAddGroupDropdownPos(null); }}
          />
          <div
            className="fixed z-50 bg-white border rounded-xl shadow-lg py-1 overflow-hidden"
            style={{ top: addGroupDropdownPos.top, bottom: addGroupDropdownPos.bottom, left: addGroupDropdownPos.left, width: addGroupDropdownPos.width }}
          >
            {[...groupOrder.filter((g) => groups.includes(g) || g === '其他').map((g) => ({ value: g, label: g }))].map(({ value: v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => { setNewGroup(v); setAddGroupDropdownOpen(false); setAddGroupDropdownPos(null); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  v === newGroup ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                )}
              >
                {v === newGroup && <Check size={12} className="shrink-0" />}
                <span className={v === newGroup ? '' : 'ml-[20px]'}>{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 类目下拉菜单 */}
      {openDropdownFor && dropdownPos && (() => {
        const platform = platforms.find((p) => p.id === openDropdownFor);
        if (!platform) return null;
        const isNewGroupOpen = newGroupInlineFor === platform.id;
        const allGroupOptions = [...new Set([...groupOrder.filter(g => g !== '其他'), ...groups, '其他'])];
        return (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => { setOpenDropdownFor(null); setDropdownPos(null); setNewGroupInlineFor(null); setGroupDropdownInput(''); }}
            />
            <div
              className="fixed z-50 min-w-[130px] bg-white border rounded-xl shadow-lg py-1 overflow-hidden"
              style={{
                top: dropdownPos.top,
                bottom: dropdownPos.bottom,
                right: dropdownPos.right,
              }}
            >
              {allGroupOptions.map((g) => {
                const isCurrent = (platform.group_label || '其他') === g;
                return (
                  <button
                    key={g}
                    onClick={() => requestGroupChange(platform, g)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                      isCurrent
                        ? 'text-purple-700 bg-purple-50 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {isCurrent && <Check size={10} className="shrink-0" />}
                    <span className={isCurrent ? '' : 'ml-[14px]'}>{g}</span>
                  </button>
                );
              })}
              <div className="border-t mt-1 pt-1">
                {isNewGroupOpen ? (
                  <div className="px-2 pb-1.5 flex items-center gap-1">
                    <input
                      type="text"
                      value={groupDropdownInput}
                      onChange={(e) => setGroupDropdownInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInlineNewGroup(platform)}
                      placeholder="新类目名称"
                      autoFocus
                      className="flex-1 border rounded px-2 py-0.5 text-xs outline-none focus:ring-2 focus:ring-purple-300 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleInlineNewGroup(platform); }}
                      disabled={!groupDropdownInput.trim()}
                      className="p-0.5 text-purple-600 hover:text-purple-800 disabled:opacity-40 shrink-0"
                    >
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setNewGroupInlineFor(platform.id); }}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50 transition-colors"
                  >
                    <Plus size={10} />新建类目
                  </button>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* 类目变更确认弹窗 */}
      {pendingGroupChange && (
        <ConfirmDialog
          title="确认变更类目"
          description={`将「${pendingGroupChange.platformName}」从「${pendingGroupChange.from}」移至「${pendingGroupChange.to}」？`}
          confirmLabel="确认变更"
          onConfirm={() => { void confirmGroupChange(); }}
          onCancel={() => setPendingGroupChange(null)}
        />
      )}
    </div>
  );
}

// ── Tab: 关于 ─────────────────────────────────────────────────────────────────

const FEATURES: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}[] = [
  {
    icon: <Archive size={18} className="text-purple-500" />,
    title: '中央技能库',
    desc: '类「中央厨房」的设计理念，实现本地技能的全局唯一管理存储（~/.agent/skills/），无需复制粘贴，零拷贝自由流通',
  },
  {
    icon: <Link size={18} className="text-blue-500" />,
    title: '零拷贝分发',
    desc: '通过符号链接（Symlink）零拷贝实现技能分发，可直接挂载到 Claude Code、Cursor、Trae 等 AI 平台的技能目录',
  },
  {
    icon: <ShoppingBag size={18} className="text-emerald-500" />,
    title: '技能市场',
    desc: '默认内置 SkillHub / ClawHub / Skillsmp，可快速接入兼容 SkillHub API 的企业自建技能源（iflytek/skillhub）',
  },
  {
    icon: <Layers size={18} className="text-orange-500" />,
    title: '共享技能集合',
    desc: '技能集合的导入/导出（*.skillcol），实现跨设备共享，支持批量分发到多个平台，内置防篡改检测功能',
  },
];

const TECH_STACK = [
  { label: '框架',   value: 'Tauri v2' },
  { label: '前端',   value: 'React + TypeScript + Tailwind CSS v4' },
  { label: '后端',     value: 'Rust' },
  { label: '数据库', value: 'SQLite' },
];

const LINKS = [
  {
    key: 'github',
    name: 'GitHub 仓库',
    desc: 'Necho-dev/skills-hub 开源代码仓库',
    url: 'https://github.com/Necho-dev/skills-hub',
  },
  {
    key: 'github',
    name: 'Issues 反馈',
    desc: '提交 Bug 报告或功能建议',
    url: 'https://github.com/Necho-dev/skills-hub/issues',
  },
];

function AboutTab() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion('0.1.0'));
  }, []);

  const handleLink = useCallback((url: string) => {
    openUrl(url).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* App identity */}
      <div className="border rounded-xl p-5 bg-white flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-purple-500 to-purple-700 flex items-center justify-center shrink-0 shadow-lg">
          <Cpu size={26} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-base font-bold text-gray-900">SkillsHub</p>
            {version && (
              <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">
                v{version}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            通过符号链接（Symlink）零拷贝实现技能在不同 AI 工具间自由流通，提供 Marketplace 技能市场（默认内置 SkillHub、Clawhub、Skillsmp 技能源），可增加兼容 SkillHub API 的自建源，支持共享技能集。
          </p>
        </div>
      </div>

      {/* Features */}
      <section>
        <SectionTitle>核心功能</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {FEATURES.map((f) => (
            <div key={f.title} className="border rounded-xl p-4 bg-white flex flex-col gap-2 hover:border-purple-200 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                {f.icon}
              </div>
              <p className="text-xs font-semibold text-gray-800">{f.title}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section>
        <SectionTitle>技术栈</SectionTitle>
        <div className="border rounded-xl bg-white overflow-hidden">
          {TECH_STACK.map((t, i) => (
            <div
              key={t.label}
              className={cn('flex items-center justify-between px-4 py-2.5 text-xs', i < TECH_STACK.length - 1 && 'border-b')}
            >
              <span className="text-gray-400 font-mono text-[12px] font-semibold">{t.label}</span>
              <span className="text-gray-700 font-mono font-medium">{t.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Links */}
      <section>
        <SectionTitle>相关链接</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {LINKS.map((link) => (
            <button
              key={link.name}
              onClick={() => handleLink(link.url)}
              className="border rounded-xl p-3.5 bg-white flex items-center gap-3 hover:border-purple-200 hover:bg-purple-50/30 transition-colors text-left group"
            >
              <PlatformIcon iconKey={link.key} size={28} className="shrink-0 rounded-lg!" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 group-hover:text-purple-700 transition-colors">{link.name}</p>
                <p className="text-[11px] text-gray-400 leading-relaxed truncate">{link.desc}</p>
              </div>
              <ExternalLink size={12} className="text-gray-300 group-hover:text-purple-400 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </section>

      {/* Friendly links */}
      <section>
        <SectionTitle>生态链接</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {
              key: 'skillhub-iflytek',
              name: 'SkillHub',
              desc: '企业级自托管 Skills 注册中心',
              url: 'https://github.com/iflytek/skillhub',
            },
            {
              key: 'skillhub',
              name: 'skillhub.cn',
              desc: '专为中国用户优化的 Skills 社区',
              url: 'https://skillhub.cn/',
            },
            {
              key: 'skillsmp',
              name: 'SkillsMP',
              desc: '百万量级 Agent Skills 开放市场',
              url: 'https://skillsmp.com/',
            },
            {
              key: 'clawhub',
              name: 'ClawHub',
              desc: '社区驱动的 Skills & Plugins 平台',
              url: 'https://clawhub.ai/',
            },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => handleLink(item.url)}
              className="border rounded-xl p-3.5 bg-white flex items-center gap-3 hover:border-purple-200 hover:bg-purple-50/30 transition-colors text-left group"
            >
              <PlatformIcon iconKey={item.key} size={28} className="shrink-0 rounded-lg!" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 group-hover:text-purple-700 transition-colors">{item.name}</p>
                <p className="text-[11px] text-gray-400 leading-relaxed truncate">{item.desc}</p>
              </div>
              <ExternalLink size={12} className="text-gray-300 group-hover:text-purple-400 shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </section>

      {/* Copyright */}
      <p className="text-center text-[11px] text-gray-300 pb-2">
        © 2025–{new Date().getFullYear()} iFlyTek · SkillsHub · MIT License
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Settings() {
  const { load: reloadPlatformStore } = usePlatformStore();

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [scanPaths, setScanPaths] = useState<ScanPathRow[]>([]);
  const [githubToken, setGithubToken] = useState('');
  const [tokenMasked, setTokenMasked] = useState(true);
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [enabledPlatforms, setEnabledPlatforms] = useState<Platform[]>([]);
  const [reloading, setReloading] = useState(false);
  const [platformScanResults, setPlatformScanResults] = useState<Record<string, boolean> | null>(null);
  const [platformScanning, setPlatformScanning] = useState(false);

  const [disableSourceConfirm, setDisableSourceConfirm] = useState<SourceConfig | null>(null);
  const [disablePlatformConfirm, setDisablePlatformConfirm] = useState<Platform | null>(null);

  const loadSources = async () => setSources(await getMarketplaceSources());
  const loadPlatforms = async () => {
    const all = await getAllPlatforms();
    setPlatforms(all);
    const enabled = await getPlatforms();
    setEnabledPlatforms(enabled);
    return all;
  };

  // Run local scan: check which platforms are installed, batch-disable absent ones
  const runLocalScan = async (allPlatforms: Platform[], silent = false) => {
    setPlatformScanning(true);
    const results: Record<string, boolean> = {};
    await Promise.all(
      allPlatforms.filter(p => BUILTIN_PLATFORM_IDS.has(p.id)).map(async (p) => {
        results[p.id] = await checkPathExists(p.skills_path);
      })
    );
    setPlatformScanResults(results);
    setPlatformScanning(false);

    const toDisable = allPlatforms.filter(
      p => BUILTIN_PLATFORM_IDS.has(p.id) && !results[p.id] && p.enabled
    );
    const toEnable = allPlatforms.filter(
      p => BUILTIN_PLATFORM_IDS.has(p.id) && results[p.id] && !p.enabled
    );

    if (toDisable.length > 0 || toEnable.length > 0) {
      await Promise.all([
        ...toDisable.map(p => togglePlatform(p.id, false)),
        ...toEnable.map(p => togglePlatform(p.id, true)),
      ]);
      await loadPlatforms();
      await reloadPlatformStore();
      if (!silent) {
        const installedCount = Object.values(results).filter(Boolean).length;
        const total = allPlatforms.filter(p => BUILTIN_PLATFORM_IDS.has(p.id)).length;
        toast.success(`扫描完成：${installedCount} / ${total} 个平台已安装并启用`);
      }
    } else if (!silent) {
      const installedCount = Object.values(results).filter(Boolean).length;
      const total = allPlatforms.filter(p => BUILTIN_PLATFORM_IDS.has(p.id)).length;
      toast.success(`扫描完成：${installedCount} / ${total} 个平台已安装`);
    }
  };

  useEffect(() => {
    getScanPaths().then(setScanPaths);
    loadSources();
    loadPlatforms().then((all) => {
      // Silent auto-scan on startup
      void runLocalScan(all, true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scan paths
  const handleAddPath = async (path: string, label: string) => {
    if (!path) return;
    await addScanPath(path, label || undefined);
    setScanPaths(await getScanPaths());
    toast.success('已添加扫描路径');
  };
  const handleRemovePath = async (id: string) => {
    await removeScanPath(id);
    setScanPaths((prev) => prev.filter((p) => p.id !== id));
    toast.success('已删除扫描路径');
  };
  const handleInitCentral = async () => {
    try { await initCentralDir(); toast.success('中央技能库目录已初始化'); }
    catch (e) { toast.error(String(e)); }
  };

  // Sources
  const handleToggleSource = (source: SourceConfig) => {
    source.enabled ? setDisableSourceConfirm(source) : void doToggleSource(source, true);
  };
  const doToggleSource = async (source: SourceConfig, enabled: boolean) => {
    await toggleMarketplaceSource(source.id, enabled);
    await loadSources();
    toast.success(`已${enabled ? '启用' : '禁用'} ${source.name}`);
  };
  const handleDeleteSource = async (source: SourceConfig) => {
    if (source.is_builtin) return;
    await deleteMarketplaceSource(source.id);
    await loadSources();
    toast.success(`已删除数据源：${source.name}`);
  };
  const handleAddSource = async (id: string, name: string, type: SourceType, url: string) => {
    if (!id || !name || !url) { toast.error('请填写所有必填字段'); return; }
    try {
      await addMarketplaceSource(id, name, type, url);
      await loadSources();
      toast.success('已添加数据源');
    } catch (e) { toast.error(String(e)); }
  };

  // Platforms
  const handleTogglePlatform = (platform: Platform) => {
    platform.enabled ? setDisablePlatformConfirm(platform) : void doTogglePlatform(platform, true);
  };
  const doTogglePlatform = async (platform: Platform, enabled: boolean) => {
    await togglePlatform(platform.id, enabled);
    await loadPlatforms();
    await reloadPlatformStore();
    toast.success(`已${enabled ? '启用' : '禁用'} ${platform.name}`);
  };
  const handleDeletePlatform = async (platform: Platform) => {
    if (BUILTIN_PLATFORM_IDS.has(platform.id)) return;
    await deletePlatform(platform.id);
    await loadPlatforms();
    await reloadPlatformStore();
    toast.success(`已删除平台：${platform.name}`);
  };
  const handleAddPlatform = async (data: { id: string; name: string; path: string; group: string }) => {
    if (!data.id || !data.name || !data.path) { toast.error('请填写平台 ID、名称和路径'); return; }
    try {
      setReloading(true);
      await addPlatform({
        id: data.id.toLowerCase().replace(/\s/g, '-'),
        name: data.name,
        icon: undefined,
        skills_path: data.path,
        group_label: data.group || '自定义平台',
        sort_order: 999,
      });
      await loadPlatforms();
      await reloadPlatformStore();
      toast.success('已添加自定义平台');
    } catch (e) { toast.error(String(e)); }
    finally { setReloading(false); }
  };

  const handleUpdatePlatformGroup = async (platformId: string, group: string) => {
    await updatePlatformGroup(platformId, group);
    await reloadPlatformStore();
    toast.success('已更新平台类目');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <h1 className="text-base font-semibold text-gray-900">设置</h1>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 shrink-0 border-b px-4 bg-white overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md my-1.5 transition-colors whitespace-nowrap shrink-0',
              activeTab === tab.id
                ? 'bg-purple-100 text-purple-700 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl">
          {activeTab === 'general' && (
            <LibraryTab
              scanPaths={scanPaths}
              onRemovePath={handleRemovePath}
              onAddPath={handleAddPath}
              onInitCentral={handleInitCentral}
              enabledPlatforms={enabledPlatforms}
            />
          )}
          {activeTab === 'market' && (
            <MarketTab
              sources={sources}
              onToggleSource={handleToggleSource}
              onDeleteSource={handleDeleteSource}
              onAddSource={handleAddSource}
              githubToken={githubToken}
              setGithubToken={setGithubToken}
              tokenMasked={tokenMasked}
              setTokenMasked={setTokenMasked}
              onSaveToken={() => toast.info('GitHub PAT Keychain 存储需要 tauri-plugin-keychain，暂时占位')}
            />
          )}
          {activeTab === 'platforms' && (
            <PlatformsTab
              platforms={platforms}
              onToggle={handleTogglePlatform}
              onDelete={handleDeletePlatform}
              onAdd={handleAddPlatform}
              onUpdateGroup={handleUpdatePlatformGroup}
              onReloadPlatforms={async () => { await loadPlatforms(); await reloadPlatformStore(); }}
              scanResults={platformScanResults}
              scanning={platformScanning}
              onScan={() => runLocalScan(platforms, false)}
              reloading={reloading}
            />
          )}
          {activeTab === 'about' && <AboutTab />}
        </div>
      </div>

      {/* Confirm dialogs */}
      {disableSourceConfirm && (
        <ConfirmDialog
          title="禁用数据源"
          description={`禁用后「${disableSourceConfirm.name}」的技能将不再显示在技能市场中，确认禁用？`}
          confirmLabel="禁用"
          onConfirm={() => { void doToggleSource(disableSourceConfirm, false); setDisableSourceConfirm(null); }}
          onCancel={() => setDisableSourceConfirm(null)}
        />
      )}
      {disablePlatformConfirm && (
        <ConfirmDialog
          title="禁用平台"
          description={`禁用后「${disablePlatformConfirm.name}」将不再显示在平台列表中，已安装的技能符号链接不受影响。确认禁用？`}
          confirmLabel="禁用"
          onConfirm={() => { void doTogglePlatform(disablePlatformConfirm, false); setDisablePlatformConfirm(null); }}
          onCancel={() => setDisablePlatformConfirm(null)}
        />
      )}
    </div>
  );
}
