import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Plus } from 'lucide-react';
import { trackAction } from '@/lib/userActivity';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (vacancyId: string) => void;
}

export function NewVacancyDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [vacancyName, setVacancyName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [area, setArea] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [publicarPortal, setPublicarPortal] = useState(false);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setVacancyName('');
    setJobDescription('');
    setArea('');
    setModalidad('');
    setUbicacion('');
    setTipoContrato('');
    setPublicarPortal(false);
  };

  const handleCreate = async () => {
    const name = vacancyName.trim();
    if (!name) {
      toast({ title: 'Nombre requerido', description: 'Ingresá un nombre para la vacante.', variant: 'destructive' });
      return;
    }
    // Generar vacancy_id manual_<timestamp>_<random>, mismo patrón que postulantes manuales
    const vacancy_id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    setCreating(true);
    try {
      const res = await fetch('https://accelrh.daleautomations.com/webhook/create-manual-vacancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacancy_id,
          vacancy_name: name,
          job_description: jobDescription.trim() || null,
          created_by_user_id: user?.id || null,
        }),
      });
      const json = await res.json().catch(() => ({ status: 'error', message: 'Respuesta inválida del servidor' }));
      if (json?.status === 'ok') {
        trackAction('create_vacancy');
        // Persistir los 5 campos extras (vía update-vacancy-fields, fire-and-forget si falla)
        const extras: Record<string, unknown> = {};
        if (area.trim()) extras.area = area.trim();
        if (modalidad.trim()) extras.modalidad = modalidad.trim();
        if (ubicacion.trim()) extras.ubicacion = ubicacion.trim();
        if (tipoContrato.trim()) extras.tipo_contrato = tipoContrato.trim();
        if (publicarPortal) extras.publicar_portal = true;
        if (Object.keys(extras).length > 0) {
          try {
            await fetch('https://accelrh.daleautomations.com/webhook/update-vacancy-fields', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vacancy_id, fields: extras }),
            });
          } catch { /* fire-and-forget */ }
        }
        toast({
          title: 'Vacante creada',
          description: `Carpeta de Drive creada automáticamente. Redirigiendo...`,
        });
        reset();
        onOpenChange(false);
        onCreated?.(vacancy_id);
        // Pequeño delay para que el toast se vea
        setTimeout(() => navigate(`/vacantes/${vacancy_id}`), 400);
      } else {
        toast({
          title: 'No se pudo crear',
          description: json?.message || 'Error desconocido al crear la vacante',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Falló la creación', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!creating) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva vacante manual</DialogTitle>
          <DialogDescription>
            Creá una vacante sin pasar por HiringRoom. Se va a crear automáticamente la carpeta de Drive y va a estar lista para recibir candidatos manuales o por hunting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="vacancy-name" className="text-xs">Nombre de la vacante *</Label>
            <Input
              id="vacancy-name"
              value={vacancyName}
              onChange={e => setVacancyName(e.target.value)}
              placeholder="Ej: Desarrollador Backend Senior - Cliente XYZ"
              disabled={creating}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="vacancy-jd" className="text-xs">
              Job Description <span className="text-muted-foreground font-normal">(opcional pero recomendado)</span>
            </Label>
            <Textarea
              id="vacancy-jd"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              placeholder="Pegá el JD completo. Sirve para que la IA arme la cadena de búsqueda boolean automática para hunting + para que el scorer evalúe contra el puesto."
              rows={6}
              disabled={creating}
              className="text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Después podés cargar/editar el JD y la rúbrica desde el detalle de la vacante.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vacancy-area" className="text-xs">Área</Label>
              <Input id="vacancy-area" value={area} onChange={e => setArea(e.target.value)}
                placeholder="Ej: Comercial, IT, RRHH" disabled={creating} />
            </div>
            <div>
              <Label htmlFor="vacancy-modalidad" className="text-xs">Modalidad</Label>
              <Select value={modalidad} onValueChange={setModalidad} disabled={creating}>
                <SelectTrigger id="vacancy-modalidad"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Presencial">Presencial</SelectItem>
                  <SelectItem value="Remoto">Remoto</SelectItem>
                  <SelectItem value="Híbrido">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vacancy-ubicacion" className="text-xs">Ubicación</Label>
              <Input id="vacancy-ubicacion" value={ubicacion} onChange={e => setUbicacion(e.target.value)}
                placeholder="Ej: CABA, Buenos Aires" disabled={creating} />
            </div>
            <div>
              <Label htmlFor="vacancy-contrato" className="text-xs">Tipo de contrato</Label>
              <Select value={tipoContrato} onValueChange={setTipoContrato} disabled={creating}>
                <SelectTrigger id="vacancy-contrato"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full-time">Full-time</SelectItem>
                  <SelectItem value="Part-time">Part-time</SelectItem>
                  <SelectItem value="Freelance">Freelance</SelectItem>
                  <SelectItem value="Temporario">Temporario</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-3 pt-2 border-t">
            <Switch id="vacancy-portal" checked={publicarPortal} onCheckedChange={setPublicarPortal} disabled={creating} />
            <div className="flex-1">
              <Label htmlFor="vacancy-portal" className="text-sm cursor-pointer">
                Publicar en portal público
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Si la activás, la vacante aparece en <code className="text-[10px]">postulantes.accel-rh.com</code> para que la gente se postule.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating || !vacancyName.trim()}>
            {creating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creando vacante + carpeta...</>
            ) : (
              <><Plus className="h-4 w-4 mr-2" /> Crear vacante</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
