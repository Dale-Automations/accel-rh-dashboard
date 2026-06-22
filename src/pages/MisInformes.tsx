import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ClipboardList, AlertCircle, CheckCircle2, XCircle, Loader2, ArrowRight, Search, Inbox,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { InformeFeedback, Postulante } from '@/types/database';

const sb = supabase as any;

interface Row extends InformeFeedback {
  postulant_name: string | null;
  vacancy_name: string | null;
  postulant_status: string | null;       // informe_status del postulante
}

type Tab = 'changes_requested' | 'pending' | 'closed';

const TAB_LABEL: Record<Tab, string> = {
  changes_requested: 'Con cambios solicitados',
  pending: 'Pendientes de revisión',
  closed: 'Aprobados / Rechazados',
};

export default function MisInformes() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [tab, setTab] = useState<Tab>('changes_requested');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Gate: solo team
  useEffect(() => {
    if (role && role !== 'manager' && role !== 'selectora') navigate('/');
  }, [role, navigate]);

  // Manager: redirigir a la página clásica /informes (esta vista es para selectora)
  useEffect(() => {
    if (role === 'manager') navigate('/informes');
  }, [role, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Para selectora: traemos feedback donde ella fue submitted_by + el estado actual del postulante
      const { data: fbs, error } = await sb
        .from('informe_feedback')
        .select('*')
        .eq('submitted_by', user.id)
        .order('submitted_at', { ascending: false })
        .limit(500);
      if (error) {
        console.warn('Error loading mi-informes', error);
        setRows([]);
        return;
      }
      const fb = (fbs || []) as InformeFeedback[];

      const postulantIds = Array.from(new Set(fb.map(f => f.postulant_id)));
      if (postulantIds.length === 0) {
        setRows([]);
        return;
      }
      const { data: posts } = await sb
        .from('postulantes')
        .select('id_postulant, full_name, vacancy_name, vacancy_id, informe_status')
        .in('id_postulant', postulantIds);
      const postMap = new Map<string, Postulante>((posts || []).map((p: any) => [p.id_postulant, p]));

      // Quedarnos con la ÚLTIMA iteración por postulante (la más reciente)
      const latestByPostulant = new Map<string, InformeFeedback>();
      for (const f of fb) {
        const cur = latestByPostulant.get(f.postulant_id);
        if (!cur || f.version_number > cur.version_number) {
          latestByPostulant.set(f.postulant_id, f);
        }
      }

      const merged: Row[] = Array.from(latestByPostulant.values()).map(f => {
        const p = postMap.get(f.postulant_id);
        return {
          ...f,
          postulant_name: p?.full_name || null,
          vacancy_name: p?.vacancy_name || null,
          postulant_status: p?.informe_status || null,
        };
      });
      setRows(merged);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => {
        if (tab === 'changes_requested') return r.decision === 'changes_requested' || r.decision === 'rejected';
        if (tab === 'pending') return r.decision === null;
        return r.decision === 'approved';
      })
      .filter(r => {
        if (!q) return true;
        return (
          (r.postulant_name || '').toLowerCase().includes(q) ||
          (r.vacancy_name || '').toLowerCase().includes(q) ||
          (r.feedback || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Sin acknowledge primero (los pendientes de leer arriba)
        const aUnack = a.acknowledged_by_submitter_at == null && a.decision != null ? 0 : 1;
        const bUnack = b.acknowledged_by_submitter_at == null && b.decision != null ? 0 : 1;
        if (aUnack !== bUnack) return aUnack - bUnack;
        return (b.reviewed_at || b.submitted_at).localeCompare(a.reviewed_at || a.submitted_at);
      });
  }, [rows, tab, search]);

  const counts = useMemo(() => ({
    changes_requested: rows.filter(r => r.decision === 'changes_requested' || r.decision === 'rejected').length,
    pending: rows.filter(r => r.decision === null).length,
    closed: rows.filter(r => r.decision === 'approved').length,
    unread: rows.filter(r => r.acknowledged_by_submitter_at == null && r.decision != null && r.decision !== 'approved').length,
  }), [rows]);

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Mis Informes
        </h1>
        <p className="text-sm text-muted-foreground">
          Informes que vos enviaste y su estado actual.
          {counts.unread > 0 && (
            <span className="ml-2 text-amber-700 font-medium">
              · {counts.unread} sin leer
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="changes_requested" className="relative">
              {TAB_LABEL.changes_requested}
              {counts.changes_requested > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">{counts.changes_requested}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending">
              {TAB_LABEL.pending}
              {counts.pending > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{counts.pending}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="closed">{TAB_LABEL.closed}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar candidato, vacante o feedback…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay informes en este estado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Vacante</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Feedback del manager</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const unread = r.acknowledged_by_submitter_at == null && r.decision != null && r.decision !== 'approved';
                  return (
                    <TableRow key={r.id} className={unread ? 'bg-amber-50/40 dark:bg-amber-950/10' : undefined}>
                      <TableCell className="font-medium">{r.postulant_name || r.postulant_id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.vacancy_name || '—'}</TableCell>
                      <TableCell className="text-xs">v{r.version_number}</TableCell>
                      <TableCell><StatusBadge decision={r.decision} /></TableCell>
                      <TableCell className="text-xs max-w-md">
                        {r.feedback ? (
                          <div className="whitespace-pre-wrap line-clamp-3">{r.feedback}</div>
                        ) : (
                          <span className="text-muted-foreground italic">(sin feedback)</span>
                        )}
                        {r.reviewed_at && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {r.reviewed_by_name || 'Manager'} · {format(new Date(r.reviewed_at), "d MMM HH:mm", { locale: es })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={unread ? 'default' : 'outline'}
                          onClick={() => navigate(`/postulantes/${r.postulant_id}?vacancy_id=${r.vacancy_id}`)}
                        >
                          {unread ? 'Ver y corregir' : 'Abrir'} <ArrowRight className="h-3 w-3 ml-1" />
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

function StatusBadge({ decision }: { decision: InformeFeedback['decision'] }) {
  if (decision === 'approved') {
    return <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40"><CheckCircle2 className="h-3 w-3 mr-1" /> Aprobado</Badge>;
  }
  if (decision === 'rejected') {
    return <Badge className="bg-red-100 text-red-900 dark:bg-red-900/40"><XCircle className="h-3 w-3 mr-1" /> Rechazado</Badge>;
  }
  if (decision === 'changes_requested') {
    return <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40"><AlertCircle className="h-3 w-3 mr-1" /> Cambios solicitados</Badge>;
  }
  return <Badge variant="secondary">Pendiente</Badge>;
}
