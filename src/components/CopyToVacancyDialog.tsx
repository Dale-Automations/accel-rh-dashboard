import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabaseExternal as sb } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { copyPostulantToVacancy } from '@/lib/copyPostulant';
import { Loader2, Copy, Search, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Postulante, Vacante } from '@/types/database';

interface Props {
  postulant: Postulante | null;
  open: boolean;
  onClose: () => void;
}

export function CopyToVacancyDialog({ postulant, open, onClose }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (sb as any).from('vacantes').select('*').eq('status', 'Activa').order('vacancy_name').then(({ data }: any) => {
      setVacantes((data || []) as Vacante[]);
      setLoading(false);
    });
    setSelected(null);
    setSearch('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = vacantes;
    if (postulant) list = list.filter(v => v.vacancy_id !== postulant.vacancy_id);
    if (q.length >= 2) list = list.filter(v => (v.vacancy_name || '').toLowerCase().includes(q));
    return list;
  }, [vacantes, search, postulant]);

  if (!postulant) return null;

  const targetVac = vacantes.find(v => v.vacancy_id === selected);

  const handleCopy = async () => {
    if (!selected || !targetVac) return;
    setCopying(true);
    const res = await copyPostulantToVacancy({
      source: postulant,
      targetVacancyId: selected,
      targetVacancyName: targetVac.vacancy_name,
    });
    setCopying(false);
    if (!res.ok) {
      toast({ title: 'Error al copiar', description: res.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Candidato copiado',
      description: `Copiado a "${targetVac.vacancy_name}". Etapa "Nuevo", listo para evaluar.`,
    });
    onClose();
    // navegar al postulant copiado para que la selectora pueda continuar
    if (res.newId) navigate(`/postulantes/${res.newId}?vacancy_id=${selected}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !copying) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy className="h-4 w-4" />Copiar a otra vacante</DialogTitle>
          <DialogDescription>
            Crea un nuevo registro del candidato <span className="font-medium">{postulant.full_name}</span> en la vacante seleccionada.
            El CV se conserva. Los estados (scoring, prescore, informe, etapa) se resetean.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar vacante activa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">{search ? 'Sin resultados' : 'No hay vacantes activas'}</p>
          ) : (
            <ul className="divide-y">
              {filtered.map(v => (
                <li key={v.vacancy_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(v.vacancy_id)}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2 ${selected === v.vacancy_id ? 'bg-primary/10' : ''}`}
                  >
                    <input type="radio" checked={selected === v.vacancy_id} onChange={() => setSelected(v.vacancy_id)} className="shrink-0" />
                    <span className="flex-1 text-sm">{v.vacancy_name}</span>
                    <Badge variant="outline" className="text-[10px]">{v.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={copying}>Cancelar</Button>
          <Button onClick={handleCopy} disabled={!selected || copying}>
            {copying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Copiando...</> : <><Copy className="h-4 w-4 mr-2" />Copiar a {targetVac?.vacancy_name?.slice(0, 30) || 'vacante'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
