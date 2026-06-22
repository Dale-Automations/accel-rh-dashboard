import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, MessageCircle, Check, CheckCheck, EyeOff } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { PostulantMessage, UserRole } from '@/types/database';
import { renderRichText } from '@/lib/markdown';
import { createNotifications } from '@/lib/notifications';
import { listVacancyClientes } from '@/lib/informeFeedback';

const sb = supabase as any;

interface Props {
  postulantId: string;
  vacancyId: string;
  vacancyName?: string | null;
  postulantName?: string | null;
  role: UserRole;
  currentUserId: string;
  currentUserName: string;
  /** Mostrar siempre los mensajes internos (default true para team). Cliente nunca los ve por RLS. */
  collapseInitialState?: 'open' | 'closed';
}

export function MessageThread({
  postulantId,
  vacancyId,
  vacancyName,
  postulantName,
  role,
  currentUserId,
  currentUserName,
}: Props) {
  const { toast } = useToast();
  const isCliente = role === 'cliente';

  const [messages, setMessages] = useState<PostulantMessage[]>([]);
  const [input, setInput] = useState('');
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Cargar mensajes iniciales + suscribirse a realtime
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await sb
        .from('postulant_messages')
        .select('*')
        .eq('postulant_id', postulantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (!mounted) return;
      if (error) {
        console.warn('Error cargando mensajes', error);
        setMessages([]);
      } else {
        setMessages((data || []) as PostulantMessage[]);
      }
      setLoading(false);
    })();

    const channel = sb
      .channel(`postulant-messages-${postulantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'postulant_messages', filter: `postulant_id=eq.${postulantId}` },
        (payload: any) => {
          const m = payload.new as PostulantMessage;
          if (!m || m.deleted_at) return;
          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev;
            return [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'postulant_messages', filter: `postulant_id=eq.${postulantId}` },
        (payload: any) => {
          const m = payload.new as PostulantMessage;
          if (!m) return;
          setMessages(prev => prev.map(x => (x.id === m.id ? m : x)));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      sb.removeChannel(channel);
    };
  }, [postulantId]);

  // Marcar como leído al cargar
  useEffect(() => {
    if (loading || messages.length === 0) return;
    if (isCliente) {
      // Cliente: marca como leídos los mensajes públicos sin read_by_client_at
      const pending = messages.filter(m => m.visible_to_client && !m.read_by_client_at);
      if (pending.length === 0) return;
      const ids = pending.map(m => m.id);
      sb.from('postulant_messages')
        .update({ read_by_client_at: new Date().toISOString() })
        .in('id', ids)
        .then(({ error }: any) => {
          if (error) console.warn('No se pudo marcar como leído (cliente)', error);
        });
    } else {
      // Team: marca como leídos los mensajes del cliente sin read_by_team_at
      const pending = messages.filter(m => m.author_role === 'cliente' && !m.read_by_team_at);
      if (pending.length === 0) return;
      const ids = pending.map(m => m.id);
      sb.from('postulant_messages')
        .update({
          read_by_team_at: new Date().toISOString(),
          read_by_team_user_id: currentUserId,
          read_by_team_user_name: currentUserName,
        })
        .in('id', ids)
        .then(({ error }: any) => {
          if (error) console.warn('No se pudo marcar como leído (team)', error);
        });
    }
  }, [loading, messages.length, isCliente, currentUserId, currentUserName]);

  // Auto scroll cuando cambian los mensajes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, sending]);

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);

    const payload = {
      postulant_id: postulantId,
      vacancy_id: vacancyId,
      author_id: currentUserId,
      author_role: role,
      author_name: currentUserName,
      content,
      visible_to_client: isCliente ? true : visibleToClient,
    };

    const { error } = await sb.from('postulant_messages').insert(payload);

    if (error) {
      console.error('Error enviando mensaje', error);
      toast({ title: 'No se pudo enviar', description: error.message, variant: 'destructive' });
      setSending(false);
      return;
    }

    // Notificar a la audiencia correcta
    const audienceFlags: { includeClientes?: boolean; onlyClientes?: boolean } = {};
    if (isCliente) {
      // Cliente postea → notif a managers + selectoras asignadas (default sin flags)
    } else if (visibleToClient) {
      // Team posteó mensaje público → notif al cliente (no a los otros del team)
      audienceFlags.onlyClientes = true;
    } else {
      // Team posteó interno → notif a otros del team (default sin flags)
    }

    createNotifications({
      actorName: currentUserName,
      postulantId,
      postulantName: postulantName || postulantId,
      vacancyId,
      vacancyName: vacancyName || '',
      action: isCliente ? 'mensaje_cliente' : visibleToClient ? 'mensaje_team' : 'mensaje_interno',
      fieldsChanged: isCliente
        ? ['Nuevo mensaje del cliente']
        : visibleToClient
          ? ['Nuevo mensaje del equipo']
          : ['Comentario interno'],
      currentUserId,
      ...audienceFlags,
    });

    // Email al equipo cuando el cliente postea un mensaje. Reusamos el type
    // 'postulant_comment' que el workflow ya maneja (resuelve managers + selectoras
    // de la vacancy internamente).
    if (isCliente) {
      fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'postulant_comment',
          postulant_id: postulantId,
          postulant_name: postulantName || postulantId,
          vacancy_id: vacancyId,
          vacancy_name: vacancyName || '',
          cliente_name: currentUserName,
          comment: content,
        }),
      }).catch(() => { /* fire-and-forget */ });
    } else if (visibleToClient) {
      // Equipo postea respuesta al cliente. Resolvemos los emails de clientes
      // asignados a la vacancy y disparamos type 'team_response_cliente' por cada uno.
      try {
        const clientes = await listVacancyClientes(vacancyId);
        clientes.forEach(c => {
          fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'team_response_cliente',
              to_email: c.email,
              to_name: c.name,
              postulant_id: postulantId,
              postulant_name: postulantName || postulantId,
              vacancy_id: vacancyId,
              vacancy_name: vacancyName || '',
              actor_name: currentUserName,
              comment: content,
            }),
          }).catch(() => { /* fire-and-forget */ });
        });
      } catch { /* fire-and-forget */ }
    }

    setInput('');
    setSending(false);
  };

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messages]
  );

  return (
    <Card className="border-primary/10">
      <CardContent className="p-4 space-y-3">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">
              {isCliente ? 'Comunicación con AccelRH' : 'Hilo del candidato'}
            </h3>
            {!isCliente && sortedMessages.some(m => m.author_role === 'cliente' && !m.read_by_team_at) && (
              <Badge variant="destructive" className="text-[10px]">
                Mensaje sin leer del cliente
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {sortedMessages.length} {sortedMessages.length === 1 ? 'mensaje' : 'mensajes'}
          </span>
        </header>

        <div
          ref={scrollRef}
          className="max-h-96 overflow-y-auto space-y-3 px-1 py-1 bg-muted/20 rounded-md"
        >
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando mensajes…
            </div>
          ) : sortedMessages.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6">
              {isCliente
                ? 'Todavía no hay mensajes. Escribí algo si querés que el equipo te conteste.'
                : 'Sin mensajes para este candidato. Podés escribir una nota interna o un mensaje visible al cliente.'}
            </div>
          ) : (
            sortedMessages.map(m => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.author_id === currentUserId}
                viewerRole={role}
              />
            ))
          )}
        </div>

        {/* Composer */}
        <div className="space-y-2 pt-1 border-t">
          {!isCliente && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="visible-to-client"
                  checked={visibleToClient}
                  onCheckedChange={setVisibleToClient}
                  disabled={sending}
                />
                <Label htmlFor="visible-to-client" className="text-xs cursor-pointer">
                  Publicar al cliente
                  <span className="text-muted-foreground/70 ml-1 font-normal">
                    {visibleToClient ? '— el cliente lo va a ver' : '— queda solo para el equipo'}
                  </span>
                </Label>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                isCliente
                  ? 'Contale al equipo de AccelRH sobre este candidato…'
                  : visibleToClient
                    ? 'Mensaje visible al cliente (ej: lo llamamos a entrevista)…'
                    : 'Comentario interno (no se publica al cliente)…'
              }
              rows={2}
              disabled={sending}
              className="text-sm resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button size="sm" onClick={send} disabled={!input.trim() || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Cmd/Ctrl + Enter para enviar. {!isCliente && 'El toggle determina si lo ve el cliente.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function MessageBubble({
  message,
  isOwn,
  viewerRole,
}: {
  message: PostulantMessage;
  isOwn: boolean;
  viewerRole: UserRole;
}) {
  const isInternal = !message.visible_to_client;
  const isCliente = viewerRole === 'cliente';
  const showInternalBadge = !isCliente && isInternal;

  // Read receipt: mostrarlo solo en los mensajes propios del lector
  // - Si soy team y mi mensaje es público al cliente y el cliente lo leyó
  // - Si soy cliente y mi mensaje fue leído por team
  let readReceipt: string | null = null;
  if (isOwn) {
    if (viewerRole !== 'cliente' && message.visible_to_client && message.read_by_client_at) {
      readReceipt = `Leído por el cliente · ${formatDistanceToNow(new Date(message.read_by_client_at), { locale: es, addSuffix: true })}`;
    } else if (viewerRole === 'cliente' && message.read_by_team_at) {
      const who = message.read_by_team_user_name || 'el equipo';
      readReceipt = `Leído por ${who} · ${formatDistanceToNow(new Date(message.read_by_team_at), { locale: es, addSuffix: true })}`;
    }
  }

  const time = format(new Date(message.created_at), "d MMM HH:mm", { locale: es });
  const authorLabel = message.author_name || (
    message.author_role === 'cliente' ? 'Cliente' :
    message.author_role === 'manager' ? 'Manager' : 'Selectora'
  );

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[86%] space-y-1">
        {!isOwn && (
          <div className="text-[10px] text-muted-foreground px-1">
            {authorLabel} <span className="capitalize">({message.author_role})</span> · {time}
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm break-words ${
            isOwn
              ? 'bg-primary text-primary-foreground'
              : message.author_role === 'cliente'
                ? 'bg-warning/10 text-foreground border border-warning/20'
                : 'bg-card text-foreground border'
          } ${isInternal && !isCliente ? 'opacity-90' : ''}`}
        >
          {renderRichText(message.content)}
        </div>
        <div className="flex items-center justify-end gap-2 px-1 flex-wrap">
          {showInternalBadge && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
              <EyeOff className="h-3 w-3" /> Interno (el cliente no lo ve)
            </span>
          )}
          {isOwn && <span className="text-[10px] text-muted-foreground">{time}</span>}
          {readReceipt && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <CheckCheck className="h-3 w-3" /> {readReceipt}
            </span>
          )}
          {isOwn && !readReceipt && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3" /> Enviado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default MessageThread;
