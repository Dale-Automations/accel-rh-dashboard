import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/formatters';
import type { Postulante, VacancyAssignment } from '@/types/database';

const sb = supabase as any;

type FilterPreset =
  | { kind: 'scoring_pending'; title: string; desc: string }
  | { kind: 'informe_pending'; title: string; desc: string }
  | { kind: 'cliente_pendiente'; title: string; desc: string }
  | { kind: 'cliente_aceptado'; title: string; desc: string }
  | { kind: 'cliente_rechazado'; title: string; desc: string }
  | { kind: 'all'; title: string; desc: string };

function parsePreset(params: URLSearchParams): FilterPreset {
  if (params.get('scoring') === 'pending') return { kind: 'scoring_pending', title: 'Postulantes por evaluar', desc: 'Esperan que la IA les ponga score con rúbrica.' };
  if (params.get('informe') === 'pending') return { kind: 'informe_pending', title: 'Informes a revisar', desc: 'La selectora ya escribió el informe — el manager debe aprobarlo o pedir cambios.' };
  if (params.get('cliente_estado') === 'pendiente') return { kind: 'cliente_pendiente', title: 'Esperando respuesta del cliente', desc: 'Candidatos compartidos al cliente sin aceptar/rechazar.' };
  if (params.get('cliente_estado') === 'aceptado') return { kind: 'cliente_aceptado', title: 'Aceptados por el cliente', desc: 'Candidatos que el cliente marcó como aceptados.' };
  if (params.get('cliente_estado') === 'rechazado') return { kind: 'cliente_rechazado', title: 'Rechazados por el cliente', desc: 'Candidatos que el cliente marcó como rechazados.' };
  return { kind: 'all', title: 'Candidatos', desc: '' };
}

export default function CandidatesList() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preset = parsePreset(searchParams);
  const [postulantes, setPostulantes] = useState<Postulante[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Cargamos todos los postulantes con columnas livianas y filtramos client-side
        // (más simple para MVP — para listas largas migraríamos a server-side).
        const POST_COLS = 'id_postulant,vacancy_id,vacancy_name,full_name,email,scoring_status,prescore_status,informe_status,etapa,mostrar_cliente,cliente_estado,created_at,apply_date,source';
        const all = await fetchAll<Postulante>('postulantes', undefined, POST_COLS);

        let filtered = all;

        // Filtro por preset
        if (preset.kind === 'scoring_pending') {
          filtered = filtered.filter(p => p.scoring_status === 'pending');
        } else if (preset.kind === 'informe_pending') {
          filtered = filtered.filter(p => (p as any).informe_status === 'pending_review');
        } else if (preset.kind === 'cliente_pendiente') {
          filtered = filtered.filter(p => p.mostrar_cliente === true && (p as any).cliente_estado === 'pendiente');
        } else if (preset.kind === 'cliente_aceptado') {
          filtered = filtered.filter(p => (p as any).cliente_estado === 'aceptado');
        } else if (preset.kind === 'cliente_rechazado') {
          filtered = filtered.filter(p => (p as any).cliente_estado === 'rechazado');
        }

        // Filtro por vacancy_id si está en el URL
        const vacancyIdFilter = searchParams.get('vacancy_id');
        if (vacancyIdFilter) {
          filtered = filtered.filter(p => p.vacancy_id === vacancyIdFilter);
        }

        // Filtro por rol cliente: solo vacantes asignadas + mostrar_cliente=true + no descartados internos
        if (role === 'cliente' && user) {
          const { data: assigns } = await sb.from('vacancy_assignments').select('vacancy_id').eq('user_id', user.id);
          const okIds = new Set((assigns || []).map((a: VacancyAssignment) => a.vacancy_id));
          const DISCARDED = new Set(['Descartado', 'Rechazado por Selector/a', 'Rechazado por Manager']);
          filtered = filtered.filter(p =>
            okIds.has(p.vacancy_id) &&
            p.mostrar_cliente === true &&
            !DISCARDED.has((p as any).etapa || '')
          );
        }

        // Sort: más reciente primero
        filtered.sort((a, b) => ((b as any).created_at || '').localeCompare((a as any).created_at || ''));

        if (!cancelled) setPostulantes(filtered);
      } catch (e) {
        if (!cancelled) setPostulantes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [preset.kind, searchParams, role, user?.id]);

  const visible = postulantes.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.vacancy_name || '').toLowerCase().includes(q)
    );
  });

  const isCliente = role === 'cliente';

  if (loading) {
    return <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-foreground">{preset.title}</h1>
        {preset.desc && <p className="text-sm text-muted-foreground mt-1">{preset.desc}</p>}
        <p className="text-xs text-muted-foreground mt-2">{visible.length} candidato{visible.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, email o vacante..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Candidato</TableHead>
              <TableHead className="font-semibold">Vacante</TableHead>
              <TableHead className="font-semibold">Etapa</TableHead>
              <TableHead className="font-semibold">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  No hay candidatos para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              visible.slice(0, 200).map(p => {
                const displayName = isCliente
                  ? `Postulante #${(p.id_postulant || '').slice(0, 8)}…`
                  : (p.full_name || p.id_postulant?.slice(0, 8) || '—');
                return (
                  <TableRow
                    key={p.id_postulant}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/postulantes/${p.id_postulant}?vacancy_id=${p.vacancy_id}`)}
                  >
                    <TableCell className="font-medium text-foreground">{displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.vacancy_name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{(p as any).etapa || '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate((p as any).created_at)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {visible.length > 200 && (
        <p className="text-xs text-muted-foreground text-center">
          Mostrando los primeros 200 — afiná tu búsqueda para ver más.
        </p>
      )}
    </div>
  );
}
