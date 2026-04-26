import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { Sidebar } from './components/layout/Sidebar';
import { CentralLibrary } from './pages/CentralLibrary';
import { ProjectLibrary } from './pages/ProjectLibrary';
import { Marketplace } from './pages/Marketplace';
import { Collections } from './pages/Collections';
import { Settings } from './pages/Settings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ImportToCentralModal } from './components/skills/ImportToCentralModal';
import { useCentralSkillsStore } from './stores/centralSkillsStore';
import { usePlatformStore } from './stores/platformStore';
import { useCollectionStore } from './stores/collectionStore';
import { useProjectSkillsStore } from './stores/projectSkillsStore';
import { initCentralDir, scanPlatformNativeSkills } from './lib/tauri';
import { getPlatforms, getAppSetting, setAppSetting } from './lib/db';
import type { NavPage, NativeSkill } from './types';

function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('central');
  const { load: loadCentral } = useCentralSkillsStore();
  const { load: loadPlatforms } = usePlatformStore();
  const { load: loadCollections } = useCollectionStore();
  const { scan: scanProjects } = useProjectSkillsStore();
  const [onboardingSkills, setOnboardingSkills] = useState<NativeSkill[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        await initCentralDir();
        await loadPlatforms();
        // 并行启动：中央库加载 + 项目技能库预热扫描 + 集合加载
        await Promise.all([
          loadCentral(),
          scanProjects(),
          loadCollections(),
        ]);
      } catch (e) {
        console.error('App init error:', e);
      }

      // 首次启动平台技能扫描（不阻塞主加载流程）
      const checkOnboarding = async () => {
        try {
          const done = await getAppSetting('platform_scan_done');
          if (done) return;
          const plats = await getPlatforms();
          const enabled = plats.filter((p) => p.enabled);
          if (enabled.length === 0) {
            await setAppSetting('platform_scan_done', '1');
            return;
          }
          const natives = await scanPlatformNativeSkills(
            enabled.map((p) => ({ id: p.id, path: p.skills_path, name: p.name }))
          );
          if (natives.length > 0) {
            setOnboardingSkills(natives);
          } else {
            await setAppSetting('platform_scan_done', '1');
          }
        } catch (e) {
          console.error('Onboarding scan error:', e);
          // 静默失败，不影响主流程
        }
      };
      void checkOnboarding();
    };
    init();
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'central': return <ErrorBoundary><CentralLibrary /></ErrorBoundary>;
      case 'projects': return <ErrorBoundary><ProjectLibrary /></ErrorBoundary>;
      case 'marketplace': return <ErrorBoundary><Marketplace /></ErrorBoundary>;
      case 'collections': return <ErrorBoundary><Collections /></ErrorBoundary>;
      case 'settings': return <ErrorBoundary><Settings /></ErrorBoundary>;
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950 overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {renderPage()}
      </main>
      <Toaster position="bottom-right" richColors closeButton />
      {onboardingSkills.length > 0 && (
        <ImportToCentralModal
          skills={onboardingSkills}
          onClose={async (imported) => {
            setOnboardingSkills([]);
            await setAppSetting('platform_scan_done', '1');
            if (imported) loadCentral();
          }}
        />
      )}
    </div>
  );
}

export default App;
