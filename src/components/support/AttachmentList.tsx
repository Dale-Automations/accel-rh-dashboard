import { useEffect, useState } from 'react';
import { Paperclip, FileText, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSignedUrl, isImage, type SupportAttachment } from '@/lib/supportAttachments';

interface Props {
  attachments: SupportAttachment[];
  /** Si esta seteado, muestra un icono X para remover el archivo (uso en uploader). */
  onRemove?: (index: number) => void;
  /** Tamano de la grilla de previews. 'sm' para inputs, 'md' para thread. */
  size?: 'sm' | 'md';
}

/**
 * Renderiza una lista de attachments con thumbnail (si es imagen) o pill con
 * nombre de archivo. Para acceso a Storage privado, llama a getSignedUrl al
 * montar; las URLs son temporales (1h).
 */
export function AttachmentList({ attachments, onRemove, size = 'md' }: Props) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string | null> = {};
      for (const a of attachments) {
        if (isImage(a)) {
          next[a.path] = await getSignedUrl(a.path);
        }
      }
      if (!cancelled) setUrls(next);
    })();
    return () => { cancelled = true; };
  }, [attachments]);

  if (!attachments.length) return null;

  const thumbSize = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24';

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a, i) => {
        const isImg = isImage(a);
        const url = urls[a.path];
        return (
          <div key={`${a.path}-${i}`} className="relative group">
            {isImg && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" title={a.name}>
                <img
                  src={url}
                  alt={a.name}
                  className={`${thumbSize} object-cover rounded-md border bg-muted`}
                  loading="lazy"
                />
              </a>
            ) : isImg ? (
              <div className={`${thumbSize} rounded-md border bg-muted flex items-center justify-center`}>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <a
                href="#"
                title={a.name}
                onClick={async (e) => {
                  e.preventDefault();
                  const u = await getSignedUrl(a.path);
                  if (u) window.open(u, '_blank', 'noopener,noreferrer');
                }}
                className="inline-flex items-center gap-2 rounded-md border bg-muted px-2.5 py-1.5 text-xs hover:bg-muted/60"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate max-w-[160px]">{a.name}</span>
              </a>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Quitar"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface UploaderProps {
  pendingFiles: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

/**
 * Boton + preview de archivos seleccionados pero todavia NO subidos.
 * Quien lo usa se encarga de hacer el upload al confirmar el form.
 */
export function AttachmentPicker({ pendingFiles, onAdd, onRemove, disabled }: UploaderProps) {
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Paperclip className="h-3.5 w-3.5" />
        <span>Adjuntar capturas o archivos (PNG, JPG, PDF, hasta 10 MB c/u)</span>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,application/pdf,text/plain"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) onAdd(files);
            e.target.value = ''; // reset for re-pick
          }}
        />
      </label>
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingFiles.map((f, i) => {
            const isImg = f.type.startsWith('image/');
            return (
              <div key={`${f.name}-${i}`} className="relative group">
                {isImg ? (
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-16 w-16 object-cover rounded-md border"
                    onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                  />
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-md border bg-muted px-2.5 py-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[140px]">{f.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Quitar"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
