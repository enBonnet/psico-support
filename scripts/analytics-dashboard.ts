// =============================================================================
// scripts/analytics-dashboard.ts — local HTML dashboard for Analytics Engine
// =============================================================================
// Serves a single-page dashboard at http://localhost:8788 that reuses the same
// query catalog as the CLI. The browser never sees the API token — SQL runs
// server-side and results are returned as JSON via /api/query.
//
// Usage:
//   pnpm run analytics:dashboard
//
// Then open http://localhost:8788 in a browser. Ctrl+C to stop.
//
// Why a standalone script and not part of the app?
//   - The Worker ANALYTICS binding is write-only; reads must use the SQL REST
//     API with an account-level token. Exposing that token inside the deployed
//     Worker requires a secret + admin-gated server fn — a bigger surface.
//     For a personal "how's it going" view, a local-only server is simpler and
//     keeps the token entirely off the deployed app.
//   - ponytail: ceiling — if multiple people need this, build it into the admin
//     panel with ANALYTICS_API_TOKEN as a Worker secret + amIAdmin gate.
// =============================================================================

import http from 'node:http'
import { URL } from 'node:url'

import { QUERIES, findQuery, getAnalyticsEnv, runSql } from './analytics-lib'
import type { QueryContext, QueryDef } from './analytics-lib'

const PORT = Number(process.env.DASHBOARD_PORT) || 8788

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

async function handleQuery(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	if (req.method !== 'POST') {
		res.writeHead(405, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ error: 'method not allowed' }))
		return
	}

	const body = await readBody(req)
	let payload: { id?: string; days?: number; event?: string }
	try {
		payload = JSON.parse(body || '{}')
	} catch {
		res.writeHead(400, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ error: 'invalid JSON body' }))
		return
	}

	const id = payload.id
	const def = id ? findQuery(id) : undefined
	if (!def) {
		res.writeHead(404, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ error: `unknown query: ${id}` }))
		return
	}

	const ctx: QueryContext = {
		days: clampDays(payload.days),
		event: payload.event,
	}

	try {
		const env = getAnalyticsEnv()
		const result = await runSql(env, def.sql(ctx).trim())

		if (result.errors && result.errors.length > 0) {
			res.writeHead(502, { 'content-type': 'application/json' })
			res.end(JSON.stringify({ error: result.errors[0]?.message ?? 'sql error' }))
			return
		}

		res.writeHead(200, { 'content-type': 'application/json' })
		res.end(
			JSON.stringify({
				id: def.id,
				columns: def.columns,
				rows: result.data ?? [],
			}),
		)
	} catch (err) {
		res.writeHead(500, { 'content-type': 'application/json' })
		res.end(
			JSON.stringify({
				error: err instanceof Error ? err.message : String(err),
			}),
		)
	}
}

function handlePage(_req: http.IncomingMessage, res: http.ServerResponse): void {
	res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
	res.end(renderPage())
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
	try {
		if (url.pathname === '/api/query') {
			await handleQuery(req, res)
		} else if (url.pathname === '/' || url.pathname === '/index.html') {
			handlePage(req, res)
		} else {
			res.writeHead(404, { 'content-type': 'text/plain' })
			res.end('not found')
		}
	} catch (err) {
		res.writeHead(500, { 'content-type': 'text/plain' })
		res.end(err instanceof Error ? err.message : String(err))
	}
})

server.listen(PORT, () => {
	console.log('')
	console.log(`  ▶ psico-support analytics → http://localhost:${PORT}`)
	console.log('')
	// Fail fast on missing env so the user sees the message instead of an
	// HTTP 500 on first request.
	try {
		getAnalyticsEnv()
	} catch (err) {
		console.error(`  ✗ ${err instanceof Error ? err.message : err}`)
		console.error('  (server keeps running — fix .env.local and refresh the page)')
	}
	console.log('')
})

// -----------------------------------------------------------------------------
// HTML — self-contained, no build step, dark theme matching the app's glass
// -----------------------------------------------------------------------------

