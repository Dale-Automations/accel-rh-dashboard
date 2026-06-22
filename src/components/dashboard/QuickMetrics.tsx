import { useEffect, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Briefcase, UserSearch, Send, Clock, CheckCircle, ListChecks, ClipboardCheck, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const sb = supabase as any;

type Role = 'manager' | 'selectora' | 'cliente' | string | null | undefined;

interface MetricCard {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  color: string;
}

export function QuickMetrics({ role, userId }: { role: Role; userId?: string }) {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (role === 'cliente' && userId) {
          // Vacantes asignadas activas
          const { data: assigns } = await sb.from('vacancy_assignments').select('vacancy_id').eq('user_id', userId);
          const vacIds = (assigns || []).map((a: any) => a.vacancy_id);
          const { count: activasCount } = await sb.from('vacantes').select('vacancy_id', { count: 'exact', head: true }).eq('status', 'Activa').in('vacancy_id', vacIds.length ? vacIds : ['__none__']);
          const { count: porRevisar } = await sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).in('vacancy_id', vacIds.length ? vacIds : ['__none__']).eq('mostrar_cliente', true).eq('cliente_estado', 'pendiente');
          const { count: aceptados } = await sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).in('vacancy_id', vacIds.length ? vacIds : ['__none__']).eq('mostrar_cliente', true).eq('cliente_estado', 'aceptado');
          if (cancelled) return;
          setMetrics([
            { label: 'Vacantes en curso', value: activasCount || 0, icon: Briefcase, to: '/vacantes?status=Activa', color: 'text-violet-600' },
            { label: 'Candidatos para revisar', value: porRevisar || 0, icon: UserSearch, to: '/candidatos?cliente_estado=pendiente', color: 'text-amber-600' },
            { label: 'Aceptados', value: aceptados || 0, icon: CheckCircle, to: '/candidatos?cliente_estado=aceptado', color: 'text-green-600' },
          ]);
        } else if (role === 'selectora' && userId) {
          // Selectora: foco en sus propios informes
          const { count: activas } = await sb.from('vacantes').select('vacancy_id', { count: 'exact', head: true }).eq('status', 'Activa');
          const { count: porEvaluar } = await sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('scoring_status', 'pending');
          // Informes propios con cambios solicitados (sin acknowledge)
          const { count: misConCambios } = await sb
            .from('informe_feedback')
            .select('id', { count: 'exact', head: true })
            .eq('submitted_by', userId)
            .in('decision', ['changes_requested', 'rejected'])
            .is('acknowledged_by_submitter_at', null);
          const { count: misPendientes } = await sb
            .from('informe_feedback')
            .select('id', { count: 'exact', head: true })
            .eq('submitted_by', userId)
            .is('decision', null);
          if (cancelled) return;
          setMetrics([
            { label: 'Vacantes activas', value: activas || 0, icon: Briefcase, to: '/vacantes?status=Activa', color: 'text-violet-600' },
            { label: 'Postulantes por evaluar', value: porEvaluar || 0, icon: ListChecks, to: '/candidatos?scoring=pending', color: 'text-amber-600' },
            { label: 'Informes con cambios', value: misConCambios || 0, icon: AlertCircle, to: '/mis-informes', color: misConCambios && misConCambios > 0 ? 'text-red-600' : 'text-indigo-600' },
            { label: 'Mis informes pendientes', value: misPendientes || 0, icon: ClipboardCheck, to: '/mis-informes', color: 'text-emerald-600' },
          ]);
        } else {
          // Manager
          const { count: activas } = await sb.from('vacantes').select('vacancy_id', { count: 'exact', head: true }).eq('status', 'Activa');
          const { count: porEvaluar } = await sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('scoring_status', 'pending');
          const { count: porRevisarInforme } = await sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('informe_status', 'pending_review');
          const { count: esperandoCliente } = await sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('mostrar_cliente', true).eq('cliente_estado', 'pendiente');
          if (cancelled) return;
          setMetrics([
            { label: 'Vacantes activas', value: activas || 0, icon: Briefcase, to: '/vacantes?status=Activa', color: 'text-violet-600' },
            { label: 'Postulantes por evaluar', value: porEvaluar || 0, icon: ListChecks, to: '/candidatos?scoring=pending', color: 'text-amber-600' },
            { label: 'Informes a revisar', value: porRevisarInforme || 0, icon: ClipboardCheck, to: '/informes', color: 'text-indigo-600' },
            { label: 'Esperando cliente', value: esperandoCliente || 0, icon: Send, to: '/candidatos?cliente_estado=pendiente', color: 'text-green-600' },
          ]);
        }
      } catch {
        if (!cancelled) setMetrics([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [role, userId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${metrics.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'}`}>
      {metrics.map((m, i) => {
        const Icon = m.icon;
        return (
          <Card
            key={i}
            className="p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
            onClick={() => navigate(m.to)}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{m.label}</p>
                <p className="text-3xl font-semibold text-foreground mt-1">{m.value ?? '—'}</p>
              </div>
              <Icon className={`h-5 w-5 ${m.color}`} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Eslint un-used silencers
void Clock;
