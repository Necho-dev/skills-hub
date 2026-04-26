import { useState } from 'react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { executeGithubImport, onImportProgress, patchSkillMeta } from '@/lib/tauri';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';
import { toast } from 'sonner';
import type { ImportPreviewItem } from '@/types';

export function Step3Confirm() {
  const { wizardPreviewItems, wizardRepo, wizardSkillsRoot, setWizardStep } = useMarketplaceStore();
  const { load: reloadCentral } = useCentralSkillsStore();
  const [executing, setExecuting] = useState(false);

  const toImport = wizardPreviewItems.filter((i) => i.action === 'import');
  const toOverwrite = wizardPreviewItems.filter((i) => i.action === 'overwrite');
  const toSkip = wizardPreviewItems.filter((i) => i.action === 'skip');

  const handleExecute = async () => {
    setExecuting(true);
    const activeItems = [...toImport, ...toOverwrite];

    const unlisten = await onImportProgress((progress) => {
      console.log('Import progress:', progress);
    });

    try {
      await executeGithubImport(wizardRepo, wizardSkillsRoot, activeItems as ImportPreviewItem[]);
      // 写入 GitHub 来源元数据到每个已安装技能的 frontmatter
      const repoBaseUrl = `https://github.com/${wizardRepo.replace(/^https?:\/\/github\.com\//, '')}`;
      await Promise.allSettled(
        activeItems.map((item) => {
          const meta: Record<string, string> = {
            source_url: wizardSkillsRoot
              ? `${repoBaseUrl}/tree/main/${wizardSkillsRoot}/${item.id}`
              : `${repoBaseUrl}/tree/main/${item.id}`,
          };
          return patchSkillMeta(item.id, meta);
        })
      );
      await reloadCentral();
      toast.success(`成功安装 ${activeItems.length} 个技能`);
      setWizardStep(4);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setExecuting(false);
      unlisten();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 内容区可滚动 */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <h3 className="text-sm font-semibold text-gray-800">确认安装计划</h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{toImport.length}</p>
            <p className="text-xs text-gray-500 mt-1">将新建安装</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{toOverwrite.length}</p>
            <p className="text-xs text-gray-500 mt-1">将覆盖写入</p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-gray-400">{toSkip.length}</p>
            <p className="text-xs text-gray-500 mt-1">将跳过</p>
          </div>
        </div>

        {toOverwrite.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-xs text-orange-700 font-medium mb-2">以下技能将被覆盖（原数据会丢失）：</p>
            {toOverwrite.map((item) => (
              <p key={item.id} className="text-xs text-orange-600 font-mono">{item.id}</p>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏，固定在弹窗底部 */}
      <div className="flex justify-between items-center px-6 py-3 border-t bg-white shrink-0">
        <button
          onClick={() => setWizardStep(2)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回
        </button>
        <button
          onClick={handleExecute}
          disabled={executing || (toImport.length + toOverwrite.length) === 0}
          className="px-5 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {executing ? '安装中...' : '开始安装'}
        </button>
      </div>
    </div>
  );
}
