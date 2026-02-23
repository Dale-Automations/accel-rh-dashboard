import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

const sb = supabase as any;

const roleBadge: Record<string, string> = {
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  selectora: 'bg-purple-50 text-purple-700 border-purple-200',
  cliente: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function UserManagement() {
  const { role } = useAuth();
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

  if (role !== 'manager') return <Navigate to="/" replace />;

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
      // Create user via Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: formEmail,
        password: formPassword,
        options: { data: { full_name: formName } },
      });
      if (error) {
        toast({ title: 'Error al crear usuario', description: error.message, variant: 'destructive' });
      } else {
        // Update the profile role (trigger should create it)
        if (data.user) {
          // Wait a bit for the trigger
          setTimeout(async () => {
            await sb.from('user_profiles').update({ role: formRole, full_name: formName }).eq('id', data.user!.id);
            loadData();
          }, 1000);
        }
        toast({ title: 'Usuario creado' });
        setModalOpen(false);
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
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="selectora">Selectora</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
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
