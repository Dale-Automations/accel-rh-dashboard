import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { trackAction } from '@/lib/userActivity';
import { useHuntingUsage } from '@/hooks/useHuntingUsage';

const N8N = 'https://accelrh.daleautomations.com';

// Re-lanza el scraper sobre la lista ya guardada de esta búsqueda → siguiente tanda (~50),
// sin re-buscar (sin gastar Sales Navigator). Robusto por vacante.
export default function HuntingScrapeMoreButton({ requestId, vacancyId, accountId = 'vicky' }: {
  requestId: number;
  vacancyId: string;
  accountId?: string;
}) {
  const { toast } = useToast();
  const { atLimit, refresh } = useHuntingUsage();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    if (atLimit) {
      toast({ title: 'Límite diario alcanzado', description: 'Llegaste al tope seguro de perfiles por hoy. Esperá a mañana.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${N8N}/webhook/accelrh-hunting-scrape-more`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hunting_request_id: requestId, vacancy_id: vacancyId, account_id: accountId }),
      });
      const json = await res.json().catch(() => ({ status: 'error' }));
      if (!res.ok || json?.status === 'error') throw new Error(json?.message || `Respondió ${res.status}`);
      trackAction('hunting_scrape_more');
      toast({ title: 'Buscando más perfiles', description: 'Llega otra tanda de ~50 a la vacante.' });
      refresh();
    } catch (err: any) {
      toast({ title: 'No se pudo buscar más', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={loading || atLimit} title={atLimit ? 'Límite diario de perfiles alcanzado' : undefined}>
      {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />} Buscar más perfiles
    </Button>
  );
}
