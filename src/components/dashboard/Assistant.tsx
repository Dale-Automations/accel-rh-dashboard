import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Sparkles, ArrowRight, Loader2, Briefcase, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { trackAction } from '@/lib/userActivity';

const ASSISTANT_WEBHOOK = 'https://accelrh.daleautomations.com/webhook/dashboard-assistant';

type Role = 'manager' | 'selectora' | 'cliente' | string | null | undefined;

interface SearchResult {
  type: 'vacancy' | 'postulant';
  label: string;
  url: string;
  vacancy_id?: string;
  id_postulant?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: { type: string; target: string } | null;
  results?: SearchResult[];
}

interface AssistantAction {
  type: string;
  target: string;
}

const suggestionsByRole = (role: Role): string[] => {
  if (role === 'cliente') {
    return [
      'Quiero armar una nueva búsqueda',
      'Mostrame los candidatos pendientes de revisar',
      '¿Cómo veo el CV de un candidato?',
    ];
  }
  return [
    'Mostrame los candidatos pendientes de evaluar',
    'Buscar la vacante de "vendedores"',
    'Crear una vacante nueva',
    '¿Cómo hago carga masiva de CVs?',
  ];
};

export function Assistant({
  role,
  userId,
  userName,
  onOpenHelp,
}: {
  role: Role;
  userId?: string;
  userName: string;
  onOpenHelp: () => void;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text: string) => {
    const msg = (text || '').trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(ASSISTANT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role, user_name: userName, message: msg, history }),
      });
      const json = await res.json().catch(() => ({ status: 'error', reply: 'No se pudo procesar la respuesta.' }));
      const reply = json?.reply || 'Sin respuesta.';
      const action: AssistantAction | null = json?.action || null;
      const results: SearchResult[] = Array.isArray(json?.results) ? json.results : [];
      setMessages(prev => [...prev, { role: 'assistant', content: reply, action, results }]);
      trackAction('chat_with_assistant');
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'No pude conectarme. Intentá de nuevo en un momento.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (action: AssistantAction) => {
    if (!action || !action.type) return;
    switch (action.type) {
      case 'navigate':
        if (action.target?.startsWith('/')) navigate(action.target);
        break;
      case 'open_modal':
        if (action.target === 'faq') {
          onOpenHelp();
        } else if (action.target === 'create-vacancy') {
          if (role === 'cliente') {
            navigate('/armar-vacante');
          } else {
            navigate('/vacantes?action=create');
          }
        } else if (action.target === 'bulk-upload') {
          if (role === 'cliente') {
            toast({ title: 'Acción no disponible', description: 'Esta función no está habilitada en tu vista.', variant: 'destructive' });
          } else {
            navigate('/vacantes?action=bulk');
          }
        }
        break;
      case 'search_postulantes':
        navigate(`/vacantes?q=${encodeURIComponent(action.target)}`);
        break;
      case 'search_vacancies':
        navigate(`/vacantes?q=${encodeURIComponent(action.target)}`);
        break;
      default:
        break;
    }
  };

  const suggestions = suggestionsByRole(role);

  return (
    <Card className="p-5 space-y-4 border-primary/20 bg-gradient-to-b from-card to-muted/20">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Asistente</h2>
      </div>

      {/* Conversación */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-80 overflow-y-auto space-y-3 px-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                {m.role === 'assistant' && m.results && m.results.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.results.map((r, idx) => {
                      const Icon = r.type === 'vacancy' ? Briefcase : User;
                      return (
                        <button
                          key={idx}
                          onClick={() => navigate(r.url)}
                          className="w-full text-left bg-background hover:bg-background/80 border border-border rounded-lg px-3 py-2 text-xs flex items-center gap-2 transition-colors"
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="flex-1 truncate text-foreground">{r.label}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {m.role === 'assistant' && m.action && m.action.type !== 'none' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2 h-7 text-xs"
                    onClick={() => handleAction(m.action!)}
                  >
                    Ir <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-3.5 py-2 text-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-muted-foreground">Pensando…</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-center gap-2"
      >
        <Input
          placeholder="Buscá un candidato, una vacante o pedime ayuda…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={!input.trim() || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {/* Sugerencias rápidas (solo si no hay conversación) */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-foreground border border-border transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
