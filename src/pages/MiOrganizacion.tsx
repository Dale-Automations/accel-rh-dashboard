import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Briefcase, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { isEnterprise } from '@/lib/roles';
import { formatDate } from '@/lib/formatters';

const sb = supabase as any;

interface Metrics {
  users: number;
  vacanciesActive: number;
  postulantesTotal: number;
  postulantesCliente: number;
}

export default function MiOrganizacion() {
  const { role, organization } = useAuth();
  const navigate = useNavigate();
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  if (!isEnterprise(role)) return <Navigate to="/" replace />;

  useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;
    (async () => {
      const [usersRes, vacRes, postTotalRes, postCliRes] = await Promise.all([
        sb.from('user_profiles').select('id', { count: 'exact', head: true }).eq('organization_id', organization.id),
        sb.from('vacantes').select('vacancy_id', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('status', 'Activa'),
        sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('organization_id', organization.id),
        sb.from('postulantes').select('id_postulant', { count: 'exact', head: true }).eq('organization_id', organization.id).eq('mostrar_cliente', true),
      ]);
      if (cancelled) return;
      setM({
        users: usersRes.count || 0,
        vacanciesActive: vacRes.count || 0,
        postulantesTotal: postTotalRes.count || 0,
        postulantesCliente: postCliRes.count || 0,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [organization?.id]);

  const daysLeft = organization?.demo_expires_at
    ? Math.ceil((new Date(organization.demo_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const expired = organization?.status === 'expired';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">{organization?.display_name}</h1>
        <p className="text-sm text-muted-foreground">Panel de tu organizacion.</p>
      </div>

      {organization?.is_demo && (
        <Card className={expired ? 'border-rose-300 bg-rose-50/60' : 'border-amber-300 bg-amber-50/60'}>
          <CardContent className="p-4 flex items-center gap-3">
            {expired ? <AlertTriangle className="h-5 w-5 text-rose-700" /> : <Clock className="h-5 w-5 text-amber-700" />}
            <div className="flex-1">
              {expired ? (
                <div>
                  <div className="font-medium text-rose-900">Tu demo vencio.</div>
                  <div className="text-xs text-rose-900/80">
                    Podes ver toda tu informacion, pero las acciones (evaluar, contactar, etc.) estan deshabilitadas.
                    Hablanos para activar tu cuenta.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-medium text-amber-900">
                    Demo: {daysLeft !== null && daysLeft > 0 ? `${daysLeft} dias restantes` : 'ultimo dia'}
                  </div>
                  <div className="text-xs text-amber-900/80">
                    Vence el {formatDate(organization.demo_expires_at)}. Despues queda en read-only.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? (
          <>
            <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
          </>
        ) : m && (
          <>
            <MetricCard icon={<Users className="h-4 w-4" />} label="Usuarios" value={m.users} onClick={() => navigate('/usuarios')} />
            <MetricCard icon={<Briefcase className="h-4 w-4" />} label="Vacantes activas" value={m.vacanciesActive} onClick={() => navigate('/vacantes')} />
            <MetricCard icon={<Users className="h-4 w-4" />} label="Candidatos total" value={m.postulantesTotal} onClick={() => navigate('/candidatos')} />
            <MetricCard icon={<Users className="h-4 w-4" />} label="Visibles al cliente" value={m.postulantesCliente} onClick={() => navigate('/candidatos?cliente_estado=pendiente')} />
          </>
        )}
      </div>

      <Card>
        <CardContent className="p-6 space-y-3">
          <h2 className="font-medium">Equipo</h2>
          <p className="text-sm text-muted-foreground">
            Como enterprise podes invitar managers, selectoras y clientes propios desde la seccion Usuarios.
          </p>
          <Button variant="outline" onClick={() => navigate('/usuarios')}>
            Gestionar usuarios <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value: number; onClick?: () => void }) {
  return (
    <Card className={onClick ? 'cursor-pointer hover:border-primary/50 transition-colors' : ''} onClick={onClick}>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
