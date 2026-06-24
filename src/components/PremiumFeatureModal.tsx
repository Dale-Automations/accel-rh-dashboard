import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Lock, Loader2, Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  title?: string;
  description: string;
}

/**
 * Modal reutilizable para funcionalidades premium que el demo no incluye.
 * Al confirmar, dispara un webhook que notifica a los super_admin (Vicky/Nacho/Pablo)
 * con los datos del usuario + org + feature solicitado.
 */
export function PremiumFeatureModal({ open, onOpenChange, feature, title, description }: Props) {
  const { user, profile, organization } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleRequest = async () => {
    setSubmitting(true);
    try {
      await fetch('https://accelrh.daleautomations.com/webhook/premium-feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature,
          user_id: user?.id,
          user_email: user?.email,
          user_full_name: profile?.full_name,
          organization_id: organization?.id,
          organization_name: organization?.display_name,
          organization_slug: organization?.slug,
          is_demo: !!organization?.is_demo,
        }),
      });
      toast({
        title: 'Solicitud enviada',
        description: 'Un asesor de AccelRH se va a contactar con vos en breve.',
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'No se pudo enviar la solicitud',
        description: e?.message || 'Probá de nuevo en un momento.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {title || 'Funcionalidad premium'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2">
            <Lock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">{description}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Si querés activar esta funcionalidad en tu cuenta, hablanos. Un asesor de
            AccelRH te va a contactar para revisar opciones de plan.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleRequest} disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Solicitar contacto con un asesor
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PremiumFeatureModal;