function renderPage(): string {
	// Serialize the query catalog so the client knows ids + labels
	const catalog = QUERIES.map((q) => ({
		id: q.id,
		title: q.title,
		description: q.description,
		columns: q.columns,
	}))
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Analítica — psico-support</title>
<style>
:root {
  --bg: #f6f7fb;
  --surface: #ffffff;
  --surface-2: #f0f2f8;
  --border: #e3e6ef;
  --text: #1a2138;
  --muted: #6b7390;
  --accent: #2563eb;
  --accent-2: #7c3aed;
  --green: #16a34a;
  --amber: #d97706;
  --red: #dc2626;
  --radius: 14px;
  --shadow: 0 1px 3px rgba(20,30,60,0.04), 0 1px 2px rgba(20,30,60,0.06);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: linear-gradient(180deg, #eef1f8 0%, var(--bg) 240px);
  color: var(--text);
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  min-height: 100vh;
}
.wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 80px; }
header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
header .sub { color: var(--muted); font-size: 13px; }
header code, footer code { background: var(--surface-2); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
.controls {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--border);
  padding: 12px; border-radius: var(--radius); margin-bottom: 20px; box-shadow: var(--shadow);
}
label { color: var(--muted); font-size: 12px; display: flex; align-items: center; gap: 6px; }
select, input[type="number"], input[type="text"] {
  background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 10px; font: inherit; min-width: 200px;
}
input[type="number"] { min-width: 80px; }
button {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #ffffff; border: 0; border-radius: 8px; padding: 8px 16px;
  font-weight: 600; cursor: pointer; box-shadow: var(--shadow);
}
button:hover { filter: brightness(1.05); }
button:disabled { opacity: 0.5; cursor: wait; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.chip {
  background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
  padding: 6px 14px; cursor: pointer; font-size: 13px; color: var(--muted);
  transition: all 0.15s; box-shadow: var(--shadow);
}
.chip:hover { background: var(--surface-2); color: var(--text); }
.chip.active {
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #ffffff; border-color: transparent; font-weight: 600;
}
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
.kpi {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 16px; box-shadow: var(--shadow);
}
.kpi .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
.kpi .value { font-size: 28px; font-weight: 700; margin-top: 4px; color: var(--accent); }
.kpi .sub { color: var(--muted); font-size: 12px; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, monospace; }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; margin-bottom: 20px; box-shadow: var(--shadow);
}
.card h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
.card .desc { color: var(--muted); font-size: 12px; margin-bottom: 14px; }
.chart { width: 100%; height: 200px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:hover td { background: var(--surface-2); }
.empty { color: var(--muted); padding: 24px; text-align: center; }
.error {
  background: #fef2f2; border: 1px solid var(--red); color: var(--red);
  padding: 12px 14px; border-radius: 8px; font-size: 13px;
}
.bar-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.bar-row .name { flex: 0 0 220px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, monospace; }
.bar-row .bar-bg { flex: 1; height: 10px; background: var(--surface-2); border-radius: 5px; overflow: hidden; }
.bar-row .bar-fg { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); border-radius: 5px; }
.bar-row .num { flex: 0 0 60px; text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 600; }
footer { color: var(--muted); font-size: 12px; margin-top: 32px; text-align: center; }
.spin { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }
.hidden { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Analítica — psico-support</h1>
    <span class="sub">Cloudflare Analytics Engine · dataset <code>psico_events</code></span>
  </header>

  <div class="controls">
    <label>Consulta
      <select id="query-select"></select>
    </label>
    <label>Evento
      <input type="text" id="event-input" placeholder="pro_contact" />
    </label>
    <label>Últimos
      <input type="number" id="days-input" value="7" min="1" max="90" />
      días
    </label>
    <button id="run-btn">Ejecutar</button>
  </div>

  <div class="chips" id="chips"></div>

  <div id="kpis" class="kpis"></div>

  <div class="card">
    <h2 id="result-title">—</h2>
    <div class="desc" id="result-desc"></div>
    <div id="error-box" class="error hidden"></div>
    <div id="result-body"><div class="empty">Pulsa <strong>Ejecutar</strong> para cargar.</div></div>
  </div>

  <footer>
    Retención 90 días · agregaciones con <code>SUM(_sample_interval * double1)</code> para corregir muestreo · token solo servidor
  </footer>
</div>

<script>
const CATALOG = ${JSON.stringify(catalog)};

const select = document.getElementById('query-select');
const eventInput = document.getElementById('event-input');
const daysInput = document.getElementById('days-input');
const runBtn = document.getElementById('run-btn');
const chipsEl = document.getElementById('chips');
const kpisEl = document.getElementById('kpis');
const titleEl = document.getElementById('result-title');
const descEl = document.getElementById('result-desc');
const errorBox = document.getElementById('error-box');
const bodyEl = document.getElementById('result-body');

// populate select + chips
CATALOG.forEach((q, i) => {
  const opt = document.createElement('option');
  opt.value = q.id; opt.textContent = q.title + ' — ' + q.description;
  select.appendChild(opt);
});
const quickChips = ['funnel', 'whatsapp', 'whatsapp-by-pro', 'trends', 'top-events'];
quickChips.forEach(id => {
  const q = CATALOG.find(x => x.id === id);
  if (!q) return;
  const c = document.createElement('div');
  c.className = 'chip'; c.dataset.id = id; c.textContent = q.title;
  c.onclick = () => { select.value = id; runQuery(); };
  chipsEl.appendChild(c);
});

let lastKpis = [];

function setActiveChip(id) {
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.id === id);
  });
}

