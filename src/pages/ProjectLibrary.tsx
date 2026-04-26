import { useEffect, useState } from 'react';
import { RefreshCw, FolderOpen, PackagePlus, X, FileText } from 'lucide-react';
import { MarkdownPreview } from '@/components/skills/MarkdownPreview';
import { ImportToCentralModal } from '@/components/skills/ImportToCentralModal';
import { useProjectSkillsStore } from '@/stores/projectSkillsStore';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { revealInFinder } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { PlatformIcon } from '@/lib/platformIcons';

import { cn } from '@/lib/utils';
import type { ProjectSkill, NativeSkill } from '@/types';

const HINT_TO_ICON_KEY: Record<string, string> = {
  'cursor':     'cursor',
  'claude code':'claude-code',
  'central':    'skillhub',
};

function platformHintIconKey(hint: string): string {
  return HINT_TO_ICON_KEY[hint.toLowerCase()] ?? hint.toLowerCase();
}

function PlatformHintTag({ hint }: { hint: string }) {
  return (
    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md border border-gray-200 font-medium">
      <PlatformIcon iconKey={platformHintIconKey(hint)} size={11} />
      {hint}
    </span>
  );
}

function useProjectSkillMarkdown(skillPath: string | null) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skillPath) { setMarkdown(null); return; }
    setLoading(true);
    setMarkdown(null);
    invoke<string>('get_project_skill_markdown', { skillPath })
      .then((text) => setMarkdown(text))
      .catch(() => setMarkdown(null))
      .finally(() => setLoading(false));
  }, [skillPath]);

  return { markdown, loading };
}

export function ProjectLibrary() {
  const { groups, selectedProject, loading, error, scan, selectProject } = useProjectSkillsStore();
  const { load: reloadCentral } = useCentralSkillsStore();
  const [selectedSkill, setSelectedSkill] = useState<ProjectSkill | null>(null);
  const [importModalSkill, setImportModalSkill] = useState<NativeSkill | null>(null);

  const { markdown, loading: mdLoading } = useProjectSkillMarkdown(selectedSkill?.path ?? null);

  useEffect(() => { scan(); }, []);

  // 切换项目时清空选中的技能
  const handleSelectProject = (projectPath: string | null) => {
    selectProject(projectPath);
    setSelectedSkill(null);
  };

  const totalSkills = groups.reduce((sum, g) => sum + g.skills.length, 0);
  const selectedGroup = groups.find((g) => g.project_path === selectedProject);

  // 构造 NativeSkill 对象，打开导入弹窗
  const handleImport = (skill: ProjectSkill) => {
    // platformSkillsPath 取技能所在目录的父目录
    const parentPath = skill.path.substring(0, skill.path.lastIndexOf('/')) || skill.path;
    setImportModalSkill({
      skillId: skill.id,
      skillName: skill.name,
      description: skill.description,
      sourcePath: skill.path,
      platformId: 'project',
      platformName: skill.project_name,
      platformSkillsPath: parentPath,
    });
  };

  return (
    <>
    <div className="flex h-full overflow-hidden">
      {/* 左栏：项目目录树 */}
      <div className="w-[200px] shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">项目技能库</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {groups.length} 个项目 · {totalSkills} 个技能
            </p>
          </div>
          <button
            onClick={() => scan(true)}
            disabled={loading}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="重新扫描"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {groups.map((group) => (
            <button
              key={group.project_path}
              onClick={() => handleSelectProject(
                selectedProject === group.project_path ? null : group.project_path
              )}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors',
                selectedProject === group.project_path
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen size={13} className="shrink-0 text-gray-400" />
                <span className="truncate text-xs">{group.project_name}</span>
              </div>
              <span className="text-[10px] text-gray-400 ml-1 shrink-0">{group.skills.length}</span>
            </button>
          ))}
          {!loading && groups.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-xs">
              未找到包含 SKILL.md 的项目
            </div>
          )}
        </div>
      </div>

      {/* 中栏：技能列表 */}
      <div className={cn(
        'flex flex-col border-r transition-all shrink-0',
        selectedSkill ? 'w-[260px]' : 'flex-1'
      )}>
        {selectedGroup ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 truncate">{selectedGroup.project_name}</h2>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{selectedGroup.project_path}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0 ml-2">({selectedGroup.skills.length})</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {selectedGroup.skills.map((skill) => {
                const isSelected = selectedSkill?.path === skill.path;
                return (
                  <div
                    key={skill.path}
                    onClick={() => setSelectedSkill(isSelected ? null : skill)}
                    className={cn(
                      'group relative px-4 py-3 border-b cursor-pointer transition-colors',
                      isSelected
                        ? 'bg-purple-50 border-l-2 border-l-purple-500'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    {/* 内容区：全宽，不与按钮争空间 */}
                    <p className="text-sm font-medium text-gray-900 truncate leading-snug pr-16">{skill.name}</p>
                    {skill.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">{skill.description}</p>
                    )}
                      {skill.platform_hint && (
                        <PlatformHintTag hint={skill.platform_hint} />
                      )}
                    {/* 操作按钮：hover 时绝对定位在右上角 */}
                    <div className="absolute top-2.5 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); revealInFinder(skill.path); }}
                        className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                        title="在 Finder 中显示"
                      >
                        <FolderOpen size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleImport(skill); }}
                        className="p-1.5 rounded bg-purple-100 text-purple-600 hover:bg-purple-200 hover:text-purple-700"
                        title="导入到中央库"
                      >
                        <PackagePlus size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <FolderOpen size={32} className="mb-2 opacity-30" />
            <p className="text-sm">从左侧选择一个项目</p>
          </div>
        )}

        {error && (
          <div className="m-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
        )}
      </div>

      {/* 右栏：Markdown 预览面板 */}
      {selectedSkill && (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* 面板 header */}
          <div className="px-4 pt-3 pb-0 border-b shrink-0">
            {/* 第一行：标题 + 操作按钮 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileText size={13} className="text-gray-400 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-900 truncate">{selectedSkill.name}</h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => revealInFinder(selectedSkill.path)}
                  className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  title="在 Finder 中显示"
                >
                  <FolderOpen size={13} />
                </button>
                <button
                  onClick={() => handleImport(selectedSkill)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700"
                >
                  <PackagePlus size={12} />
                  导入到中央技能库
                </button>
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            {/* 描述全宽 */}
            {selectedSkill.description && (
              <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-snug">{selectedSkill.description}</p>
            )}
            {/* 路径（在 tag 上方） */}
            <p className="text-[10px] text-gray-400 font-mono mt-1 truncate">{selectedSkill.path}</p>
            {/* platform tag */}
            {selectedSkill.platform_hint && (
              <div className="mb-3">
                <PlatformHintTag hint={selectedSkill.platform_hint} />
              </div>
            )}
            {!selectedSkill.platform_hint && <div className="mb-3" />}
          </div>

          {/* Markdown 内容 */}
          <div className="flex-1 overflow-y-auto">
            {mdLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                加载中...
              </div>
            ) : markdown ? (
              <div className="px-4 py-4">
                <MarkdownPreview content={markdown} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400">
                <FileText size={24} className="mb-2 opacity-30" />
                <p className="text-sm">无法读取 SKILL.md</p>
                <p className="text-xs mt-1 font-mono">{selectedSkill.path}/SKILL.md</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    {importModalSkill && (
      <ImportToCentralModal
        skills={[importModalSkill]}
        allowLink
        onClose={(imported) => {
          setImportModalSkill(null);
          if (imported) void reloadCentral();
        }}
      />
    )}
    </>
  );
}
