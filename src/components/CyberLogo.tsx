import { Zap } from 'lucide-react';

interface CyberLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export function CyberLogo({ size = 'md' }: CyberLogoProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const iconSizes = {
    sm: 18,
    md: 28,
    lg: 40,
  };

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex items-center justify-center">
        <div className={`rounded-xl bg-primary/15 p-1.5 ${size === 'lg' ? 'p-2.5' : size === 'md' ? 'p-2' : 'p-1.5'}`}>
          <Zap
            size={iconSizes[size]}
            className="text-primary"
            fill="currentColor"
          />
        </div>
      </div>
      <div className={`font-semibold tracking-tight ${sizeClasses[size]}`}>
        <span className="text-foreground">Dasher</span>
        <span className="text-primary">Mail</span>
      </div>
    </div>
  );
}
