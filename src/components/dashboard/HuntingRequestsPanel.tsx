import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/formatters';

const sb = supabase as any;

interface Props {
  role: string | null;
  /** asPage=true muestra el card siempre (incl. vacío). En el dashboard se oculta si no hay pendientes. */
  asPage?: boolean;
}

export default function HuntingRequestsPanel({ role, asPage = false }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await sb
      .from('hunting_requests')
      .select('id, vacancy_id, requested_by, generated_string, notes, status, created_at, vacantes(vacancy_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    const list = data || [];
    setRows(list);
    const ids = Array.from(new Set(list.map((r: any) => r.requested_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await sb.from('user_profiles').select('id, full_name').in('id', ids);
      setNames(Object.fromEntries((profs || []).map((p: any) => [p.id, p.full_name])));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role !== 'manager') return;
    load();
    // Realtime: salta en el dashboard apenas una selectora solicita.
    const ch = sb
      .channel('hunting_requests:dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hunting_requests' }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [role, load]);

  if (role !== 'manager') return null;
  // En el dashboard, no metemos un card vacío: solo aparece cuando hay pendientes.
  if (!asPage && (loading || rows.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> Solicitudes de Headhunting
          {rows.length > 0 && (
            <Badge variant="outline" aria-label={`${rows.length} pendientes`} className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{rows.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">No hay solicitudes de headhunting pendientes.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => navigate(`/vacantes/${r.vacancy_id}`)}
                  className="w-full flex items-center justify-between gap-3 px-6 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.vacantes?.vacancy_name || r.vacancy_id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Solicitada por {names[r.requested_by] || '—'} · {formatDate(r.created_at)}
                    </p>
                    {r.generated_string && (
                      <p className="text-xs font-mono text-muted-foreground/80 truncate mt-0.5 cursor-help" title={r.generated_string}>{r.generated_string}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
