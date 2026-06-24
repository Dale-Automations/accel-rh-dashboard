import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, BookOpen, ArrowRight, AlertTriangle, Lightbulb, HelpCircle } from 'lucide-react';
import type { SupportTicketCategory } from '@/types/database';
import { AttachmentPicker } from '@/components/support/AttachmentList';
import { isAllowedFile, uploadSupportFile, type SupportAttachment } from '@/lib/supportAttachments';

const sb = supabase as any;

const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  no_entiendo: 'No entiendo cómo hacer algo',
  error: 'Hay un error o algo no funciona',
  sugerencia: 'Sugerencia o mejora',
  otro: 'Otro',
};

const CATEGORY_ICON: Record<SupportTicketCategory, typeof HelpCircle> = {
  no_entiendo: HelpCircle,
  error: AlertTriangle,
  sugerencia: Lightbulb,
  otro: Sparkles,
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Callback opcional para llevar al user a la tab FAQ del Support page. */
  onGoToFaq?: () => void;
}

export function NewTicketDialog({ open, onOpenChange, onGoToFaq }: Props) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [category, setCategory] = useState<SupportTicketCategory | ''>('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setCategory('');
    setSubject('');
    setDescription('');
    setFiles([]);
    setSubmitting(false);
  };

  const addFiles = (newFiles: File[]) => {
    const valid: File[] = [];
    const invalid: string[] = [];
    for (const f of newFiles) {
      const check = isAllowedFile(f);
      if (check.ok) valid.push(f);
      else invalid.push(check.reason);
    }
    if (invalid.length) {
      toast({ title: 'Algunos archivos no se sumaron', description: invalid.join(' · '), variant: 'destructive' });
    }
    setFiles((prev) => [...prev, ...valid]);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleGoToFaq = () => {
    handleClose(false);
    if (onGoToFaq) onGoToFaq();
  };

  const continueToStep2 = () => {
    if (!category) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!user || !profile?.organization_id) {
      toast({ title: 'No estás logueado', variant: 'destructive' });
      return;
    }
    if (!category || !subject.trim() || !description.trim()) {
      toast({ title: 'Completá categoría, asunto y descripción', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Insert ticket
      const { data: ticket, error: terr } = await sb
        .from('support_tickets')
        .insert({
          organization_id: profile.organization_id,
          created_by: user.id,
          category,
          subject: subject.trim(),
          description: description.trim(),
          status: 'open',
        })
        .select('id')
        .single();

      if (terr || !ticket) throw new Error(terr?.message || 'No se pudo crear el ticket');

      // 2. Subir attachments al storage si hay
      let uploaded: SupportAttachment[] = [];
      if (files.length) {
        uploaded = await Promise.all(files.map((f) => uploadSupportFile(f, 'ticket', user.id)));
        if (uploaded.length) {
          await sb.from('support_tickets').update({ attachments: uploaded }).eq('id', ticket.id);
        }
      }

      // 3. Insert primer mensaje del thread (espejo de la descripción + mismos attachments)
      const { error: merr } = await sb
        .from('support_ticket_messages')
        .insert({
          ticket_id: ticket.id,
          author_id: user.id,
          author_role: profile.role,
          body: description.trim(),
          attachments: uploaded,
        });
      if (merr) throw new Error(merr.message);

      // 3. Resolver display_name/slug de la org. Si el join en profile no esta
      //    populado (caches viejos), fetchear directo desde organizations.
      let orgName = profile.organizations?.display_name || '';
      let orgSlug = profile.organizations?.slug || '';
      if (!orgName) {
        const { data: org } = await sb
          .from('organizations')
          .select('display_name, slug')
          .eq('id', profile.organization_id)
          .maybeSingle();
        if (org) {
          orgName = org.display_name || '';
          orgSlug = org.slug || '';
        }
      }

      // 4. Notificar al equipo de soporte via n8n
      fetch('https://accelrh.daleautomations.com/webhook/support-ticket-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'ticket_created',
          ticket_id: ticket.id,
          ticket_subject: subject.trim(),
          ticket_description: description.trim(),
          ticket_category: category,
          ticket_status: 'open',
          organization_id: profile.organization_id,
          organization_name: orgName,
          organization_slug: orgSlug,
          actor_user_id: user.id,
          actor_full_name: profile.full_name || user.email || '',
          actor_email: user.email || '',
          actor_role: profile.role,
          message_body: description.trim(),
          attachments: uploaded,
        }),
      }).catch(() => { /* best-effort */ });

      toast({ title: 'Ticket abierto', description: 'Te respondemos lo antes posible.' });
      handleClose(false);
      navigate(`/soporte/${ticket.id}`);
    } catch (err: any) {
      toast({ title: 'Error al abrir el ticket', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir un ticket de soporte</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Contanos brevemente qué pasa para orientarte mejor.'
              : 'Dale un asunto corto y describí el problema con detalle.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Categoría</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SupportTicketCategory)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Elegí qué tipo de ayuda necesitás" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABEL) as SupportTicketCategory[]).map((k) => {
                    const Icon = CATEGORY_ICON[k];
                    return (
                      <SelectItem key={k} value={k}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{CATEGORY_LABEL[k]}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {category === 'no_entiendo' && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 space-y-3 dark:bg-violet-950/30 dark:border-violet-900">
                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 text-violet-700 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
                      ¿Buscaste primero en las Preguntas frecuentes?
                    </p>
                    <p className="text-xs text-violet-800/80 dark:text-violet-200/80">
                      La mayoría de las dudas de uso están explicadas ahí, con links directos a la pantalla que necesitás. Ahorrate la espera.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-8">
                  <Button size="sm" variant="default" onClick={handleGoToFaq} className="bg-violet-600 hover:bg-violet-700">
                    <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                    Buscar en FAQ
                  </Button>
                  <Button size="sm" variant="outline" onClick={continueToStep2}>
                    Igual quiero abrir ticket
                    <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {category && category !== 'no_entiendo' && (
              <div className="flex justify-end">
                <Button onClick={continueToStep2}>
                  Siguiente
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="ticket-subject" className="text-xs uppercase tracking-wider text-muted-foreground">
                Asunto
              </Label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                placeholder={
                  category === 'error' ? 'Ej: No puedo subir un CV en la vacante X' :
                  category === 'sugerencia' ? 'Ej: Agregar filtro por fecha en candidatos' :
                  'Resumí el tema en una frase'
                }
                className="mt-1"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">{subject.length}/120</p>
            </div>

            <div>
              <Label htmlFor="ticket-desc" className="text-xs uppercase tracking-wider text-muted-foreground">
                Descripción
              </Label>
              <Textarea
                id="ticket-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                rows={7}
                placeholder={
                  category === 'error'
                    ? 'Contanos qué intentaste hacer, qué esperabas, qué pasó y cualquier error que viste en pantalla. Si podés, pegá la URL donde ocurre.'
                    : 'Contanos con el mayor detalle posible.'
                }
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">{description.length}/4000</p>
            </div>

            <AttachmentPicker
              pendingFiles={files}
              onAdd={addFiles}
              onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={submitting}
            />

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={submitting}>
                Volver
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !subject.trim() || !description.trim()}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Abrir ticket
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default NewTicketDialog;
