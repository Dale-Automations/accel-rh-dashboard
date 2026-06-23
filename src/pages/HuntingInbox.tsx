import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Send, Loader2, Inbox, Check, X, ExternalLink, MessageSquare, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/formatters';
import { trackAction } from '@/lib/userActivity';

const sb = supabase as any;

// Plantilla por defecto: tono/cierre de Vicky, con placeholders para que sea reusable por vacante.
const DEFAULT_TEMPLATE = `Hola {nombre}, ¿cómo estás?

Te escribo desde AccelRH. Estamos buscando perfiles para {vacancy_name} y el tuyo nos llamó la atención: {razon_match}. ¿Te interesaría conocer más sobre la oportunidad?

Si te resulta interesante, ¿podrías compartirme tu teléfono y/o email de contacto para coordinar una breve entrevista?

¡Muchas gracias por tu tiempo!`;

type Tab = 'compose' | 'approval' | 'queue';

interface Candidate {
  id_postulant: string;
  full_name: string | null;
  vacancy_id: string;
  notes: string | null;            // = URL de LinkedIn
  vacancy_name: string | null;
  razon: string | null;
}

interface QueueRow {
  id: number;
  postulant_id: string;
  vacancy_id: string;
  message_body: string;
  status: string;
  sent_via_account: string | null;
  sent_at: string | null;
  created_at: string;
  full_name?: string | null;
  vacancy_name?: string | null;
}

const firstName = (full?: string | null) => (full || '').trim().split(/\s+/)[0] || '';
const personalize = (tpl: string, c: { nombre: string; vacancy_name: string; razon: string }) =>
  tpl.replaceAll('{nombre}', c.nombre).replaceAll('{vacancy_name}', c.vacancy_name).replaceAll('{razon_match}', c.razon);

