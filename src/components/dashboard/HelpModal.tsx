import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Video, MessageSquare, Send, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Role = 'manager' | 'selectora' | 'cliente' | string | null | undefined;

interface FaqEntry {
  q: string;
  a: string;
  cta?: { label: string; to?: string };
  visibleFor?: ('manager' | 'selectora' | 'cliente')[];
}

const FAQ: FaqEntry[] = [
  {
    q: '¿Cómo veo el listado completo de vacantes?',
    a: 'Desde el sidebar izquierdo, click en "Vacantes". Vas a ver la tabla completa con filtros, búsqueda y estado de cada vacante.',
    cta: { label: 'Ir a Vacantes', to: '/vacantes' },
  },
  {
    q: '¿Cómo agrego un candidato manualmente?',
    a: 'Entrá a la vacante, scrolleá hasta la tabla de candidatos y arriba a la derecha vas a ver un botón "+ Agregar". Tenés dos opciones: "Uno por uno" (form con CV) o "Carga masiva" (varios PDFs a la vez).',
    visibleFor: ['manager', 'selectora'],
  },
  {
    q: '¿Cómo hago carga masiva de CVs?',
    a: 'Entrá a una vacante manual, click en "+ Agregar" → tab "Carga masiva (varios CVs)" → arrastrá todos los PDFs al cuadro → click "Subir". El sistema extrae nombre, email y teléfono de cada CV con IA y los carga automáticamente.',
    visibleFor: ['manager', 'selectora'],
  },
  {
    q: '¿Cómo cierro una vacante?',
    a: 'Entrá a la vacante. Arriba a la derecha hay un botón rojo "Cerrar Vacante" (solo manager). Tenés que elegir un motivo y confirmar.',
    visibleFor: ['manager'],
  },
  {
    q: '¿Cómo reabro una vacante cerrada?',
    a: 'Entrá a la vacante cerrada. Arriba a la derecha hay un botón verde "Reabrir Vacante" (solo manager). Esto restaura los candidatos archivados de esa vacante.',
    visibleFor: ['manager'],
  },
  {
    q: '¿Qué significa "No se pudo leer" en preeval?',
    a: 'La IA no pudo extraer texto del CV (escaneado, imagen, o tipo no soportado). No es un rechazo — el candidato necesita revisión manual.',
  },
  {
    q: '¿Cómo apruebo o rechazo un candidato?',
    a: 'Entrá al perfil del candidato. En la sección "Pipeline" tenés un botón "Aceptar" y "Rechazar". También podés agregar un comentario antes de decidir.',
    visibleFor: ['cliente'],
  },
  {
    q: '¿Cómo veo el CV de un candidato?',
    a: 'En la lista de candidatos, click en el nombre. En el perfil vas a ver el botón "Ver CV Anonimizado" (cliente) o "Ver CV" / "Ver perfil de LinkedIn" según el origen.',
  },
  {
    q: '¿Cómo envío las preguntas de screening por email?',
    a: 'Entrá al perfil del candidato. En "Preguntas Sugeridas" editá si querés, después click en "Enviar por email". El candidato responde y la respuesta aparece en su perfil automáticamente.',
    visibleFor: ['manager', 'selectora'],
  },
  {
    q: '¿Cómo me contacto con el equipo de soporte?',
    a: 'Usá la pestaña "Contacto" arriba para escribirnos. Te respondemos en el día.',
  },
];

export function HelpModal({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: Role;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [contactMsg, setContactMsg] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactSending, setContactSending] = useState(false);

  const r = (role as any) || 'manager';
  const visibleFaqs = FAQ.filter(f => !f.visibleFor || f.visibleFor.includes(r));

  const handleSendContact = async () => {
    const msg = contactMsg.trim();
    if (!msg) {
      toast({ title: 'Mensaje vacío', variant: 'destructive' });
      return;
    }
    setContactSending(true);
    try {
      // Reuso notify-manager-email con un tipo genérico para soporte
      await fetch('https://accelrh.daleautomations.com/webhook/notify-manager-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'support_request',
          to_email: 'daleautomations00@gmail.com',
          to_name: 'Soporte AccelRH',
          actor_name: contactName || 'Usuario AccelRH',
          message: msg,
        }),
      });
      toast({ title: 'Mensaje enviado', description: 'Te respondemos al toque.' });
      setContactMsg('');
      setContactName('');
      onOpenChange(false);
    } catch {
      toast({ title: 'No se pudo enviar', description: 'Probá de nuevo o escribinos a daleautomations00@gmail.com', variant: 'destructive' });
    } finally {
      setContactSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tutoriales y FAQ</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="faq" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="faq"><MessageSquare className="h-3.5 w-3.5 mr-2" />FAQ</TabsTrigger>
            <TabsTrigger value="videos"><Video className="h-3.5 w-3.5 mr-2" />Videos</TabsTrigger>
            <TabsTrigger value="contact"><Send className="h-3.5 w-3.5 mr-2" />Contacto</TabsTrigger>
          </TabsList>

          <TabsContent value="faq" className="overflow-y-auto pr-2 space-y-2 mt-3">
            {visibleFaqs.map((f, i) => (
              <div key={i} className="border rounded-lg">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className="text-sm font-medium text-foreground">{f.q}</span>
                  {expanded === i ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>
                {expanded === i && (
                  <div className="px-4 pb-3 space-y-2 text-sm text-muted-foreground">
                    <p>{f.a}</p>
                    {f.cta?.to && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { navigate(f.cta!.to!); onOpenChange(false); }}
                      >
                        {f.cta.label}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="videos" className="overflow-y-auto pr-2 mt-3">
            <div className="text-center py-10 text-muted-foreground">
              <Video className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Los videotutoriales se están grabando.</p>
              <p className="text-xs mt-1">Vas a verlos acá apenas estén listos.</p>
            </div>
          </TabsContent>

          <TabsContent value="contact" className="overflow-y-auto pr-2 mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Escribinos lo que necesites. Te respondemos por email en el día.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tu nombre (opcional)</label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Mensaje *</label>
              <Textarea
                value={contactMsg}
                onChange={e => setContactMsg(e.target.value)}
                rows={5}
                placeholder="Contanos qué necesitás: una nueva funcionalidad, un problema que viste, una duda…"
                className="mt-1"
              />
            </div>
            <Button onClick={handleSendContact} disabled={!contactMsg.trim() || contactSending} className="w-full">
              {contactSending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</> : <><Send className="h-4 w-4 mr-2" /> Enviar</>}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
