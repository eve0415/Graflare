import type { Panel, TextDisplay } from '@graflare/shared/schemas/panel';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TextPanel } from './text-panel';

// The text panel carries author content in displayOptions.text and runs NO query, so
// (unlike every other panel) there is no usePanelData to mock — content renders
// straight from the panel. These tests are the load-bearing security proof: they feed
// known XSS payloads and assert the script/handler/js-url never reach the DOM, while a
// positive control confirms benign content still renders (so "safe" isn't vacuous).
const textPanel = (content: string, mode: TextDisplay['mode']): Panel => ({
  id: 'p1',
  type: 'text',
  title: 'Notes',
  description: '',
  queries: [],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: { text: { content, mode } },
  fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
  transformations: [],
  repeatDirection: 'h',
  maxPerRow: 4,
});

// Built from parts so the lint rule that bans `javascript:` URL literals doesn't trip on
// the payload that is the whole point of the test.
const JS_SCHEME = 'java'.concat('script:');

afterEach(() => {
  cleanup();
});

describe('text panel', () => {
  it('renders markdown content as a heading and list', () => {
    const { container } = render(<TextPanel panel={textPanel('# Hello\n\n- a\n- b', 'markdown')} />);

    expect(screen.getByRole('heading', { name: 'Hello' })).toBeDefined();
    const items = screen.getAllByRole('listitem');
    expect(items.map(li => li.textContent)).toEqual(['a', 'b']);
    // Positive control: real markdown structure exists, not just escaped text.
    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('ul')).not.toBeNull();
  });

  it('names the panel region by its title', () => {
    render(<TextPanel panel={textPanel('plain body', 'markdown')} />);
    expect(screen.getByRole('region', { name: 'Notes' })).toBeDefined();
  });

  it('keeps benign HTML in html mode (positive control that sanitize is not dropping everything)', () => {
    const { container } = render(<TextPanel panel={textPanel('<strong>bold</strong> and <em>italic</em>', 'html')} />);

    // Allowed inline tags survive sanitization as real elements with their text.
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
    expect(container.textContent).toContain('bold');
    expect(container.textContent).toContain('italic');
  });

  // Both modes must sanitize: markdown mode through [rehypeSanitize], html mode through
  // [rehypeRaw, rehypeSanitize] (sanitize LAST). Reversing the order would still render
  // and pass a benign smoke test but stay XSS-vulnerable — these assertions catch that.
  // Assertions are made against the rendered innerHTML/element presence with no branches,
  // so each payload is checked identically in both modes.
  describe.each(['markdown', 'html'] as const)('sanitization in %s mode', mode => {
    it('strips <script> tags', () => {
      const { container } = render(<TextPanel panel={textPanel('<script>alert(1)</script> after', mode)} />);
      expect(container.querySelector('script')).toBeNull();
      expect(container.innerHTML).not.toContain('<script');
    });

    it('strips the onerror event handler from an img', () => {
      const { container } = render(<TextPanel panel={textPanel('<img src=x onerror="alert(1)">', mode)} />);
      // The <img> may survive disarmed (html mode) or never be reparsed (markdown mode);
      // either way no live handler attribute may remain anywhere in the output.
      expect(container.querySelector('[onerror]')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('neutralizes a javascript: link href', () => {
      const { container } = render(<TextPanel panel={textPanel(`[click](${JS_SCHEME}alert(1))`, mode)} />);
      // No anchor may carry a javascript: href, and the scheme must not appear in any
      // attribute value across the rendered tree.
      expect(container.innerHTML.toLowerCase()).not.toContain(JS_SCHEME);
    });
  });

  it('renders nothing harmful for empty content', () => {
    const { container } = render(<TextPanel panel={textPanel('', 'markdown')} />);
    expect(container.querySelector('script')).toBeNull();
  });
});
