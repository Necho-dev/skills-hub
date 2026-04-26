import { Search } from 'lucide-react';
import { useState } from 'react';
import { searchSkills } from '@/lib/db';
import type { Skill } from '@/types';

interface HeaderProps {
  onSearchResult?: (skills: Skill[]) => void;
}

export function Header({ onSearchResult }: HeaderProps) {
  const [query, setQuery] = useState('');

  const handleSearch = async (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      onSearchResult?.([]);
      return;
    }
    try {
      const results = await searchSkills(value);
      onSearchResult?.(results);
    } catch {
      onSearchResult?.([]);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 h-11 border-b bg-white/80 backdrop-blur-sm sticky top-0 z-20">
      <div className="flex items-center gap-2 flex-1 max-w-xl">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜索技能 ..."
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
        />
        {query && (
          <kbd className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">Esc</kbd>
        )}
      </div>
    </div>
  );
}
