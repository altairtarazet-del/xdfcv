import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { CyberBackground } from '@/components/CyberBackground';
import { CyberLogo } from '@/components/CyberLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PortalLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { login, isAuthenticated, isLoading: authLoading } = usePortalAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/portal/mail');
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'E-posta ve sifre zorunludur',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await login(email, password);
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Giris Basarisiz',
          description: error,
        });
      } else {
        navigate('/portal/mail');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <CyberBackground />

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <CyberLogo size="lg" />
          </div>
          <p className="text-muted-foreground text-sm">
            XDFCV Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl bg-card border border-border p-6 shadow-xl shadow-black/20">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            Portal Girisi
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">
                E-posta
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 bg-input border-border focus:border-primary focus:ring-1 focus:ring-primary/30"
                  placeholder="email@xdfcv.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-muted-foreground">
                Sifre
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9 bg-input border-border focus:border-primary focus:ring-1 focus:ring-primary/30"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Giris yapiliyor...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Giris Yap
                  <ArrowRight size={16} />
                </span>
              )}
            </Button>
          </form>

          <p className="text-center text-muted-foreground text-xs mt-5">
            Sifreniz icin yoneticinize basvurun
          </p>

          <div className="space-y-2 mt-4">
            <Button
              variant="outline"
              className="w-full text-sm gap-1.5"
              onClick={() => navigate('/portal/market')}
            >
              <ShoppingBag size={14} />
              Markete Goz At
            </Button>
            <Link
              to="/portal"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Portal Ana Sayfa
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground/50 text-xs mt-8">
          XDFCV &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
