import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from './RichTextEditor';
import { SafeHtml } from './SafeHtml';
import { supabaseExternal as sb } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createNotifications } from '@/lib/notifications';
import { formatDate } from '@/lib/formatters';
import { Loader2, CheckCircle, XCircle, AlertCircle, Send } from 'lucide-react';
import type { Postulante, UserProfile } from '@/types/database';

interface Props {
  postulant: Postulante | null;
  profiles: UserProfile[];
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function InformeDialog({ postulant, profiles, open, onClose, onSubmitted }: Props) {
  const { toast } = useToast();
  const { user, profile: authProfile } = useAuth();
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (postulant) setHtml(postulant.informe_selectora || '');
  }, [postulant]);

  if (!postulant) return null;

  const status = postulant.informe_status;
  const isFinal = status === 'approved' || status === 'rejected';
  const isPending = status === 'pending_review';
  const isNew = !status;

  const reviewer = postulant.informe_reviewed_by
    ? profiles.find(p => p.id === postulant.informe_reviewed_by)
    : null;

  const handleSubmit = async () => {
    if (isFinal) return;
    if (!user) return;
    const text = html.replace(/<[^>]*>/g, '').trim();
    if (text.length < 20) {
      toast({ title: 'El informe es muy corto', description: 'Escribí al menos un párrafo describiendo al candidato.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const actorName = authProfile?.full_name || user.email || 'Selectora';
      const nowIso = new Date().toISOString();

      // 1) Update del postulante — incluye informe_submitted_by (quién envía AHORA)
      const { error: upErr } = await (sb as any).from('postulantes').update({
        informe_selectora: html,
        informe_status: 'pending_review',
        informe_submitted_by: user.id,
        informe_submitted_at: nowIso,
        etapa: 'En revisión por Manager',
      }).eq('id_postulant', postulant.id_postulant);
      if (upErr) throw upErr;

      // 2) Determinar el siguiente version_number consultando feedback existente
      const { data: lastFb } = await (sb as any)
        .from('informe_feedback')
        .select('version_number')
        .eq('postulant_id', postulant.id_postulant)
        .order('version_number', { ascending: false })
        .limit(1);
      const nextVersion = (lastFb && lastFb[0]?.version_number ? lastFb[0].version_number : 0) + 1;

      // 3) INSERT en informe_feedback — nueva iteración, decision queda null hasta que el manager responda
      const { error: fbErr } = await (sb as any).from('informe_feedback').insert({
        postulant_id: postulant.id_postulant,
        vacancy_id: postulant.vacancy_id,
        version_number: nextVersion,
        submitted_by: user.id,
        submitted_by_name: actorName,
        submitted_at: nowIso,
        informe_html_snapshot: html,
      });
      if (fbErr) {
        // No fatal — el informe ya se persistió. Solo loggeo.
        console.warn('No se pudo registrar la iteración del informe', fbErr);
      }

      // 4) Notificar a managers (campanita)
      await createNotifications({
        actorName,
        postulantId: postulant.id_postulant,
        postulantName: postulant.full_name || postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        vacancyName: postulant.vacancy_name,
        action: nextVersion === 1 ? 'informe_submitted' : 'informe_re_review',
        fieldsChanged: ['informe_selectora'],
        currentUserId: user.id,
      });

      // 5) Email a managers (fire-and-forget)
      fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: nextVersion === 1 ? 'informe_submitted' : 'informe_re_review',
          postulant_id: postulant.id_postulant,
          postulant_name: postulant.full_name || postulant.id_postulant,
          vacancy_id: postulant.vacancy_id,
          vacancy_name: postulant.vacancy_name,
          actor_name: actorName,
          version_number: nextVersion,
        }),
      }).catch(() => { /* fire-and-forget */ });

      toast({
        title: nextVersion === 1 ? 'Informe enviado al manager' : `Versión ${nextVersion} enviada`,
        description: 'Te avisaremos cuando lo revise.',
      });
      onSubmitted();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error al enviar informe', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const headerBadge = () => {
    if (status === 'approved') return <Badge className="bg-green-100 text-green-800 border-green-300"><CheckCircle className="h-3 w-3 mr-1" />Aprobado</Badge>;
    if (status === 'rejected') return <Badge className="bg-red-100 text-red-800 border-red-300"><XCircle className="h-3 w-3 mr-1" />Rechazado</Badge>;
    if (status === 'pending_review') return <Badge className="bg-amber-100 text-amber-800 border-amber-300"><AlertCircle className="h-3 w-3 mr-1" />En revisión</Badge>;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Informe del candidato
            {headerBadge()}
          </DialogTitle>
          <DialogDescription>
            {postulant.full_name} — {postulant.vacancy_name}
          </DialogDescription>
        </DialogHeader>

        {isFinal && (
          <div className="bg-muted/50 border rounded-md p-3 text-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-medium">{status === 'approved' ? 'Aprobado' : 'Rechazado'}</span>
                {' por '}
                <span className="font-medium">{reviewer?.full_name || '—'}</span>
                {' — '}
                {formatDate(postulant.informe_reviewed_at)}
              </div>
            </div>
            {status === 'rejected' && postulant.informe_rejection_reason && (
              <div className="mt-2 pt-2 border-t">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Motivo del rechazo</span>
                <p className="text-sm mt-1">{postulant.informe_rejection_reason}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2 italic">
              {status === 'rejected'
                ? 'Este candidato no podrá ser re-enviado al cliente.'
                : 'Este candidato ya está visible al cliente.'}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isFinal ? (
            <div className="border rounded-md p-3 bg-muted/20">
              <SafeHtml html={postulant.informe_selectora || '<p class="text-muted-foreground italic">Sin informe</p>'} />
            </div>
          ) : (
            <RichTextEditor
              value={html}
              onChange={setHtml}
              disabled={saving}
              placeholder="Pegá o escribí el informe del candidato (negrita, listas, etc.)..."
              minHeight="280px"
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {isFinal ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!isFinal && (
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : <><Send className="h-4 w-4 mr-2" />{isPending ? 'Re-enviar al manager' : 'Enviar al manager'}</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
