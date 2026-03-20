import { LayoutDashboard, Briefcase, Users, LogOut, ClipboardCheck } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import logo from '@/assets/logo.png';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

export function AppSidebar() {
  const { role, profile, signOut } = useAuth();

  const menuItems = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'Vacantes', url: '/vacantes', icon: Briefcase },
  ];

  if (role === 'manager') {
    menuItems.push({ title: 'Usuarios', url: '/usuarios', icon: Users });
  }

  return (
    <Sidebar className="border-r-0">
      <div className="flex h-14 items-center gap-3 px-4 border-b border-sidebar-border">
        <img src={logo} alt="AccelRH" className="h-8 w-8" />
        <span className="font-bold text-lg text-sidebar-foreground tracking-tight">AccelRH</span>
      </div>
      <SidebarContent className="pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
            Navegación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-sidebar-foreground truncate">{profile?.full_name}</div>
          <div className="text-xs text-sidebar-muted capitalize">{role}</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent px-0"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
