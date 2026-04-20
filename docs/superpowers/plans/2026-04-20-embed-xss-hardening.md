# Embed XSS & CSP Hardening — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three vulnerabilities in `GET /api/charts/:hash/embed` identified in the 2026-04-20 security review: (1) stored XSS via unescaped `title`/`description`/`theme`/`chart_type`, (2) stored XSS via `</script>` breakout in the JSON-in-script `chart_data` payload, and (3) defense-in-depth weakness — the endpoint's CSP includes `'unsafe-inline'` for `script-src`.

**Architecture:** Introduce a small HTML-escape helper. Extract the embed HTML template out of the route handler into `src/views/embedPage.ts`, which HTML-escapes all user-controlled strings and emits the chart payload as a `<script type="application/json" id="chart-payload">` with `<`/`>`/`&`/`\u2028`/`\u2029` escaped. Move the `window.chartData`/`window.chartType`/`window.chartTheme` init out of inline `<script>` by having `public/js/embed-chart.js` read from the JSON script tag and `data-*` attributes on the container div. Once no inline scripts remain on that page, drop `'unsafe-inline'` from the endpoint's CSP override.

**Tech Stack:** Node.js 18+, TypeScript 5.3, Express 4, Zod 3, Chart.js 4 (unchanged), Helmet 7. No new dependencies.

**Spec reference:** Findings are documented in the 2026-04-20 security review (conversation transcript). This plan references them as Vuln 1 (title/description/theme/type XSS), Vuln 2 (`</script>` breakout in chart_data), Vuln 3 (CSP `'unsafe-inline'`).

**Testing strategy:** Consistent with this project's existing convention (no automated test suite — see [docs/superpowers/plans/2026-04-20-cleanup-jwt-and-zod-migration.md](2026-04-20-cleanup-jwt-and-zod-migration.md) header). Each task is verified via `tsc --noEmit`, targeted `grep`, and an end-to-end curl smoke test through `docker compose`. A written attack-payload smoke test confirms the fix before the final commit.

**Commit strategy:** One commit per task. Every commit must pass `tsc --noEmit`. Tasks are ordered so the embed endpoint is never broken between commits (client JS change lands before route change; CSP tightening lands last, after all inline scripts are gone).

**File structure after the work:**

```
src/
├── utils/
│   ├── html.ts           [NEW] escapeHtml, escapeJsonForScript
│   └── logger.ts         unchanged
├── views/                [NEW DIRECTORY]
│   └── embedPage.ts      [NEW] renderEmbedPage(chart) → string
├── routes/
│   └── charts.ts         [EDITED: embed handler uses renderEmbedPage, CSP tightened]
└── (all other src/ files unchanged)

public/js/
└── embed-chart.js        [EDITED: read from JSON script tag + data-* attrs, no window.chart*]
```

---

## Chunk 1: Escape utility + hardened embed view

**Goal of this chunk:** Land the HTML-escape helper, the extracted `renderEmbedPage` view with escaping + safe JSON embedding, and the updated `public/js/embed-chart.js` client. After this chunk, Vulns 1 and 2 are closed. CSP still contains `'unsafe-inline'` (removed in Chunk 2).

### Task 1: Create HTML escape utility

**Files:**
- Create: `src/utils/html.ts`

- [ ] **Step 1.1: Write the utility**

Create `src/utils/html.ts` with exactly this content:

```ts
// HTML / JSON-in-script escaping helpers for server-rendered pages.
// Use escapeHtml for any untrusted string interpolated into HTML text or
// attribute values. Use escapeJsonForScript when serializing a JS value
// inside a <script>...</script> block.

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

// Escapes characters that would let a string break out of a <script> tag
// or an HTML comment, and neutralizes U+2028 / U+2029 which are valid JSON
// but illegal JS line terminators. Safe to place the return value inside a
// <script type="application/json"> ... </script> block.
export function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
```

- [ ] **Step 1.2: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 1.3: Sanity check the escapes in a REPL**

Run:
```bash
npx ts-node -e "
import { escapeHtml, escapeJsonForScript } from './src/utils/html';
console.log(escapeHtml('<img src=x onerror=alert(1)>'));
console.log(escapeJsonForScript({label: '</script><script>evil()</script>'}));
"
```

Expected output:
```
&lt;img src=x onerror=alert(1)&gt;
{"label":"\u003c/script\u003e\u003cscript\u003eevil()\u003c/script\u003e"}
```

The second line must NOT contain a literal `</script>` or `<script>`.

- [ ] **Step 1.4: Commit**

```bash
git add src/utils/html.ts
git commit -m "Add HTML and JSON-in-script escape helpers"
```

