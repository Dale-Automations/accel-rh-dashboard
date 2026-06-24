import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, Wand2 } from 'lucide-react';

/**
 * CTA destacado del wizard "Armar Vacante con IA" para el dashboard.
 *
 * Reemplaza el item del sidebar que apuntaba a /armar-vacante. La idea es
 * que el wizard sea el camino primario para arrancar una nueva vacancy
 * desde el dashboard, no una seccion separada.
 *
 * Visible para enterprise/manager/selectora/cliente. Para AccelRH (org con
 * clientes externos) seguimos mostrandolo solo a cliente (que arma JD
 * para que AccelRH ejecute). Para orgs self-serve (sin clientes externos),
 * lo ven enterprise/manager/selectora.
 */
export function WizardCallout() {
  const navigate = useNavigate();
  const { role, hasExternalClients } = useAuth();

  const visible = hasExternalClients
    ? role === 'cliente'
    : role === 'enterprise' || role === 'manager' || role === 'selectora';
  if (!visible) return null;

  return (
    <Card className="border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/20 dark:to-fuchsia-950/20 dark:border-violet-900">
      <CardContent className="p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0">
            <Wand2 className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-700" />
              <span className="text-[11px] uppercase tracking-wider text-violet-700 font-semibold">Asistente IA</span>
            </div>
            <h3 className="text-base font-semibold text-foreground mt-0.5">Armá tu próxima vacante con IA</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Un chat te guía para definir el puesto, los criterios de evaluación y un guion de entrevista. En 5 minutos lo tenés listo para abrir la vacante.
            </p>
          </div>
          <Button onClick={() => navigate('/armar-vacante')} className="bg-violet-600 hover:bg-violet-700 shrink-0">
            Abrir asistente
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default WizardCallout;
