import { Mail, Shield } from 'lucide-react';

interface CyberLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export function CyberLogo({ size = 'md' }: CyberLogoProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  const iconSizes = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <Shield
          size={iconSizes[size]}
          className="text-primary cyber-glow-text"
        />
        <Mail
          size={iconSizes[size] * 0.5}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-secondary"
        />
      </div>
      <div className={`font-mono font-bold ${sizeClasses[size]}`}>
        <span className="text-primary cyber-glow-text">Dasher</span>
        <span className="text-secondary">Mail</span>
      </div>
    </div>
  );
}