async function runQuery() {
  const id = select.value;
  const days = parseInt(daysInput.value, 10) || 7;
  const event = eventInput.value.trim() || undefined;
  const def = CATALOG.find(q => q.id === id);
  if (!def) return;

  setActiveChip(id);
  titleEl.textContent = def.title + ' · últimos ' + days + 'd';
  descEl.textContent = def.description;
  errorBox.classList.add('hidden');
  bodyEl.innerHTML = '<div class="empty"><span class="spin"></span> cargando…</div>';
  runBtn.disabled = true;

  // Show event input only for trends
  eventInput.parentElement.style.display = id === 'trends' ? '' : 'none';

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, days, event }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    if (!def.columns || !Array.isArray(def.columns)) {
      throw new Error('Definición de consulta sin columnas (id=' + id + ')');
    }
    renderResult(def, data.rows || []);
    if (id === 'funnel' || id === 'top-events') recomputeKpis(data.rows || [], days);
  } catch (err) {
    errorBox.textContent = '✗ ' + (err.message || err);
    errorBox.classList.remove('hidden');
    bodyEl.innerHTML = '';
  } finally {
    runBtn.disabled = false;
  }
}

function renderResult(def, rows) {
  if (!rows.length) { bodyEl.innerHTML = '<div class="empty">(sin datos en este período)</div>'; return; }

  // Line chart for trends (day, count)
  if (def.id === 'trends') { renderTrendChart(rows); return; }

  // Bar chart for low-cardinality single-number queries
  if (def.id === 'whatsapp' || def.id === 'sources' || def.id === 'routes') {
    renderBars(def, rows); return;
  }

  // Default: table
  renderTable(def, rows);
}

