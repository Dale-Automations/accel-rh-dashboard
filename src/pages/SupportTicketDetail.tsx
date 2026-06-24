import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Send, Loader2, Lock, MessageSquare,
  AlertTriangle, HelpCircle, Lightbulb, Sparkles, Building2, User as UserIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isSupport, isSuperAdmin, roleLabel } from '@/lib/roles';
import { formatDate } from '@/lib/formatters';
import type {
  SupportTicket, SupportTicketMessage, SupportTicketStatus, SupportTicketCategory,
} from '@/types/database';

const sb = supabase as any;

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: 'Abierto',
  in_progress: 'En progreso',
  waiting_user: 'Esperando respuesta',
  closed: 'Cerrado',
};

const STATUS_BADGE: Record<SupportTicketStatus, string> = {
  open: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  in_progress: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  waiting_user: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200',
  closed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
};

const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  no_entiendo: 'Duda de uso',
  error: 'Error',
  sugerencia: 'Sugerencia',
  otro: 'Otro',
};

const CATEGORY_ICON: Record<SupportTicketCategory, typeof HelpCircle> = {
  no_entiendo: HelpCircle,
  error: AlertTriangle,
  sugerencia: Lightbulb,
  otro: Sparkles,
};

function initials(name?: string | null): string {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
}

