import { useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2 } from 'lucide-react';
import type { Vacante } from '@/types/database';

const sb = supabase as any;

/**
 * Panel "Evaluacion automatica" en la pagina de Vacancy.
 * Permite (solo manager/enterprise/super_admin) configurar la cascada
 * Prescorer -> OpenAI -> Gemini por vacancy:
 *   - auto_cascade_enabled: kill switch
 *   - gemini_threshold: score minimo para escalar a Gemini
 *   - daily_openai_cap: tope diario de evaluaciones OpenAI
 *
 * Solo se muestra si la organizacion es demo (cuando no, la cascada esta
 * intencionalmente apagada). Para casos de AccelRH/Enterprise pagos, el
 * flujo manual (botones) se conserva.
 */
export function CascadePanel({
  vacante,
  onChange,
  canEdit,
}: {
  vacante: Vacante;
  onChange?: () => void;
  canEdit: boolean;
}) {
  const { organization } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(!!vacante.auto_cascade_enabled);
  const [threshold, setThreshold] = useState<number>(vacante.gemini_threshold ?? 80);
  const [dailyCap, setDailyCap] = useState<number>(vacante.daily_openai_cap ?? 100);

  // Solo visible para vacancies de orgs demo. AccelRH/pagas mantienen el flujo manual.
  if (!organization?.is_demo) return null;

  const handleSave = async () => {
    if (threshold < 0 || threshold > 100) {
      toast({ title: 'Umbral invalido', description: '0-100', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await sb.from('vacantes').update({
      auto_cascade_enabled: enabled,
      gemini_threshold: threshold,
      daily_openai_cap: dailyCap,
    }).eq('vacancy_id', vacante.vacancy_id);
    setSaving(false);
    if (error) {
      toast({ title: 'No se pudo guardar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Cascada actualizada' });
    onChange?.();
  };

  return (
    <div className="pt-3 border-t space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-600" />
        <h4 className="text-sm font-medium">Evaluacion automatica (cascada)</h4>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Cuando ingresa un CV: Prescorer Ollama, si match, OpenAI evalua, si score supera el umbral, Gemini refina. Todo sin tocar botones.
      </p>

      <div className="flex items-start gap-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit || saving} id="vac-cascade" />
        <div className="flex-1">
          <label htmlFor="vac-cascade" className="text-sm font-medium cursor-pointer">
            Cascada activa
          </label>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Apagala si queres revisar candidatos manualmente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Umbral Gemini (0-100)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={threshold}
            onChange={e => setThreshold(parseInt(e.target.value || '0', 10))}
            disabled={!canEdit || saving}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">Score OpenAI minimo para escalar.</p>
        </div>
        <div>
          <Label className="text-xs">Tope diario OpenAI</Label>
          <Input
            type="number"
            min={0}
            value={dailyCap}
            onChange={e => setDailyCap(parseInt(e.target.value || '0', 10))}
            disabled={!canEdit || saving}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">Limita gasto de tokens.</p>
        </div>
      </div>

      {canEdit && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
          Guardar cascada
        </Button>
      )}
    </div>
  );
}

export default CascadePanel;