export default function HuntingInbox() {
  const { role, profile } = useAuth();
  const { toast } = useToast();
  const isManager = role === 'manager' || role === 'enterprise' || role === 'super_admin';
  const isTeam = role === 'manager' || role === 'selectora' || role === 'enterprise' || role === 'super_admin';

  const [tab, setTab] = useState<Tab>('compose');
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [vacancyFilter, setVacancyFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [submitting, setSubmitting] = useState(false);

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  // ---- Carga de candidatos (LinkedIn + match + no encolados) ----
  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      // Inbox = candidatos que el equipo marcó para contactar (etapa "Contactar"),
      // no todo el acumulado de matches (eso traía descartados/rechazados/ya-contactados).
      const { data: posts } = await sb
        .from('postulantes')
        .select('id_postulant, full_name, vacancy_id, notes, vacantes(vacancy_name, status)')
        .like('source', 'LinkedIn%')
        .eq('etapa', 'Contactar')
        .limit(500);
      // Solo de vacantes activas (no tiene sentido contactar para una vacante cerrada)
      const list = ((posts || []) as any[]).filter(p => p.vacantes?.status === 'Activa');

      // Excluir los que ya están en la cola (cualquier estado salvo cancelled)
      const { data: queued } = await sb
        .from('hunting_message_queue')
        .select('postulant_id, status')
        .neq('status', 'cancelled');
      const queuedIds = new Set((queued || []).map((q: any) => q.postulant_id));

      const fresh = list.filter(p => !queuedIds.has(p.id_postulant));

      // Razón del match (cv_scores.razones_top3) por postulante
      const ids = fresh.map(p => p.id_postulant);
      const reasonByPid = new Map<string, string>();
      if (ids.length) {
        const { data: scores } = await sb
          .from('cv_scores')
          .select('postulant_id, razones_top3, scored_at')
          .in('postulant_id', ids)
          .order('scored_at', { ascending: false });
        for (const s of (scores || []) as any[]) {
          if (!reasonByPid.has(s.postulant_id)) {
            const r = Array.isArray(s.razones_top3) ? s.razones_top3[0] : null;
            if (r) reasonByPid.set(s.postulant_id, String(r));
          }
        }
      }

      setCandidates(fresh.map(p => ({
        id_postulant: p.id_postulant,
        full_name: p.full_name,
        vacancy_id: p.vacancy_id,
        notes: p.notes,
        vacancy_name: p.vacantes?.vacancy_name || null,
        razon: reasonByPid.get(p.id_postulant) || null,
      })));
    } catch (err) {
      console.warn('Error cargando candidatos', err);
      setCandidates([]);
    }
    setLoading(false);
  }, []);

  // ---- Carga de la cola (aprobación + historial) ----
  const loadQueue = useCallback(async () => {
    const { data } = await sb
      .from('hunting_message_queue')
      .select('id, postulant_id, vacancy_id, message_body, status, sent_via_account, sent_at, created_at, postulantes(full_name), vacantes(vacancy_name)')
      .order('created_at', { ascending: false })
      .limit(300);
    setQueue(((data || []) as any[]).map(q => ({
      ...q,
      full_name: q.postulantes?.full_name || null,
      vacancy_name: q.vacantes?.vacancy_name || null,
    })));
  }, []);

  useEffect(() => {
    if (role && !isTeam) return;
    loadCandidates();
    loadQueue();
  }, [role, isTeam, loadCandidates, loadQueue]);

  const vacancyOptions = useMemo(() => {
    const m = new Map<string, string>();
    candidates.forEach(c => m.set(c.vacancy_id, c.vacancy_name || c.vacancy_id));
    return Array.from(m.entries());
  }, [candidates]);

  const visibleCandidates = useMemo(
    () => candidates.filter(c => vacancyFilter === 'all' || c.vacancy_id === vacancyFilter),
    [candidates, vacancyFilter],
  );

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const toggleAll = () => setSelected(prev =>
    prev.size === visibleCandidates.length ? new Set() : new Set(visibleCandidates.map(c => c.id_postulant)));

  // ---- Enviar seleccionados a aprobación ----
  const submitToQueue = async () => {
    const chosen = candidates.filter(c => selected.has(c.id_postulant));
    if (!chosen.length) { toast({ title: 'No seleccionaste candidatos', variant: 'destructive' }); return; }
    if (!template.trim()) { toast({ title: 'La plantilla está vacía', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const rows = chosen.map(c => ({
        postulant_id: c.id_postulant,
        vacancy_id: c.vacancy_id,
        linkedin_url: c.notes || '',
        message_body: personalize(template, {
          nombre: firstName(c.full_name),
          vacancy_name: c.vacancy_name || 'la búsqueda',
          razon: c.razon || 'tu experiencia',
        }),
        status: 'pending_approval',
        created_by: profile?.id || null,
      }));
      const { error } = await sb.from('hunting_message_queue').insert(rows);
      if (error) throw error;
      trackAction('hunting_message_propose');
      toast({ title: `${rows.length} mensaje${rows.length > 1 ? 's' : ''} enviado${rows.length > 1 ? 's' : ''} a aprobación`, description: isManager ? 'Aprobalos en la pestaña "Pendientes".' : 'Un manager los va a revisar.' });
      setSelected(new Set());
      loadCandidates();
      loadQueue();
    } catch (err: any) {
      toast({ title: 'Error al enviar a la cola', description: err.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  // ---- Aprobar / cancelar (manager) ----
  const approve = async (q: QueueRow) => {
    setBusyId(q.id);
    try {
      const { error } = await sb.from('hunting_message_queue')
        .update({ status: 'pending', approved_by: profile?.id || null, approved_at: new Date().toISOString() })
        .eq('id', q.id);
      if (error) throw error;
      toast({ title: 'Mensaje aprobado', description: 'Entró a la cola de envío.' });
      loadQueue();
    } catch (err: any) {
      toast({ title: 'Error al aprobar', description: err.message, variant: 'destructive' });
    }
    setBusyId(null);
  };
  const cancel = async (q: QueueRow) => {
    setBusyId(q.id);
    try {
      const { error } = await sb.from('hunting_message_queue').update({ status: 'cancelled' }).eq('id', q.id);
      if (error) throw error;
      toast({ title: 'Mensaje cancelado' });
      loadQueue();
      loadCandidates();
    } catch (err: any) {
      toast({ title: 'Error al cancelar', description: err.message, variant: 'destructive' });
    }
    setBusyId(null);
  };

  const pendingApproval = queue.filter(q => q.status === 'pending_approval');
  const inQueue = queue.filter(q => q.status === 'pending' || q.status === 'sent' || q.status === 'failed');

  if (role && !isTeam) {
    return <div className="max-w-5xl mx-auto py-10 text-center text-muted-foreground">Esta sección es solo para el equipo de AccelRH.</div>;
  }

  const STATUS_BADGE: Record<string, string> = {
    pending_approval: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
    pending: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
    sent: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
    failed: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  };
  const STATUS_LABEL: Record<string, string> = { pending_approval: 'Pend. aprobación', pending: 'En cola', sent: 'Enviado', failed: 'Falló' };

  return (
    <div className="max-w-6xl mx-auto py-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Contacto LinkedIn
        </h1>
        <p className="text-sm text-muted-foreground">
          Aparecen los candidatos de LinkedIn que el equipo marcó en la etapa "Contactar". Proponés el mensaje, el manager lo aprueba y el sistema lo envía con rate-limiting para cuidar las cuentas.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="compose">Candidatos a contactar</TabsTrigger>
          {isManager && (
            <TabsTrigger value="approval">
              Pendientes de aprobación{pendingApproval.length ? ` (${pendingApproval.length})` : ''}
            </TabsTrigger>
          )}
          <TabsTrigger value="queue">Cola y enviados</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ---------- TAB COMPOSE ---------- */}
      {tab === 'compose' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">Candidatos marcados para contactar</CardTitle>
              {vacancyOptions.length > 1 && (
                <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
                  <SelectTrigger className="h-8 w-[220px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las vacantes</SelectItem>
                    {vacancyOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : visibleCandidates.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No hay candidatos en "Contactar". Cuando el equipo mueve un candidato de LinkedIn a la etapa "Contactar", aparece acá.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox checked={selected.size > 0 && selected.size === visibleCandidates.length} onCheckedChange={toggleAll} aria-label="Seleccionar todos" />
                      </TableHead>
                      <TableHead>Candidato</TableHead>
                      <TableHead>Vacante</TableHead>
                      <TableHead>Razón del match</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleCandidates.map(c => (
                      <TableRow key={c.id_postulant} className={selected.has(c.id_postulant) ? 'bg-primary/5' : ''}>
                        <TableCell><Checkbox checked={selected.has(c.id_postulant)} onCheckedChange={() => toggle(c.id_postulant)} aria-label={`Seleccionar ${c.full_name}`} /></TableCell>
                        <TableCell className="font-medium text-sm">{c.full_name || c.id_postulant}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.vacancy_name || c.vacancy_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={c.razon || ''}>{c.razon || '—'}</TableCell>
                        <TableCell>
                          {c.notes && <a href={c.notes} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex" title="Ver perfil"><ExternalLink className="h-3.5 w-3.5" /></a>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit lg:sticky lg:top-4">
            <CardHeader className="pb-2"><CardTitle className="text-base">Mensaje</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Plantilla (placeholders se reemplazan por candidato)</Label>
                <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={11} className="text-sm" />
                <p className="text-[11px] text-muted-foreground">Disponibles: <code>{'{nombre}'}</code> · <code>{'{vacancy_name}'}</code> · <code>{'{razon_match}'}</code>. El asunto del InMail lo maneja el sender de PhantomBuster.</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-2">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Vista previa (1er seleccionado)</p>
                <p className="text-xs whitespace-pre-wrap">
                  {(() => {
                    const c = candidates.find(x => selected.has(x.id_postulant));
                    if (!c) return 'Seleccioná un candidato para previsualizar…';
                    return personalize(template, { nombre: firstName(c.full_name), vacancy_name: c.vacancy_name || 'la búsqueda', razon: c.razon || 'tu experiencia' });
                  })()}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full" disabled={submitting || selected.size === 0 || !template.trim()}>
                    {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Enviar a aprobación ({selected.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Enviar {selected.size} mensaje{selected.size > 1 ? 's' : ''} a aprobación?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Quedan en la cola como "pendiente de aprobación". {isManager ? 'Los aprobás vos en la otra pestaña.' : 'Un manager los revisa antes de enviarse.'} No se envía nada todavía.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={submitToQueue}>Enviar a aprobación</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---------- TAB APPROVAL (manager) ---------- */}
      {tab === 'approval' && isManager && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mensajes pendientes de aprobación</CardTitle></CardHeader>
          <CardContent>
            {pendingApproval.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><Check className="h-8 w-8 mx-auto mb-2 opacity-50" />No hay mensajes esperando aprobación.</div>
            ) : (
              <div className="space-y-2">
                {pendingApproval.map(q => (
                  <div key={q.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{q.full_name || q.postulant_id}</div>
                        <div className="text-xs text-muted-foreground">{q.vacancy_name || q.vacancy_id}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === q.id ? null : q.id)}>
                          {expanded === q.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => cancel(q)} disabled={busyId === q.id} className="text-destructive">
                          <X className="h-4 w-4 mr-1" /> Cancelar
                        </Button>
                        <Button size="sm" onClick={() => approve(q)} disabled={busyId === q.id}>
                          {busyId === q.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Aprobar
                        </Button>
                      </div>
                    </div>
                    {expanded === q.id && (
                      <p className="text-xs whitespace-pre-wrap mt-2 border-t pt-2 text-muted-foreground">{q.message_body}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------- TAB QUEUE / SENT ---------- */}
      {tab === 'queue' && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cola de envío e historial</CardTitle></CardHeader>
          <CardContent>
            {inQueue.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />Todavía no hay mensajes aprobados ni enviados.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Vacante</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inQueue.map(q => (
                    <TableRow key={q.id}>
                      <TableCell className="text-sm font-medium">{q.full_name || q.postulant_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.vacancy_name || q.vacancy_id}</TableCell>
                      <TableCell><Badge className={`${STATUS_BADGE[q.status] || 'bg-muted'} text-xs`}>{STATUS_LABEL[q.status] || q.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.sent_via_account || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.sent_at ? formatDate(q.sent_at) : formatDate(q.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
