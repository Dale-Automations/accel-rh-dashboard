import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const roleBadgeClass: Record<string, string> = {
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  selectora: 'bg-purple-100 text-purple-800 border-purple-200',
  cliente: 'bg-orange-100 text-orange-800 border-orange-200',
};

export default function AppLayout() {
  const { session, profile, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
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
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
