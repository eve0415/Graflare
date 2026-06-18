// Grafana's text panel `mode` is one of code/text/html/markdown. We render only markdown or
// sanitized html, so anything that isn't explicitly 'html' clamps to 'markdown' (the safe
// default — html still goes through rehype-sanitize).
export const clampTextMode = (mode: string): 'markdown' | 'html' => (mode === 'html' ? 'html' : 'markdown');
