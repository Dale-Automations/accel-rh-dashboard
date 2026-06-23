import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Target, Loader2, Inbox, ChevronDown, ChevronUp, Save, ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { useToast } from '@/hooks/use-toast';
import HuntingRequestActions, { type HuntingAccount } from '@/components/HuntingRequestActions';
import HuntingScrapeMoreButton from '@/components/HuntingScrapeMoreButton';
import HuntingUsageBadge from '@/components/HuntingUsageBadge';

const sb = supabase as any;

type Filter = 'pending' | 'approved' | 'executed' | 'rejected' | 'all';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pendiente', color: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  approved: { label: 'En curso',  color: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200' },
  executed: { label: 'Ejecutada', color: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' },
  rejected: { label: 'Rechazada', color: 'bg-muted text-muted-foreground' },
};

interface Row {
  id: number;
  vacancy_id: string;
  requested_by: string | null;
  sales_nav_url: string | null;
  generated_string: string | null;
  notes: string | null;
  rejected_reason: string | null;
  status: string;
  created_at: string;
  vacantes?: { vacancy_name: string | null } | null;
  requester_name?: string | null;
}

export default function HuntingRequestsIndex() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<HuntingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editStr, setEditStr] = useState<Record<number, string>>({});
  const [savingStr, setSavingStr] = useState<number | null>(null);
  const { toast } = useToast();

  // Gate: manager-only (el hunting se dispara/aprueba solo desde manager)
  useEffect(() => {
    if (role && role !== 'manager' && role !== 'enterprise' && role !== 'super_admin') navigate('/');
  }, [role, navigate]);

  useEffect(() => {
    if (role !== 'manager' && role !== 'enterprise' && role !== 'super_admin') return;
    sb.from('hunting_accounts')
      .select('account_id, display_name, status, sent_today, daily_cap')
      .eq('status', 'active')
      .then(({ data }: any) => setAccounts(data || []));
  }, [role]);

  const loadData = useCallback(async () => {
    setLoading(true);
    let q = sb
      .from('hunting_requests')
      .select('id, vacancy_id, requested_by, sales_nav_url, generated_string, notes, rejected_reason, status, created_at, vacantes(vacancy_name)')
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);

    const { data, error } = await q.limit(200);
    if (error) {
      console.warn('Error cargando solicitudes de hunting', error);
      setRows([]);
      setLoading(false);
      return;
    }
    const list = (data || []) as Row[];
    const ids = Array.from(new Set(list.map(r => r.requested_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await sb.from('user_profiles').select('id, full_name').in('id', ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      list.forEach(r => { r.requester_name = (r.requested_by && map.get(r.requested_by)) || null; });
    }
    setRows(list);
    setLoading(false);
  }, [filter]);

  const saveString = async (r: Row) => {
    setSavingStr(r.id);
    try {
      const { error } = await sb.from('hunting_requests').update({ generated_string: editStr[r.id] ?? '' }).eq('id', r.id);
      if (error) throw error;
      toast({ title: 'Cadena guardada' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Error al guardar', description: err.message, variant: 'destructive' });
    }
    setSavingStr(null);
  };

  useEffect(() => {
    if (role !== 'manager' && role !== 'enterprise' && role !== 'super_admin') return;
    loadData();
  }, [role, loadData]);

  return (
    <div className="max-w-5xl mx-auto py-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Solicitudes de Headhunting
          </h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes de búsqueda en LinkedIn. Trabajá las pendientes o rechazadas acá mismo, o entrá a la vacante.
          </p>
        </div>
        <HuntingUsageBadge />
      </div>

      <Tabs value={filter} onValueChange={(v) => { setFilter(v as Filter); setExpandedId(null); }}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="approved">En curso</TabsTrigger>
          <TabsTrigger value="executed">Ejecutadas</TabsTrigger>
          <TabsTrigger value="rejected">Rechazadas</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            {rows.length} solicitud{rows.length === 1 ? '' : 'es'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No hay solicitudes en este estado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vacante</TableHead>
                  <TableHead>Solicitada por</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const st = STATUS_LABEL[r.status] || { label: r.status, color: 'bg-muted' };
                  const workable = r.status === 'pending' || r.status === 'rejected';
                  const expanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow className={expanded ? 'border-b-0' : ''}>
                        <TableCell>
                          <div className="text-sm font-medium">{r.vacantes?.vacancy_name || r.vacancy_id}</div>
                          {r.generated_string && (
                            <div className="text-[11px] font-mono text-muted-foreground truncate max-w-xs cursor-help" title={r.generated_string}>{r.generated_string}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{r.requester_name || '—'}</TableCell>
                        <TableCell>
                          <Badge className={`${st.color} text-xs`}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setExpandedId(expanded ? null : r.id)}>
                            {workable ? 'Trabajar' : 'Ver'} {expanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/30">
                            <div className="space-y-3 py-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Cadena de búsqueda{workable ? ' (editable)' : ''}</Label>
                                {workable ? (
                                  <>
                                    <Textarea
                                      value={editStr[r.id] ?? r.generated_string ?? ''}
                                      onChange={(e) => setEditStr(prev => ({ ...prev, [r.id]: e.target.value }))}
                                      rows={2}
                                      className="text-xs font-mono"
                                      placeholder="Cadena boolean para Sales Navigator…"
                                    />
                                    <div className="flex justify-end">
                                      <Button size="sm" variant="outline" onClick={() => saveString(r)}
                                        disabled={savingStr === r.id || (editStr[r.id] ?? r.generated_string ?? '') === (r.generated_string ?? '')}>
                                        {savingStr === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Guardar cadena
                                      </Button>
                                    </div>
                                  </>
                                ) : (
                                  <p className="text-xs font-mono bg-muted rounded px-2 py-1.5 break-words whitespace-pre-wrap">{r.generated_string || '(sin cadena)'}</p>
                                )}
                              </div>
                              {r.notes && <p className="text-sm text-muted-foreground">Nota: {r.notes}</p>}
                              {r.status === 'rejected' && r.rejected_reason && (
                                <p className="text-sm text-muted-foreground">Motivo del rechazo: {r.rejected_reason}</p>
                              )}
                              {workable && (
                                <HuntingRequestActions
                                  req={r}
                                  accounts={accounts}
                                  userId={user?.id}
                                  onChanged={() => { setExpandedId(null); loadData(); }}
                                />
                              )}
                              {r.status === 'executed' && (
                                <HuntingScrapeMoreButton requestId={r.id} vacancyId={r.vacancy_id} />
                              )}
                              <a href={`/vacantes/${r.vacancy_id}`} onClick={(e) => { e.preventDefault(); navigate(`/vacantes/${r.vacancy_id}`); }}
                                className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Ver vacante completa
                              </a>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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
