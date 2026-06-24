import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronDown, ChevronRight, Video, MessageSquare, LifeBuoy, Search, BookOpen,
} from 'lucide-react';
import { FAQ, filterFaqByRole, searchFaq } from '@/lib/faq';

type Role = string | null | undefined;

/**
 * Atajo rápido a FAQ + tutoriales desde cualquier pantalla.
 *
 * Para tickets / contacto con soporte: el flujo vive en /soporte (sección
 * propia con tickets y thread). Acá solo dejamos un CTA al final del FAQ que
 * lleva a esa sección.
 */
export function HelpModal({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: Role;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const visibleFaqs = searchFaq(filterFaqByRole(FAQ, role), query);

  const goSupport = () => {
    onOpenChange(false);
    navigate('/soporte');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Ayuda rápida</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="faq" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="faq"><MessageSquare className="h-3.5 w-3.5 mr-2" />FAQ</TabsTrigger>
            <TabsTrigger value="videos"><Video className="h-3.5 w-3.5 mr-2" />Tutoriales</TabsTrigger>
          </TabsList>

          <TabsContent value="faq" className="overflow-y-auto pr-2 space-y-3 mt-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en la FAQ"
                className="pl-9"
              />
            </div>
            {visibleFaqs.map((f, i) => (
              <div key={i} className="border rounded-lg">
                <button
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className="text-sm font-medium text-foreground">{f.q}</span>
                  {expanded === i ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>
                {expanded === i && (
                  <div className="px-4 pb-3 space-y-2 text-sm text-muted-foreground">
                    <p>{f.a}</p>
                    {f.cta?.to && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { navigate(f.cta!.to!); onOpenChange(false); }}
                      >
                        {f.cta.label}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}

            {visibleFaqs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Sin resultados para "{query}".
              </p>
            )}

            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 flex items-center gap-3 dark:bg-violet-950/30 dark:border-violet-900">
              <LifeBuoy className="h-5 w-5 text-violet-700 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-violet-900 dark:text-violet-100">¿No encontraste lo que buscabas?</p>
                <p className="text-[11px] text-violet-800/80 dark:text-violet-200/80">
                  Andá a Soporte y abrí un ticket. El equipo te responde dentro del sistema.
                </p>
              </div>
              <Button size="sm" onClick={goSupport} className="bg-violet-600 hover:bg-violet-700">
                Ir a Soporte
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="videos" className="overflow-y-auto pr-2 mt-3">
            <div className="text-center py-10 text-muted-foreground">
              <Video className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Los videotutoriales se están grabando.</p>
              <p className="text-xs mt-1">Vas a verlos acá apenas estén listos.</p>
              <Button size="sm" variant="outline" onClick={goSupport} className="mt-4">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Ver Centro de Soporte
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
