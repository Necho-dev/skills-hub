import { ChevronRight } from 'lucide-react';
import type { Publisher } from '@/types';

interface PublisherCardProps {
  publisher: Publisher;
  onClick: () => void;
  selected?: boolean;
}

export function PublisherCard({ publisher, onClick, selected }: PublisherCardProps) {
  const initials = publisher.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all hover:shadow-sm ${
        selected ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {publisher.avatar_url ? (
        <img
          src={publisher.avatar_url}
          alt={publisher.name}
          className="w-10 h-10 rounded-lg object-cover shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold shrink-0">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{publisher.name}</p>
        <p className="text-xs text-gray-500">
          {publisher.skill_count} skills · {publisher.repo_count} repo{publisher.repo_count !== 1 ? 's' : ''}
        </p>
      </div>
      <ChevronRight size={14} className="text-gray-400 shrink-0" />
    </button>
  );
}
