import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: es });
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy HH:mm', { locale: es });
  } catch {
    return '—';
  }
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function getScoreColor(score: number | null | undefined): string {
  if (score == null) return 'bg-muted text-muted-foreground';
  if (score > 90) return 'bg-green-50 text-green-700 border-green-200';
  if (score >= 80) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  if (score >= 70) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

export function getEtapaColor(etapa: string | null): string {
  const colors: Record<string, string> = {
    'Nuevo': 'bg-blue-50 text-blue-700 border-blue-200',
    'Evaluado': 'bg-teal-50 text-teal-700 border-teal-200',
    'Contactado': 'bg-cyan-50 text-cyan-700 border-cyan-200',
    'Preguntas screening': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Coordinando entrevista selectora': 'bg-purple-50 text-purple-700 border-purple-200',
    'Entrevista agendada': 'bg-violet-50 text-violet-700 border-violet-200',
    'Enviado a cliente': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Descartado': 'bg-rose-50 text-rose-700 border-rose-200',
    'Rechazado por cliente': 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return colors[etapa || ''] || 'bg-muted text-muted-foreground';
}

export function extractLinks(text: string | null): { text: string; url: string }[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches.map(url => ({ text: url, url })) : [];
}
