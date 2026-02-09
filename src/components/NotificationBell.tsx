import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, CheckCircle, XCircle, Package, Scan, AlertTriangle, Check, Shield, Info, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: any;
  is_read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  new_bgc_complete: CheckCircle,
  new_bgc_consider: AlertTriangle,
  new_deactivation: XCircle,
  stale_account: AlertTriangle,
  missing_package: Package,
  scan_complete: Scan,
  high_risk: Shield,
  info_needed: Info,
  bilgi_bekliyor_change: Info,
};

const TYPE_COLORS: Record<string, string> = {
  new_bgc_complete: 'text-emerald-400',
  new_bgc_consider: 'text-orange-400',
  new_deactivation: 'text-red-400',
  stale_account: 'text-yellow-400',
  missing_package: 'text-orange-400',
  scan_complete: 'text-blue-400',
  high_risk: 'text-red-400',
  info_needed: 'text-yellow-400',
  bilgi_bekliyor_change: 'text-yellow-400',
};

const TYPE_CATEGORIES: Record<string, string> = {
  new_bgc_complete: 'bgc',
  new_bgc_consider: 'bgc',
  new_deactivation: 'bgc',
  stale_account: 'risk',
  missing_package: 'bgc',
  scan_complete: 'system',
  high_risk: 'risk',
  info_needed: 'bgc',
  bilgi_bekliyor_change: 'bgc',
};

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [filterTab, setFilterTab] = useState('all');

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const markAllRead = async () => {
    if (!user) return;

    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  };

  const markOneRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (!error) {
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const filteredNotifications = filterTab === 'all'
    ? notifications
    : notifications.filter(n => TYPE_CATEGORIES[n.type] === filterTab);

  const bgcUnread = notifications.filter(n => !n.is_read && TYPE_CATEGORIES[n.type] === 'bgc').length;
  const riskUnread = notifications.filter(n => !n.is_read && TYPE_CATEGORIES[n.type] === 'risk').length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="font-semibold text-sm">Bildirimler</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
              <Check className="h-3 w-3 mr-1" />
              Tumunu Oku
            </Button>
          )}
        </div>

        <Tabs value={filterTab} onValueChange={setFilterTab}>
          <TabsList className="w-full grid grid-cols-4 h-8 mx-0 rounded-none border-b border-border bg-transparent">
            <TabsTrigger value="all" className="text-[11px] h-7 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Tumu {unreadCount > 0 && <span className="ml-1 text-[9px] bg-red-500/20 text-red-400 px-1 rounded">{unreadCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="bgc" className="text-[11px] h-7 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              BGC {bgcUnread > 0 && <span className="ml-1 text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">{bgcUnread}</span>}
            </TabsTrigger>
            <TabsTrigger value="risk" className="text-[11px] h-7 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Risk {riskUnread > 0 && <span className="ml-1 text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded">{riskUnread}</span>}
            </TabsTrigger>
            <TabsTrigger value="system" className="text-[11px] h-7 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
              Sistem
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <ScrollArea className="h-80">
          {filteredNotifications.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-8">
              Bildirim yok
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredNotifications.map((notif) => {
                const Icon = TYPE_ICONS[notif.type] || Bell;
                const color = TYPE_COLORS[notif.type] || 'text-muted-foreground';
                return (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                      !notif.is_read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => !notif.is_read && markOneRead(notif.id)}
                  >
                    <div className="flex gap-3">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{notif.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {formatDistanceToNow(new Date(notif.created_at), {
                            addSuffix: true,
                            locale: tr,
                          })}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
