import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User, Save, Shield, Key } from 'lucide-react';

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('user_id', profile?.user_id);

      if (error) throw error;

      await refreshProfile();
      toast({
        title: 'Başarılı',
        description: 'Profil güncellendi',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Profil güncellenirken bir hata oluştu',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: 'Şifre en az 6 karakter olmalıdır',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Başarılı',
        description: 'Şifre değiştirildi',
      });
      setCurrentPassword('');
      setNewPassword('');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Hata',
        description: error.message || 'Şifre değiştirilirken bir hata oluştu',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Ayarlar
          </h1>
          <p className="text-muted-foreground text-sm">
            Hesap ve profil ayarlarınızı yönetin
          </p>
        </div>

        {/* Profile Section */}
        <div className="cyber-card rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <User size={24} className="text-primary" />
            <h2 className="font-bold text-foreground">Profil Bilgileri</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">E-posta</Label>
              <Input
                value={profile?.email || ''}
                disabled
                className="cyber-input font-mono opacity-60"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Görünen Ad</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="cyber-input font-mono"
                placeholder="Ad Soyad"
              />
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={isSaving}
            >
              <Save size={16} className="mr-2" />
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </div>


        {/* Password Section */}
        <div className="cyber-card rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Key size={24} className="text-primary" />
            <h2 className="font-bold text-foreground">Şifre Değiştir</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Yeni Şifre</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="cyber-input font-mono"
                placeholder="••••••••"
              />
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword}
            >
              <Key size={16} className="mr-2" />
              {isChangingPassword ? 'Değiştiriliyor...' : 'Şifre Değiştir'}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
