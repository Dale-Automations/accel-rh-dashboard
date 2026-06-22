import { useEffect, useState, useCallback } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Target, Sparkles, Loader2, Send, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/formatters';
import { trackAction } from '@/lib/userActivity';
import HuntingRequestActions, { type HuntingAccount } from '@/components/HuntingRequestActions';
import HuntingScrapeMoreButton from '@/components/HuntingScrapeMoreButton';
import HuntingUsageBadge from '@/components/HuntingUsageBadge';

const sb = supabase as any;
const N8N = 'https://accelrh.daleautomations.com';

type Role = 'manager' | 'selectora' | 'cliente' | null;

interface HuntingRequest {
  id: number;
  vacancy_id: string;
  requested_by: string | null;
  sales_nav_url: string | null;
  generated_string: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'executed' | 'rejected';
  approved_by: string | null;
  rejected_reason: string | null;
  created_at: string;
}

// Colores de estado alineados a JdSessionsIndex (light + dark, contraste AA).
const STATUS_META: Record<string, { label: string; className: string }> = {
  pending:  { label: 'Pendiente', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  approved: { label: 'En curso',  className: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200' },
  executed: { label: 'Ejecutada', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' },
  rejected: { label: 'Rechazada', className: 'bg-muted text-muted-foreground' },
};
const PENDING_BADGE = 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';

interface Props {
  vacancyId: string;
  vacancyName: string | null;
  role: Role;
  userId: string | undefined;
}

export default function HuntingCard({ vacancyId, vacancyName, role, userId }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<HuntingRequest[]>([]);
  const [accounts, setAccounts] = useState<HuntingAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal "Solicitar Headhunting" (selectora + manager)
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedString, setGeneratedString] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string> | null>(null);
  const [salesNavUrl, setSalesNavUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isManager = role === 'manager';
  const isTeam = role === 'manager' || role === 'selectora';

  const loadRequests = useCallback(async () => {
    const { data, error } = await sb
      .from('hunting_requests')
      .select('*')
      .eq('vacancy_id', vacancyId)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'No se pudieron cargar las solicitudes', description: error.message, variant: 'destructive' });
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  }, [vacancyId, toast]);

  useEffect(() => {
    if (!isTeam) return;
    loadRequests();
    if (isManager) {
      sb.from('hunting_accounts')
        .select('account_id, display_name, status, sent_today, daily_cap')
        .eq('status', 'active')
        .then(({ data }: any) => setAccounts(data || []));
    }
    const channel = sb
      .channel(`hunting_requests:${vacancyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hunting_requests', filter: `vacancy_id=eq.${vacancyId}` }, () => loadRequests())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [vacancyId, isTeam, isManager, loadRequests]);

  // Generador IA para el modal de crear (devuelve string + filtros sugeridos)
  const generateString = async (): Promise<string | null> => {
    setGenerating(true);
    try {
      const res = await fetch(`${N8N}/webhook/accelrh-hunting-string-generator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vacancy_id: vacancyId }),
      });
      if (!res.ok) throw new Error(`El generador respondió ${res.status}`);
      const json = await res.json();
      if (!json?.boolean_string) throw new Error(json?.message || 'No se obtuvo una cadena de búsqueda');
      setFiltros(json.filtros || null);
      return json.boolean_string as string;
    } catch (err: any) {
      toast({ title: 'No se pudo generar con IA', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateInModal = async () => {
    const s = await generateString();
    if (s) setGeneratedString(s);
  };

  const resetModal = () => {
    setGeneratedString(''); setFiltros(null); setSalesNavUrl(''); setNotes('');
  };

  const handleSubmitRequest = async () => {
    if (!generatedString.trim() && !salesNavUrl.trim()) {
      toast({ title: 'Falta información', description: 'Generá la cadena con IA o pegá una URL de Sales Navigator.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await sb.from('hunting_requests').insert({
        vacancy_id: vacancyId,
        requested_by: userId,
        sales_nav_url: salesNavUrl.trim() || null,
        generated_string: generatedString.trim() || null,
        notes: notes.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      trackAction('hunting_request_create');
      // Aviso por email a los managers (fire-and-forget, no bloquea la UI)
      fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'hunting_requested',
          vacancy_id: vacancyId,
          vacancy_name: vacancyName,
          actor_name: profile?.full_name || 'Una selectora',
        }),
      }).catch(() => {});
      toast({ title: 'Solicitud enviada', description: 'El manager la verá en pendientes y le llega un email.' });
      setOpen(false);
      resetModal();
      loadRequests();
    } catch (err: any) {
      toast({ title: 'Error al solicitar hunting', description: err.message, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  if (!isTeam) return null;

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const requestDialog = (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetModal(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full"><Target className="h-4 w-4 mr-2" /> Solicitar Headhunting</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Solicitar Headhunting — {vacancyName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="hunt-string">Cadena de búsqueda (Keywords de Sales Navigator)</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleGenerateInModal} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generar con IA
              </Button>
            </div>
            <Textarea
              id="hunt-string"
              value={generatedString}
              onChange={(e) => setGeneratedString(e.target.value)}
              placeholder='Ej: ("Node.js" AND TypeScript) AND (PostgreSQL OR "bases de datos relacionales")'
              rows={3}
            />
            {filtros && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {Object.entries(filtros).filter(([, v]) => v).map(([k, v]) => (
                  <Badge key={k} variant="outline" className="font-normal">{k}: {v}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="hunt-url">URL de Sales Navigator (recomendada)</Label>
            <Input id="hunt-url" value={salesNavUrl} onChange={(e) => setSalesNavUrl(e.target.value)} placeholder="https://www.linkedin.com/sales/search/people?..." />
            <p className="text-xs text-muted-foreground">Si no la pegás, el manager la arma antes de ejecutar.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hunt-notes">Notas para el manager (opcional)</Label>
            <Textarea id="hunt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Aclaraciones, prioridades, etc." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmitRequest} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Botón en la barra de acciones + Popover overlay (no roba espacio vertical).
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Target className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Headhunting</span>
          {pendingCount > 0 && (
            <>
              <Badge variant="outline" className={`hidden sm:inline-flex ml-2 h-5 px-1.5 ${PENDING_BADGE}`}>{pendingCount}</Badge>
              <span className="sm:hidden absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold">Headhunting</span>
              <span className="text-xs text-muted-foreground">· LinkedIn</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? 'Cargando…' : `${requests.length} solicitud${requests.length !== 1 ? 'es' : ''}`}
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge variant="outline" className={PENDING_BADGE}>{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</Badge>
          )}
        </div>
        <div className="px-4 pt-3 space-y-2">
          {requestDialog}
          {role === 'manager' && <HuntingUsageBadge className="w-full justify-center" />}
        </div>
        <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {!loading && requests.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">Todavía no hay solicitudes.</p>
          )}
          {requests.map((req) => {
            const meta = STATUS_META[req.status] || STATUS_META.pending;
            const workable = isManager && (req.status === 'pending' || req.status === 'rejected');
            return (
              <div key={req.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={meta.className}>
                    {req.status === 'approved' && <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />}
                    {meta.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
                </div>
                {req.generated_string && (
                  <p className="text-xs font-mono bg-muted rounded px-2 py-1.5 break-words">{req.generated_string}</p>
                )}
                {req.notes && <p className="text-sm text-muted-foreground">Nota: {req.notes}</p>}
                {req.status === 'rejected' && req.rejected_reason && (
                  <p className="text-sm text-muted-foreground">Motivo del rechazo: {req.rejected_reason}</p>
                )}

                {workable ? (
                  <HuntingRequestActions req={req} accounts={accounts} userId={userId} onChanged={loadRequests} />
                ) : (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {req.status === 'executed' && (
                      <HuntingScrapeMoreButton requestId={req.id} vacancyId={req.vacancy_id} />
                    )}
                    {req.sales_nav_url && (
                      <a href={req.sales_nav_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Ver búsqueda en Sales Navigator
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
