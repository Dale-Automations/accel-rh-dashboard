import { useAuth } from '@/contexts/AuthContext';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Lock } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement } from 'react';

/**
 * Devuelve true cuando la org del usuario actual NO puede escribir
 * (demo expirada, suspendida, archived). Es la base para deshabilitar
 * botones de accion en la UI y advertir al usuario.
 *
 * SELECT no se bloquea (la org expirada ve todo); solo write.
 */
export function useReadOnly() {
  const { organization } = useAuth();
  if (!organization) return false;
  const s = organization.status;
  if (s === 'expired' || s === 'suspended' || s === 'archived') return true;
  if (organization.is_demo && organization.demo_expires_at) {
    return new Date(organization.demo_expires_at).getTime() < Date.now();
  }
  return false;
}

/**
 * Wrappea un boton (u otro elemento clickeable) y lo deshabilita si la org
 * esta read-only. Muestra tooltip explicativo. Ideal para evaluar/contactar/etc.
 *
 * Uso:
 *   <ReadOnlyGuard>
 *     <Button onClick={...}>Evaluar</Button>
 *   </ReadOnlyGuard>
 */
export function ReadOnlyGuard({ children, message }: { children: ReactElement; message?: string }) {
  const readOnly = useReadOnly();
  if (!readOnly) return children;
  if (!isValidElement(children)) return children;
  const tooltip = message || 'Tu demo vencio. Esta accion esta deshabilitada en modo read-only.';
  const cloned = cloneElement(children as any, {
    disabled: true,
    onClick: (e: any) => { e?.preventDefault?.(); e?.stopPropagation?.(); },
  });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{cloned}</span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-1.5 text-xs">
            <Lock className="h-3 w-3" />
            {tooltip}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ReadOnlyGuard;
