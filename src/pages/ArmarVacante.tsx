import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { trackAction } from '@/lib/userActivity';
import {
  Wand2, Send, Loader2, Check, Circle, MessageCircleMore,
  Sparkles, Briefcase, ListChecks, MessagesSquare, RotateCcw, CheckCircle2,
} from 'lucide-react';
import type { ClientJdSession, ClientJdHistoryEntry, RubricaData } from '@/types/database';
import { renderRichText, stripMarkdown } from '@/lib/markdown';

const sb = supabase as any;
const WIZARD_URL  = 'https://accelrh.daleautomations.com/webhook/client-jd-wizard';
const CONFIRM_URL = 'https://accelrh.daleautomations.com/webhook/client-jd-confirm';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

interface WizardResponse {
  session_id: string;
  phase: 1 | 2 | 3 | 4;
  exchange_count: number;
  reply: string;
  ready_to_confirm: boolean;
  proposed_role_title: string | null;
  entregables?: { jd: string; rubrica: RubricaData; guion: string[] } | null;
}

const FASES = [
  { n: 1, label: 'Diagnóstico', desc: 'Entendemos qué necesitás' },
  { n: 2, label: 'Competencias', desc: 'Skills duros y blandos' },
  { n: 3, label: 'Mercado', desc: 'Rango salarial y referencias' },
  { n: 4, label: 'Entregables', desc: 'Descripción + Rúbrica + Guion' },
];

const INITIAL_GREETING =
  'Hola, soy tu asistente de AccelRH. Estoy acá para ayudarte a definir una nueva ' +
  'búsqueda de talento. Te voy a hacer algunas preguntas y vamos a ir armando juntos ' +
  'la Descripción de Puesto, la Rúbrica de Evaluación y un Guion de Preguntas para las ' +
  'entrevistas.\n\nContame: ¿qué puesto necesitás cubrir y por qué surge esta búsqueda ahora?';

