import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { CyberBackground } from '@/components/CyberBackground';
import { CyberLogo } from '@/components/CyberLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Lock, Mail, Terminal } from 'lucide-react';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';

const authSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
});

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalText, setTerminalText] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('rememberMe') === 'true';
  });
  
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  useEffect(() => {
    const text = '> Güvenli bağlantı kuruluyor...\n> Kimlik doğrulama modülü aktif\n> Erişim için yetkilendirme bekleniyor...';
    
    let i = 0;
    setTerminalText('');
    const interval = setInterval(() => {
      if (i < text.length) {
        setTerminalText(prev => prev + text[i]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validation = authSchema.safeParse({ email, password });
      if (!validation.success) {
        toast({
          variant: 'destructive',
          title: 'Doğrulama Hatası',
          description: validation.error.errors[0].message,
        });
        setIsLoading(false);
        return;
      }

      // Store remember me preference
      localStorage.setItem('rememberMe', rememberMe.toString());
      
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          variant: 'destructive',
          title: 'Giriş Başarısız',
          description: error.message === 'Invalid login credentials' 
            ? 'E-posta veya şifre hatalı' 
            : error.message,
        });
      } else {
        toast({
          title: 'Giriş Başarılı',
          description: 'Sisteme hoş geldiniz!',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen matrix-bg flex items-center justify-center p-4 relative overflow-hidden">
      <CyberBackground />
      
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <CyberLogo size="lg" />
          <p className="text-muted-foreground mt-2 font-mono text-sm">
            Secure Mail Testing Platform
          </p>
        </div>

        {/* Terminal Preview */}
        <div className="cyber-card rounded-lg p-4 mb-6 font-mono text-sm">
          <div className="flex items-center gap-2 mb-2 text-muted-foreground">
            <Terminal size={14} />
            <span>terminal</span>
          </div>
          <div className="text-primary whitespace-pre-wrap min-h-[50px]">
            {terminalText}
            <span className="typing-cursor" />
          </div>
        </div>

        {/* Auth Form */}
        <div className="cyber-card rounded-lg p-6">
          <div className="mb-6 pb-2 border-b border-primary/30">
            <h2 className="font-mono text-lg text-primary cyber-glow-text text-center">
              SİSTEM GİRİŞİ
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground font-mono text-xs">
                E-POSTA
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="cyber-input pl-10 font-mono"
                  placeholder="user@dashermail.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground font-mono text-xs">
                ŞİFRE
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="cyber-input pl-10 pr-10 font-mono"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                className="border-primary/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label 
                htmlFor="rememberMe" 
                className="text-muted-foreground font-mono text-xs cursor-pointer"
              >
                Beni Hatırla
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full cyber-glow font-mono"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  DOĞRULANIYOR...
                </span>
              ) : (
                'SİSTEME GİRİŞ'
              )}
            </Button>
          </form>

          <p className="text-center text-muted-foreground text-xs mt-4 font-mono">
            Hesap için sistem yöneticinize başvurun
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground text-xs mt-6 font-mono">
          © 2024 DasherMail • Tüm hakları saklıdır
        </p>
      </div>
    </div>
  );
}
