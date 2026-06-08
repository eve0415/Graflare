import type { Panel } from '@graflare/shared/schemas/panel';
import type { Options } from 'react-markdown';

import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { PanelFrame } from './panel-frame';

interface TextPanelProps {
  panel: Panel;
}

// Type the plugin arrays via react-markdown's own Options so we don't depend on the
// transitive `unified` package for its PluggableList.
type RehypePlugins = NonNullable<Options['rehypePlugins']>;

// rehype-sanitize runs LAST in both pipelines, so whatever earlier plugins emit is
// XSS-stripped before it becomes React elements: <script>, event-handler attributes
// (onerror, onclick, …) and javascript:/data: URLs are all removed. Markdown mode needs
// no raw-HTML reparse; html mode adds rehype-raw FIRST so author `<tag>`s are parsed,
// then sanitized. Defined at module scope so the arrays are stable props (react-perf
// jsx-no-new-array-as-prop) and the React Compiler stays happy.
const MARKDOWN_PLUGINS: RehypePlugins = [rehypeSanitize];
const HTML_PLUGINS: RehypePlugins = [rehypeRaw, rehypeSanitize];

// react-markdown builds a React element tree from the syntax tree — there is no
// dangerouslySetInnerHTML and no raw-HTML string injection anywhere in this path.
export const TextPanel = ({ panel }: TextPanelProps) => {
  const { text } = panel.displayOptions;
  const content = text?.content ?? '';
  const plugins = text?.mode === 'html' ? HTML_PLUGINS : MARKDOWN_PLUGINS;

  return (
    <PanelFrame title={panel.title} panelId={panel.id}>
      {/* Scoped typographic styles via arbitrary variants keep the panel readable
          without pulling in a typography plugin; the content itself is sanitized. */}
      <div className='[&_pre]:bg-muted h-full overflow-auto text-sm [&_a]:underline [&_code]:text-xs [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:p-2 [&_ul]:mb-2'>
        <Markdown rehypePlugins={plugins}>{content}</Markdown>
      </div>
    </PanelFrame>
  );
};
