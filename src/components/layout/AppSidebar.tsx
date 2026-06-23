import { LayoutDashboard, Briefcase, Users, LogOut, ClipboardCheck, Archive, ClipboardList, Receipt, Wand2, Target, MessageSquare, Building2, Globe2 } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin, isEnterprise, isManager, isCliente, isSelectora, roleLabel } from '@/lib/roles';
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

  if (isCliente(role)) {
    menuItems.push({ title: 'Armar Vacante con IA', url: '/armar-vacante', icon: Wand2 });
  }

  if (isSelectora(role)) {
    menuItems.push({ title: 'Mis Informes', url: '/mis-informes', icon: ClipboardList });
  }

  if (!isCliente(role)) {
    menuItems.push({ title: 'Rúbricas', url: '/rubricas', icon: ClipboardCheck });
    menuItems.push({ title: 'Solicitudes de Clientes', url: '/jd-sessions', icon: ClipboardList });
    menuItems.push({ title: 'Contacto LinkedIn', url: '/hunting/inbox', icon: MessageSquare });
    menuItems.push({ title: 'Archivados', url: '/archivados', icon: Archive });
  }

  if (isManager(role) || isEnterprise(role) || isSuperAdmin(role)) {
    menuItems.push({ title: 'Solicitudes de Headhunting', url: '/headhunting', icon: Target });
    menuItems.push({ title: 'Informes', url: '/informes', icon: ClipboardList });
    menuItems.push({ title: 'Usuarios', url: '/usuarios', icon: Users });
    menuItems.push({ title: 'Facturación', url: '/facturacion', icon: Receipt });
  }

  if (isEnterprise(role)) {
    menuItems.push({ title: 'Mi Organización', url: '/mi-organizacion', icon: Building2 });
  }

  if (isSuperAdmin(role)) {
    menuItems.push({ title: 'Organizaciones', url: '/admin/orgs', icon: Globe2 });
  }

  return (
    <Sidebar className="border-r-0">
      <div className="flex h-16 items-center justify-center px-4 border-b border-sidebar-border">
        <img src={logo} alt="AccelRH" className="h-12 w-auto object-contain" />
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
          <div className="text-xs text-sidebar-muted">{roleLabel(role)}</div>
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
