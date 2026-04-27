/**
 * Platform & data-source icon registry.
 *
 * Each entry is either:
 *  - { type: 'img', src }           — image file, fills container, no padding
 *  - { type: 'img', src, bg, pad }  — image file on a coloured bg with padding
 *  - { type: 'svg', component }     — inline SVG that already fills its viewBox
 *  - { type: 'initial', letter, bg } — auto-generated coloured letter badge
 *
 * PlatformIcon is the single rendering component. It owns:
 *  - fixed size (width × height)
 *  - rounded corners
 *  - subtle inset ring border
 */

import React, { useId } from 'react';
import { cn } from '@/lib/utils';

// ── Registry entry types ──────────────────────────────────────────────────────

type ImgEntry     = { type: 'img'; src: string; alt: string; bg?: string; pad?: number };
type SvgEntry     = { type: 'svg'; component: React.ComponentType<{ size: number }> };
type InitialEntry = { type: 'initial'; letter: string; bg: string; fg?: string };
type IconEntry    = ImgEntry | SvgEntry | InitialEntry;

// ── Inline SVG components (must accept a `size` prop) ────────────────────────

function LegacyCentralFolderIcon({ size }: { size: number }) {
  const fontSize = Math.max(8, Math.round(size * 0.55));
  return (
    <span
      className="inline-flex select-none items-center justify-center rounded-[2.5px] bg-slate-400 text-white dark:bg-zinc-500"
      style={{
        width: size,
        height: size,
        fontSize,
        fontWeight: 700,
        lineHeight: 1,
        fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      旧
    </span>
  );
}

function CodeBuddySvg({ size }: { size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clipId = `cb-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath={`url(#${clipId})`}>
        <rect x="-0.001" width="40" height="40" rx="8.632" fill="#6C4DFF" />
        <path d="M30.5918 3.12856C30.984 2.77679 31.0078 2.7632 31.2955 2.74593C31.7615 2.71193 32.1882 2.93586 32.9147 3.59728C34.6119 5.13959 36.9755 8.30995 38.4449 11.0177L39.0125 12.0691L39.8143 12.4677C40.5885 12.8589 41.8587 13.6611 42.389 14.0913C42.6286 14.2894 42.6626 14.2934 42.912 14.1964C44.0375 13.7583 45.6494 14.3393 47.0714 15.7033C48.3516 16.9303 49.5781 19.0269 50.0478 20.7767C50.1164 21.0582 50.2074 21.6636 50.2405 22.1144C50.3477 23.6973 49.84 24.9617 48.8624 25.5341C48.6628 25.6493 48.6492 25.6807 48.6548 26.1783C48.6998 28.5492 48.0606 30.9165 46.7768 33.2244C45.3276 35.8156 42.7467 38.496 39.2544 41.0214C37.3789 42.3862 32.9421 44.9717 30.9361 45.8792C26.1304 48.0428 22.278 48.8718 18.9316 48.4618C16.9356 48.22 14.6761 47.4417 13.3392 46.5373C12.9873 46.294 12.9318 46.2791 12.6629 46.3561C11.2318 46.7671 9.35752 45.9219 7.76528 44.1544C7.13027 43.448 6.10508 41.7136 5.77273 40.7853C5.00409 38.6128 5.15721 36.6516 6.18105 35.4808C6.44522 35.1797 6.4538 35.1667 6.39603 34.6598C6.30065 33.8298 6.25703 32.6017 6.30061 31.809L6.33535 31.0683L5.22371 29.1019C3.50212 26.0386 2.40857 23.4663 1.98661 21.501C1.76389 20.4233 1.77634 19.9446 2.05091 19.5908C2.21741 19.3773 2.76347 19.1568 3.42155 19.0352C5.07869 18.7442 8.69327 19.0065 12.7142 19.7165L13.1316 19.789L14.0497 18.977C15.5733 17.6274 16.5858 16.8705 18.4518 15.707C20.3967 14.4901 22.5922 13.4895 25.064 12.6968L25.8564 12.4423L26.2926 11.2974C27.8535 7.17701 29.452 4.13917 30.5918 3.12856ZM17.5169 24.2439C15.7528 25.2625 14.8705 25.7716 14.2223 26.3423C11.5975 28.6536 10.6172 32.3151 11.7346 35.6292C12.0106 36.4475 12.5193 37.3301 13.5378 39.0941C14.5563 40.8582 15.0662 41.7401 15.637 42.3882C17.9483 45.0128 21.6091 45.9938 24.923 44.8764C25.7414 44.6004 26.6233 44.0909 28.3875 43.0724L38.5362 37.213C40.3004 36.1945 41.1826 35.6854 41.8308 35.1147C44.4555 32.8034 45.4363 29.1426 44.319 25.8286C44.043 25.0103 43.5343 24.1277 42.5158 22.3637C41.4974 20.5997 40.9873 19.7177 40.4166 19.0696C38.1053 16.4448 34.4441 15.4631 31.1301 16.5806C30.3118 16.8565 29.4297 17.3661 27.6656 18.3846L17.5169 24.2439Z" fill="white" />
        <rect x="18.4944" y="31.334" width="4.009" height="8.326" rx="2.005" transform="rotate(-30 18.4944 31.334)" fill="white" />
        <rect x="29.311" y="25.09" width="4.009" height="8.326" rx="2.005" transform="rotate(-30 29.311 25.09)" fill="white" />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect x="-0.001" width="40" height="40" rx="8.632" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}


// ── Icon registry ─────────────────────────────────────────────────────────────
// pad: inner padding as fraction of size (e.g. 0.15 = 15% each side → 70% content)

const ICON_REGISTRY: Record<string, IconEntry> = {
  // AI 编辑器
  cursor:    { type: 'img', src: '/platform-icons/cursor.png',   alt: 'Cursor'   },
  trae:      { type: 'img', src: '/platform-icons/trae.png',     alt: 'Trae'     },
  windsurf:  { type: 'img', src: '/platform-icons/windsurf.svg', alt: 'Windsurf' },
  qoder:     { type: 'img', src: '/platform-icons/qoder.svg',    alt: 'Qoder'    },
  codebuddy: { type: 'svg', component: CodeBuddySvg },
  kiro:      { type: 'img', src: '/platform-icons/kiro.svg',     alt: 'Kiro'     },
  // AI 助手
  claude:    { type: 'img', src: '/platform-icons/claude.svg',   alt: 'Claude'   },
  openai:    { type: 'img', src: '/platform-icons/codex.png',    alt: 'Codex'    },
  gemini:    { type: 'img', src: '/platform-icons/gemini.svg',   alt: 'Gemini'   },
  qwen:      { type: 'img', src: '/platform-icons/qwen.svg',     alt: 'Qwen'     },
  opencode:  { type: 'img', src: '/platform-icons/opencode.png', alt: 'OpenCode' },
  hermes:    { type: 'img', src: '/platform-icons/hermes.png',   alt: 'Hermes'   },
  // Data sources
  skillhub:          { type: 'img', src: '/platform-icons/skillhub.png',         alt: 'SkillHub' },
  clawhub:           { type: 'img', src: '/platform-icons/clawhub.png',           alt: 'ClawHub'  },
  official_registry: { type: 'img', src: '/platform-icons/github.svg',            alt: 'GitHub'   },
  skillsmp:          { type: 'img', src: '/platform-icons/skillsmp.svg',           alt: 'Skillsmp' },
  github:            { type: 'img', src: '/platform-icons/github.svg',             alt: 'GitHub'   },
  'skillhub-iflytek': { type: 'img', src: '/platform-icons/skillhub-iflytek.svg', alt: 'iflytek/skillhub' },
  legacy_central: { type: 'svg', component: LegacyCentralFolderIcon },
};

// 平台 ID → 图标 key 映射（当平台 ID 与图标 key 不同时使用）
const PLATFORM_ICON_MAP: Record<string, string> = {
  'claude-code':    'claude',
  'codex-cli':      'openai',
  'gemini-cli':     'gemini',
  'trae-cn':        'trae',
  'cursor-cursor':  'cursor',
  '__legacy_central__': 'legacy_central',
};

function getEntry(key: string | undefined): IconEntry {
  if (!key) return { type: 'initial', letter: '?', bg: '#6b7280' };
  const normalized = PLATFORM_ICON_MAP[key.toLowerCase()] ?? key.toLowerCase();
  const found = ICON_REGISTRY[normalized];
  if (found) return found;
  const letter = key.charAt(0).toUpperCase();
  const hue = (key.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 47) % 360;
  return { type: 'initial', letter, bg: `hsl(${hue},55%,45%)` };
}

/** Renders a platform icon at the given size with unified border + rounding. */
export function PlatformIcon({
  iconKey,
  size = 16,
  className,
}: {
  iconKey?: string;
  size?: number;
  className?: string;
}) {
  const entry = getEntry(iconKey);

  let content: React.ReactNode;

  if (entry.type === 'svg') {
    content = <entry.component size={size} />;
  } else if (entry.type === 'initial') {
    const { letter, bg, fg = '#fff' } = entry;
    content = (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="16" height="16" rx="3.5" fill={bg} />
        <text x="8" y="11.5" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="system-ui, sans-serif" fill={fg}>
          {letter}
        </text>
      </svg>
    );
  } else {
    // img entry
    const { src, alt, bg = '#fff', pad = 0 } = entry;
    const inset = Math.round(size * pad);
    const imgSize = size - inset * 2;
    content = bg ? (
      <span
        className="flex items-center justify-center"
        style={{ width: size, height: size, background: bg }}
      >
        <img src={src} alt={alt} width={imgSize} height={imgSize} className="block object-contain" draggable={false} />
      </span>
    ) : (
      <img src={src} alt={alt} width={size} height={size} className="block object-contain" draggable={false} />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] align-middle',
        'ring-1 ring-inset ring-black/10 dark:ring-white/15',
        className
      )}
      style={{ width: size, height: size }}
    >
      {content}
    </span>
  );
}

/** @deprecated Use PlatformIcon directly. */
export function getPlatformIcon(key: string | undefined) {
  return (props: { size?: number }) => <PlatformIcon iconKey={key} size={props.size} />;
}
