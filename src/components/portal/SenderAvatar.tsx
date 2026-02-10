import { cn } from '@/lib/utils';

const AVATAR_COLORS = [
  'bg-blue-500/20 text-blue-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-violet-500/20 text-violet-400',
  'bg-amber-500/20 text-amber-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-pink-500/20 text-pink-400',
  'bg-teal-500/20 text-teal-400',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface SenderAvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SenderAvatar({ name, size = 'md', className }: SenderAvatarProps) {
  const colorIndex = hashString(name) % AVATAR_COLORS.length;
  const letter = (name[0] || '?').toUpperCase();
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-10 w-10 text-base' : 'h-8 w-8 text-sm';

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold shrink-0',
        sizeClass,
        AVATAR_COLORS[colorIndex],
        className,
      )}
    >
      {letter}
    </div>
  );
}
