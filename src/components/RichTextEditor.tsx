import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Quote } from 'lucide-react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: string;
}

export function RichTextEditor({ value, onChange, disabled = false, placeholder = 'Escribí el informe...', minHeight = '200px' }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-3 py-2 [&>p]:my-2 [&>ul]:my-2 [&>ol]:my-2`,
        style: `min-height: ${minHeight};`,
      },
    },
  });

  // Sync external value changes (e.g. cuando se abre con contenido pre-cargado)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  // Sync disabled state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  return (
    <div className={`border rounded-md ${disabled ? 'bg-muted/30' : 'bg-background'}`}>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b bg-muted/40">
          <Toggle
            size="sm"
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            aria-label="Negrita"
          ><Bold className="h-4 w-4" /></Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            aria-label="Cursiva"
          ><Italic className="h-4 w-4" /></Toggle>
          <div className="w-px h-5 bg-border mx-1" />
          <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 2 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            aria-label="Título"
          ><Heading2 className="h-4 w-4" /></Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 3 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            aria-label="Subtítulo"
          ><Heading3 className="h-4 w-4" /></Toggle>
          <div className="w-px h-5 bg-border mx-1" />
          <Toggle
            size="sm"
            pressed={editor.isActive('bulletList')}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
            aria-label="Lista"
          ><List className="h-4 w-4" /></Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('orderedList')}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
            aria-label="Lista numerada"
          ><ListOrdered className="h-4 w-4" /></Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('blockquote')}
            onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
            aria-label="Cita"
          ><Quote className="h-4 w-4" /></Toggle>
        </div>
      )}
      <EditorContent editor={editor} />
      {!value && !disabled && (
        <div className="px-3 pb-2 text-xs text-muted-foreground italic pointer-events-none -mt-8 ml-1">
          {placeholder}
        </div>
      )}
    </div>
  );
}
