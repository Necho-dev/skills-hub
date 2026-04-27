import { useState } from 'react';
import {
  SquaresExclude, FolderSymlink, FolderPlus, FolderClock,
  Loader2, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { migrateCentralDir } from '@/lib/tauri';
import { batchUpdateSkillPaths, batchUpdateInstallPaths, getAllPlatforms } from '@/lib/db';
import { useSettingsStore, contractToDisplay } from '@/stores/settingsStore';
import { useCentralSkillsStore } from '@/stores/centralSkillsStore';

const OLD_PATH = '$HOME/.agent/skills';
const NEW_PATH = '$HOME/.skillshub/skills';

type Step = 'choose' | 'migrating' | 'done';

interface MigrateResult {
  moved: number;
  relinked: number;
  errors: string[];
}

interface Props {
  onClose: () => void;
}

export function CentralDirSetupModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);

  const { confirmSetup, setCentralDir } = useSettingsStore();
  const { load: reloadCentral } = useCentralSkillsStore();

  const handleMigrate = async () => {
    setStep('migrating');
    try {
      const allPlatforms = await getAllPlatforms();
      const platformPaths = allPlatforms.map((p) => p.skills_path);

      const report = await migrateCentralDir(OLD_PATH, NEW_PATH, platformPaths);

      if (report.results.length > 0) {
        const skillPathUpdates = report.results
          .filter((r) => r.new_path)
          .map((r) => ({ skillId: r.skill_id, newPath: r.new_path }));
        if (skillPathUpdates.length > 0) await batchUpdateSkillPaths(skillPathUpdates);

        const installUpdates = report.results.flatMap((r) =>
          r.relinked_platforms
            .map((platformPath) => {
              const platform = allPlatforms.find((p) => p.skills_path === platformPath);
              if (!platform) return null;
              return {
                skillId: r.skill_id,
                platformId: platform.id,
                newSymlinkPath: `${platformPath}/${r.skill_id}`,
              };
            })
            .filter(Boolean) as { skillId: string; platformId: string; newSymlinkPath: string }[]
        );
        if (installUpdates.length > 0) await batchUpdateInstallPaths(installUpdates);
      }

      await setCentralDir(NEW_PATH);
      await confirmSetup(false);
      await reloadCentral();

      setMigrateResult({ moved: report.moved, relinked: report.relinked, errors: report.errors });
      setStep('done');
    } catch (e) {
      toast.error(`技能路径迁移操作失败：${String(e)}`);
      setStep('choose');
    }
  };

  const handleUseNew = async () => {
    await confirmSetup(false);
    onClose();
  };

  const handleKeepLegacy = async () => {
    await confirmSetup(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* 头部 */}
        <div className="px-6 pt-6 pb-4 border-b dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mt-0.5">
              <SquaresExclude size={18} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">检测到旧版技能库</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-snug">
              SkillsHub 已将默认中央技能库路径调整至新位置，自动扫描发现旧目录中仍有技能文件，请选择如何处理这些技能文件！
              </p>
            </div>
          </div>
        </div>

        {/* 内容区 */}
        <div className="px-6 py-5">

          {step === 'choose' && (
            <div className="flex flex-col gap-2.5">
              {/* 路径对比 */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3.5 text-xs font-mono space-y-2 mb-0.5">
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500">旧</span>
                  <span className="truncate">{contractToDisplay(OLD_PATH)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400">新</span>
                  <span className="truncate">{contractToDisplay(NEW_PATH)}</span>
                </div>
              </div>

              {/* 选项：迁移到新路径（推荐） */}
              <button
                onClick={() => void handleMigrate()}
                className="flex items-start gap-3 text-left border rounded-xl p-3.5 hover:border-purple-300 hover:bg-purple-50/60 dark:hover:bg-purple-900/10 dark:border-gray-700 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/60 transition-colors">
                  <FolderSymlink size={15} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">迁移技能到新路径</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-600 text-white leading-none shrink-0">推荐</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                    这将把旧目录中的技能文件移动到新的中央技能库目录，自动重建已分发的 Symlink 符号链接，不影响正常使用
                  </p>
                </div>
              </button>

              {/* 选项：直接使用新路径 */}
              <button
                onClick={() => void handleUseNew()}
                className="flex items-start gap-3 text-left border rounded-xl p-3.5 hover:border-orange-300 hover:bg-orange-50/60 dark:hover:bg-orange-900/10 dark:border-gray-700 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-orange-200 dark:group-hover:bg-orange-900/60 transition-colors">
                  <FolderPlus size={15} className="text-orange-500 dark:text-orange-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">直接使用新路径</span>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                    这将直接忽略旧的技能目录，在新路径中新建中央技能库，旧的技能文件不会被删除，您可以在稍后手动进行处理
                  </p>
                </div>
              </button>

              {/* 选项：继续使用旧路径 */}
              <button
                onClick={() => void handleKeepLegacy()}
                className="flex items-start gap-3 text-left border rounded-xl p-3.5 hover:border-teal-300 hover:bg-teal-50/60 dark:hover:bg-teal-900/10 dark:border-gray-700 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-teal-200 dark:group-hover:bg-teal-900/60 transition-colors">
                  <FolderClock size={15} className="text-teal-600 dark:text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">继续使用旧路径</span>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                    这将保持中央技能库目录 {contractToDisplay(OLD_PATH)} 不变，技能数据和已配置的 Symlink 符号链接均无需调整
                  </p>
                </div>
              </button>

              {/* 底部提示 */}
              <div className="flex items-start gap-1.5 mt-0.5 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50">
                <Info size={12} className="shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" />
                <span className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
                  此提示仅出现一次，如需重新配置，请前往设置 › 中央技能库进行操作
                </span>
              </div>
            </div>
          )}

          {step === 'migrating' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 size={28} className="animate-spin text-purple-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">迁移中，请勿关闭窗口...</p>
              <p className="text-xs text-gray-400">正在移动技能文件并重建符号链接</p>
            </div>
          )}

          {step === 'done' && migrateResult && (
            <div className="flex flex-col gap-3">
              <div className={cn(
                'rounded-xl p-4',
                migrateResult.errors.length > 0
                  ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
                  : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              )}>
                <div className="flex items-center gap-2 mb-1.5">
                  {migrateResult.errors.length > 0
                    ? <AlertTriangle size={15} className="text-orange-500 shrink-0" />
                    : <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0" />
                  }
                  <span className={cn(
                    'text-sm font-medium',
                    migrateResult.errors.length > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-green-700 dark:text-green-400'
                  )}>
                    {migrateResult.errors.length === 0 ? '技能路径迁移完成' : '技能路径迁移完成（但有错误）'}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  已迁移 {migrateResult.moved} 个技能，重建 {migrateResult.relinked} 个符号链接
                  {migrateResult.errors.length > 0 && `，${migrateResult.errors.length} 个错误`}
                </p>
                {migrateResult.errors.length > 0 && (
                  <ul className="mt-2 space-y-0.5 max-h-20 overflow-y-auto text-[11px] text-orange-600 dark:text-orange-400">
                    {migrateResult.errors.map((e, i) => (
                      <li key={i} className="truncate">· {e}</li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                若迁移不完整，可在设置 › 技能库中重新扫描修复
              </p>
              <button
                onClick={onClose}
                className="mt-1 w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
              >
                完成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
