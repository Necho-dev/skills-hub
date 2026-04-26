import { CheckCircle } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';

export function Step4Result() {
  const { closeWizard } = useMarketplaceStore();

  return (
    <div className="p-6 flex flex-col items-center justify-center gap-4 h-full">
      <CheckCircle size={48} className="text-green-500" />
      <h3 className="text-lg font-semibold text-gray-800">安装完成</h3>
      <p className="text-sm text-gray-500 text-center">
        技能已成功安装到中央库，你可以在「中央技能库」中查看并分发到各平台。
      </p>
      <button
        onClick={closeWizard}
        className="px-6 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
      >
        完成
      </button>
    </div>
  );
}
