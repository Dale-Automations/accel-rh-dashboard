import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { useAuth } from '@/contexts/AuthContext';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Briefcase, Users, CheckCircle, Clock, Phone, BarChart3, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Vacante, Postulante, UserProfile, VacancyAssignment } from '@/types/database';

const sb = supabase as any;

export default function Dashboard() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [postulantes, setPostulantes] = useState<Postulante[]>([]);
  const [assignments, setAssignments] = useState<VacancyAssignment[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, [role, user]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch assignments for the current user if not manager
      // Fetch core data
      const [vacs, posts, profs] = await Promise.all([
        fetchAll<Vacante>('vacantes'),
        fetchAll<Postulante>('postulantes'),
        fetchAll<UserProfile>('user_profiles'),
      ]);

      // Try fetching assignments (table may not exist)
      let assigns: VacancyAssignment[] = [];
      let assignedVacancyIds: string[] | null = null;
      try {
        const assignRes = await sb.from('vacancy_assignments').select('*');
        if (assignRes.data) assigns = assignRes.data as VacancyAssignment[];
        if (role !== 'manager' && user) {
          assignedVacancyIds = assigns.filter((a: VacancyAssignment) => a.user_id === user.id).map((a: VacancyAssignment) => a.vacancy_id);
        }
      } catch {
        console.warn('vacancy_assignments table not available');
      }

      let filteredVacs = vacs;
      let filteredPosts = posts;
      if (assignedVacancyIds) {
        filteredVacs = vacs.filter(v => assignedVacancyIds!.includes(v.vacancy_id));
        filteredPosts = posts.filter(p => assignedVacancyIds!.includes(p.vacancy_id));
      }

      // Sort: active first, then by created_at desc
      filteredVacs.sort((a, b) => {
        const aActive = a.status === 'Activa' ? 0 : 1;
        const bActive = b.status === 'Activa' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setVacantes(filteredVacs);
      setPostulantes(filteredPosts);
      setAssignments(assigns);
      setProfiles(profs);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
    setLoading(false);
  };

  const activasCount = vacantes.filter(v => v.status === 'Activa').length;
  const totalPost = postulantes.length;
  const evaluados = postulantes.filter(p => p.scoring_status === 'scored').length;
  const pendientes = postulantes.filter(p => p.scoring_status === 'pending').length;
  const contactados = postulantes.filter(p => p.contacted).length;

  // Source breakdown
  const sourceBreakdown = postulantes.reduce<Record<string, number>>((acc, p) => {
    const raw = (p.source || '').toLowerCase().trim();
    let label: string;
    if (raw === 'bum' || raw === 'web') label = 'HiringRoom';
    else if (raw.includes('linkedin') || raw.includes('phantom')) label = 'LinkedIn';
    else if (raw === '' || raw === 'manual') label = 'Manual';
    else label = raw.charAt(0).toUpperCase() + raw.slice(1);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const getVacancyStats = (vacancyId: string) => {
    const vPosts = postulantes.filter(p => p.vacancy_id === vacancyId);
    const scored = vPosts.filter(p => p.scoring_status === 'scored');
    const avgScore = scored.length
      ? Math.round(scored.reduce((sum, p) => sum + (p.salary_pretended || 0), 0) / scored.length)
      : 0;
    return { total: vPosts.length, evaluados: scored.length, avgScore: 0 };
  };

  const getVacancyAvgScore = (vacancyId: string) => {
    // We'd need cv_scores for real avg score - approximate from postulantes
    return '—';
  };

    const getSelectoras = (vacancyId: string) => {
    const vacAssigns = assignments.filter(a => a.vacancy_id === vacancyId && a.role === 'selectora');
    return vacAssigns
      .map(a => profiles.find(p => p.id === a.user_id)?.full_name)
      .filter(Boolean)
      .join(', ');
  };

  // Chart data for cliente
  const etapaChartData = role === 'cliente'
    ? Object.entries(
        postulantes.reduce<Record<string, number>>((acc, p) => {
          const e = p.etapa || 'Sin etapa';
          acc[e] = (acc[e] || 0) + 1;
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value }))
    : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar vacante o postulante..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* KPI Cards */}
      {role === 'cliente' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Vacantes Asignadas" value={vacantes.length} icon={Briefcase} />
          <KpiCard title="Total Candidatos" value={totalPost} icon={Users} />
          <KpiCard title="Evaluados" value={evaluados} icon={CheckCircle} />
          <KpiCard title="Score Promedio" value="—" icon={BarChart3} />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <KpiCard title="Vacantes Activas" value={activasCount} icon={Briefcase} />
          <KpiCard title="Total Postulantes" value={totalPost} icon={Users} />
          <KpiCard title="Evaluados" value={evaluados} icon={CheckCircle} />
          <KpiCard title="Pendientes" value={pendientes} icon={Clock} />
          <KpiCard title="Contactados" value={contactados} icon={Phone} />
        </div>
      )}

      {/* Matching Postulantes */}
      {searchQuery.length >= 2 && (() => {
        const q = searchQuery.toLowerCase();
        const matchingPosts = postulantes.filter(p => p.full_name?.toLowerCase().includes(q)).slice(0, 10);
        if (matchingPosts.length === 0) return null;
        return (
          <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Postulantes encontrados</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Nombre</TableHead>
                  <TableHead className="font-semibold">Vacante</TableHead>
                  <TableHead className="font-semibold">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchingPosts.map(p => (
                  <TableRow
                    key={p.id_postulant}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/postulantes/${p.id_postulant}?vacancy_id=${p.vacancy_id}`)}
                  >
                    <TableCell className="font-medium text-foreground">{p.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.vacancy_name || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{p.scoring_status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })()}

      {/* Vacancies Table */}
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Vacante</TableHead>
              <TableHead className="font-semibold">Estado</TableHead>
              <TableHead className="font-semibold text-center">Postulantes</TableHead>
              <TableHead className="font-semibold text-center">Evaluados</TableHead>
              {role !== 'cliente' && <TableHead className="font-semibold">Selector/a(s)</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const q = searchQuery.toLowerCase();
              const filteredVacs = q.length >= 2
                ? vacantes.filter(v => v.vacancy_name.toLowerCase().includes(q))
                : vacantes;
              if (filteredVacs.length === 0) return (
                <TableRow>
                  <TableCell colSpan={role !== 'cliente' ? 5 : 4} className="text-center text-muted-foreground py-10">
                    {q.length >= 2 ? 'Sin resultados' : 'No hay vacantes disponibles'}
                  </TableCell>
                </TableRow>
              );
              return filteredVacs.map(v => {
                const stats = getVacancyStats(v.vacancy_id);
                return (
                  <TableRow
                    key={v.vacancy_id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/vacantes/${v.vacancy_id}`)}
                  >
                    <TableCell className="font-medium text-foreground">{v.vacancy_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={v.status === 'Activa'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-muted text-muted-foreground'}
                      >
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{stats.total}</TableCell>
                    <TableCell className="text-center">{stats.evaluados} / {stats.total}</TableCell>
                    {role !== 'cliente' && <TableCell className="text-sm text-muted-foreground">{getSelectoras(v.vacancy_id) || '—'}</TableCell>}
                  </TableRow>
                );
              });
            })()}
          </TableBody>
        </Table>
      </div>

      {/* Cliente chart */}
      {role === 'cliente' && etapaChartData.length > 0 && (
        <div className="bg-card rounded-lg border shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Candidatos por Etapa</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={etapaChartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-20} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(260, 50%, 55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
