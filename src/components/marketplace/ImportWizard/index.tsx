import { X, ChevronRight } from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { Step1Url } from './Step1Url';
import { Step2Preview } from './Step2Preview';
import { Step3Confirm } from './Step3Confirm';
import { Step4Result } from './Step4Result';
import { cn } from '@/lib/utils';

const STEPS = ['仓库地址', '预览', '确认', '结果'];

export function ImportWizard() {
  const { wizardOpen, wizardStep, closeWizard } = useMarketplaceStore();

  if (!wizardOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">GitHub 仓库安装</h2>
            <p className="text-xs text-gray-500 mt-0.5">从 GitHub 仓库浏览并安装技能到中央技能库</p>
          </div>
          <button onClick={closeWizard} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 py-3 border-b bg-gray-50/50 gap-2">
          {STEPS.map((label, i) => {
            const step = (i + 1) as 1 | 2 | 3 | 4;
            const active = wizardStep === step;
            const done = wizardStep > step;
            return (
              <div key={step} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-medium',
                      active ? 'bg-purple-600 text-white' :
                      done ? 'bg-purple-100 text-purple-600' :
                      'bg-gray-200 text-gray-500'
                    )}
                  >
                    {step}
                  </span>
                  <span className={cn(
                    'text-xs',
                    active ? 'text-purple-600 font-medium' :
                    done ? 'text-purple-400' : 'text-gray-400'
                  )}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} className="text-gray-300" />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-hidden">
          {wizardStep === 1 && <Step1Url />}
          {wizardStep === 2 && <Step2Preview />}
          {wizardStep === 3 && <Step3Confirm />}
          {wizardStep === 4 && <Step4Result />}
        </div>
      </div>
    </div>
  );
}
