import { useState } from 'react';
import { LayoutDashboard, Briefcase, Users, LogOut, ClipboardCheck, Archive, ClipboardList, Receipt, Wand2, Target, MessageSquare, Building2, Globe2, Lock, BookOpen, LifeBuoy } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin, isEnterprise, isManager, isCliente, isSelectora, isSupport, roleLabel } from '@/lib/roles';
import { PremiumFeatureModal } from '@/components/PremiumFeatureModal';
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

type MenuItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  premium?: boolean;
  external?: boolean;
};

export function AppSidebar() {
  const { role, profile, signOut, hasExternalClients } = useAuth();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [premiumFeature, setPremiumFeature] = useState<{ feature: string; title: string; description: string } | null>(null);

  // Para el rol 'support' el sidebar se reduce a "Soporte" + "Guia rapida".
  // No accede a vacantes, candidatos, informes, facturacion, etc. (defensivo;
  // las policies RLS tambien lo bloquean del lado servidor).
  const menuItems: MenuItem[] = isSupport(role)
    ? []
    : [
        { title: 'Dashboard', url: '/', icon: LayoutDashboard },
        { title: 'Vacantes', url: '/vacantes', icon: Briefcase },
      ];

  // Nota: "Armar Vacante con IA" se accede ahora desde el Dashboard (card destacada
  // + onboarding checklist), no como item del sidebar. La ruta /armar-vacante sigue
  // funcionando para acceso directo.

  if (isSelectora(role)) {
    menuItems.push({ title: 'Mis Informes', url: '/mis-informes', icon: ClipboardList });
  }

  if (!isCliente(role) && !isSupport(role)) {
    menuItems.push({ title: 'Rúbricas', url: '/rubricas', icon: ClipboardCheck });

    // "Solicitudes de Clientes" solo tiene sentido cuando la org atiende a clientes externos
    // (caso AccelRH). En orgs self-serve no aplica: el flow JD se inicia desde el dashboard.
    if (hasExternalClients) {
      menuItems.push({ title: 'Solicitudes de Clientes', url: '/jd-sessions', icon: ClipboardList });
    }

    // Contacto LinkedIn: visible en todos los casos pero como premium en orgs self-serve.
    menuItems.push({
      title: 'Contacto LinkedIn',
      url: '/hunting/inbox',
      icon: MessageSquare,
      premium: !hasExternalClients,
    });
    menuItems.push({ title: 'Archivados', url: '/archivados', icon: Archive });
  }

  if (isManager(role) || isEnterprise(role) || isSuperAdmin(role)) {
    menuItems.push({ title: 'Solicitudes de Headhunting', url: '/headhunting', icon: Target });
    menuItems.push({ title: 'Informes', url: '/informes', icon: ClipboardList });
    menuItems.push({ title: 'Usuarios', url: '/usuarios', icon: Users });
    if (hasExternalClients) {
      menuItems.push({ title: 'Facturación', url: '/facturacion', icon: Receipt });
    }
  }

  if (isEnterprise(role)) {
    menuItems.push({ title: 'Mi Organización', url: '/mi-organizacion', icon: Building2 });
  }

  // Soporte: tickets + FAQ + tutoriales. Visible para TODOS los roles operativos
  // (cliente, selectora, manager, enterprise) y tambien para support (es su unica
  // navegacion). Super_admin tambien lo ve para poder monitorear los tickets.
  menuItems.push({ title: 'Soporte', url: '/soporte', icon: LifeBuoy });

  // Guía rápida (PDF estático). Visible para todos los roles operativos para que
  // cualquiera del equipo pueda abrirla en una pestaña nueva. No la mostramos a
  // super_admin (su rol no es "user final" del producto).
  if (!isSuperAdmin(role)) {
    menuItems.push({ title: 'Guía rápida', url: '/guia-rapida.pdf', icon: BookOpen, external: true });
  }

  if (isSuperAdmin(role)) {
    menuItems.push({ title: 'Organizaciones', url: '/admin/orgs', icon: Globe2 });
  }

  const handlePremiumClick = (e: React.MouseEvent, item: MenuItem) => {
    if (!item.premium) return;
    e.preventDefault();
    setPremiumFeature({
      feature: item.title,
      title: `${item.title}: funcionalidad premium`,
      description:
        'El envío de mensajes directos en LinkedIn no está incluido en el plan demo. Con esta funcionalidad podés contactar a los candidatos hunteados sin salir del sistema.',
    });
    setPremiumOpen(true);
  };

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
                    {item.external ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </a>
                    ) : (
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        onClick={(e: React.MouseEvent) => handlePremiumClick(e, item)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.premium && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400">
                            <Lock className="h-3 w-3" />
                            Premium
                          </span>
                        )}
                      </NavLink>
                    )}
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
      {premiumFeature && (
        <PremiumFeatureModal
          open={premiumOpen}
          onOpenChange={setPremiumOpen}
          feature={premiumFeature.feature}
          title={premiumFeature.title}
          description={premiumFeature.description}
        />
      )}
    </Sidebar>
  );
}
