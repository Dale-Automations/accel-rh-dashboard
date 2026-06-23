import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as sb } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ClipboardList, Search, Eye, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { ReviewInformeDialog } from '@/components/ReviewInformeDialog';
import type { Postulante, UserProfile } from '@/types/database';

type Tab = 'pending' | 'awaiting_selectora' | 'approved' | 'rejected';

export default function Informes() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [postulantes, setPostulantes] = useState<Postulante[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<Record<string, {
    maxVersion: number;
    submittedByName: string | null;
    acknowledged: boolean;
    lastDecision: 'approved' | 'changes_requested' | 'rejected' | null;
    awaitingSelectoraCorrection: boolean;
  }>>({});
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('pending');
  const [reviewing, setReviewing] = useState<Postulante | null>(null);

  // Solo manager
  useEffect(() => {
    if (role && (role !== 'manager' && role !== 'enterprise' && role !== 'super_admin')) navigate('/');
  }, [role, navigate]);

  const load = async () => {
    if ((role !== 'manager' && role !== 'enterprise' && role !== 'super_admin')) return;
    setLoading(true);
    try {
      const [postsRes, profsRes] = await Promise.all([
        (sb as any).from('postulantes').select('*').not('informe_status', 'is', null).order('informe_submitted_at', { ascending: false }).limit(500),
        (sb as any).from('user_profiles').select('*'),
      ]);
      const posts = (postsRes.data || []) as Postulante[];
      setPostulantes(posts);
      setProfiles((profsRes.data || []) as UserProfile[]);

      // Cargar stats de informe_feedback para mostrar iteraciones + read-by-selectora
      const ids = posts.map(p => p.id_postulant);
      if (ids.length > 0) {
        const { data: fbs } = await (sb as any)
          .from('informe_feedback')
          .select('postulant_id,version_number,submitted_by_name,acknowledged_by_submitter_at,decision')
          .in('postulant_id', ids);
        const stats: typeof feedbackStats = {};
        for (const f of (fbs || [])) {
          const cur = stats[f.postulant_id];
          if (!cur || f.version_number > cur.maxVersion) {
            stats[f.postulant_id] = {
              maxVersion: f.version_number,
              submittedByName: f.submitted_by_name,
              acknowledged: !!f.acknowledged_by_submitter_at,
              lastDecision: f.decision || null,
              // Está esperando que la selectora corrija si el último feedback fue changes_requested
              // (no importa si ya hizo acknowledge — sigue siendo su pelota hasta que reenvíe nueva versión)
              awaitingSelectoraCorrection: f.decision === 'changes_requested',
            };
          }
        }
        setFeedbackStats(stats);
      } else {
        setFeedbackStats({});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [role]);

  const getSelectoraName = (id: string | null) => {
    if (!id) return '—';
    return profiles.find(p => p.id === id)?.full_name || '—';
  };
  const getSelectoraEmail = (id: string | null) => {
    if (!id) return undefined;
    return profiles.find(p => p.id === id)?.email || undefined;
  };

  // Un postulante en pending_review está "esperando selectora" si su última iteración del feedback
  // fue changes_requested (la selectora todavía no envió una nueva versión).
  const isAwaitingSelectora = (p: Postulante) =>
    p.informe_status === 'pending_review' &&
    feedbackStats[p.id_postulant]?.awaitingSelectoraCorrection === true;

  const filtered = postulantes
    .filter(p => {
      if (tab === 'approved') return p.informe_status === 'approved';
      if (tab === 'rejected') return p.informe_status === 'rejected';
      if (tab === 'awaiting_selectora') return isAwaitingSelectora(p);
      // tab === 'pending' = esperando MI revisión (pending_review pero NO en ida-vuelta hacia selectora)
      return p.informe_status === 'pending_review' && !isAwaitingSelectora(p);
    })
    .filter(p => {
      if (search.trim().length < 2) return true;
      const q = search.toLowerCase();
      return (p.full_name || '').toLowerCase().includes(q)
        || (p.vacancy_name || '').toLowerCase().includes(q)
        || (p.id_postulant || '').toLowerCase().includes(q);
    });

  const counts = {
    pending: postulantes.filter(p => p.informe_status === 'pending_review' && !isAwaitingSelectora(p)).length,
    awaiting_selectora: postulantes.filter(isAwaitingSelectora).length,
    approved: postulantes.filter(p => p.informe_status === 'approved').length,
    rejected: postulantes.filter(p => p.informe_status === 'rejected').length,
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const reviewerNameOf = (p: Postulante) => p.informe_reviewed_by ? (profiles.find(x => x.id === p.informe_reviewed_by)?.full_name || '—') : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Informes</h1>
        {counts.pending > 0 && <Badge className="bg-amber-100 text-amber-800 border-amber-300">{counts.pending} pendientes</Badge>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
          <Button
            variant={tab === 'pending' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTab('pending')}
          >Esperan mi revisión ({counts.pending})</Button>
          <Button
            variant={tab === 'awaiting_selectora' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTab('awaiting_selectora')}
          >Esperan corrección de selectora ({counts.awaiting_selectora})</Button>
          <Button
            variant={tab === 'approved' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTab('approved')}
          >Aprobados ({counts.approved})</Button>
          <Button
            variant={tab === 'rejected' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTab('rejected')}
          >Rechazados ({counts.rejected})</Button>
        </div>

        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre / ID / vacante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Candidato</TableHead>
              <TableHead className="font-semibold">Vacante</TableHead>
              <TableHead className="font-semibold w-40">Selectora</TableHead>
              <TableHead className="font-semibold w-32">Enviado</TableHead>
              {tab !== 'pending' && <TableHead className="font-semibold w-40">Revisado por</TableHead>}
              <TableHead className="font-semibold w-32 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tab !== 'pending' ? 6 : 5} className="text-center text-muted-foreground py-10">
                  {search.length >= 2
                    ? 'Sin resultados'
                    : tab === 'pending'
                      ? 'No hay informes esperando tu revisión'
                      : tab === 'awaiting_selectora'
                        ? 'No hay informes esperando corrección de la selectora'
                        : tab === 'approved'
                          ? 'No hay informes aprobados'
                          : 'No hay informes rechazados'}
                </TableCell>
              </TableRow>
            ) : filtered.map(p => (
              <TableRow key={p.id_postulant} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{p.full_name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{p.id_postulant}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{p.vacancy_name || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {/* Nombre real de quien envió el informe — fallback a selectora_id (legacy) */}
                  {feedbackStats[p.id_postulant]?.submittedByName
                    || (p.informe_submitted_by ? (profiles.find(pr => pr.id === p.informe_submitted_by)?.full_name || '—') : null)
                    || getSelectoraName(p.selectora_id)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  <div className="flex flex-col">
                    <span>{formatDate(p.informe_submitted_at)}</span>
                    {feedbackStats[p.id_postulant]?.maxVersion > 1 && (
                      <span className="text-[10px] font-medium text-amber-700">v{feedbackStats[p.id_postulant].maxVersion} · {feedbackStats[p.id_postulant].maxVersion} iteraciones</span>
                    )}
                    {tab === 'pending' && feedbackStats[p.id_postulant] && !feedbackStats[p.id_postulant].acknowledged && feedbackStats[p.id_postulant].maxVersion > 1 && (
                      <span className="text-[10px] text-muted-foreground italic">selectora aún no leyó cambios previos</span>
                    )}
                  </div>
                </TableCell>
                {tab !== 'pending' && (
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span className="text-xs">{reviewerNameOf(p) || '—'}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(p.informe_reviewed_at)}</span>
                    </div>
                  </TableCell>
                )}
                <TableCell className="text-right">
                  {tab === 'pending' ? (
                    <Button size="sm" className="h-8 text-xs" onClick={() => setReviewing(p)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />Revisar
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      {tab === 'awaiting_selectora' && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {feedbackStats[p.id_postulant]?.acknowledged ? 'Leído por selectora' : 'Sin leer'}
                        </Badge>
                      )}
                      {tab === 'approved' && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />Aprobado
                        </Badge>
                      )}
                      {tab === 'rejected' && (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <XCircle className="h-3 w-3 mr-1" />Rechazado
                        </Badge>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setReviewing(p)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />{tab === 'awaiting_selectora' ? 'Ver feedback' : 'Reabrir'}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ReviewInformeDialog
        postulant={reviewing}
        selectoraName={reviewing ? getSelectoraName(reviewing.selectora_id) : ''}
        selectoraEmail={reviewing ? getSelectoraEmail(reviewing.selectora_id) : undefined}
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        onResolved={load}
      />
    </div>
  );
}
