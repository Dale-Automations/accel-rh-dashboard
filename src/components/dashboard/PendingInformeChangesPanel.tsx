import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowRight, ClipboardEdit } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { InformeFeedback } from '@/types/database';

const sb = supabase as any;

interface Row extends InformeFeedback {
  postulant_name?: string | null;
  vacancy_name?: string | null;
}

/**
 * Widget destacado en Home para selectoras: muestra los informes con cambios
 * solicitados (o rechazados) que todavía no fueron leídos por la selectora.
 * Se oculta si no hay nada pendiente.
 */
export function PendingInformeChangesPanel({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data: fbs } = await sb
        .from('informe_feedback')
        .select('*')
        .eq('submitted_by', userId)
        .in('decision', ['changes_requested', 'rejected'])
        .is('acknowledged_by_submitter_at', null)
        .order('reviewed_at', { ascending: false })
        .limit(5);
      const fb = (fbs || []) as InformeFeedback[];
      if (fb.length === 0) {
        if (!cancelled) { setItems([]); setLoading(false); }
        return;
      }
      const ids = Array.from(new Set(fb.map(f => f.postulant_id)));
      const { data: posts } = await sb
        .from('postulantes')
        .select('id_postulant, full_name, vacancy_name')
        .in('id_postulant', ids);
      const map = new Map<string, any>((posts || []).map((p: any) => [p.id_postulant, p]));
      if (cancelled) return;
      setItems(fb.map(f => ({
        ...f,
        postulant_name: map.get(f.postulant_id)?.full_name || null,
        vacancy_name: map.get(f.postulant_id)?.vacancy_name || null,
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading || items.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-200">
              Tenés {items.length} {items.length === 1 ? 'informe' : 'informes'} con cambios solicitados
            </h3>
            <Badge variant="destructive" className="text-[10px]">sin leer</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/mis-informes')}>
            Ver todos <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
        <div className="space-y-2">
          {items.map(f => (
            <div
              key={f.id}
              className="bg-background border rounded-md p-2.5 flex items-start gap-3 cursor-pointer hover:border-amber-400 transition-colors"
              onClick={() => navigate(`/postulantes/${f.postulant_id}?vacancy_id=${f.vacancy_id}`)}
            >
              <ClipboardEdit className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {f.postulant_name || f.postulant_id}
                  <span className="text-xs text-muted-foreground font-normal ml-2">{f.vacancy_name}</span>
                </div>
                {f.feedback && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                    "{f.feedback}"
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {f.reviewed_by_name || 'Manager'} · hace {formatDistanceToNow(new Date(f.reviewed_at || f.submitted_at), { locale: es })}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
