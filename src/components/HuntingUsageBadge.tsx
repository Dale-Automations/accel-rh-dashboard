import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useHuntingUsage } from '@/hooks/useHuntingUsage';

// Muestra el uso de LinkedIn del día (perfiles visitados / límite seguro) con semáforo.
export default function HuntingUsageBadge({ className = '' }: { className?: string }) {
  const { profilesToday, batchesToday, cap, near, atLimit, loading } = useHuntingUsage();
  if (loading) return null;

  const color = atLimit
    ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-200 dark:bg-red-900/30 dark:border-red-900/50'
    : near
    ? 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-900/30 dark:border-amber-900/50'
    : 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-900/50';
  const Icon = atLimit ? ShieldAlert : near ? Shield : ShieldCheck;
  const note = atLimit ? ' — límite alcanzado, esperá a mañana' : near ? ' — cerca del límite' : '';

  return (
    <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${color} ${className}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>
        Uso LinkedIn hoy: <strong>{profilesToday}/{cap}</strong> perfiles
        <span className="opacity-70"> · {batchesToday} {batchesToday === 1 ? 'tanda' : 'tandas'}</span>
        {note}
      </span>
    </div>
  );
}
