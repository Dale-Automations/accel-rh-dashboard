import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Building2, Clock } from 'lucide-react';
import { isSuperAdmin } from '@/lib/roles';
import { formatDate } from '@/lib/formatters';
import type { Organization } from '@/types/database';

const sb = supabase as any;

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  demo: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200',
  suspended: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  archived: 'bg-zinc-100 text-zinc-500 border-zinc-300',
};

interface OrgRow extends Organization {
  user_count?: number;
  active_vacancy_count?: number;
}

export default function AdminOrganizations() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'demo' | 'expired'>('all');

  if (!isSuperAdmin(role)) return <Navigate to="/" replace />;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: orgsData } = await sb.from('organizations').select('*').order('created_at', { ascending: false });
      const orgIds = (orgsData || []).map((o: any) => o.id);
      const [usersRes, vacRes] = await Promise.all([
        sb.from('user_profiles').select('organization_id').in('organization_id', orgIds.length ? orgIds : ['__none__']),
        sb.from('vacantes').select('organization_id').eq('status', 'Activa').in('organization_id', orgIds.length ? orgIds : ['__none__']),
      ]);
      const userCounts: Record<string, number> = {};
      const vacCounts: Record<string, number> = {};
      (usersRes.data || []).forEach((u: any) => { userCounts[u.organization_id] = (userCounts[u.organization_id] || 0) + 1; });
      (vacRes.data || []).forEach((v: any) => { vacCounts[v.organization_id] = (vacCounts[v.organization_id] || 0) + 1; });
      const enriched = (orgsData || []).map((o: any) => ({
        ...o,
        user_count: userCounts[o.id] || 0,
        active_vacancy_count: vacCounts[o.id] || 0,
      }));
      if (!cancelled) {
        setOrgs(enriched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = orgs.filter(o => {
    if (filter === 'all') return true;
    if (filter === 'demo') return o.is_demo && o.status === 'demo';
    return o.status === filter;
  });

  const daysLeft = (org: Organization) => {
    if (!org.demo_expires_at) return null;
    const diff = new Date(org.demo_expires_at).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Organizaciones</h1>
          <p className="text-muted-foreground text-sm">Gestion de tenants y demos.</p>
        </div>
        <Button onClick={() => navigate('/admin/orgs/new')}>
          <Plus className="h-4 w-4 mr-2" /> Crear organizacion
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'demo', 'expired'] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : f === 'demo' ? 'Demos' : 'Vencidas'}
            <span className="ml-1.5 text-xs opacity-70">
              ({f === 'all' ? orgs.length : f === 'demo' ? orgs.filter(o => o.is_demo && o.status === 'demo').length : orgs.filter(o => o.status === f).length})
            </span>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organizacion</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usuarios</TableHead>
                  <TableHead>Vacantes activas</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Vence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Sin resultados.</TableCell></TableRow>
                ) : filtered.map(o => {
                  const days = daysLeft(o);
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/admin/orgs/${o.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{o.display_name}</div>
                            <div className="text-xs text-muted-foreground">{o.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge[o.status] || ''}>
                          {o.is_demo && o.status === 'demo' ? 'Demo' : o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{o.user_count}</TableCell>
                      <TableCell>{o.active_vacancy_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        {o.demo_expires_at ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className={days !== null && days <= 0 ? 'text-rose-600' : days !== null && days <= 3 ? 'text-amber-600' : 'text-muted-foreground'}>
                              {days !== null && days <= 0 ? 'Vencida' : `${days}d`}
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