export default function SupportTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, role } = useAuth();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isSupportTeam = isSupport(role) || isSuperAdmin(role);
  const canChangeStatus = isSupportTeam;
  const ticketClosed = ticket?.status === 'closed';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: t, error: terr }, { data: ms, error: merr }] = await Promise.all([
        sb.from('support_tickets')
          .select(`
            id, organization_id, created_by, category, subject, description, status,
            assigned_to, created_at, updated_at, closed_at,
            organizations:organization_id(id, slug, display_name),
            creator:created_by(id, full_name, email, role),
            assignee:assigned_to(id, full_name, email)
          `)
          .eq('id', id)
          .maybeSingle(),
        sb.from('support_ticket_messages')
          .select(`
            id, ticket_id, author_id, author_role, body, created_at,
            author:author_id(id, full_name, email, role)
          `)
          .eq('ticket_id', id)
          .order('created_at', { ascending: true }),
      ]);

      if (terr) throw terr;
      if (!t) throw new Error('Ticket no encontrado o sin permisos');
      setTicket(t as SupportTicket);
      if (merr) throw merr;
      setMessages((ms || []) as SupportTicketMessage[]);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      navigate('/soporte');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!user || !profile || !ticket) return;
    const body = reply.trim();
    if (!body) return;
    setSending(true);
    try {
      const { error: ierr } = await sb.from('support_ticket_messages').insert({
        ticket_id: ticket.id,
        author_id: user.id,
        author_role: profile.role,
        body,
      });
      if (ierr) throw ierr;

      // Si support responde, ticket pasa a 'waiting_user'. Si user responde, vuelve a 'in_progress'.
      const newStatus: SupportTicketStatus = isSupportTeam ? 'waiting_user' : 'in_progress';
      if (ticket.status !== newStatus && !ticketClosed) {
        await sb.from('support_tickets').update({ status: newStatus }).eq('id', ticket.id);
      }

      // Notificar via n8n
      fetch('https://accelrh.daleautomations.com/webhook/support-ticket-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: isSupportTeam ? 'ticket_replied_by_support' : 'ticket_replied_by_user',
          ticket_id: ticket.id,
          ticket_subject: ticket.subject,
          ticket_category: ticket.category,
          ticket_status: newStatus,
          organization_id: ticket.organization_id,
          organization_name: (ticket as any).organizations?.display_name || '',
          organization_slug: (ticket as any).organizations?.slug || '',
          actor_user_id: user.id,
          actor_full_name: profile.full_name || user.email || '',
          actor_email: user.email || '',
          actor_role: profile.role,
          message_body: body,
          ticket_created_by: ticket.created_by,
          ticket_created_by_email: (ticket as any).creator?.email || '',
          ticket_created_by_name: (ticket as any).creator?.full_name || '',
        }),
      }).catch(() => { /* best-effort */ });

      setReply('');
      await load();
    } catch (err: any) {
      toast({ title: 'No se pudo enviar', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (newStatus: SupportTicketStatus) => {
    if (!ticket) return;
    setUpdatingStatus(true);
    try {
      const { error } = await sb.from('support_tickets').update({ status: newStatus }).eq('id', ticket.id);
      if (error) throw error;
      toast({ title: 'Estado actualizado', description: STATUS_LABEL[newStatus] });

      if (newStatus === 'closed') {
        fetch('https://accelrh.daleautomations.com/webhook/support-ticket-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'ticket_closed',
            ticket_id: ticket.id,
            ticket_subject: ticket.subject,
            ticket_category: ticket.category,
            ticket_status: 'closed',
            organization_id: ticket.organization_id,
            organization_name: (ticket as any).organizations?.display_name || '',
            actor_user_id: user?.id || '',
            actor_full_name: profile?.full_name || '',
            actor_email: user?.email || '',
            actor_role: profile?.role || '',
            message_body: '',
            ticket_created_by: ticket.created_by,
            ticket_created_by_email: (ticket as any).creator?.email || '',
            ticket_created_by_name: (ticket as any).creator?.full_name || '',
          }),
        }).catch(() => { /* best-effort */ });
      }

      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const assignToMe = async () => {
    if (!ticket || !user) return;
    setUpdatingStatus(true);
    try {
      const { error } = await sb.from('support_tickets').update({ assigned_to: user.id }).eq('id', ticket.id);
      if (error) throw error;
      toast({ title: 'Asignado a vos' });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) return null;

  const CatIcon = CATEGORY_ICON[ticket.category];
  const org = (ticket as any).organizations;
  const creator = (ticket as any).creator;
  const assignee = (ticket as any).assignee;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pt-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/soporte')}>
        <ArrowLeft className="h-4 w-4 mr-1.5" />
        Volver a soporte
      </Button>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CatIcon className="h-3.5 w-3.5" />
                <span>{CATEGORY_LABEL[ticket.category]}</span>
                <span>·</span>
                <span>Ticket #{ticket.id.slice(0, 8)}</span>
              </div>
              <CardTitle className="text-xl">{ticket.subject}</CardTitle>
              <CardDescription className="flex items-center gap-3 flex-wrap text-xs pt-1">
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{org?.display_name || '—'}</span>
                <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{creator?.full_name || 'Usuario'} ({roleLabel(creator?.role)})</span>
                <span>·</span>
                <span>Abierto {formatDate(ticket.created_at)}</span>
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${STATUS_BADGE[ticket.status]} text-xs`}>{STATUS_LABEL[ticket.status]}</Badge>
              {assignee && (
                <Badge variant="outline" className="text-xs">Asignado: {assignee.full_name}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Panel de support */}
      {canChangeStatus && (
        <Card className="border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-900">
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-violet-900 dark:text-violet-200 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5" />
              <span>Panel de soporte</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={ticket.status}
                onValueChange={(v) => changeStatus(v as SupportTicketStatus)}
                disabled={updatingStatus}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Abierto</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="waiting_user">Esperando respuesta</SelectItem>
                  <SelectItem value="closed">Cerrado</SelectItem>
                </SelectContent>
              </Select>
              {ticket.assigned_to !== user?.id && (
                <Button size="sm" variant="outline" onClick={assignToMe} disabled={updatingStatus}>
                  Asignarme
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Thread */}
      <div className="space-y-3">
        {messages.map((m) => {
          const isOwn = m.author_id === user?.id;
          const isSupportMsg = m.author_role === 'support' || m.author_role === 'super_admin';
          return (
            <div key={m.id} className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
                isSupportMsg ? 'bg-violet-600 text-white' : 'bg-muted text-foreground'
              }`}>
                {initials((m as any).author?.full_name)}
              </div>
              <div className={`max-w-[75%] ${isOwn ? 'items-end text-right' : 'items-start text-left'} flex flex-col gap-1`}>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                  <span className="font-medium">{(m as any).author?.full_name || 'Usuario'}</span>
                  <span>·</span>
                  <span>{roleLabel(m.author_role)}</span>
                  <span>·</span>
                  <span>{formatDate(m.created_at)}</span>
                </div>
                <div className={`rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  isOwn
                    ? 'bg-violet-100 text-violet-950 dark:bg-violet-900/40 dark:text-violet-100'
                    : isSupportMsg
                      ? 'bg-violet-50 border border-violet-200 dark:bg-violet-950/30 dark:border-violet-900'
                      : 'bg-muted'
                }`}>
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">El ticket no tiene mensajes todavía.</p>
          </div>
        )}
      </div>

      {/* Form de respuesta */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          {ticketClosed ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Lock className="h-5 w-5 mx-auto mb-2 opacity-50" />
              Este ticket está cerrado. Si necesitás más ayuda,{' '}
              <Button variant="link" className="px-1 h-auto" onClick={() => navigate('/soporte')}>
                abrí uno nuevo
              </Button>.
            </div>
          ) : (
            <>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={isSupportTeam ? 'Respondé al usuario…' : 'Escribí tu respuesta…'}
                rows={4}
              />
              <div className="flex items-center justify-end">
                <Button onClick={sendReply} disabled={!reply.trim() || sending}>
                  {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Enviar respuesta
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
