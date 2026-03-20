import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import type { RubricaCriterio } from '@/types/database';

interface Props {
  initialCriteria?: RubricaCriterio[];
  onSave: (criteria: RubricaCriterio[]) => void;
  onCancel: () => void;
  saving?: boolean;
}

export function RubricEditor({ initialCriteria, onSave, onCancel, saving }: Props) {
  const [criteria, setCriteria] = useState<RubricaCriterio[]>(
    initialCriteria?.length
      ? initialCriteria.map(c => ({ ...c }))
      : [{ criterio: '', puntaje_max: 0, palabras_clave: [] }]
  );

  const total = criteria.reduce((s, c) => s + (c.puntaje_max || 0), 0);
  const isValid = total === 100 && criteria.every(c => c.criterio.trim().length > 0);

  const update = (idx: number, field: keyof RubricaCriterio, value: any) => {
    setCriteria(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const addRow = () => {
    setCriteria(prev => [...prev, { criterio: '', puntaje_max: 0, palabras_clave: [] }]);
  };

  const removeRow = (idx: number) => {
    if (criteria.length <= 1) return;
    setCriteria(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Progress value={Math.min(total, 100)} className="h-3" />
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-semibold ${total === 100 ? 'text-green-600' : 'text-destructive'}`}>
          {total === 100 ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {total} / 100
        </div>
      </div>

      {/* Criteria rows */}
      <div className="space-y-3">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg border">
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Nombre del criterio"
                value={c.criterio}
                onChange={e => update(i, 'criterio', e.target.value)}
                className="font-medium"
              />
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Puntaje"
                  value={c.puntaje_max || ''}
                  onChange={e => update(i, 'puntaje_max', parseInt(e.target.value) || 0)}
                  className="w-24"
                />
                <Input
                  placeholder="Palabras clave (separadas por coma)"
                  value={c.palabras_clave.join(', ')}
                  onChange={e => update(i, 'palabras_clave', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="flex-1 text-sm"
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeRow(i)}
              disabled={criteria.length <= 1}
              className="text-muted-foreground hover:text-destructive mt-1"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addRow} className="w-full">
        <Plus className="h-4 w-4 mr-1" /> Agregar criterio
      </Button>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button onClick={() => onSave(criteria)} disabled={!isValid || saving}>
          {saving ? 'Guardando…' : 'Guardar versión'}
        </Button>
      </div>
    </div>
  );
}
