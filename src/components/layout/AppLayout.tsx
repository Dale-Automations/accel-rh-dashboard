import { useEffect, useState, useCallback } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, CheckCheck } from 'lucide-react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const sb = supabase as any;

interface Notification {
  id: string;
  actor_name: string;
  postulant_id: string;
  postulant_name: string;
  vacancy_id: string;
  vacancy_name: string;
  action: string;
  fields_changed: string[];
  read: boolean;
  created_at: string;
}

const roleBadgeClass: Record<string, string> = {
  manager: 'bg-primary/10 text-primary border-primary/20',
  selectora: 'bg-accent/10 text-accent border-accent/20',
  cliente: 'bg-warning/10 text-warning border-warning/20',
};

export default function AppLayout() {
  const { session, profile, role, loading, user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await sb.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    const notifs = (data || []) as Notification[];
    setNotifications(notifs);
    setUnreadCount(notifs.filter(n => !n.read).length);
  }, [user]);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user, loadNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = sb
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        loadNotifications();
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [user, loadNotifications]);

  const markAsRead = async (id: string) => {
    await sb.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    if (!user) return;
    await sb.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-brand-gradient animate-pulse" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
            </div>
            <div className="flex items-center gap-3">
              {/* Notifications bell */}
              <Popover open={notifOpen} onOpenChange={setNotifOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 p-0 max-h-[480px] flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <span className="font-semibold text-sm">Notificaciones</span>
                    {unreadCount > 0 && (
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
                        <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar todas
                      </Button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Sin notificaciones</p>
                    ) : (
                      notifications.map(n => (
                        <button
                          key={n.id}
                          className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
                          onClick={() => {
                            if (!n.read) markAsRead(n.id);
                            setNotifOpen(false);
                            navigate(`/postulantes/${n.postulant_id}?vacancy_id=${n.vacancy_id}`);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">
                                <span className="font-medium">{n.actor_name}</span>
                                {' modificó '}
                                <span className="font-medium">{n.fields_changed.join(', ')}</span>
                                {' de '}
                                <span className="font-medium">{n.postulant_name}</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.vacancy_name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {(() => { try { return formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es }); } catch { return ''; } })()}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <span className="text-sm text-foreground font-medium hidden sm:inline">
                {profile?.full_name}
              </span>
              {role && (
                <Badge variant="outline" className={`capitalize text-xs ${roleBadgeClass[role] || ''}`}>
                  {role}
                </Badge>
              )}
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 relative">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
