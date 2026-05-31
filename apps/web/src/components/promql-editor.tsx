import { autocompletion } from '@codemirror/autocomplete';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { PromQLExtension } from '@prometheus-io/codemirror-promql';
import { useCallback, useEffect, useRef } from 'react';

interface PromQLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  placeholder?: string;
}

const theme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: 'Geist Mono, monospace',
  },
  '.cm-content': {
    padding: '8px 12px',
    minHeight: '36px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    display: 'none',
  },
});

const promql = new PromQLExtension();

export const PromQLEditor = ({ value, onChange, onRun, placeholder }: PromQLEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          onRunRef.current();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const extensions = [
      theme,
      runKeymap,
      updateListener,
      autocompletion(),
      promql.asExtension(),
      EditorView.lineWrapping,
    ];

    if (placeholder !== undefined) {
      extensions.push(placeholderExt(placeholder));
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className='border-border bg-background overflow-hidden rounded-md border'
      role='textbox'
      aria-label='PromQL query editor'
      aria-multiline='true'
    />
  );
};
