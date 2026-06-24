import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { isSuperAdmin } from '@/lib/roles';

const sb = supabase as any;

function defaultDemoExpiresAt() {
  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  // input type=date espera YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

export default function AdminOrgNew() {
  const { role, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const [demoExpiresAt, setDemoExpiresAt] = useState(defaultDemoExpiresAt());
  const [demoSource, setDemoSource] = useState('');
  const [transferVacancyId, setTransferVacancyId] = useState('');
  const [vacancies, setVacancies] = useState<Array<{ vacancy_id: string; vacancy_name: string }>>([]);

  if (!isSuperAdmin(role)) return <Navigate to="/" replace />;

  useEffect(() => {
    // Cargar vacantes de dale-accelrh (no transferidas), para el dropdown demo
    (async () => {
      const { data: orgs } = await sb.from('organizations').select('id').eq('slug', 'dale-accelrh').maybeSingle();
      if (!orgs?.id) return;
      const { data: vacs } = await sb
        .from('vacantes')
        .select('vacancy_id, vacancy_name, status, organization_id')
        .eq('organization_id', orgs.id)
        .eq('status', 'Activa')
        .order('created_at', { ascending: false })
        .limit(200);
      setVacancies((vacs || []).map((v: any) => ({ vacancy_id: v.vacancy_id, vacancy_name: v.vacancy_name })));
    })();
  }, []);

  const handleSubmit = async () => {
    if (!displayName || !ownerEmail || !ownerFullName || !ownerPassword) {
      toast({ title: 'Faltan campos requeridos', variant: 'destructive' });
      return;
    }
    // transferVacancyId es opcional: si no se elige, el enterprise arma su propia vacancy adentro.
    setSubmitting(true);
    try {
      const authToken = session?.access_token;
      const res = await fetch('https://qdlopcpjopvaprvnzxys.supabase.co/functions/v1/admin-create-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          display_name: displayName,
          slug: slug || undefined,
          is_demo: isDemo,
          demo_expires_at: isDemo ? new Date(demoExpiresAt).toISOString() : undefined,
          demo_source: isDemo ? demoSource || undefined : undefined,
          transfer_vacancy_id: isDemo && transferVacancyId ? transferVacancyId : undefined,
          owner_email: ownerEmail,
          owner_full_name: ownerFullName,
          owner_password: ownerPassword,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast({ title: 'No se pudo crear', description: json?.error || `HTTP ${res.status}`, variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      toast({ title: 'Organizacion creada', description: isDemo ? 'Demo activada, bootstrap disparado.' : 'Lista para usar.' });
      navigate(`/admin/orgs/${json.organization.id}`);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Error de red', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/orgs')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Volver
      </Button>
      <div>
        <h1 className="text-2xl font-semibold">Nueva organizacion</h1>
        <p className="text-sm text-muted-foreground">Crea el tenant y su primer usuario enterprise.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>Nombre visible *</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Acme Consultoria" />
          </div>
          <div className="space-y-2">
            <Label>Slug (opcional, se genera del nombre)</Label>
            <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-consultoria" />
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label className="font-medium">Primer usuario Enterprise</Label>
            <Input value={ownerFullName} onChange={e => setOwnerFullName(e.target.value)} placeholder="Nombre completo del contacto" />
            <Input value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="email@empresa.com" type="email" />
            <Input value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="Password inicial (min 6)" type="text" />
            <p className="text-xs text-muted-foreground">El password se le manda por email junto con el link de acceso.</p>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Es demo (2 semanas, read-only al vencer)</Label>
              <Switch checked={isDemo} onCheckedChange={setIsDemo} />
            </div>
            {isDemo && (
              <div className="mt-3 space-y-3 pl-3 border-l-2 border-amber-200">
                <div>
                  <Label>Vence el</Label>
                  <Input type="date" value={demoExpiresAt} onChange={e => setDemoExpiresAt(e.target.value)} />
                </div>
                <div>
                  <Label>Origen / quien lo arma</Label>
                  <Input value={demoSource} onChange={e => setDemoSource(e.target.value)} placeholder="vicky / nacho / texto libre" />
                </div>
                <div>
                  <Label>Vacancy a transferir desde AccelRH (opcional)</Label>
                  <Select value={transferVacancyId || 'none'} onValueChange={(v) => setTransferVacancyId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Sin vacancy (el enterprise arma la suya)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin vacancy (el enterprise la crea adentro)</SelectItem>
                      {vacancies.map(v => (
                        <SelectItem key={v.vacancy_id} value={v.vacancy_id}>{v.vacancy_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Si quer&eacute;s arrancar el demo con una vacancy ya cargada (ya publicada en HR con la cuenta de AccelRH), eleg&iacute;la ac&aacute;. Si no, el enterprise crea su propia vacancy desde adentro del sistema.
                  </p>
                </div>
              </div>
            )}
          </div>

          <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isDemo ? 'Crear org + activar demo' : 'Crear organizacion'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
