import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ClipboardCheck, Search } from 'lucide-react';
import type { Vacante, Rubrica } from '@/types/database';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const sb = supabase as any;

export default function RubricasList() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [rubricas, setRubricas] = useState<Rubrica[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vacs, rubs] = await Promise.all([
        fetchAll<Vacante>('vacantes'),
        fetchAll<Rubrica>('rubricas'),
      ]);

      // Only active vacancies
      const activeVacs = vacs.filter(v => v.status === 'Activa');
      activeVacs.sort((a, b) => a.vacancy_name.localeCompare(b.vacancy_name));

      setVacantes(activeVacs);
      setRubricas(rubs);
    } catch (err) {
      console.error('Error loading rubricas list:', err);
    }
    setLoading(false);
  };

  const getRubricStats = (vacancyId: string) => {
    const vRubs = rubricas.filter(r => r.vacancy_id === vacancyId);
    const active = vRubs.find(r => r.is_active);
    const latest = vRubs.length
      ? vRubs.reduce((a, b) => new Date(b.created_at) > new Date(a.created_at) ? b : a)
      : null;
    return { count: vRubs.length, active, latest };
  };

  const filtered = search.length >= 2
    ? vacantes.filter(v => v.vacancy_name.toLowerCase().includes(search.toLowerCase()))
    : vacantes;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Rúbricas</h1>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar vacante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Vacante</TableHead>
              <TableHead className="font-semibold text-center">Versiones</TableHead>
              <TableHead className="font-semibold text-center">Estado</TableHead>
              <TableHead className="font-semibold">Última versión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  {search.length >= 2 ? 'Sin resultados' : 'No hay vacantes activas'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(v => {
                const stats = getRubricStats(v.vacancy_id);
                return (
                  <TableRow
                    key={v.vacancy_id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/rubricas/${v.vacancy_id}`)}
                  >
                    <TableCell className="font-medium text-foreground">{v.vacancy_name}</TableCell>
                    <TableCell className="text-center">{stats.count}</TableCell>
                    <TableCell className="text-center">
                      {stats.active ? (
                        <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">
                          v{stats.active.version_number} activa
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Sin rúbrica
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {stats.latest
                        ? format(new Date(stats.latest.created_at), "d MMM yyyy HH:mm", { locale: es })
                        : '—'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