---

### Task 2: Create `src/views/embedPage.ts`

**Files:**
- Create: `src/views/embedPage.ts`

- [ ] **Step 2.1: Write the view module**

Create `src/views/embedPage.ts` with exactly this content:

```ts
import { escapeHtml, escapeJsonForScript } from '../utils/html';

export interface EmbedChart {
  title: string | null;
  description: string | null;
  chart_type: string;
  chart_data: unknown;
  width: number;
  height: number;
  theme: string;
}

// Renders the HTML embed page for a chart. All untrusted string fields
// (title, description, chart_type, theme) are HTML-escaped before being
// placed into the document. chart_data is serialized into a
// <script type="application/json"> block with <, >, & and the JS line
// terminators U+2028/U+2029 escaped, so no attacker-controlled bytes
// can break out of the script context.
export function renderEmbedPage(chart: EmbedChart): string {
  const title = escapeHtml(chart.title || 'Chart');
  const description = chart.description ? escapeHtml(chart.description) : '';
  const theme = escapeHtml(chart.theme);
  const chartType = escapeHtml(chart.chart_type);
  const width = Math.trunc(chart.width);
  const height = Math.trunc(chart.height);
  const payload = escapeJsonForScript(chart.chart_data);

  const isDark = chart.theme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';
  const fgColor = isDark ? '#ffffff' : '#333333';
  const descColor = isDark ? '#cccccc' : '#666666';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="/js/chart.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${bgColor};
      color: ${fgColor};
    }
    .chart-container {
      max-width: ${width}px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      margin-bottom: 20px;
      font-size: 24px;
      font-weight: 600;
    }
    .chart-description {
      text-align: center;
      margin-bottom: 30px;
      color: ${descColor};
    }
  </style>
</head>
<body>
  <div class="chart-container"
       data-chart-type="${chartType}"
       data-chart-theme="${theme}">
    <h1>${title}</h1>
    ${description ? `<p class="chart-description">${description}</p>` : ''}
    <canvas id="chartCanvas" width="${width}" height="${height}"></canvas>
  </div>
  <script type="application/json" id="chart-payload">${payload}</script>
  <script src="/js/embed-chart.js"></script>
</body>
</html>`;
}
```

Notes for the implementing agent:
- `width`/`height` are ints validated by Zod (100–4000), but `Math.trunc` is a belt-and-suspenders guard in case a raw DB row is malformed.
- `theme` is Zod-enum-constrained on the create/update paths, but we still escape it because the server must not trust what comes out of the DB.
- The CSS background/fg hex colors are derived from a bool, never interpolated from user input — safe.

- [ ] **Step 2.2: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 2.3: Commit**

```bash
git add src/views/embedPage.ts
git commit -m "Add embed view module with HTML + script-tag escaping"
```

---

### Task 3: Update `public/js/embed-chart.js` to read from DOM

**Files:**
- Modify: `public/js/embed-chart.js`

**Why this lands before the route change:** After this change, the script tolerates BOTH the old globals (`window.chartData` etc., still emitted by the current route) and the new DOM-based inputs (not yet emitted). That means this task can be committed without breaking the live endpoint. Task 4 then switches the server side.

- [ ] **Step 3.1: Replace the globals-reading block with DOM-reading logic**

At the top of [public/js/embed-chart.js](../../../public/js/embed-chart.js), find:

```js
  // Get chart data from global variables
  const chartData = window.chartData;
  const chartType = window.chartType;
  const theme = window.chartTheme;
```

Replace with:

```js
  // Prefer DOM-sourced inputs (new, safe). Fall back to window globals so
  // the page keeps working during the rollout.
  const payloadEl = document.getElementById('chart-payload');
  const container = document.querySelector('.chart-container');

  let chartData;
  try {
    chartData = payloadEl ? JSON.parse(payloadEl.textContent) : window.chartData;
  } catch (e) {
    console.error('Failed to parse chart payload', e);
    return;
  }

  const chartType = (container && container.dataset.chartType) || window.chartType;
  const theme = (container && container.dataset.chartTheme) || window.chartTheme;
