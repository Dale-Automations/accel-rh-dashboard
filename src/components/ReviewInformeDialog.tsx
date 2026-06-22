import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SafeHtml } from './SafeHtml';
import { supabaseExternal as sb } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { createNotifications } from '@/lib/notifications';
import { formatDate, extractLinks } from '@/lib/formatters';
import { Loader2, CheckCircle, XCircle, ExternalLink, FileText, AlertCircle, History, CheckCheck } from 'lucide-react';
import type { Postulante, UserProfile, InformeFeedback } from '@/types/database';
import { loadInformeFeedback, recordManagerDecision, resolveFeedbackRecipient } from '@/lib/informeFeedback';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  postulant: Postulante | null;
  selectoraName?: string;
  selectoraEmail?: string;
  open: boolean;
  onClose: () => void;
  onResolved: () => void;
}

const GENERAR_CV_WEBHOOK = 'https://accelrh.daleautomations.com/webhook/generar-cv-cliente';

export function ReviewInformeDialog({ postulant, selectoraName, selectoraEmail, open, onClose, onResolved }: Props) {
  const { toast } = useToast();
  const { user, profile: authProfile } = useAuth();
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState<'approve' | 'reject' | 'changes' | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<InformeFeedback[]>([]);
  // Cuando el informe es legacy (no sabemos quién lo envió), el manager debe elegir
  // a qué selectora notificar desde un dropdown. Se persiste como informe_submitted_by
  // para que las próximas iteraciones no requieran preguntar de nuevo.
  const [selectoras, setSelectoras] = useState<UserProfile[]>([]);
  const [recipientOverride, setRecipientOverride] = useState<string>('');

  // Cargar histórico de iteraciones + lista de selectoras al abrir
  useEffect(() => {
    if (!open || !postulant) return;
    loadInformeFeedback(postulant.id_postulant).then(setFeedbackHistory);
    setRecipientOverride('');
    (sb as any).from('user_profiles').select('id,email,full_name,role').eq('role', 'selectora').then(({ data }: any) => {
      setSelectoras((data || []) as UserProfile[]);
    });
  }, [open, postulant?.id_postulant]);

  // El dropdown SOLO aparece cuando el sistema no puede identificar a la selectora:
  // no hay informe_submitted_by (post-fix) ni selectora_id (legacy). Si existe selectora_id,
  // el sistema asume que es la dueña/quien envió → email automático sin pedir override.
  const needsRecipient = postulant
    ? !postulant.informe_submitted_by && !postulant.selectora_id
    : false;

  if (!postulant) return null;

  const noteLinks = extractLinks(postulant.notes);
  const cvOriginalUrl = noteLinks.length > 0 ? noteLinks[0].url : null;
  // Convertir Drive view URL → preview embed
  const previewUrl = cvOriginalUrl?.match(/\/file\/d\/([^/?]+)/)
    ? `https://drive.google.com/file/d/${cvOriginalUrl.match(/\/file\/d\/([^/?]+)/)![1]}/preview`
    : cvOriginalUrl;

  const handleApprove = async () => {
    if (!user) return;
    setActing('approve');
    try {
      const now = new Date().toISOString();
      const updates: any = {
        informe_status: 'approved',
        informe_reviewed_by: user.id,
        informe_reviewed_at: now,
        mostrar_cliente: true,
        assigned_to_cliente_at: now,
        cliente_estado: 'pendiente',
        etapa: 'Enviado a cliente',
      };
      const { error } = await (sb as any).from('postulantes').update(updates).eq('id_postulant', postulant.id_postulant);
      if (error) throw error;

      // Generar CV anonimizado:
      //  - candidatos con PDF en Drive (notes apunta a /file/d/...) -> workflow original
      //  - candidatos phantom/LinkedIn -> nuevo workflow que busca el TXT en Drive por id_postulant
      const hasDrivePdf = !!postulant.notes && /\/file\/d\//.test(postulant.notes);
      const isPhantom = !!postulant.source && /phantom|linkedin/i.test(postulant.source);
      const webhookUrl = hasDrivePdf
        ? GENERAR_CV_WEBHOOK
        : (isPhantom ? 'https://accelrh.daleautomations.com/webhook/generar-cv-cliente-phantom' : null);
      if (webhookUrl) {
        try {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postulant_id: postulant.id_postulant }),
          }).catch(() => {});
        } catch (e) {
          console.warn('Webhook generar-cv-cliente falló:', e);
        }
      }

      // Registrar la decisión en el histórico (updatea la versión pendiente)
      const actorName = authProfile?.full_name || user.email || 'Manager';
      await recordManagerDecision({
        postulantId: postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        decision: 'approved',
        feedback: null,
        reviewerUserId: user.id,
        reviewerName: actorName,
        fallbackSubmittedBy: postulant.informe_submitted_by || postulant.selectora_id,
        fallbackInformeHtml: postulant.informe_selectora,
      });

      // Notificar selectora + cliente
      await createNotifications({
        actorName,
        postulantId: postulant.id_postulant,
        postulantName: postulant.full_name || postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        vacancyName: postulant.vacancy_name,
        action: 'informe_approved',
        fieldsChanged: ['informe_status'],
        currentUserId: user.id,
        includeClientes: true,
      });

      // Email a los clientes asignados a la vacancy
      try {
        const { data: clientAssigns } = await (sb as any).from('vacancy_assignments').select('user_id').eq('vacancy_id', postulant.vacancy_id).eq('role', 'cliente');
        const clientIds = (clientAssigns || []).map((a: any) => a.user_id);
        if (clientIds.length > 0) {
          const { data: clientProfiles } = await (sb as any).from('user_profiles').select('email, full_name').in('id', clientIds);
          (clientProfiles || []).forEach((c: any) => {
            if (!c.email) return;
            fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'informe_approved_cliente',
                to_email: c.email,
                to_name: c.full_name || '',
                postulant_id: postulant.id_postulant,
                postulant_name: postulant.full_name || postulant.id_postulant,
                vacancy_id: postulant.vacancy_id,
                vacancy_name: postulant.vacancy_name,
                actor_name: actorName,
              }),
            }).catch(() => {});
          });
        }
      } catch (e) {
        console.warn('Error notifying clients via email:', e);
      }

      toast({
        title: 'Informe aprobado',
        description: webhookUrl
          ? 'Candidato visible al cliente. CV anonimizado en generación.'
          : 'Candidato visible al cliente. (Sin CV disponible: el cliente verá solo el informe.)',
      });
      onResolved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error al aprobar', description: e?.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  const handleRequestChanges = async () => {
    if (!user) return;
    if (!reason.trim()) {
      toast({ title: 'Falta feedback', description: 'Indicá qué cambios necesita el informe en el cuadro de "Motivo".', variant: 'destructive' });
      return;
    }
    if (needsRecipient && !recipientOverride) {
      toast({ title: 'Elegí destinataria', description: 'Este informe no tiene registro de quién lo envió. Seleccioná la selectora del dropdown antes de pedir cambios.', variant: 'destructive' });
      return;
    }
    setActing('changes');
    try {
      const now = new Date().toISOString();
      const { error } = await (sb as any).from('postulantes').update({
        // Vuelve al estado pendiente — selectora corrige y reenvía
        informe_status: 'pending_review',
        informe_reviewed_by: user.id,
        informe_reviewed_at: now,
        informe_rejection_reason: reason.trim(), // se mantiene por compat con UI vieja
      }).eq('id_postulant', postulant.id_postulant);
      if (error) throw error;

      const actorName = authProfile?.full_name || user.email || 'Manager';

      // 1) Registrar en el histórico (updatea la versión pendiente con decisión + feedback)
      const { targetSubmittedBy, targetSubmittedByName, versionNumber } = await recordManagerDecision({
        postulantId: postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        decision: 'changes_requested',
        feedback: reason.trim(),
        reviewerUserId: user.id,
        reviewerName: actorName,
        fallbackSubmittedBy: postulant.informe_submitted_by || postulant.selectora_id,
        fallbackInformeHtml: postulant.informe_selectora,
      });

      // 1.b) Si el manager eligió un destinatario en el dropdown (caso legacy),
      // corregimos el row del feedback + persistimos en postulantes.informe_submitted_by
      // para que las próximas iteraciones no requieran preguntar.
      const overrideUser = recipientOverride ? selectoras.find(s => s.id === recipientOverride) : null;
      if (overrideUser && versionNumber != null) {
        await (sb as any).from('informe_feedback').update({
          submitted_by: overrideUser.id,
          submitted_by_name: overrideUser.full_name || overrideUser.email || '—',
        }).eq('postulant_id', postulant.id_postulant).eq('version_number', versionNumber);
        await (sb as any).from('postulantes').update({
          informe_submitted_by: overrideUser.id,
        }).eq('id_postulant', postulant.id_postulant);
      }

      // 2) Notif in-app (campanita)
      await createNotifications({
        actorName,
        postulantId: postulant.id_postulant,
        postulantName: postulant.full_name || postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        vacancyName: postulant.vacancy_name,
        action: 'informe_changes_requested',
        fieldsChanged: ['informe_status'],
        currentUserId: user.id,
      });

      // 3) Email a la selectora que envió este informe específico.
      // Prioridad: override del dropdown > targetSubmittedBy del feedback (si no es legacy) > selectora_id legacy.
      const isLegacy = targetSubmittedByName === '(legacy)';
      let recipient: { email: string | null; name: string | null } = { email: null, name: null };
      if (overrideUser?.email) {
        recipient = { email: overrideUser.email, name: overrideUser.full_name || overrideUser.email };
      } else if (!isLegacy && targetSubmittedBy) {
        recipient = await resolveFeedbackRecipient({ targetSubmittedBy, fallbackUserId: null });
      }
      if (!recipient.email && postulant.selectora_id) {
        recipient = await resolveFeedbackRecipient({ targetSubmittedBy: postulant.selectora_id, fallbackUserId: null });
      }

      if (recipient.email) {
        fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'informe_changes_requested',
            to_email: recipient.email,
            to_name: recipient.name || selectoraName,
            postulant_id: postulant.id_postulant,
            postulant_name: postulant.full_name || postulant.id_postulant,
            vacancy_id: postulant.vacancy_id,
            vacancy_name: postulant.vacancy_name,
            actor_name: actorName,
            feedback: reason.trim(),
          }),
        }).catch(() => {});
        toast({
          title: 'Cambios solicitados',
          description: `Notificada por mail: ${recipient.name || recipient.email}.`,
        });
      } else {
        toast({
          title: 'Cambios guardados — sin email automático',
          description: 'No identificamos a la selectora que envió este informe (registro legacy). Comunicate manualmente con quien lo armó.',
          variant: 'destructive',
        });
      }
      onResolved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!user) return;
    if (needsRecipient && !recipientOverride) {
      toast({ title: 'Elegí destinataria', description: 'Este informe no tiene registro de quién lo envió. Seleccioná la selectora del dropdown antes de rechazar.', variant: 'destructive' });
      return;
    }
    setActing('reject');
    try {
      const now = new Date().toISOString();
      const updates: any = {
        informe_status: 'rejected',
        informe_reviewed_by: user.id,
        informe_reviewed_at: now,
        informe_rejection_reason: reason.trim() || null,
        etapa: 'Rechazado por Manager',
      };
      const { error } = await (sb as any).from('postulantes').update(updates).eq('id_postulant', postulant.id_postulant);
      if (error) throw error;

      const actorName = authProfile?.full_name || user.email || 'Manager';

      // Registrar en el histórico
      const { targetSubmittedBy, targetSubmittedByName, versionNumber: vNum } = await recordManagerDecision({
        postulantId: postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        decision: 'rejected',
        feedback: reason.trim() || null,
        reviewerUserId: user.id,
        reviewerName: actorName,
        fallbackSubmittedBy: postulant.informe_submitted_by || postulant.selectora_id,
        fallbackInformeHtml: postulant.informe_selectora,
      });
      const isLegacyR = targetSubmittedByName === '(legacy)';

      // Si hay override del dropdown, corregir feedback + persistir en postulante
      const overrideUserR = recipientOverride ? selectoras.find(s => s.id === recipientOverride) : null;
      if (overrideUserR && vNum != null) {
        await (sb as any).from('informe_feedback').update({
          submitted_by: overrideUserR.id,
          submitted_by_name: overrideUserR.full_name || overrideUserR.email || '—',
        }).eq('postulant_id', postulant.id_postulant).eq('version_number', vNum);
        await (sb as any).from('postulantes').update({
          informe_submitted_by: overrideUserR.id,
        }).eq('id_postulant', postulant.id_postulant);
      }

      await createNotifications({
        actorName,
        postulantId: postulant.id_postulant,
        postulantName: postulant.full_name || postulant.id_postulant,
        vacancyId: postulant.vacancy_id,
        vacancyName: postulant.vacancy_name,
        action: 'informe_rejected',
        fieldsChanged: ['informe_status'],
        currentUserId: user.id,
      });

      // Email: prioridad override > submitted_by no-legacy > selectora_id legacy
      let recipientR: { email: string | null; name: string | null } = { email: null, name: null };
      if (overrideUserR?.email) {
        recipientR = { email: overrideUserR.email, name: overrideUserR.full_name || overrideUserR.email };
      } else if (!isLegacyR && targetSubmittedBy) {
        recipientR = await resolveFeedbackRecipient({ targetSubmittedBy, fallbackUserId: null });
      }
      if (!recipientR.email && postulant.selectora_id) {
        recipientR = await resolveFeedbackRecipient({ targetSubmittedBy: postulant.selectora_id, fallbackUserId: null });
      }
      if (recipientR.email) {
        fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'informe_rejected',
            to_email: recipientR.email,
            to_name: recipientR.name,
            postulant_id: postulant.id_postulant,
            postulant_name: postulant.full_name || postulant.id_postulant,
            vacancy_id: postulant.vacancy_id,
            vacancy_name: postulant.vacancy_name,
            actor_name: actorName,
            feedback: reason.trim() || null,
          }),
        }).catch(() => {});
        toast({ title: 'Informe rechazado', description: `Notificada por mail: ${recipientR.name || recipientR.email}.` });
      } else {
        toast({
          title: 'Informe rechazado — sin email automático',
          description: 'No identificamos a la selectora que envió este informe (registro legacy). Comunicate manualmente.',
          variant: 'destructive',
        });
      }
      onResolved();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error al rechazar', description: e?.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !acting) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Revisar informe — {postulant.full_name}
            <Badge variant="outline" className="text-xs">{postulant.vacancy_name}</Badge>
          </DialogTitle>
          <DialogDescription>
            Selectora: <span className="font-medium">{selectoraName || '—'}</span>
            {' · Enviado: '}{formatDate(postulant.informe_submitted_at)}
            {feedbackHistory.length > 0 && (
              <span className="ml-2">
                · <span className="font-medium">v{Math.max(...feedbackHistory.map(f => f.version_number))}</span>
                {feedbackHistory.length > 1 && ` (${feedbackHistory.length} iteraciones)`}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Dropdown de destinatario — SOLO si el sistema no puede identificar a la selectora */}
        {needsRecipient && (
          <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3 mb-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
                <strong>Informe sin registro de quién lo envió.</strong> Es un caso legacy del sistema viejo.
                Elegí a quién mandar el feedback por email. La selección queda guardada para próximas iteraciones de este candidato.
              </div>
            </div>
            <div>
              <Label className="text-xs text-amber-900 dark:text-amber-200">Selectora que armó este informe</Label>
              <Select value={recipientOverride} onValueChange={setRecipientOverride}>
                <SelectTrigger className="mt-1 bg-background">
                  <SelectValue placeholder="Elegí una selectora…" />
                </SelectTrigger>
                <SelectContent>
                  {selectoras.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.email || s.id}
                      {s.email && <span className="text-muted-foreground ml-2">({s.email})</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Histórico de iteraciones previas — visible si hay versiones anteriores con decisión */}
        {feedbackHistory.filter(f => f.decision != null).length > 0 && (
          <details className="border rounded-md bg-muted/30 mb-3">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2 select-none">
              <History className="h-4 w-4" />
              Histórico de iteraciones ({feedbackHistory.filter(f => f.decision != null).length})
            </summary>
            <div className="px-3 pb-3 space-y-2 max-h-60 overflow-y-auto">
              {feedbackHistory.filter(f => f.decision != null).map(f => {
                const dColor = f.decision === 'approved' ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
                  : f.decision === 'rejected' ? 'text-red-700 bg-red-50 dark:bg-red-950/30'
                  : 'text-amber-700 bg-amber-50 dark:bg-amber-950/30';
                const dLabel = f.decision === 'approved' ? 'Aprobado' : f.decision === 'rejected' ? 'Rechazado' : 'Cambios solicitados';
                return (
                  <div key={f.id} className={`rounded-md p-2 text-xs ${dColor}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold">v{f.version_number} · {dLabel}</span>
                      <span className="text-muted-foreground">
                        {f.reviewed_by_name || '—'} · {f.reviewed_at ? format(new Date(f.reviewed_at), "d MMM HH:mm", { locale: es }) : '—'}
                      </span>
                    </div>
                    {f.submitted_by_name && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Enviado por {f.submitted_by_name} · {format(new Date(f.submitted_at), "d MMM HH:mm", { locale: es })}
                        {f.acknowledged_by_submitter_at && (
                          <span className="ml-2 text-emerald-700">
                            <CheckCheck className="h-3 w-3 inline" /> Leído por la selectora
                          </span>
                        )}
                      </div>
                    )}
                    {f.feedback && (
                      <div className="mt-1.5 whitespace-pre-wrap text-foreground/90">{f.feedback}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden">
          {/* Informe */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" /> Informe de la selectora
            </h3>
            <div className="border rounded-md p-3 bg-card flex-1 overflow-y-auto">
              <SafeHtml html={postulant.informe_selectora || '<p class="text-muted-foreground italic">Sin informe</p>'} />
            </div>
          </div>

          {/* CV original preview */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> CV original (con datos personales)</span>
              {cvOriginalUrl && (
                <a href={cvOriginalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1">
                  Abrir en Drive <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </h3>
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="border rounded-md flex-1 w-full bg-card"
                title="CV preview"
                allow="autoplay"
              />
            ) : (
              <div className="border rounded-md flex-1 flex items-center justify-center text-sm text-muted-foreground bg-muted/30">
                CV no disponible — verificar en Drive manualmente
              </div>
            )}
          </div>
        </div>

        {/* Footer + acciones */}
        <div className="border-t pt-3 space-y-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivo / feedback (requerido para "Pedir cambios" o "Rechazar")</label>
            <Textarea
              placeholder="Ej: agregá detalle sobre experiencia en X, ajustá la redacción de tal párrafo, etc."
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              disabled={!!acting}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={!!acting}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={!!acting}
            title="Rechazo definitivo. Cierra el proceso para este candidato."
          >
            {acting === 'reject' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Rechazando...</> : <><XCircle className="h-4 w-4 mr-2" />Rechazar</>}
          </Button>
          <Button
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={handleRequestChanges}
            disabled={!!acting}
            title="Devolvé el informe a la selectora para que lo corrija. Notifica por email."
          >
            {acting === 'changes' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Pidiendo...</> : <><AlertCircle className="h-4 w-4 mr-2" />Pedir cambios</>}
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={handleApprove}
            disabled={!!acting}
          >
            {acting === 'approve' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aprobando...</> : <><CheckCircle className="h-4 w-4 mr-2" />Aprobar y enviar al cliente</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
