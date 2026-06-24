import { useEffect, useState } from 'react';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Briefcase, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import type { UserProfile, Vacante, VacancyAssignment } from '@/types/database';
import { canManageUsers, rolesAssignableBy } from '@/lib/roles';

const sb = supabase as any;

const roleBadge: Record<string, string> = {
  super_admin: 'bg-rose-50 text-rose-700 border-rose-200',
  enterprise: 'bg-amber-50 text-amber-700 border-amber-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  selectora: 'bg-purple-50 text-purple-700 border-purple-200',
  cliente: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function UserManagement() {
  const { role, profile, hasExternalClients } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [vacantes, setVacantes] = useState<Vacante[]>([]);
  const [assignments, setAssignments] = useState<VacancyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [assignModal, setAssignModal] = useState<UserProfile | null>(null);
  const [selectedVacancies, setSelectedVacancies] = useState<Record<string, boolean>>({});

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('selectora');
  const [submitting, setSubmitting] = useState(false);

  if (!canManageUsers(role)) return <Navigate to="/" replace />;
  const assignableRoles = rolesAssignableBy(role, hasExternalClients);
  const showRoleGuidance = !hasExternalClients && role === 'enterprise';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [usersRes, vacRes, assignRes] = await Promise.all([
      sb.from('user_profiles').select('*'),
      sb.from('vacantes').select('*').eq('status', 'Activa'),
      sb.from('vacancy_assignments').select('*'),
    ]);
    setUsers((usersRes.data || []) as UserProfile[]);
    setVacantes((vacRes.data || []) as Vacante[]);
    setAssignments((assignRes.data || []) as VacancyAssignment[]);
    setLoading(false);
  };

  const openCreate = () => {
    setEditUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('selectora');
    setModalOpen(true);
  };

  const openEdit = (u: UserProfile) => {
    setEditUser(u);
    setFormName(u.full_name || '');
    setFormEmail(u.email || '');
    setFormPassword('');
    setFormRole(u.role);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    if (editUser) {
      // Update profile
      const { error } = await sb.from('user_profiles').update({ full_name: formName, role: formRole }).eq('id', editUser.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Usuario actualizado' });
        setModalOpen(false);
        loadData();
      }
    } else {
      // Create user via Edge Function (admin-create-user).
      // El frontend ya NO usa signUp directo: la función serverside
      // crea con email_confirm=true (puede loguear al toque) y hace
      // upsert atómico del profile. Si falla, rollback automático.
      try {
        const { data, error } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: formEmail.trim(),
            password: formPassword,
            full_name: formName.trim(),
            role: formRole,
            organization_id: profile?.organization_id,
          },
        });
        if (error) {
          // Supabase functions.invoke devuelve error con context para non-2xx
          const ctxResp = (error as any).context?.response;
          let serverMsg = '';
          if (ctxResp && typeof ctxResp.json === 'function') {
            try { const j = await ctxResp.json(); serverMsg = j?.error || ''; } catch { /* ignore */ }
          }
          throw new Error(serverMsg || error.message || 'Error invocando function');
        }
        if (!data?.ok) throw new Error(data?.error || 'Respuesta inválida');
        toast({ title: 'Usuario creado', description: `${formName} ya puede loguearse con el email/contraseña.` });
        setModalOpen(false);
        loadData();
      } catch (e: any) {
        toast({ title: 'Error al crear usuario', description: e?.message || 'Error desconocido', variant: 'destructive' });
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async (u: UserProfile) => {
    if (!confirm(`¿Eliminar a ${u.full_name}?`)) return;
    await sb.from('user_profiles').delete().eq('id', u.id);
    toast({ title: 'Usuario eliminado' });
    loadData();
  };

  const openAssignVacancies = (u: UserProfile) => {
    const userAssigns = assignments.filter(a => a.user_id === u.id);
    const checked: Record<string, boolean> = {};
    userAssigns.forEach(a => { checked[a.vacancy_id] = true; });
    setSelectedVacancies(checked);
    setAssignModal(u);
  };

  const handleSaveVacancyAssignments = async () => {
    if (!assignModal) return;
    // Delete existing assignments for this user
    const existing = assignments.filter(a => a.user_id === assignModal.id);
    for (const a of existing) {
      await sb.from('vacancy_assignments').delete().eq('id', a.id);
    }
    // Insert new
    const vacIds = Object.entries(selectedVacancies).filter(([_, v]) => v).map(([k]) => k);
    for (const vid of vacIds) {
      await sb.from('vacancy_assignments').insert({ vacancy_id: vid, user_id: assignModal.id, role: assignModal.role });
    }
    toast({ title: 'Vacantes asignadas' });
    setAssignModal(null);
    loadData();
  };

  const getUserVacancyCount = (userId: string) => assignments.filter(a => a.user_id === userId).length;

  if (loading) {
    return <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Nuevo Usuario</Button>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Nombre</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Rol</TableHead>
              <TableHead className="font-semibold text-center">Vacantes</TableHead>
              <TableHead className="font-semibold">Creado</TableHead>
              <TableHead className="font-semibold text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`capitalize text-xs ${roleBadge[u.role] || ''}`}>{u.role}</Badge>
                </TableCell>
                <TableCell className="text-center">{getUserVacancyCount(u.id)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => openAssignVacancies(u)}><Briefcase className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(u)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editUser ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {!editUser && showRoleGuidance && (
              <div className="bg-violet-50 border border-violet-200 rounded-md p-3 text-xs space-y-1">
                <div className="font-medium text-violet-900">¿Qué rol elegir?</div>
                <p className="text-violet-900/80">
                  Tu usuario enterprise tiene los mismos poderes que un manager dentro de tu organización.
                  Te recomendamos crear usuarios <strong>manager</strong> y <strong>selectora</strong> separados para repartir la coordinación:
                </p>
                <ul className="list-disc pl-5 text-violet-900/80 space-y-0.5">
                  <li><strong>Manager</strong>: aprueba informes y coordina búsquedas.</li>
                  <li><strong>Selector/a</strong>: trabaja sobre los candidatos y escribe los informes.</li>
                </ul>
              </div>
            )}
            <div>
              <Label>Nombre Completo</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} disabled={!!editUser} type="email" />
            </div>
            {!editUser && (
              <div>
                <Label>Contraseña</Label>
                <Input value={formPassword} onChange={e => setFormPassword(e.target.value)} type="password" />
              </div>
            )}
            <div>
              <Label>Rol</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map(r => (
                    <SelectItem key={r} value={r}>
                      {r === 'enterprise' ? 'Enterprise' : r === 'manager' ? 'Manager' : r === 'selectora' ? 'Selector/a' : 'Cliente'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSubmit} className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editUser ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Vacancies Modal */}
      <Dialog open={!!assignModal} onOpenChange={() => setAssignModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Asignar Vacantes a {assignModal?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {vacantes.map(v => (
              <label key={v.vacancy_id} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer">
                <Checkbox
                  checked={!!selectedVacancies[v.vacancy_id]}
                  onCheckedChange={(c) => setSelectedVacancies(prev => ({ ...prev, [v.vacancy_id]: !!c }))}
                />
                <span className="text-sm">{v.vacancy_name}</span>
              </label>
            ))}
            {vacantes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay vacantes activas</p>}
          </div>
          <Button onClick={handleSaveVacancyAssignments} className="w-full">Guardar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
