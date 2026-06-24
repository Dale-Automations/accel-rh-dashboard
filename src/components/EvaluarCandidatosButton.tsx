import { useMemo, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Brain, Loader2, Sparkles } from 'lucide-react';
import type { Postulante, CvScore } from '@/types/database';

const sb = supabase as any;

const PRESCORER_URL = 'https://accelrh.daleautomations.com/webhook/prescorer';
const SCORER_GPT_URL = 'https://accelrh.daleautomations.com/webhook/scorer-gpt';

interface Props {
  vacancyId: string;
  vacancyName?: string | null;
  geminiThreshold?: number | null;
  postulantes: Postulante[];
  scores: CvScore[];
  rubricaActive: boolean;
  onTriggered?: () => void;
}

/**
 * Boton "Evaluar candidatos" para la cabecera de la vacancy.
 *
 * Disparo del recorrido completo (manual, NO automatico al ingresar candidato):
 *   1. UPDATE vacantes.auto_cascade_enabled = true (asi el workflow `cascade-score-check`
 *      encadena Gemini cuando GPT supera el umbral).
 *   2. Si hay postulantes sin prescore -> POST a `webhook/prescorer` con esos ids.
 *      El Database Webhook `cascade_prescore_match` se va a encargar de disparar
 *      `webhook/scorer-gpt` para los que terminen en `prescore_status='match'`.
 *   3. Si ya hay postulantes con prescore=match pero sin score -> POST a `webhook/scorer-gpt`
 *      directo con esos ids para arrancar ya mismo.
 */
export function EvaluarCandidatosButton({
  vacancyId,
  vacancyName,
  geminiThreshold,
  postulantes,
  scores,
  rubricaActive,
  onTriggered,
}: Props) {
  const { hasExternalClients } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bucketize:
  const buckets = useMemo(() => {
    const scoredPostulantIds = new Set(scores.map(s => s.postulant_id));
    const noPrescore: string[] = [];
    const matchSinScore: string[] = [];
    for (const p of postulantes) {
      if (!p.id_postulant) continue;
      if (!p.prescore_status || p.prescore_status === 'queued' || p.prescore_status === 'processing') {
        noPrescore.push(p.id_postulant);
      } else if (p.prescore_status === 'match' && !scoredPostulantIds.has(p.id_postulant)) {
        matchSinScore.push(p.id_postulant);
      }
    }
    return { noPrescore, matchSinScore };
  }, [postulantes, scores]);

  const totalAEvaluar = buckets.noPrescore.length + buckets.matchSinScore.length;

  // En orgs con clientes externos (dale-accelrh) mantenemos el flow tradicional
  // (botones manuales en la fila por candidato). Este CTA grande es solo para
  // orgs nuevas donde el demo necesita un disparo simple del recorrido completo.
  if (hasExternalClients) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // 1. Activar cascada en la vacancy (para que cascade-score-check encadene Gemini).
      const { error: vacErr } = await sb
        .from('vacantes')
        .update({ auto_cascade_enabled: true })
        .eq('vacancy_id', vacancyId);
      if (vacErr) throw new Error(`No se pudo activar la cascada: ${vacErr.message}`);

      // 2. Disparar Prescorer sobre los postulantes sin prescore.
      const promises: Promise<Response>[] = [];
      if (buckets.noPrescore.length > 0) {
        promises.push(
          fetch(PRESCORER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postulant_ids: buckets.noPrescore,
              vacancy_id: vacancyId,
              origin: 'cascade',
            }),
          }),
        );
      }
      // 3. Disparar Scorer GPT sobre los que ya estan en match pero sin score.
      if (buckets.matchSinScore.length > 0) {
        promises.push(
          fetch(SCORER_GPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postulant_ids: buckets.matchSinScore,
              vacancy_id: vacancyId,
              origin: 'cascade',
            }),
          }),
        );
      }
      await Promise.allSettled(promises);

      toast({
        title: 'Evaluación iniciada',
        description: `Procesando ${totalAEvaluar} candidato${totalAEvaluar === 1 ? '' : 's'}. Los resultados aparecen en vivo.`,
      });
      setOpen(false);
      onTriggered?.();
    } catch (e: any) {
      toast({
        title: 'No se pudo disparar la evaluación',
        description: e?.message || 'Probá de nuevo',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const buttonContent = (
    <Button
      onClick={() => setOpen(true)}
      disabled={!rubricaActive || totalAEvaluar === 0}
      className="bg-violet-600 hover:bg-violet-700"
    >
      <Brain className="h-4 w-4 mr-2" />
      Evaluar candidatos
      {totalAEvaluar > 0 && (
        <span className="ml-2 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold bg-white text-violet-700">
          {totalAEvaluar}
        </span>
      )}
    </Button>
  );

  return (
    <>
      {!rubricaActive ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild><span>{buttonContent}</span></TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Crea la rúbrica de evaluación primero. Sin rúbrica, la IA no sabe qué medir.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : totalAEvaluar === 0 ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild><span>{buttonContent}</span></TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Todos los candidatos ya fueron evaluados.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttonContent
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Evaluar candidatos con IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Se va a iniciar el recorrido completo de evaluación sobre <strong>{vacancyName || 'esta vacante'}</strong>:</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li><strong>Prescorer Ollama</strong> filtra los candidatos sin CV o que no encajan.</li>
              <li><strong>OpenAI</strong> evalúa con tu rúbrica los que pasan el filtro.</li>
              <li><strong>Gemini</strong> refina los mejores (score ≥ {geminiThreshold ?? 80}).</li>
            </ol>
            <div className="bg-violet-50 border border-violet-200 rounded-md p-3 space-y-1">
              <div className="text-xs font-medium text-violet-900">A procesar</div>
              <div className="text-xs text-violet-900/80">
                {buckets.noPrescore.length > 0 && <div>· {buckets.noPrescore.length} candidato{buckets.noPrescore.length === 1 ? '' : 's'} pendiente de pre-filtrado</div>}
                {buckets.matchSinScore.length > 0 && <div>· {buckets.matchSinScore.length} candidato{buckets.matchSinScore.length === 1 ? '' : 's'} listo{buckets.matchSinScore.length === 1 ? '' : 's'} para scoring con IA</div>}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Los resultados van apareciendo en vivo en la tabla. Los candidatos nuevos que cargues después también se evalúan automáticamente.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>Cancelar</Button>
              <Button size="sm" onClick={handleConfirm} disabled={submitting} className="bg-violet-600 hover:bg-violet-700">
                {submitting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
                Evaluar todo ({totalAEvaluar})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default EvaluarCandidatosButton;
