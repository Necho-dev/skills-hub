import { FolderOpen, Trash2, X, AlertTriangle, CheckCircle2, PlusCircle, Loader2, Send, Ban } from 'lucide-react';
import type { Skill } from '@/types';
import { usePlatformStore } from '@/stores/platformStore';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { MarkdownPreview } from './MarkdownPreview';
import { PlatformIcon } from '@/lib/platformIcons';
import { revealInFinder } from '@/lib/tauri';
import { toast } from 'sonner';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SOURCE_CONFIG } from '@/lib/skillSource';

interface SkillDetailPanelProps {
  skill: Skill;
  markdown: string | null;
  markdownLoading: boolean;
  installedPlatformIds: string[];
  onClose?: () => void;
}

interface DeleteModalProps {
  skillName: string;
  installedPlatformNames: string[];
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ skillName, installedPlatformNames, deleting, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[360px] p-5 flex flex-col gap-4">
        {/* 标题 */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle size={15} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">删除技能</p>
            <p className="text-xs text-gray-500 mt-0.5">
              确定要删除 <span className="font-medium text-gray-700">"{skillName}"</span> 吗？
            </p>
          </div>
        </div>

        {/* 符号链接警告 */}
        {installedPlatformNames.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              该技能已被分发到以下平台：
            </div>
            <div className="flex flex-wrap gap-1">
              {installedPlatformNames.map((name) => (
                <span key={name} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  {name}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-400">
              确认删除以后将自动移除 Symbolic Link（符号链接）
            </p>
          </div>
        )}

        {/* 不可恢复提示 */}
        <p className="text-xs text-gray-400">
          该操作将从 <code className="bg-gray-100 px-1 rounded font-mono">~/.agent/skills/</code> 目录中<span className="text-red-500 font-medium">删除技能文件且无法恢复</span>，请谨慎操作。
        </p>

        {/* 按钮 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-3 py-1.5 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className={cn(
              'px-3 py-1.5 text-sm text-white rounded-lg flex items-center gap-1.5',
              deleting ? 'bg-red-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'
            )}
          >
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}


export function SkillDetailPanel({
  skill,
  markdown,
  markdownLoading,
  installedPlatformIds,
  onClose,
}: SkillDetailPanelProps) {
  const { platforms } = usePlatformStore();
  const { installToPlatform, uninstallFromPlatform, removeSkill } = useCentralSkillsStore();
  const [toggling, setToggling] = useState<string | null>(null);
  const [togglingAll, setTogglingAll] = useState<'install' | 'uninstall' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleTogglePlatform = async (platformId: string, wantInstall: boolean) => {
    const platform = platforms.find((p) => p.id === platformId);
    if (!platform) return;
    setToggling(platformId);
    try {
      if (wantInstall) {
        const result = await installToPlatform(skill.id, platformId, platform.skills_path);
        if (result.success) {
          toast.success(`已安装到 ${platform.name}`);
        } else {
          toast.error(result.error ?? '安装失败');
        }
      } else {
        const result = await uninstallFromPlatform(skill.id, platformId, platform.skills_path);
        if (result.success) {
          toast.success(`已从 ${platform.name} 卸载`);
        } else {
          toast.error(result.error ?? '卸载失败');
        }
      }
    } finally {
      setToggling(null);
    }
  };

  const handleToggleAll = async (action: 'install' | 'uninstall') => {
    const enabled = platforms.filter((p) => p.enabled);
    const targets = action === 'install'
      ? enabled.filter((p) => !installedPlatformIds.includes(p.id))
      : enabled.filter((p) => installedPlatformIds.includes(p.id));
    if (targets.length === 0) return;
    setTogglingAll(action);
    for (const platform of targets) {
      try {
        if (action === 'install') {
          const result = await installToPlatform(skill.id, platform.id, platform.skills_path);
          if (!result.success) toast.error(`${platform.name} 安装失败: ${result.error ?? ''}`);
        } else {
          const result = await uninstallFromPlatform(skill.id, platform.id, platform.skills_path);
          if (!result.success) toast.error(`${platform.name} 撤销失败: ${result.error ?? ''}`);
        }
      } catch (e) {
        toast.error(String(e));
      }
    }
    setTogglingAll(null);
    toast.success(action === 'install' ? `已分发到全部 ${targets.length} 个平台` : `已从全部 ${targets.length} 个平台撤销`);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await removeSkill(skill.id);
      toast.success(`已删除技能 ${skill.name}`);
      setShowDeleteModal(false);
      onClose?.();
    } catch (e) {
      toast.error(String(e));
      setDeleting(false);
    }
  };

  const installedPlatformNames = installedPlatformIds
    .map((pid) => platforms.find((p) => p.id === pid)?.name)
    .filter(Boolean) as string[];

  return (
    <>
      {showDeleteModal && (
        <DeleteConfirmModal
          skillName={skill.name}
          installedPlatformNames={installedPlatformNames}
          deleting={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Panel header：标题行 + 操作按钮 */}
        <div className="px-4 pt-3 pb-0 border-b">
          {/* 第一行：标题 + 操作按钮 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-semibold text-gray-900 text-sm truncate">{skill.name}</h2>
              {skill.version && (
                <span className="shrink-0 text-[9px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded font-mono">
                  {skill.version}
                </span>
              )}
              {(() => {
                const cfg = SOURCE_CONFIG[skill.source] ?? SOURCE_CONFIG.local;
                return (
                  <span className={cn(
                    'shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border',
                    cfg.className
                  )}>
                    {cfg.icon}{cfg.label}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => revealInFinder(skill.path)}
                className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                title="在 Finder 中显示"
              >
                <FolderOpen size={13} />
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={deleting}
                className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                title="删除技能"
              >
                <Trash2 size={13} />
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* 描述（全宽） */}
          {skill.description && (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{skill.description}</p>
          )}

          {/* 作者 / 来源链接 */}
          {(skill.author || skill.source_url) && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {skill.author && (
                <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
                  {skill.author}
                </span>
              )}
              {skill.source_url && (
                <a
                  href={skill.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => { e.preventDefault(); void import('@/lib/tauri').then(({ revealInFinder: _ }) => { window.open(skill.source_url, '_blank'); }); }}
                  className="text-[10px] text-purple-500 hover:text-purple-700 flex items-center gap-0.5 truncate max-w-[200px]"
                  title={skill.source_url}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  来源链接
                </a>
              )}
            </div>
          )}

          {/* 路径 */}
          <p className="text-[10px] text-gray-400 mt-1 font-mono truncate">{skill.path}</p>

          {/* 平台分发区 */}
          <div className="mt-2 mb-3">
            {(() => {
              const enabled = platforms.filter((p) => p.enabled);
              if (enabled.length === 0) return (
                <p className="text-[11px] text-gray-400 py-1">暂无已启用平台，请在设置中启用</p>
              );
              const installedCount = enabled.filter((p) => installedPlatformIds.includes(p.id)).length;
              const notInstalledCount = enabled.length - installedCount;
              return (
                <div>
                  {/* 操作栏 */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-gray-500 font-medium">分发到平台</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleAll('install')}
                        disabled={notInstalledCount === 0 || !!togglingAll}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {togglingAll === 'install'
                          ? <Loader2 size={9} className="animate-spin" />
                          : <Send size={9} />
                        }
                        全部分发
                      </button>
                      <button
                        onClick={() => handleToggleAll('uninstall')}
                        disabled={installedCount === 0 || !!togglingAll}
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {togglingAll === 'uninstall'
                          ? <Loader2 size={9} className="animate-spin" />
                          : <Ban size={9} />
                        }
                        全部撤销
                      </button>
                    </div>
                  </div>
                  {/* 胶囊网格 */}
                  <div className="flex flex-wrap gap-1.5">
                    {enabled.map((platform) => {
                      const isInstalled = installedPlatformIds.includes(platform.id);
                      const isToggling = toggling === platform.id;
                      return (
                        <button
                          key={platform.id}
                          onClick={() => handleTogglePlatform(platform.id, !isInstalled)}
                          disabled={isToggling || !!togglingAll}
                          title={isInstalled ? `点击撤销 ${platform.name}` : `点击分发到 ${platform.name}`}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                            isInstalled
                              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                              : 'bg-white border-gray-200 text-gray-500 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-600'
                          )}
                        >
                          {isToggling
                            ? <Loader2 size={10} className="animate-spin" />
                            : isInstalled
                              ? <CheckCircle2 size={10} />
                              : <PlusCircle size={10} />
                          }
                          <PlatformIcon iconKey={platform.icon ?? platform.id} size={10} />
                          {platform.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Markdown content */}
        <div className="flex-1 overflow-y-auto">
          {markdownLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              加载中...
            </div>
          ) : markdown ? (
            <div className="px-4 py-4">
              <MarkdownPreview content={markdown} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              无 SKILL.md 内容
            </div>
          )}
        </div>

      </div>
    </>
  );
}