```

- [ ] **Step 3.2: Rebuild and smoke test the client side statically**

Run:
```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('public/js/embed-chart.js', 'utf8');
if (!src.includes('chart-payload')) { console.error('FAIL: payload read missing'); process.exit(1); }
if (!src.includes('dataset.chartType')) { console.error('FAIL: dataset read missing'); process.exit(1); }
console.log('OK');
"
```

Expected: `OK`.

- [ ] **Step 3.3: Commit**

```bash
git add public/js/embed-chart.js
git commit -m "Read embed chart data from DOM payload instead of globals"
```

---

### Task 4: Switch `/embed` route to `renderEmbedPage`

**Files:**
- Modify: `src/routes/charts.ts` (lines 384-478 — the `router.get('/:hash/embed', ...)` handler)

- [ ] **Step 4.1: Add import**

At the top of [src/routes/charts.ts](../../../src/routes/charts.ts), below existing `import` lines, add:

```ts
import { renderEmbedPage } from '../views/embedPage';
```

- [ ] **Step 4.2: Replace the embed HTML template with the view call**

In [src/routes/charts.ts](../../../src/routes/charts.ts), find the block that begins with:

```ts
    // Generate HTML embed page
    const embedHtml = `
      <!DOCTYPE html>
```

and ends with:

```ts
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Set CSP to allow inline scripts for chart initialization
    res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
    res.send(embedHtml);
```

Replace the entire block with:

```ts
    const embedHtml = renderEmbedPage({
      title: chart.title,
      description: chart.description,
      chart_type: chart.chart_type,
      chart_data: chart.chart_data,
      width: chart.width,
      height: chart.height,
      theme: chart.theme,
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Intentionally keep 'unsafe-inline' for script-src in this commit so
    // /embed continues to work if any cached/old client JS is in flight.
    // Tightened in the next chunk.
    res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
    res.send(embedHtml);
```

- [ ] **Step 4.3: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4.4: Verify the old inline-template string is gone from `charts.ts`**

Run:
```bash
grep -n "window.chartData" src/routes/charts.ts || echo "OK: no inline chart globals remain"
grep -n "<!DOCTYPE html>" src/routes/charts.ts || echo "OK: no inline HTML template remains"
```

Expected: both `OK:` lines.

- [ ] **Step 4.5: Smoke test end-to-end with an XSS payload**

Start the stack:
```bash
docker compose up -d --build
# wait for app to be healthy
docker compose logs -f app | sed -n '/Server started/q'
```

Create a chart with an attack payload (two payloads — one per vuln):
```bash
API_KEY=change-me-in-production-min-16-chars
curl -sS -X POST http://localhost:3000/api/charts/generate \
  -H "x-api-key: $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"<img src=x onerror=alert(1)>",
    "description":"<script>alert(2)</script>",
    "chartType":"bar",
    "isPublic":true,
    "data":{
      "labels":["</script><script>alert(3)</script>"],
      "datasets":[{"label":"x","data":[1,2,3]}]
    }
  }' | tee /tmp/embed-xss-chart.json
HASH=$(jq -r .data.chart_hash /tmp/embed-xss-chart.json)
echo "HASH=$HASH"

curl -sS http://localhost:3000/api/charts/$HASH/embed > /tmp/embed.html
```

Check that no raw attack markup reached the HTML:
```bash
# Must NOT appear (raw markup):
grep -F "<img src=x onerror=alert(1)>" /tmp/embed.html && echo "FAIL vuln1" || echo "OK vuln1"
grep -F "<script>alert(2)</script>"    /tmp/embed.html && echo "FAIL vuln2-desc" || echo "OK vuln2-desc"
grep -F "</script><script>alert(3)"    /tmp/embed.html && echo "FAIL vuln2-data" || echo "OK vuln2-data"

# Must appear (escaped forms):
grep -F "&lt;img src=x onerror=alert(1)&gt;" /tmp/embed.html && echo "OK esc-title" || echo "FAIL esc-title"
grep -F '\u003c/script\u003e\u003cscript\u003e' /tmp/embed.html && echo "OK esc-data"   || echo "FAIL esc-data"
```

Expected: six `OK ...` lines, zero `FAIL ...` lines.

Open the page in a real browser (`http://localhost:3000/api/charts/$HASH/embed`) and confirm:
1. The chart renders.
2. No `alert()` dialog fires.
3. DevTools Console has no syntax errors.

- [ ] **Step 4.6: Commit**

```bash
git add src/routes/charts.ts
git commit -m "Render embed page via safe view; close title/description/chart_data XSS"
```

---

## Chunk 2: Drop `'unsafe-inline'` from embed CSP

**Goal of this chunk:** With no inline `<script>` blocks left on the embed page (the JSON payload lives in a `<script type="application/json">`, which CSP treats as data and does not gate with `script-src`), we can safely tighten the CSP header to `script-src 'self'`. This removes Vuln 3 and provides a CSP safety net against future escape mistakes.

### Task 5: Tighten the embed CSP header

**Files:**
- Modify: `src/routes/charts.ts` (the CSP header set in the embed handler)

