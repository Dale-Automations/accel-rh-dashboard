import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserX, ArrowRight, Briefcase } from 'lucide-react';

const sb = supabase as any;

interface Row {
  vacancy_id: string;
  vacancy_name: string | null;
  pending_count: number;
}

/**
 * Manager-only: vacantes con candidatos `mostrar_cliente=true cliente_estado=pendiente`
 * pero sin ningún `vacancy_assignments.role='cliente'`. Aparece cuando alguien duplica
 * una vacancy (típicamente HiringRoom con sufijo "- copia") y olvida re-asignar al cliente.
 */
export function VacanciesMissingClientPanel({ role }: { role: string | null }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== 'manager' && role !== 'enterprise' && role !== 'super_admin') { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const pending = await fetchAll<{ vacancy_id: string; vacancy_name: string | null }>(
          'postulantes',
          [['mostrar_cliente', 'true'], ['cliente_estado', 'pendiente']],
          'vacancy_id,vacancy_name'
        );
        const byVac = new Map<string, { name: string | null; count: number }>();
        for (const p of pending) {
          const slot = byVac.get(p.vacancy_id) || { name: p.vacancy_name, count: 0 };
          slot.count += 1;
          if (!slot.name && p.vacancy_name) slot.name = p.vacancy_name;
          byVac.set(p.vacancy_id, slot);
        }
        const vacIds = Array.from(byVac.keys());
        if (vacIds.length === 0) {
          if (!cancelled) { setItems([]); setLoading(false); }
          return;
        }
        const { data: clientAssigns } = await sb
          .from('vacancy_assignments')
          .select('vacancy_id')
          .eq('role', 'cliente')
          .in('vacancy_id', vacIds);
        const withClient = new Set((clientAssigns || []).map((a: any) => a.vacancy_id));
        const orphans: Row[] = [];
        for (const [vid, info] of byVac.entries()) {
          if (!withClient.has(vid)) {
            orphans.push({ vacancy_id: vid, vacancy_name: info.name, pending_count: info.count });
          }
        }
        orphans.sort((a, b) => b.pending_count - a.pending_count);
        if (!cancelled) { setItems(orphans); setLoading(false); }
      } catch {
        if (!cancelled) { setItems([]); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [role]);

  if (loading || items.length === 0) return null;

  const total = items.reduce((s, r) => s + r.pending_count, 0);

  return (
    <Card className="border-rose-300 bg-rose-50/60 dark:bg-rose-950/20 dark:border-rose-900">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-rose-700 dark:text-rose-400" />
            <h3 className="font-semibold text-sm text-rose-900 dark:text-rose-200">
              {items.length === 1
                ? '1 vacante sin cliente asignado'
                : `${items.length} vacantes sin cliente asignado`}
            </h3>
            <Badge variant="destructive" className="text-[10px]">
              {total} {total === 1 ? 'candidato esperando' : 'candidatos esperando'}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-rose-900/80 dark:text-rose-200/80">
          Estos candidatos están marcados visibles al cliente pero la vacante no tiene ningún cliente asignado, así que nadie los ve. Suele pasar cuando se duplica una vacante en HiringRoom: asigná manualmente al cliente correcto (o ignorá si la base es para otro cliente).
        </p>
        <div className="space-y-2">
          {items.map(r => (
            <div
              key={r.vacancy_id}
              className="bg-background border rounded-md p-2.5 flex items-start gap-3 cursor-pointer hover:border-rose-400 transition-colors"
              onClick={() => navigate(`/vacantes/${r.vacancy_id}`)}
            >
              <Briefcase className="h-4 w-4 text-rose-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {r.vacancy_name || r.vacancy_id}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {r.pending_count} {r.pending_count === 1 ? 'candidato esperando review' : 'candidatos esperando review'}
                </div>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0">
                Asignar cliente <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default VacanciesMissingClientPanel;
