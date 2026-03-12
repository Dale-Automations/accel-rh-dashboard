import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  onClick?: () => void;
  active?: boolean;
}

export function KpiCard({ title, value, icon: Icon, onClick, active }: KpiCardProps) {
  return (
    <Card
      className={`shadow-sm hover:shadow-md transition-shadow border-0 relative overflow-hidden group ${onClick ? 'cursor-pointer' : ''} ${active ? 'ring-2 ring-primary' : ''}`}
      onClick={onClick}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-gradient opacity-60 group-hover:opacity-100 transition-opacity" />
      <CardContent className="p-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
