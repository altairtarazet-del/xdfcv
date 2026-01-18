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
          <h1 className="text-2xl font-mono font-bold text-foreground cyber-glow-text">
            Ayarlar
          </h1>
          <p className="text-muted-foreground font-mono text-sm">
            Hesap ve profil ayarlarınızı yönetin
          </p>
        </div>

        {/* Profile Section */}
        <div className="cyber-card rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <User size={24} className="text-primary" />
            <h2 className="font-mono font-bold text-foreground">Profil Bilgileri</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">E-POSTA</Label>
              <Input
                value={profile?.email || ''}
                disabled
                className="cyber-input font-mono opacity-60"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">GÖRÜNEN AD</Label>
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
              className="cyber-glow font-mono"
            >
              <Save size={16} className="mr-2" />
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </div>

        {/* Role Info Section */}
        {profile?.custom_role && (
          <div className="cyber-card rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <Shield size={24} className="text-primary" />
              <h2 className="font-mono font-bold text-foreground">Rol Bilgileri</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm font-mono">
              <div>
                <span className="text-muted-foreground">Rol:</span>
                <p className="text-primary">{profile.custom_role.name}</p>
              </div>
              {profile.permissions?.time_filter_minutes && (
                <div>
                  <span className="text-muted-foreground">Zaman Filtresi:</span>
                  <p className="text-foreground">Son {profile.permissions.time_filter_minutes} dakika</p>
                </div>
              )}
              {profile.permissions?.allowed_mailboxes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">İzin Verilen Posta Kutuları:</span>
                  <p className="text-foreground">{profile.permissions.allowed_mailboxes.join(', ')}</p>
                </div>
              )}
              {profile.permissions?.allowed_senders && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">İzin Verilen Göndericiler:</span>
                  <p className="text-foreground">{profile.permissions.allowed_senders.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Password Section */}
        <div className="cyber-card rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Key size={24} className="text-primary" />
            <h2 className="font-mono font-bold text-foreground">Şifre Değiştir</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-mono text-xs">YENİ ŞİFRE</Label>
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
              className="cyber-glow font-mono"
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
