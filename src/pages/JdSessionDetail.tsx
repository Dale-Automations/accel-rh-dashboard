import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Wand2, Briefcase, ListChecks, MessagesSquare, MessageCircle,
  CheckCircle2, ExternalLink, Loader2, Mail, Phone,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ClientJdSession, ClientJdHistoryEntry, RubricaData } from '@/types/database';

const sb = supabase as any;
const APPROVE_URL = 'https://accelrh.daleautomations.com/webhook/client-jd-approve';

// Limpia los asteriscos/markdown del título guardado (sesiones viejas pre-fix).
function stripTitleMarkdown(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/[*_`#|]/g, '').replace(/\s+/g, ' ').trim();
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:               { label: 'En curso',                color: 'bg-muted text-foreground' },
  confirmed:            { label: 'Pendiente de aprobación', color: 'bg-amber-100 text-amber-900' },
  approved:             { label: 'Aprobada',                color: 'bg-emerald-100 text-emerald-900' },
  requires_commercial:  { label: 'Requiere comercial',     color: 'bg-blue-100 text-blue-900' },
  abandoned:            { label: 'Abandonada',             color: 'bg-rose-100 text-rose-900' },
};

export default function JdSessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [session, setSession] = useState<ClientJdSession | null>(null);
  const [cliente, setCliente] = useState<{ full_name: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [approveOpen, setApproveOpen] = useState(false);
  const [commercialOpen, setCommercialOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Gate
  useEffect(() => {
    if (role && role !== 'manager' && role !== 'selectora') {
      navigate('/');
    }
  }, [role, navigate]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await sb
      .from('client_jd_sessions')
      .select('*')
      .eq('id', id)
      .limit(1);
    if (error || !data || data.length === 0) {
      toast({ title: 'Sesión no encontrada', variant: 'destructive' });
      navigate('/jd-sessions');
      return;
    }
    const row = data[0] as ClientJdSession;
    setSession(row);

    if (row.user_id) {
      const { data: prof } = await sb
        .from('user_profiles')
        .select('full_name,email')
        .eq('id', row.user_id)
        .limit(1);
      if (prof && prof[0]) setCliente({ full_name: prof[0].full_name, email: prof[0].email });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const submitApprove = async (action: 'approve_and_open' | 'require_commercial') => {
    if (!session || !user) return;
    setSubmitting(true);
    try {
      const res = await fetch(APPROVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          action,
          approver_user_id: user.id,
          note: note.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === 'error') {
        toast({
          title: 'No se pudo procesar',
          description: json?.message || 'Intentá de nuevo.',
          variant: 'destructive',
        });
        return;
      }
      if (action === 'approve_and_open' && json.vacancy_id) {
        toast({ title: 'Vacante abierta', description: 'La búsqueda está activa.' });
        navigate(`/vacantes/${json.vacancy_id}`);
      } else {
        toast({ title: 'Solicitud derivada a comercial' });
        await load();
        setCommercialOpen(false);
        setApproveOpen(false);
        setNote('');
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Falló la operación', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = STATUS_LABEL[session.status] || { label: session.status, color: 'bg-muted' };
  const rubrica = session.rubrica_final || session.rubrica_draft;
  const criterios = (rubrica as RubricaData | null)?.criterios || [];
  const guion = session.guion_final || session.guion_draft || [];
  const history = Array.isArray(session.history) ? session.history : [];

  const canDecide = session.status === 'confirmed';
  const canReopenFromCommercial = session.status === 'requires_commercial';

  return (
    <div className="max-w-5xl mx-auto py-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/jd-sessions')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <Badge className={`${status.color} text-sm`}>{status.label}</Badge>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-fuchsia-600" />
          {stripTitleMarkdown(session.proposed_role_title) || 'Búsqueda sin título'}
        </h1>
        <p className="text-xs text-muted-foreground">
          Creada el {format(new Date(session.created_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}
          {session.confirmed_at && ` · Confirmada el ${format(new Date(session.confirmed_at), "d MMM yyyy 'a las' HH:mm", { locale: es })}`}
        </p>
      </div>

      {/* Datos del cliente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-sm font-medium">{cliente?.full_name || 'Sin nombre'}</div>
          {cliente?.email && (
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> {cliente.email}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acciones de aprobación — sesión recién confirmada por el cliente */}
      {canDecide && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm">
              Decidí si esta búsqueda entra dentro del plan contratado del cliente:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button onClick={() => setApproveOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aprobar y abrir búsqueda
              </Button>
              <Button onClick={() => setCommercialOpen(true)} variant="outline">
                <Phone className="h-4 w-4 mr-2" />
                Requiere presupuesto comercial
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sesión derivada a comercial — habilitar apertura cuando comercial confirma OK */}
      {canReopenFromCommercial && (
        <Card className="border-blue-300 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm">
              Esta búsqueda fue derivada a comercial. Si <strong>comercial ya cerró el presupuesto con el cliente</strong>, podés abrirla acá:
            </p>
            {session.approval_note && (
              <p className="text-xs text-muted-foreground italic">
                Nota del equipo: "{session.approval_note}"
              </p>
            )}
            <Button onClick={() => setApproveOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 w-full md:w-auto">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Comercial OK → Abrir búsqueda
            </Button>
          </CardContent>
        </Card>
      )}

      {session.status === 'approved' && session.created_vacancy_id && (
        <Card>
          <CardContent className="p-4">
            <Button variant="outline" onClick={() => navigate(`/vacantes/${session.created_vacancy_id}`)}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Ver vacante creada
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Descripción de Puesto */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Descripción de Puesto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm whitespace-pre-wrap max-h-[40vh] overflow-y-auto p-3 bg-muted/30 rounded-md">
            {session.jd_final || session.jd_draft || '(sin contenido)'}
          </div>
        </CardContent>
      </Card>

      {/* Rúbrica */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Rúbrica de Evaluación
          </CardTitle>
        </CardHeader>
        <CardContent>
          {criterios.length === 0 ? (
            <div className="text-sm text-muted-foreground">(sin rúbrica)</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Criterio</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criterios.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.criterio}</TableCell>
                    <TableCell className="text-muted-foreground">{c.descripcion || '—'}</TableCell>
                    <TableCell className="text-right">{c.puntaje_max}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-medium bg-muted/30">
                  <TableCell colSpan={2} className="text-right">Total</TableCell>
                  <TableCell className="text-right">
                    {criterios.reduce((s, c) => s + (c.puntaje_max || 0), 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Guion de preguntas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessagesSquare className="h-4 w-4" /> Guion de Preguntas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {guion.length === 0 ? (
            <div className="text-sm text-muted-foreground">(sin preguntas)</div>
          ) : (
            <ol className="space-y-2 text-sm list-decimal pl-6">
              {guion.map((q, i) => <li key={i}>{q}</li>)}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Historial */}
      <details className="border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium flex items-center gap-2">
          <MessageCircle className="h-4 w-4" /> Conversación completa ({history.length} mensajes)
        </summary>
        <div className="px-4 pb-4 space-y-2 max-h-[40vh] overflow-y-auto">
          {history.map((h: ClientJdHistoryEntry, i: number) => (
            <div key={i} className={`text-xs ${h.role === 'user' ? 'pl-12' : 'pr-12'}`}>
              <div className={`rounded-lg px-3 py-2 ${h.role === 'user' ? 'bg-primary/10' : 'bg-muted'}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  {h.role === 'user' ? 'Cliente' : 'Asistente'} · {format(new Date(h.ts), "d MMM HH:mm", { locale: es })}
                </div>
                <div className="whitespace-pre-wrap">{h.content}</div>
              </div>
            </div>
          ))}
        </div>
      </details>

      {/* Approve modal */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar y abrir búsqueda</DialogTitle>
            <DialogDescription>
              Se va a crear una vacante nueva con la Descripción de Puesto, la Rúbrica y el Guion
              de Preguntas que generó el cliente. La carpeta de Drive se crea automáticamente y
              el cliente queda asignado a la vacante.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs text-muted-foreground">Nota interna (opcional)</label>
            <Textarea
              value={note} onChange={e => setNote(e.target.value)}
              rows={3} placeholder="Ej: cliente paga Plan Express, abrir como prioridad."
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button
              onClick={() => submitApprove('approve_and_open')}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creando vacante…</>
              ) : (
                <>Aprobar y crear vacante</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Commercial modal */}
      <Dialog open={commercialOpen} onOpenChange={setCommercialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Derivar a comercial</DialogTitle>
            <DialogDescription>
              Se envía un email al equipo comercial con la información del cliente y la búsqueda
              para que coordine un presupuesto. El cliente recibe una notificación de que estamos
              revisando.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs text-muted-foreground">Por qué se deriva (opcional)</label>
            <Textarea
              value={note} onChange={e => setNote(e.target.value)}
              rows={3} placeholder="Ej: cliente fuera del plan contratado; pidió un perfil distinto al acordado."
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommercialOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={() => submitApprove('require_commercial')} disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
              ) : (
                <>Derivar a comercial</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
