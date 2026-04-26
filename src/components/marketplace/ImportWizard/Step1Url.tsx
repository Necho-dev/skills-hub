import { useState } from 'react';
import { GitBranch, Info } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';

const GITHUB_TREE_PATTERN = /https:\/\/github\.com\/[^/]+\/[^/]+\/(?:tree|blob)\/.+/;

export function Step1Url() {
  const {
    wizardRepo,
    wizardSkillsRoot,
    setWizardRepo,
    setWizardSkillsRoot,
    fetchWizardPreview,
    wizardPreviewLoading,
  } = useMarketplaceStore();
  const [localRepo, setLocalRepo] = useState(wizardRepo);
  const [localRoot, setLocalRoot] = useState(wizardSkillsRoot);

  const isTreeUrl = GITHUB_TREE_PATTERN.test(localRepo.trim());

  const handleNext = () => {
    setWizardRepo(localRepo.trim());
    setWizardSkillsRoot(localRoot);
    fetchWizardPreview();
  };

  return (
    <div className="flex flex-col h-full">
      {/* 内容区可滚动 */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">GitHub 仓库地址</label>
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-purple-300">
            <GitBranch size={15} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={localRepo}
              onChange={(e) => setLocalRepo(e.target.value)}
              placeholder="https://github.com/owner/repo/tree/main/skills/my-skill 或 owner/repo"
              className="flex-1 text-sm outline-none text-gray-800 placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-col gap-1 text-xs text-gray-400">
            <span>支持三种格式：</span>
            <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">owner/repo</span>
            <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">https://github.com/owner/repo</span>
            <span className="font-mono bg-gray-50 px-2 py-0.5 rounded">https://github.com/owner/repo/tree/branch/path/to/skill</span>
          </div>
        </div>

        {/* 当输入 tree URL 时，隐藏 skills_root 输入（自动从 URL 推断） */}
        {!isTreeUrl && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">技能根目录</label>
            <input
              type="text"
              value={localRoot}
              onChange={(e) => setLocalRoot(e.target.value)}
              placeholder="skills/"
              className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300 text-gray-800"
            />
            <p className="text-xs text-gray-400">仓库内包含技能子目录的路径</p>
          </div>
        )}

        {isTreeUrl && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              已识别为 GitHub tree URL，将自动检测路径类型：
              <br />· 若路径含 SKILL.md → 直接安装该单个技能
              <br />· 否则 → 列出所有子技能目录供选择
            </span>
          </div>
        )}
      </div>

      {/* 底部操作栏，固定在弹窗底部 */}
      <div className="flex justify-end items-center px-6 py-3 border-t bg-white shrink-0">
        <button
          onClick={handleNext}
          disabled={!localRepo.trim() || wizardPreviewLoading}
          className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {wizardPreviewLoading ? '解析中...' : '下一步 →'}
        </button>
      </div>
    </div>
  );
}