export default function ArmarVacante() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [exchangeCount, setExchangeCount] = useState(0);
  const [proposedTitle, setProposedTitle] = useState<string | null>(null);

  const [entregables, setEntregables] = useState<WizardResponse['entregables'] | null>(null);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [hasJdDraft, setHasJdDraft] = useState(false);
  const [hasRubricaDraft, setHasRubricaDraft] = useState(false);
  const [hasGuionDraft, setHasGuionDraft] = useState(false);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Gate: cualquier rol que arma JDs (cliente, selectora, manager, enterprise, super_admin)
  useEffect(() => {
    if (role && !['cliente', 'selectora', 'manager', 'enterprise', 'super_admin'].includes(role)) {
      navigate('/');
    }
  }, [role, navigate]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Cargar sesión activa al montar (o arrancar nueva)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      trackAction('start_jd_wizard');
      const { data, error } = await sb
        .from('client_jd_sessions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) {
        console.warn('No se pudo cargar sesión activa', error);
      }
      const existing = (data && data[0]) as ClientJdSession | undefined;
      if (existing) {
        const hist = Array.isArray(existing.history) ? existing.history : [];
        const msgs: ChatMsg[] = hist.map((h: ClientJdHistoryEntry) => ({ role: h.role, content: h.content }));
        // Si no hay historial todavía, inyectamos el saludo en UI (no en DB — el primer turno lo regenera el modelo)
        setMessages(msgs.length > 0 ? msgs : [{ role: 'assistant', content: INITIAL_GREETING }]);
        setSessionId(existing.id);
        setPhase(existing.phase || 1);
        setExchangeCount(existing.exchange_count || 0);
        setProposedTitle(existing.proposed_role_title);
        setHasJdDraft(!!existing.jd_draft || !!existing.jd_final);
        setHasRubricaDraft(!!existing.rubrica_draft || !!existing.rubrica_final);
        setHasGuionDraft((existing.guion_draft?.length ?? 0) > 0 || (existing.guion_final?.length ?? 0) > 0);
        if (existing.jd_final && existing.rubrica_final && existing.guion_final) {
          setEntregables({
            jd: existing.jd_final,
            rubrica: existing.rubrica_final,
            guion: existing.guion_final,
          });
          setReadyToConfirm(true);
        }
      } else {
        setMessages([{ role: 'assistant', content: INITIAL_GREETING }]);
      }
      setBootLoading(false);
    })();
  }, [user?.id]);

  const send = async (text: string) => {
    const msg = (text || '').trim();
    if (!msg || loading || confirming || confirmed) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const res = await fetch(WIZARD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, user_id: user?.id, message: msg }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === 'error') {
        const errMsg = json?.message || 'No pude procesar tu mensaje. Probá de nuevo.';
        setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
        return;
      }
      const data = json as WizardResponse;
      setSessionId(data.session_id);
      setPhase(data.phase);
      setExchangeCount(data.exchange_count);
      if (data.proposed_role_title) setProposedTitle(data.proposed_role_title);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      setReadyToConfirm(!!data.ready_to_confirm);
      if (data.entregables) {
        setEntregables(data.entregables);
        setHasJdDraft(true);
        setHasRubricaDraft(true);
        setHasGuionDraft(true);
      } else {
        // Heurística: si la respuesta es larga + estructurada con markdown headers, marca JD draft
        if (!hasJdDraft && data.reply.length > 600 && /^#{1,3}\s/m.test(data.reply)) {
          setHasJdDraft(true);
        }
      }
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'No pude conectarme con el asistente. Si persiste, escribinos a comercial@accel-rh.com.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!sessionId || !readyToConfirm) return;
    setConfirming(true);
    try {
      const res = await fetch(CONFIRM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, user_id: user?.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === 'error') {
        toast({
          title: 'No se pudo enviar',
          description: json?.message || 'Intentá de nuevo en un momento.',
          variant: 'destructive',
        });
        return;
      }
      setConfirmed(true);
      toast({ title: '¡Listo!', description: 'Recibimos tu solicitud. El equipo te va a contactar pronto.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Falló el envío', variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  const handleReset = async () => {
    if (!sessionId) {
      setMessages([{ role: 'assistant', content: INITIAL_GREETING }]);
      setResetOpen(false);
      return;
    }
    // Marcar la sesión actual como abandoned (UPDATE via supabaseExternal — RLS no permite, pero
    // como fallback el cliente puede abrir una nueva sesión y el cron de Vicky verá la vieja como abandonada).
    // Mejor: simplemente arrancamos otra sesión nueva en el próximo POST (session_id null).
    setSessionId(null);
    setMessages([{ role: 'assistant', content: INITIAL_GREETING }]);
    setPhase(1);
    setExchangeCount(0);
    setProposedTitle(null);
    setEntregables(null);
    setReadyToConfirm(false);
    setHasJdDraft(false);
    setHasRubricaDraft(false);
    setHasGuionDraft(false);
    setResetOpen(false);
  };

  if (bootLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <Card>
          <CardContent className="p-10 text-center space-y-6">
            <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500" />
            <div>
              <h1 className="text-2xl font-semibold mb-2">¡Recibimos tu solicitud!</h1>
              <p className="text-muted-foreground">
                Vicky y Jimena la van a revisar y se contactan con vos en menos de 24hs.
                Te avisamos por mail y acá en el dashboard cuando esté abierta la búsqueda.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/')}>Volver al inicio</Button>
              <Button onClick={() => navigate('/vacantes')}>Ver mis vacantes</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-fuchsia-600" />
          Armemos tu próxima búsqueda
        </h1>
        <p className="text-sm text-muted-foreground">
          Charlá conmigo unos minutos y te ayudo a armar todo lo que AccelRH necesita para arrancar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Panel izquierdo: progreso */}
        <Card className="lg:col-span-1 h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Tu progreso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Fases */}
            <div className="space-y-3">
              {FASES.map(f => {
                const isCurrent = f.n === phase;
                const isDone = f.n < phase;
                return (
                  <div key={f.n} className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full h-5 w-5 flex items-center justify-center shrink-0 border ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : isCurrent ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'bg-background border-muted-foreground/30'}`}>
                      {isDone ? <Check className="h-3 w-3" /> : <span className="text-[10px] font-medium">{f.n}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isCurrent ? 'text-fuchsia-700 dark:text-fuchsia-400' : isDone ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {f.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{f.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-3 text-xs text-muted-foreground">
              <div>Intercambios: <span className="font-medium text-foreground">{exchangeCount}</span></div>
              {proposedTitle && (
                <div className="mt-1">Puesto propuesto: <span className="font-medium text-foreground">{stripMarkdown(proposedTitle)}</span></div>
              )}
            </div>

            {/* Estado entregables */}
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Entregables</div>
              <DeliverableRow icon={Briefcase}    label="Descripción de Puesto"  state={entregables ? 'final' : hasJdDraft ? 'draft' : 'pending'} />
              <DeliverableRow icon={ListChecks}   label="Rúbrica de Evaluación"  state={entregables ? 'final' : hasRubricaDraft ? 'draft' : 'pending'} />
              <DeliverableRow icon={MessagesSquare} label="Guion de Preguntas"   state={entregables ? 'final' : hasGuionDraft ? 'draft' : 'pending'} />
            </div>

            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setResetOpen(true)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reiniciar conversación
            </Button>
          </CardContent>
        </Card>

        {/* Panel derecho: chat */}
        <Card className="lg:col-span-2 flex flex-col" style={{ minHeight: '70vh' }}>
          <CardContent className="flex-1 flex flex-col p-4 gap-3">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-1 max-h-[60vh]">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                    {m.role === 'assistant' ? renderRichText(m.content) : m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-muted-foreground">Pensando…</span>
                  </div>
                </div>
              )}
            </div>

            {readyToConfirm && entregables && (
              <DeliverablesPreview entregables={entregables} onConfirm={handleConfirm} confirming={confirming} role={role} />
            )}

            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-end gap-2 pt-2 border-t"
            >
              <Textarea
                placeholder="Escribí tu mensaje…"
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={loading || confirming}
                rows={2}
                className="flex-1 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              <Button type="submit" size="sm" disabled={!input.trim() || loading || confirming}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground text-center">
              <MessageCircleMore className="h-3 w-3 inline mr-1" />
              Enter envía. Shift+Enter agrega un salto de línea. La conversación se guarda automáticamente.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Reiniciar la conversación?</DialogTitle>
            <DialogDescription>
              Vas a empezar una sesión nueva desde cero. La conversación actual queda guardada
              en el sistema pero no la vas a poder retomar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReset}>Reiniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function DeliverableRow({
  icon: Icon, label, state,
}: { icon: React.ComponentType<{ className?: string }>; label: string; state: 'pending' | 'draft' | 'final' }) {
  const cfg = {
    pending: { variant: 'outline' as const, badge: 'Pendiente', color: 'text-muted-foreground' },
    draft:   { variant: 'secondary' as const, badge: 'Borrador', color: 'text-amber-600' },
    final:   { variant: 'default' as const, badge: 'Final',     color: 'text-emerald-600' },
  }[state];
  return (
    <div className="flex items-center gap-2.5">
      <Icon className={`h-4 w-4 ${cfg.color}`} />
      <span className="text-sm flex-1 truncate">{label}</span>
      <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">{cfg.badge}</Badge>
    </div>
  );
}

function DeliverablesPreview({
  entregables, onConfirm, confirming, role,
}: { entregables: NonNullable<WizardResponse['entregables']>; onConfirm: () => void; confirming: boolean; role: string | null; }) {
  const isSelectora = role === 'selectora';
  const isCliente = role === 'cliente';
  const ctaLabel = isCliente ? 'Crear esta búsqueda → Enviar a AccelRH'
    : isSelectora ? 'Enviar a aprobación del manager'
    : 'Crear esta búsqueda → Abrir vacante';
  const footnote = isCliente
    ? 'Al enviar, Vicky y Jimena reciben tus 3 entregables y se contactan con vos en menos de 24hs.'
    : isSelectora
    ? 'Tu solicitud queda pendiente. Cuando el manager la apruebe, la vacante se abre y arranca la búsqueda.'
    : 'Al enviar, se crea la vacante en tu organización y queda lista para cargar candidatos y evaluar con IA.';
  const { jd, rubrica, guion } = entregables;
  const criterios = Array.isArray(rubrica?.criterios) ? rubrica.criterios : [];
  return (
    <Card className="border-fuchsia-300 bg-fuchsia-50/50 dark:bg-fuchsia-950/20 dark:border-fuchsia-900">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-fuchsia-600" />
          Tus 3 entregables están listos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="border rounded-md bg-background">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5" /> Descripción de Puesto
          </summary>
          <div className="px-3 pb-3 text-xs whitespace-pre-wrap text-foreground max-h-72 overflow-y-auto">{jd}</div>
        </details>

        <details className="border rounded-md bg-background">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2">
            <ListChecks className="h-3.5 w-3.5" /> Rúbrica de Evaluación ({criterios.length} criterios)
          </summary>
          <div className="px-3 pb-3 text-xs">
            <table className="w-full">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-1 pr-2">Criterio</th>
                  <th className="text-left py-1 pr-2">Descripción</th>
                  <th className="text-right py-1">Peso</th>
                </tr>
              </thead>
              <tbody>
                {criterios.map((c, i) => (
                  <tr key={i} className="border-b border-muted/40">
                    <td className="py-1 pr-2 font-medium">{c.criterio}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{c.descripcion || '—'}</td>
                    <td className="py-1 text-right">{c.puntaje_max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="border rounded-md bg-background">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2">
            <MessagesSquare className="h-3.5 w-3.5" /> Guion de Preguntas ({guion.length})
          </summary>
          <ol className="px-6 pb-3 text-xs text-foreground space-y-1 list-decimal">
            {guion.map((q, i) => <li key={i}>{q}</li>)}
          </ol>
        </details>

        <Button
          onClick={onConfirm}
          disabled={confirming}
          className="w-full bg-fuchsia-600 hover:bg-fuchsia-700"
        >
          {confirming ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</>
          ) : (
            <>{ctaLabel}</>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          {footnote}
        </p>
      </CardContent>
    </Card>
  );
}