function renderTable(def, rows) {
  const numericCols = new Set(['total', 'clicks', 'count', 'events']);
  let html = '<table><thead><tr>';
  def.columns.forEach(c => {
    html += '<th class="' + (numericCols.has(c) ? 'num' : '') + '">' + c + '</th>';
  });
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr>';
    def.columns.forEach(c => {
      const v = r[c] ?? '';
      const cls = numericCols.has(c) ? ' class="num"' : '';
      html += '<td' + cls + '>' + escapeHtml(String(v)) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  bodyEl.innerHTML = html;
}

function renderBars(def, rows) {
  // first col = label, last numeric col = value
  const labelKey = def.columns[0];
  const valueKey = def.columns.find(c => ['total','clicks','count','events'].includes(c)) || def.columns[def.columns.length - 1];
  const max = Math.max(...rows.map(r => Number(r[valueKey]) || 0), 1);
  let html = '';
  rows.forEach(r => {
    const v = Number(r[valueKey]) || 0;
    const pct = (v / max) * 100;
    html += '<div class="bar-row">'
      + '<div class="name" title="' + escapeHtml(String(r[labelKey])) + '">' + escapeHtml(String(r[labelKey])) + '</div>'
      + '<div class="bar-bg"><div class="bar-fg" style="width:' + pct + '%"></div></div>'
      + '<div class="num">' + v.toLocaleString() + '</div>'
      + '</div>';
  });
  bodyEl.innerHTML = html;
}

function renderTrendChart(rows) {
  const data = rows.map(r => ({ day: r.day, count: Number(r.count) || 0 }));
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 1000, H = 200, P = 30;
  const innerW = W - P * 2, innerH = H - P * 2;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const points = data.map((d, i) => {
    const x = P + i * stepX;
    const y = P + innerH - (d.count / max) * innerH;
    return [x, y];
  });
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaD = pathD + ' L' + (P + (data.length - 1) * stepX).toFixed(1) + ',' + (P + innerH) + ' L' + P + ',' + (P + innerH) + ' Z';
  // y gridlines
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const y = P + innerH - f * innerH;
    return '<line x1="' + P + '" y1="' + y + '" x2="' + (W - P) + '" y2="' + y + '" stroke="rgba(20,30,60,0.08)" />';
  }).join('');
  // x labels (first, middle, last)
  const labels = [];
  const labelIdx = [0, Math.floor(data.length / 2), data.length - 1];
  labelIdx.forEach(i => {
    if (!data[i]) return;
    const x = P + i * stepX;
    labels.push('<text x="' + x + '" y="' + (H - 8) + '" fill="#6b7390" font-size="11" text-anchor="middle">' + escapeHtml(String(data[i].day).slice(5)) + '</text>');
    labels.push('<text x="' + x + '" y="' + (P + innerH - (data[i].count / max) * innerH - 6) + '" fill="#1a2138" font-size="11" text-anchor="middle">' + data[i].count + '</text>');
  });

  bodyEl.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="#2563eb" stop-opacity="0.25" />'
    + '<stop offset="100%" stop-color="#2563eb" stop-opacity="0" />'
    + '</linearGradient></defs>'
    + grid
    + '<path d="' + areaD + '" fill="url(#g)" />'
    + '<path d="' + pathD + '" fill="none" stroke="#2563eb" stroke-width="2" />'
    + labels.join('')
    + '</svg>';
}

function recomputeKpis(rows, days) {
  const byEvent = {};
  rows.forEach(r => { byEvent[r.event] = (byEvent[r.event] || 0) + (Number(r.total) || 0); });
  lastKpis = [
    { label: 'Contactos WhatsApp', value: (byEvent['pro_contact'] || 0) + (byEvent['pro_contact_random'] || 0) + (byEvent['pro_contact_help_now'] || 0) + (byEvent['pro_contact_ahora'] || 0), sub: 'pro_contact* (4 entry points)' },
    { label: 'Vistas directorio', value: byEvent['directory_view'] || 0, sub: 'directory_view' },
    { label: 'Vistas perfil', value: byEvent['profile_view'] || 0, sub: 'profile_view' },
    { label: 'CTA landing', value: byEvent['cta_click'] || 0, sub: 'cta_click' },
  ];
  renderKpis(days);
}

function renderKpis(days) {
  if (!lastKpis.length) { kpisEl.innerHTML = ''; return; }
  kpisEl.innerHTML = lastKpis.map(k => (
    '<div class="kpi"><div class="label">' + k.label + '</div>'
    + '<div class="value">' + (Number(k.value) || 0).toLocaleString() + '</div>'
    + '<div class="sub">' + k.sub + '</div></div>'
  )).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

runBtn.onclick = runQuery;
select.onchange = runQuery;
daysInput.onchange = runQuery;
eventInput.addEventListener('keydown', e => { if (e.key === 'Enter') runQuery(); });

// initial: load top-events to populate KPIs, then jump to funnel
async function init() {
  select.value = 'top-events';
  await runQuery();
  select.value = 'funnel';
  await runQuery();
}
init();
</script>
</body>
</html>`
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = ''
		req.on('data', (chunk) => {
			data += chunk
			if (data.length > 1_000_000) {
				req.destroy()
				reject(new Error('body too large'))
			}
		})
		req.on('end', () => resolve(data))
		req.on('error', reject)
	})
}

function clampDays(n: unknown): number {
	const v = Number(n)
	if (!Number.isFinite(v) || v <= 0) return 7
	return Math.min(Math.max(Math.floor(v), 1), 90)
}

// use QueryDef type to keep the import meaningful for readers
export type _QueryDef = QueryDef
