import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, Mail, Lock, Zap, Users, Settings } from "lucide-react";
import { CyberBackground } from "@/components/CyberBackground";
import { CyberLogo } from "@/components/CyberLogo";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Mail,
      title: "SMTP Yönetimi",
      description: "Tüm e-posta hesaplarınızı tek panelden yönetin",
    },
    {
      icon: Shield,
      title: "Güvenli Erişim",
      description: "Rol tabanlı erişim kontrolü ile güvenlik",
    },
    {
      icon: Zap,
      title: "Gerçek Zamanlı",
      description: "Anlık e-posta bildirimleri ve izleme",
    },
    {
      icon: Users,
      title: "Çoklu Kullanıcı",
      description: "Ekip üyeleri için özelleştirilebilir roller",
    },
  ];

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <CyberBackground />
      
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-cyber-primary/20 backdrop-blur-sm bg-background/50">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <CyberLogo />
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                className="text-cyber-primary hover:text-cyber-primary hover:bg-cyber-primary/10"
                onClick={() => navigate("/auth")}
              >
                Giriş Yap
              </Button>
              <Button
                className="bg-cyber-primary hover:bg-cyber-primary/80 text-background"
                onClick={() => navigate("/auth")}
              >
                Başla
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="container mx-auto text-center max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-cyber-primary/30 bg-cyber-primary/5">
              <Lock className="w-4 h-4 text-cyber-primary" />
              <span className="text-sm text-cyber-primary">Güvenli SMTP Yönetim Sistemi</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              <span className="text-foreground">E-posta Altyapınızı</span>
              <br />
              <span className="text-cyber-primary cyber-glow-text">Tam Kontrolde Tutun</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              SMTP.dev API entegrasyonu ile tüm e-posta hesaplarınızı, 
              posta kutularınızı ve mesajlarınızı güvenli bir şekilde yönetin.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Button
                size="lg"
                className="bg-cyber-primary hover:bg-cyber-primary/80 text-background px-8 py-6 text-lg"
                onClick={() => navigate("/auth")}
              >
                <Shield className="w-5 h-5 mr-2" />
                Hemen Başla
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-cyber-primary/50 text-cyber-primary hover:bg-cyber-primary/10 px-8 py-6 text-lg"
                onClick={() => navigate("/dashboard")}
              >
                <Settings className="w-5 h-5 mr-2" />
                Dashboard'a Git
              </Button>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="cyber-card p-6 rounded-lg text-left group hover:border-cyber-primary/50 transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-lg bg-cyber-primary/10 flex items-center justify-center mb-4 group-hover:bg-cyber-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-cyber-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-cyber-primary/20 backdrop-blur-sm bg-background/50 py-6">
          <div className="container mx-auto px-6 text-center">
            <p className="text-sm text-muted-foreground">
              © 2025 SMTP Control Panel. Tüm hakları saklıdır.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
