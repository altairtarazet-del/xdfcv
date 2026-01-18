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

const authSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [terminalText, setTerminalText] = useState('');
  
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  useEffect(() => {
    const text = isLogin 
      ? '> Güvenli bağlantı kuruluyor...\n> Kimlik doğrulama modülü aktif'
      : '> Yeni kullanıcı kaydı başlatılıyor...\n> Güvenlik protokolleri yükleniyor';
    
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
  }, [isLogin]);

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

      if (isLogin) {
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
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              variant: 'destructive',
              title: 'Kayıt Başarısız',
              description: 'Bu e-posta adresi zaten kayıtlı',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Kayıt Başarısız',
              description: error.message,
            });
          }
        } else {
          toast({
            title: 'Kayıt Başarılı',
            description: 'Hesabınız oluşturuldu, giriş yapabilirsiniz.',
          });
          setIsLogin(true);
        }
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
          <div className="flex mb-6">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 font-mono text-sm transition-all border-b-2 ${
                isLogin 
                  ? 'border-primary text-primary cyber-glow-text' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              GİRİŞ YAP
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 font-mono text-sm transition-all border-b-2 ${
                !isLogin 
                  ? 'border-primary text-primary cyber-glow-text' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              KAYIT OL
            </button>
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
                  placeholder="admin@dashermail.com"
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

            <Button
              type="submit"
              className="w-full cyber-glow font-mono"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span>
                  İŞLENİYOR...
                </span>
              ) : (
                isLogin ? 'SİSTEME GİRİŞ' : 'HESAP OLUŞTUR'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground text-xs mt-6 font-mono">
          © 2024 DasherMail • Tüm hakları saklıdır
        </p>
      </div>
    </div>
  );
}
