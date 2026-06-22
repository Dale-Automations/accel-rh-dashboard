import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Wand2, ArrowRight, Loader2, Inbox } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ClientJdSession } from '@/types/database';

const sb = supabase as any;

type Filter = 'confirmed' | 'approved' | 'requires_commercial' | 'all';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:               { label: 'En curso',                color: 'bg-muted text-foreground' },
  confirmed:            { label: 'Pendiente de aprobación', color: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  approved:             { label: 'Aprobada — vacante abierta', color: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' },
  requires_commercial:  { label: 'Requiere comercial',     color: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200' },
  abandoned:            { label: 'Abandonada',             color: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200' },
};

interface SessionWithClient extends ClientJdSession {
  cliente_name?: string | null;
  cliente_email?: string | null;
}

export default function JdSessionsIndex() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [filter, setFilter] = useState<Filter>('confirmed');
  const [sessions, setSessions] = useState<SessionWithClient[]>([]);
  const [loading, setLoading] = useState(true);

  // Gate: solo manager/selectora
  useEffect(() => {
    if (role && role !== 'manager' && role !== 'selectora') {
      navigate('/');
    }
  }, [role, navigate]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = sb
        .from('client_jd_sessions')
        .select('*')
        .order('confirmed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        q = q.eq('status', filter);
      } else {
        q = q.in('status', ['confirmed', 'approved', 'requires_commercial']);
      }

      const { data, error } = await q.limit(200);
      if (error) {
        console.warn('Error cargando sesiones', error);
        setSessions([]);
        setLoading(false);
        return;
      }
      const rows = (data || []) as SessionWithClient[];

      // Hidratar nombres de cliente
      const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
      if (userIds.length > 0) {
        const { data: profiles } = await sb
          .from('user_profiles')
          .select('id,full_name,email')
          .in('id', userIds);
        const map = new Map<string, { full_name: string | null; email: string | null }>(
          (profiles || []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]),
        );
        rows.forEach(r => {
          const p = map.get(r.user_id);
          if (p) {
            r.cliente_name = p.full_name;
            r.cliente_email = p.email;
          }
        });
      }
      setSessions(rows);
      setLoading(false);
    })();
  }, [filter]);

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-fuchsia-600" />
          Solicitudes de búsquedas (Accel GPT)
        </h1>
        <p className="text-sm text-muted-foreground">
          Búsquedas armadas por clientes con el wizard de IA. Aprobalas o derivalas a comercial.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="confirmed">Pendientes</TabsTrigger>
          <TabsTrigger value="approved">Aprobadas</TabsTrigger>
          <TabsTrigger value="requires_commercial">Comercial</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {sessions.length} solicitud{sessions.length === 1 ? '' : 'es'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay solicitudes en este estado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Puesto propuesto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Confirmada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map(s => {
                  const status = STATUS_LABEL[s.status] || { label: s.status, color: 'bg-muted' };
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{s.cliente_name || 'Sin nombre'}</div>
                        {s.cliente_email && (
                          <div className="text-[11px] text-muted-foreground">{s.cliente_email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.proposed_role_title
                          ? s.proposed_role_title.replace(/[*_`#|]/g, '').replace(/\s+/g, ' ').trim()
                          : <span className="text-muted-foreground">(sin título)</span>}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${status.color} text-xs`}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.confirmed_at ? format(new Date(s.confirmed_at), "d MMM yyyy 'a las' HH:mm", { locale: es }) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/jd-sessions/${s.id}`)}>
                          Ver detalle <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
