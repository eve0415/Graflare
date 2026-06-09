import { useCallback } from 'react';

/**
 * Test stand-in for `QueryCodeEditor`. The real editor wraps CodeMirror's `EditorView`, which
 * cannot construct under jsdom (it trips a multiple-`@codemirror/state` instanceof check). This
 * lightweight textarea preserves the `value`/`onChange` contract so a row's code draft can be
 * driven and read in tests; the editor's own behavior is out of scope for the components that
 * embed it. The handler is memoized to satisfy `react-perf/jsx-no-new-function-as-prop`.
 *
 * Use via `vi.mock('…/query-code-editor', () => ({ QueryCodeEditor: MockCodeEditor }))`.
 */
export const MockCodeEditor = ({ value, onChange }: { value: string; onChange: (v: string) => void; onRun: () => void }) => {
  const handle = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );
  return <textarea aria-label='Code editor' value={value} onChange={handle} />;
};