- [ ] **Step 5.1: Update the CSP header**

In [src/routes/charts.ts](../../../src/routes/charts.ts), in the embed handler, find:

```ts
    // Intentionally keep 'unsafe-inline' for script-src in this commit so
    // /embed continues to work if any cached/old client JS is in flight.
    // Tightened in the next chunk.
    res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
```

Replace with:

```ts
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors *"
    );
```

Rationale for each directive:
- `default-src 'none'` — deny everything by default; force each resource type to be listed explicitly.
- `script-src 'self'` — only `/js/chart.js` and `/js/embed-chart.js`; no inline JS.
- `style-src 'unsafe-inline'` — the page still renders an inline `<style>` block generated by `renderEmbedPage`. That block does not contain user input, but CSP needs `'unsafe-inline'` to allow it. Acceptable: style-src inline is a much narrower risk than script-src inline.
- `img-src 'self' data:` — Chart.js may render to canvas which generates data URIs; also covers favicon.
- `connect-src 'self'` — no outbound XHR/fetch.
- `base-uri 'none'` — block `<base>` tag injection.
- `frame-ancestors *` — embed endpoint is explicitly intended to be embedded in third-party pages; leave this open. (If the product decides to restrict this, narrow it here.)

- [ ] **Step 5.2: Typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5.3: Rebuild and smoke test**

Run:
```bash
docker compose up -d --build
docker compose logs -f app | sed -n '/Server started/q'

# Reuse the chart hash from Chunk 1 if still present, otherwise create a benign one:
API_KEY=change-me-in-production-min-16-chars
HASH=$(curl -sS -X POST http://localhost:3000/api/charts/generate \
  -H "x-api-key: $API_KEY" -H 'Content-Type: application/json' \
  -d '{"title":"CSP test","chartType":"bar","isPublic":true,
       "data":{"labels":["a","b"],"datasets":[{"label":"x","data":[1,2]}]}}' \
  | jq -r .data.chart_hash)
echo "HASH=$HASH"

# Header sanity
curl -sSI "http://localhost:3000/api/charts/$HASH/embed" | grep -i content-security-policy
```

Expected: header line contains `script-src 'self'` and does **not** contain `'unsafe-inline'` inside the `script-src` directive.

- [ ] **Step 5.4: Browser smoke test**

Open `http://localhost:3000/api/charts/$HASH/embed` in a real browser. Verify:
1. The chart renders correctly.
2. DevTools Console shows **no CSP violations** (no `Refused to execute inline script because it violates the following Content Security Policy directive...`). If any appear, inline script snuck back in — fix before committing.
3. DevTools Network → document → Response Headers shows the new CSP.

- [ ] **Step 5.5: Re-run the XSS regression from Task 4.5**

Run the six `OK/FAIL` checks from Step 4.5 again against the hash from this task. Expected: all `OK`.

- [ ] **Step 5.6: Commit**

```bash
git add src/routes/charts.ts
git commit -m "Drop 'unsafe-inline' from embed CSP; add default-deny baseline"
```

---

### Task 6: Verify history and summarize

**Files:** none

- [ ] **Step 6.1: Review the series**

Run:
```bash
git log --oneline origin/master..HEAD
```

Expected: five commits in this order:
1. `Add HTML and JSON-in-script escape helpers`
2. `Add embed view module with HTML + script-tag escaping`
3. `Read embed chart data from DOM payload instead of globals`
4. `Render embed page via safe view; close title/description/chart_data XSS`
5. `Drop 'unsafe-inline' from embed CSP; add default-deny baseline`

- [ ] **Step 6.2: Clean up test artifact charts**

If you created attack-payload charts during smoke tests against a shared DB, delete them:
```bash
API_KEY=change-me-in-production-min-16-chars
# repeat for each $HASH from smoke tests
curl -sS -X DELETE -H "x-api-key: $API_KEY" http://localhost:3000/api/charts/$HASH
```

- [ ] **Step 6.3: Stop the dev stack if you started it**

```bash
docker compose down
```

---

## Out of scope (explicitly)

- Constant-time comparison of `x-api-key` in [src/middleware/auth.ts:16](../../../src/middleware/auth.ts#L16). Noted in the review as a LOW / hardening item; not a vulnerability. Track separately if desired.
- Replacing the default docker-compose `API_KEY` placeholder or adding a Zod refine that rejects known placeholders in `NODE_ENV=production`. Operational hygiene, not a code vulnerability.
- Broadening CSP to the whole app via Helmet options. The security review scoped the CSP finding to `/embed`; other routes are not HTML-rendering endpoints.
