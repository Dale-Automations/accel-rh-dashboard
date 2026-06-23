import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Calendar, ShieldOff, RefreshCw, Loader2 } from 'lucide-react';
import { isSuperAdmin, roleLabel } from '@/lib/roles';
import { formatDate } from '@/lib/formatters';
import type { Organization, UserProfile, Vacante } from '@/types/database';

const sb = supabase as any;

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  demo: 'bg-amber-50 text-amber-700 border-amber-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200',
  suspended: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  archived: 'bg-zinc-100 text-zinc-500 border-zinc-300',
};

export default function AdminOrgDetail() {
  const { role } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vacancies, setVacancies] = useState<Vacante[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStatus, setNewStatus] = useState<string>('');
  const [newExpiresAt, setNewExpiresAt] = useState<string>('');
  const [saving, setSaving] = useState(false);

  if (!isSuperAdmin(role)) return <Navigate to="/" replace />;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [orgRes, usersRes, vacRes] = await Promise.all([
        sb.from('organizations').select('*').eq('id', id).maybeSingle(),
        sb.from('user_profiles').select('*').eq('organization_id', id).order('created_at', { ascending: false }),
        sb.from('vacantes').select('*').eq('organization_id', id).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;
      setOrg(orgRes.data as Organization | null);
      setUsers((usersRes.data || []) as UserProfile[]);
      setVacancies((vacRes.data || []) as Vacante[]);
      setNewStatus(orgRes.data?.status || '');
      setNewExpiresAt(orgRes.data?.demo_expires_at?.slice(0, 10) || '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSave = async () => {
    if (!org) return;
    setSaving(true);
    const updates: any = { status: newStatus };
    if (newExpiresAt) updates.demo_expires_at = new Date(newExpiresAt).toISOString();
    const { error } = await sb.from('organizations').update(updates).eq('id', org.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Organizacion actualizada' });
      setOrg({ ...org, ...updates });
    }
    setSaving(false);
  };

  const daysLeft = () => {
    if (!org?.demo_expires_at) return null;
    return Math.ceil((new Date(org.demo_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!org) return <Navigate to="/admin/orgs" replace />;
  const days = daysLeft();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/orgs')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Volver
      </Button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">{org.display_name}</h1>
          <p className="text-sm text-muted-foreground">{org.slug}</p>
        </div>
        <Badge variant="outline" className={statusBadge[org.status] || ''}>
          {org.is_demo && org.status === 'demo' ? 'Demo' : org.status}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vence el</Label>
              <Input type="date" value={newExpiresAt} onChange={e => setNewExpiresAt(e.target.value)} />
              {days !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {days <= 0 ? 'Vencida' : `${days} dias restantes`}
                </p>
              )}
            </div>
            <div className="flex items-end">
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Guardar
              </Button>
            </div>
          </div>
          {org.is_demo && (
            <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
              <div className="flex items-center gap-2"><Calendar className="h-3 w-3" /> Creada {formatDate(org.created_at)}</div>
              {org.demo_source && <div>Origen: {org.demo_source}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-3">Usuarios ({users.length})</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sin usuarios.</TableCell></TableRow>
                ) : users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{u.full_name || '-'}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell><Badge variant="outline">{roleLabel(u.role)}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-3">Vacantes ({vacancies.length})</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Creada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vacancies.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin vacantes.</TableCell></TableRow>
                ) : vacancies.map(v => (
                  <TableRow key={v.vacancy_id}>
                    <TableCell>{v.vacancy_name}</TableCell>
                    <TableCell><Badge variant="outline">{v.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(v.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
