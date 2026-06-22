import { useAuth } from '@/contexts/AuthContext';
import { QuickMetrics } from '@/components/dashboard/QuickMetrics';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { Assistant } from '@/components/dashboard/Assistant';
import { HelpModal } from '@/components/dashboard/HelpModal';
import HuntingRequestsPanel from '@/components/dashboard/HuntingRequestsPanel';
import { PendingInformeChangesPanel } from '@/components/dashboard/PendingInformeChangesPanel';
import { VacanciesMissingClientPanel } from '@/components/dashboard/VacanciesMissingClientPanel';
import { useState } from 'react';

export default function Home() {
  const { profile, role } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const firstName = (profile?.full_name || '').split(/\s+/)[0] || '';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Saludo */}
      <div className="space-y-1 pt-4">
        <h1 className="text-3xl font-semibold text-foreground">
          {firstName ? `Hola, ${firstName}.` : 'Hola.'}
        </h1>
        <p className="text-muted-foreground text-base">
          ¿Qué querés hacer hoy?
        </p>
      </div>

      {/* Métricas compactas */}
      <QuickMetrics role={role} userId={profile?.id} />

      {/* Informes con cambios pendientes (selectora-only, se oculta si no hay) */}
      {role === 'selectora' && <PendingInformeChangesPanel userId={profile?.id} />}

      {/* Vacantes con candidatos esperando pero sin cliente asignado (manager-only) */}
      <VacanciesMissingClientPanel role={role} />

      {/* Solicitudes de Headhunting pendientes (manager-only, se oculta si no hay) */}
      <HuntingRequestsPanel role={role} />

      {/* Asistente IA */}
      <Assistant
        role={role}
        userId={profile?.id}
        userName={profile?.full_name || ''}
        onOpenHelp={() => setHelpOpen(true)}
      />

      {/* Accesos rápidos */}
      <QuickActions role={role} onOpenHelp={() => setHelpOpen(true)} />

      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} role={role} />
    </div>
  );
}
