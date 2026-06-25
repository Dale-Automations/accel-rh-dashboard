import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabaseExternal as sb } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Combine, Search, ArrowRight, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Vacante } from '@/types/database';

interface Props {
  sourceVacancy: Vacante | null;
  open: boolean;
  onClose: () => void;
}

interface MergePreview {
  to_move: number;
  to_dedup: number;
  dedup_emails: string[];
  rubricas_to_move: number;
  assignments_to_move: number;
}

// Combinar (unir) la vacante actual con otra: MUEVE todos los candidatos preservando
// la evaluación y CIERRA la vacante actual. Usa la función Postgres merge_vacancy
// (atómica). Primero previsualiza con p_dry_run=true, luego ejecuta tras confirmar.
export function MergeVacancyDialog({ sourceVacancy, open, onClose }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (sb as any).from('vacantes').select('*').eq('status', 'Activa').order('vacancy_name').then(({ data }: any) => {
      setVacantes((data || []) as Vacante[]);
      setLoading(false);
    });
    setSelected(null);
    setSearch('');
    setPreview(null);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = vacantes;
    if (sourceVacancy) list = list.filter(v => v.vacancy_id !== sourceVacancy.vacancy_id);
    if (q.length >= 2) list = list.filter(v => (v.vacancy_name || '').toLowerCase().includes(q));
    return list;
  }, [vacantes, search, sourceVacancy]);

  const targetVac = vacantes.find(v => v.vacancy_id === selected);

  // Al elegir destino, pedir el preview (dry-run) a la función.
  useEffect(() => {
    if (!open || !selected || !sourceVacancy) { setPreview(null); return; }
    let active = true;
    setPreviewing(true);
    setPreview(null);
    (sb as any).rpc('merge_vacancy', {
      p_source: sourceVacancy.vacancy_id,
      p_target: selected,
      p_dry_run: true,
    }).then(({ data, error }: any) => {
      if (!active) return;
      setPreviewing(false);
      if (error) {
        toast({ title: 'No se pudo previsualizar', description: error.message, variant: 'destructive' });
        return;
      }
      setPreview({
        to_move: data?.to_move ?? 0,
        to_dedup: data?.to_dedup ?? 0,
        dedup_emails: Array.isArray(data?.dedup_emails) ? data.dedup_emails : [],
        rubricas_to_move: data?.rubricas_to_move ?? 0,
        assignments_to_move: data?.assignments_to_move ?? 0,
      });
    });
    return () => { active = false; };
  }, [open, selected, sourceVacancy, toast]);

  if (!sourceVacancy) return null;

  const handleMerge = async () => {
    if (!selected || !targetVac) return;
    setMerging(true);
    const { data, error } = await (sb as any).rpc('merge_vacancy', {
      p_source: sourceVacancy.vacancy_id,
      p_target: selected,
      p_dry_run: false,
    });
    setMerging(false);
    if (error) {
      toast({ title: 'Error al combinar', description: error.message, variant: 'destructive' });
      return;
    }
    const moved = data?.moved ?? 0;
    const deduped = data?.deduped ?? 0;
    toast({
      title: 'Vacantes combinadas',
      description: `${moved} candidato${moved !== 1 ? 's' : ''} movido${moved !== 1 ? 's' : ''} a "${targetVac.vacancy_name}"`
        + (deduped ? ` · ${deduped} duplicado${deduped !== 1 ? 's' : ''} resuelto${deduped !== 1 ? 's' : ''}` : '')
        + '. Esta vacante quedó Cerrada.',
    });
    onClose();
    navigate(`/vacantes/${selected}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !merging) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Combine className="h-4 w-4" />Combinar esta vacante con otra</DialogTitle>
          <DialogDescription>
            Mueve <span className="font-medium">todos</span> los candidatos de
            <span className="font-medium"> "{sourceVacancy.vacancy_name}"</span> a la vacante que elijas,
            <span className="font-medium"> conservando la evaluación</span> (scores, informes, comentarios).
            Esta vacante quedará <span className="font-medium">Cerrada</span>. Sirve para unir dos vacantes que son la misma búsqueda.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar vacante destino..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" disabled={merging} />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">{search ? 'Sin resultados' : 'No hay otras vacantes activas'}</p>
          ) : (
            <ul className="divide-y">
              {filtered.map(v => (
                <li key={v.vacancy_id}>
                  <button
                    type="button"
                    disabled={merging}
                    onClick={() => setSelected(v.vacancy_id)}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2 ${selected === v.vacancy_id ? 'bg-primary/10' : ''}`}
                  >
                    <input type="radio" checked={selected === v.vacancy_id} onChange={() => setSelected(v.vacancy_id)} className="shrink-0" disabled={merging} />
                    <span className="flex-1 text-sm">{v.vacancy_name}</span>
                    <Badge variant="outline" className="text-[10px]">{v.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Preview (dry-run) */}
        {selected && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            {previewing ? (
              <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</span>
            ) : preview ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <span>"{sourceVacancy.vacancy_name}"</span><ArrowRight className="h-3.5 w-3.5" /><span>"{targetVac?.vacancy_name}"</span>
                </div>
                <ul className="text-xs text-muted-foreground list-disc pl-4">
                  <li><span className="text-foreground font-medium">{preview.to_move}</span> candidato(s) se moverán con su evaluación intacta</li>
                  {preview.to_dedup > 0 && (
                    <li><span className="text-foreground font-medium">{preview.to_dedup}</span> duplicado(s) se resolverán (se conserva el evaluado)</li>
                  )}
                  {preview.rubricas_to_move > 0 && <li>{preview.rubricas_to_move} rúbrica(s) pasan al historial del destino</li>}
                  <li>Esta vacante quedará <span className="text-foreground font-medium">Cerrada</span></li>
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={merging}>Cancelar</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!selected || merging || previewing || !preview}>
                {merging ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Combinando...</> : <><Combine className="h-4 w-4 mr-2" />Combinar con {targetVac?.vacancy_name?.slice(0, 24) || 'vacante'}</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />¿Combinar las vacantes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se moverán {preview?.to_move ?? 0} candidato(s) a "{targetVac?.vacancy_name}" y
                  esta vacante ("{sourceVacancy.vacancy_name}") quedará <strong>Cerrada</strong>.
                  Es reversible reabriéndola, pero los candidatos ya estarán en la otra vacante. ¿Confirmás?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleMerge}>Sí, combinar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
