import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useThemeStore } from '@/stores/themeStore';

interface CodeFilePreviewProps {
  filename: string;
  content: string;
  language?: string;
}

// Monaco 语言 ID 修正
const MONACO_LANG_OVERRIDE: Record<string, string> = {
  bash: 'shell',
  text: 'plaintext',
};

function toMonacoLanguage(language: string | undefined): string {
  if (!language) return 'plaintext';
  return MONACO_LANG_OVERRIDE[language] ?? language;
}

function resolveIsDark(mode: 'light' | 'dark' | 'system'): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function CodeFilePreview({ content, language }: CodeFilePreviewProps) {
  const { mode } = useThemeStore();
  const [isDark, setIsDark] = useState(() => resolveIsDark(mode));

  // 当主题模式变化，或系统偏好变化时同步更新
  useEffect(() => {
    setIsDark(resolveIsDark(mode));

    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const monacoLang = toMonacoLanguage(language);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={monacoLang}
          value={content}
          theme={isDark ? 'vs-dark' : 'vs'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineHeight: 20,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            lineNumbers: 'on',
            wordWrap: 'on',
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
            },
            padding: { top: 12, bottom: 12 },
            contextmenu: false,
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
            renderValidationDecorations: 'off',
          }}
          loading={
            <div className="flex items-center justify-center h-full text-gray-400 text-sm bg-white dark:bg-gray-900">
              加载编辑器...
            </div>
          }
        />
      </div>
    </div>
  );
}
