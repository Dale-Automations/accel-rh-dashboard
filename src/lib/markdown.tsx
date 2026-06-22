/**
 * Helpers de markdown ligero para contenidos generados por LLM
 * o por usuarios sin editor rico.
 *
 * Soporta:
 *  - `**bold**`, `*italic*`, `` `code` `` (inline)
 *  - Viñetas con "- " o "* " al inicio de línea (`<ul>`)
 *  - Listas numeradas "1. " o "1) " (`<ol>`)
 *
 * Limpia silenciosamente artefactos comunes del modelo (tablas con `|`,
 * headers `#`, separadores `---/===/***`, backticks aleatorios) en lugar
 * de mostrarlos como ruido visual al usuario final.
 *
 * Extraído de `src/pages/ArmarVacante.tsx` para reuso entre ArmarVacante
 * (chat con gemma4) y MessageThread (hilo manager↔cliente del candidato).
 */

import type { ReactNode } from 'react';

function renderInlineMarks(text: string, keyPrefix: string): ReactNode[] {
  const re = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    if (m[2] !== undefined) parts.push(<strong key={`${keyPrefix}-${key++}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) parts.push(<em key={`${keyPrefix}-${key++}`}>{m[3]}</em>);
    else if (m[4] !== undefined) parts.push(<code key={`${keyPrefix}-${key++}`} className="px-1 py-0.5 rounded bg-background/60 text-[0.85em]">{m[4]}</code>);
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

export function renderRichText(text: string): ReactNode {
  if (!text) return null;
  const rawLines = text.split('\n');
  const blocks: ReactNode[] = [];
  let currentList: { kind: 'ul' | 'ol'; items: string[] } | null = null;
  let blockKey = 0;

  const flushList = () => {
    if (!currentList) return;
    const Tag = currentList.kind === 'ol' ? 'ol' : 'ul';
    const className = currentList.kind === 'ol' ? 'list-decimal pl-5 space-y-0.5' : 'list-disc pl-5 space-y-0.5';
    blocks.push(
      <Tag key={`list-${blockKey++}`} className={className}>
        {currentList.items.map((it, i) => (
          <li key={i}>{renderInlineMarks(it, `li-${blockKey}-${i}`)}</li>
        ))}
      </Tag>
    );
    currentList = null;
  };

  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (/^\s*(?:[-=*_]{3,})\s*$/.test(line)) { flushList(); continue; }
    if (/^\s*#{1,6}\s+/.test(line)) {
      flushList();
      const cleaned = line.replace(/^\s*#{1,6}\s+/, '').replace(/[|]/g, '').trim();
      if (cleaned) blocks.push(<div key={`h-${blockKey++}`} className="font-semibold mt-1">{renderInlineMarks(cleaned, `h-${blockKey}`)}</div>);
      continue;
    }
    if (/^\s*\|/.test(line)) { flushList(); continue; }
    const bulletM = line.match(/^\s*[-*]\s+(.+)/);
    if (bulletM) {
      if (!currentList || currentList.kind !== 'ul') { flushList(); currentList = { kind: 'ul', items: [] }; }
      currentList.items.push(bulletM[1]);
      continue;
    }
    const numM = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (numM) {
      if (!currentList || currentList.kind !== 'ol') { flushList(); currentList = { kind: 'ol', items: [] }; }
      currentList.items.push(numM[1]);
      continue;
    }
    flushList();
    if (line.length === 0) {
      blocks.push(<div key={`br-${blockKey++}`} className="h-2" />);
    } else {
      const cleaned = line.replace(/\s*\|\s*/g, ' ');
      blocks.push(<div key={`p-${blockKey++}`}>{renderInlineMarks(cleaned, `p-${blockKey}`)}</div>);
    }
  }
  flushList();
  return <>{blocks}</>;
}

/** Sanitiza markdown de campos persistidos (títulos, snippets) para mostrar texto plano. */
export function stripMarkdown(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/[*_`#|]/g, '').replace(/\s+/g, ' ').trim();
}
