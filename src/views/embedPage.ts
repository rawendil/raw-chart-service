import { escapeHtml, escapeJsonForScript } from '../utils/html';
import { THEMES, Theme } from '../config/themes';

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
  const chartType = escapeHtml(chart.chart_type);
  const width = Math.trunc(chart.width);
  const height = Math.trunc(chart.height);
  const payload = escapeJsonForScript(chart.chart_data);

  // chart.theme is a validated value but typed as string from the DB; fall back to light for safety.
  const themeColors = THEMES[chart.theme as Theme] ?? THEMES.light;
  const bgColor = themeColors.background;
  const fgColor = themeColors.text;
  const descColor = themeColors.mutedText;

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
       data-chart-type="${chartType}">
    <h1>${title}</h1>
    ${description ? `<p class="chart-description">${description}</p>` : ''}
    <canvas id="chartCanvas" width="${width}" height="${height}"></canvas>
  </div>
  <script type="application/json" id="chart-payload">${payload}</script>
  <script type="application/json" id="chart-theme">${escapeJsonForScript({
    text: themeColors.text,
    grid: themeColors.grid,
    palette: themeColors.palette,
  })}</script>
  <script src="/js/embed-chart.js"></script>
</body>
</html>`;
}
