module.exports = {
  launch_options: {
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-gpu'],
  },
  pdf_options: {
    format: 'A4',
    margin: '20mm 18mm',
    printBackground: true,
  },
  stylesheet: undefined,
  css: `
    body { font-family: 'Noto Sans', -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.55; }
    h1, h2, h3, h4 { color: #0f172a; line-height: 1.25; }
    h1 { border-bottom: 2px solid #0ea5e9; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; margin-top: 1.6em; }
    code { background: #f1f5f9; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.88em; font-family: 'Noto Sans Mono', monospace; }
    pre { background: #0f172a; color: #e2e8f0; padding: 0.9em; border-radius: 6px; overflow-x: auto; }
    pre code { background: transparent; color: inherit; padding: 0; font-family: 'Noto Sans Mono', monospace; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
    th, td { border: 1px solid #cbd5e1; padding: 0.45em 0.6em; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    tr:nth-child(even) td { background: #f8fafc; }
    blockquote { border-left: 3px solid #0ea5e9; margin: 1em 0; padding: 0.3em 0.9em; color: #475569; background: #f0f9ff; }
    a { color: #0369a1; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5em 0; }
  `,
};
