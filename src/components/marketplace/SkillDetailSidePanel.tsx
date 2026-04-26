import { X, Star, Download, GitFork, ExternalLink, Shield, Loader2 } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { cn } from '@/lib/utils';
import { openUrl } from '@tauri-apps/plugin-opener';

export function SkillDetailSidePanel() {
  const { selectedItem, detailData, detailLoading, sources, setSelectedItem, openWizard, setWizardRepo, enqueueInstall, installQueue } =
    useMarketplaceStore();

  if (!selectedItem) return null;

  const source = sources.find((s) => s.id === selectedItem.source_id);
  const isSkillsmp = source?.type === 'skillsmp';
  const isSkillHub = source?.type === 'skillhub';

  const isQueued = (slug: string) =>
    installQueue.some((t) => t.slug === slug && (t.status === 'pending' || t.status === 'installing'));

  const handleInstall = () => {
    if (isSkillsmp && selectedItem.github_url) {
      setWizardRepo(selectedItem.github_url);
      openWizard(selectedItem.github_url);
    } else {
      enqueueInstall([{ item: selectedItem, overwrite: false }]);
    }
    setSelectedItem(null);
  };

  const handleOpenExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      // no-op if opener plugin unavailable
    }
  };

  const externalUrl = isSkillsmp
    ? (selectedItem.github_url ?? null)
    : isSkillHub
    ? `https://skillhub.cn/skills/${selectedItem.slug}`
    : null;

  const description =
    (detailData?.skill?.summary_zh || detailData?.skill?.summary) ??
    selectedItem.description;

  const sourceLabel =
    source?.name ??
    selectedItem.source_id;

  const securityReports = detailData?.securityReports;
  const hasSecurityReports =
    isSkillHub && detailData && securityReports && Object.keys(securityReports).length > 0;

  const downloading = isQueued(selectedItem.slug);

  return (
    <div className="h-full flex flex-col bg-white border-l overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {selectedItem.author_avatar ? (
              <img
                src={selectedItem.author_avatar}
                alt={selectedItem.author ?? ''}
                className="w-6 h-6 rounded-full shrink-0"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {(selectedItem.author ?? selectedItem.name)[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-xs text-gray-500 truncate">
              {selectedItem.author ?? '未知作者'}
            </span>
          </div>
          <h2 className="text-base font-semibold text-gray-900 leading-snug">
            {selectedItem.name}
          </h2>
          {(selectedItem.version || detailData?.latestVersion?.version) && (
            <span className="text-xs text-gray-400 mt-0.5 block">
              v{selectedItem.version ?? detailData?.latestVersion?.version}
            </span>
          )}
        </div>
        <button
          onClick={() => setSelectedItem(null)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md shrink-0 mt-0.5"
        >
          <X size={16} />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 px-5 py-3 border-b shrink-0">
        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {sourceLabel}
        </span>
        {selectedItem.downloads != null && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Download size={11} />
            {selectedItem.downloads >= 1000
              ? `${(selectedItem.downloads / 1000).toFixed(1)}k`
              : selectedItem.downloads}
          </span>
        )}
        {selectedItem.stars != null && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Star size={11} />
            {selectedItem.stars >= 1000
              ? `${(selectedItem.stars / 1000).toFixed(1)}k`
              : selectedItem.stars}
          </span>
        )}
        {selectedItem.forks != null && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <GitFork size={11} />
            {selectedItem.forks >= 1000
              ? `${(selectedItem.forks / 1000).toFixed(1)}k`
              : selectedItem.forks}
          </span>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Loading state */}
        {detailLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={12} className="animate-spin" />
            正在加载详情...
          </div>
        )}

        {/* Description */}
        {description && (
          <div>
            <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
          </div>
        )}

        {/* Tags */}
        {Array.isArray(selectedItem.tags) && selectedItem.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedItem.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Changelog (SkillHub) */}
        {detailData?.latestVersion?.changelog && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              更新日志
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
              {detailData.latestVersion.changelog}
            </p>
          </div>
        )}

        {/* Security reports (SkillHub only) */}
        {hasSecurityReports && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Shield size={12} />
              安全报告
            </h4>
            <div className="space-y-2">
              {securityReports?.keen && (
                <SecurityReportRow
                  label="腾讯安全"
                  status={securityReports.keen.status}
                  statusText={securityReports.keen.statusText}
                  reportUrl={securityReports.keen.reportUrl}
                  onOpen={handleOpenExternal}
                />
              )}
              {securityReports?.sanbu && (
                <SecurityReportRow
                  label="三步检测"
                  status={securityReports.sanbu.status}
                  statusText={securityReports.sanbu.statusText}
                  reportUrl={securityReports.sanbu.reportUrl}
                  onOpen={handleOpenExternal}
                />
              )}
            </div>
          </div>
        )}

        {/* External links */}
        {externalUrl && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              来源链接
            </h4>
            <button
              onClick={() => handleOpenExternal(externalUrl)}
              className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              <ExternalLink size={13} />
              {isSkillsmp ? '在 GitHub 查看' : '在 SkillHub 查看'}
            </button>
          </div>
        )}
      </div>

      {/* Install button */}
      <div className="px-5 py-4 border-t shrink-0">
        <button
          onClick={handleInstall}
          disabled={downloading}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors',
            downloading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
        >
          {downloading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              安装中...
            </>
          ) : isSkillsmp ? (
            <>
              <ExternalLink size={14} />
              通过 GitHub 安装
            </>
          ) : (
            <>
              <Download size={14} />
              安装到中央库
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface SecurityReportRowProps {
  label: string;
  status: string;
  statusText: string;
  reportUrl: string;
  onOpen: (url: string) => void;
}

function SecurityReportRow({ label, status, statusText, reportUrl, onOpen }: SecurityReportRowProps) {
  const isSafe = status === 'safe' || status === 'pass';
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            isSafe ? 'bg-green-500' : 'bg-yellow-500'
          )}
        />
        <span className="text-gray-600">{label}</span>
        <span className={cn('text-xs', isSafe ? 'text-green-600' : 'text-yellow-600')}>
          {statusText}
        </span>
      </div>
      {reportUrl && (
        <button
          onClick={() => onOpen(reportUrl)}
          className="text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
        >
          查看报告
          <ExternalLink size={10} />
        </button>
      )}
    </div>
  );
}
