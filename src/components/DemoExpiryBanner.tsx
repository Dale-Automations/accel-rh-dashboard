import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Clock } from 'lucide-react';

/**
 * Banner que aparece en el top de AppLayout cuando la org actual es demo.
 * - Demo activa: amber, muestra dias restantes.
 * - Demo vencida (status='expired' o demo_expires_at pasado): rojo, advierte read-only.
 * - Otra org: no renderiza nada.
 */
export function DemoExpiryBanner() {
  const { organization } = useAuth();
  if (!organization || !organization.is_demo) return null;

  const expiresAt = organization.demo_expires_at;
  const isExpiredByStatus = organization.status === 'expired';
  const isExpiredByDate = expiresAt && new Date(expiresAt).getTime() < Date.now();
  const expired = isExpiredByStatus || isExpiredByDate;

  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  if (expired) {
    return (
      <div className="bg-rose-100 border-b border-rose-300 text-rose-900 px-4 py-2 text-sm flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>
          Tu demo de <strong>{organization.display_name}</strong> vencio. Podes seguir viendo tu informacion pero las acciones estan deshabilitadas.
        </span>
      </div>
    );
  }

  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 px-4 py-2 text-sm flex items-center justify-center gap-2">
      <Clock className="h-4 w-4" />
      <span>
        Demo activo: {daysLeft !== null && daysLeft > 0 ? `${daysLeft} dias restantes` : 'ultimo dia'}.
        Despues queda en modo read-only.
      </span>
    </div>
  );
}

export default DemoExpiryBanner;
