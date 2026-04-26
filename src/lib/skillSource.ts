import { createElement } from 'react';
import { ServerCrash, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SkillSourceConfig {
  label: string;
  icon: ReactNode;
  /** 带边框/背景的完整 badge 样式（用于详情面板 Tag） */
  className: string;
  /** 仅文字颜色，无背景无边框（用于列表行内标注） */
  textClassName: string;
}

function imgIcon(src: string, alt: string, size = 9): ReactNode {
  return createElement('img', {
    src,
    alt,
    width: size,
    height: size,
    style: { display: 'inline-block', borderRadius: 2, objectFit: 'contain' },
  });
}

export const SOURCE_CONFIG: Record<string, SkillSourceConfig> = {
  local: {
    label: '本地',
    icon: createElement(ServerCrash, { size: 9 }),
    className: 'bg-gray-50 text-gray-500 border-gray-200',
    textClassName: 'text-gray-400',
  },
  marketplace: {
    label: '技能市场',
    icon: createElement(ShoppingBag, { size: 9 }),
    className: 'bg-blue-50 text-blue-600 border-blue-200',
    textClassName: 'text-blue-500',
  },
  skillhub: {
    label: 'SkillHub',
    icon: imgIcon('/platform-icons/skillhub.png', 'SkillHub'),
    className: 'bg-purple-50 text-purple-600 border-purple-200',
    textClassName: 'text-purple-500',
  },
  clawhub: {
    label: 'ClawHub',
    icon: imgIcon('/platform-icons/clawhub.png', 'ClawHub'),
    className: 'bg-pink-50 text-pink-600 border-pink-200',
    textClassName: 'text-pink-500',
  },
  skillsmp: {
    label: 'Skillsmp',
    icon: imgIcon('/platform-icons/skillsmp.svg', 'Skillsmp'),
    className: 'bg-orange-50 text-orange-600 border-orange-200',
    textClassName: 'text-orange-500',
  },
  github: {
    label: 'GitHub',
    icon: imgIcon('https://github.githubassets.com/favicons/favicon.svg', 'GitHub'),
    className: 'bg-gray-50 text-gray-700 border-gray-300',
    textClassName: 'text-gray-500',
  },
};
