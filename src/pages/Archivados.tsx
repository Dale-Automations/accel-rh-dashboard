import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as sb } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Archive, Search } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import type { Vacante, Postulante, VacancyAssignment } from '@/types/database';

export default function Archivados() {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');

  // Solo selectoras y managers acceden
  useEffect(() => {
    if (role && (role !== 'manager' && role !== 'enterprise' && role !== 'super_admin') && role !== 'selectora') {
      navigate('/');
    }
  }, [role, navigate]);

  useEffect(() => {
    if (!role || role === 'cliente') return;
    const load = async () => {
      setLoading(true);
      try {
        // Vacantes cerradas (status != 'Activa')
        const { data: vacs } = await (sb as any).from('vacantes').select('*').neq('status', 'Activa').order('closed_at', { ascending: false }).limit(500);
        let filteredVacs = (vacs || []) as Vacante[];

        // Selectoras solo ven vacantes asignadas
        if (role === 'selectora' && user) {
          const { data: assigns } = await (sb as any).from('vacancy_assignments').select('vacancy_id').eq('user_id', user.id).eq('role', 'selectora');
          const allowed = new Set((assigns || []).map((a: VacancyAssignment) => a.vacancy_id));
          filteredVacs = filteredVacs.filter(v => allowed.has(v.vacancy_id));
        }

        // Postulant counts por vacante (single query, agrupado del lado cliente)
        if (filteredVacs.length > 0) {
          const ids = filteredVacs.map(v => v.vacancy_id);
          const { data: posts } = await (sb as any).from('postulantes').select('vacancy_id').in('vacancy_id', ids);
          const counts: Record<string, number> = {};
          for (const p of (posts || []) as Postulante[]) {
            counts[p.vacancy_id] = (counts[p.vacancy_id] || 0) + 1;
          }
          setPostCounts(counts);
        }

        setVacantes(filteredVacs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role, user]);

  const q = search.trim().toLowerCase();
  const filtered = q.length >= 2
    ? vacantes.filter(v => v.vacancy_name?.toLowerCase().includes(q))
    : vacantes;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Archive className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Vacantes Archivadas</h1>
        <Badge variant="outline" className="text-xs">{vacantes.length}</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre de vacante..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Vacante</TableHead>
              <TableHead className="font-semibold w-32">Estado</TableHead>
              <TableHead className="font-semibold w-32">Cerrada</TableHead>
              <TableHead className="font-semibold text-center w-28">Postulantes</TableHead>
              <TableHead className="font-semibold w-40">Motivo cierre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                  {q.length >= 2 ? 'Sin resultados' : 'No hay vacantes archivadas'}
                </TableCell>
              </TableRow>
            ) : filtered.map(v => (
              <TableRow
                key={v.vacancy_id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => navigate(`/vacantes/${v.vacancy_id}`)}
              >
                <TableCell className="font-medium text-foreground">{v.vacancy_name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">{v.status}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate((v as any).closed_at) || '—'}</TableCell>
                <TableCell className="text-center text-sm">{postCounts[v.vacancy_id] ?? 0}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={(v as any).close_reason || ''}>
                  {(v as any).close_reason || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
