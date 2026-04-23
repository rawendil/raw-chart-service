import { renderEmbedPage, EmbedChart } from '../../views/embedPage';

const baseChart: EmbedChart = {
  title: 'Test Chart',
  description: 'A description',
  chart_type: 'bar',
  chart_data: { labels: ['A', 'B'], datasets: [{ label: 'ds', data: [1, 2] }] },
  width: 800,
  height: 600,
  theme: 'light',
};

describe('renderEmbedPage', () => {
  it('zawiera tytuł w tagu <title> i <h1>', () => {
    const html = renderEmbedPage(baseChart);
    expect(html).toContain('<title>Test Chart</title>');
    expect(html).toContain('<h1>Test Chart</h1>');
  });

  it('HTML-escapuje tytuł (XSS prevention)', () => {
    const html = renderEmbedPage({ ...baseChart, title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('HTML-escapuje opis', () => {
    const html = renderEmbedPage({ ...baseChart, description: '<b>bold</b>' });
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('zawiera opis w paragrafie gdy podany', () => {
    const html = renderEmbedPage(baseChart);
    expect(html).toContain('<p class="chart-description">');
  });

  it('nie renderuje paragrafu opisu gdy brak opisu', () => {
    const html = renderEmbedPage({ ...baseChart, description: null });
    expect(html).not.toContain('<p class="chart-description">');
  });

  it('osadza chart_data w script type="application/json"', () => {
    const html = renderEmbedPage(baseChart);
    expect(html).toContain('<script type="application/json" id="chart-payload">');
    const match = html.match(/<script type="application\/json" id="chart-payload">(.*?)<\/script>/s);
    expect(match).toBeTruthy();
    expect(() => JSON.parse(match![1])).not.toThrow();
  });

  it('escapuje < i > w chart_data wewnątrz script', () => {
    const html = renderEmbedPage({
      ...baseChart,
      chart_data: { label: '<script>' },
    });
    const match = html.match(/<script type="application\/json" id="chart-payload">(.*?)<\/script>/s);
    expect(match![1]).not.toContain('<script>');
    expect(match![1]).toContain('\\u003c');
  });

  it('motyw dark ustawia ciemne tło', () => {
    const html = renderEmbedPage({ ...baseChart, theme: 'dark' });
    expect(html).toContain('background: #1a1a1a');
  });

  it('motyw light ustawia jasne tło', () => {
    const html = renderEmbedPage({ ...baseChart, theme: 'light' });
    expect(html).toContain('background: #ffffff');
  });

  it('HTML-escapuje chart_type w atrybucie data-chart-type', () => {
    const html = renderEmbedPage({ ...baseChart, chart_type: '"evil"' });
    expect(html).not.toContain('data-chart-type=""evil""');
    expect(html).toContain('&quot;evil&quot;');
  });

  it('przycina float width/height do liczby całkowitej w atrybutach canvas', () => {
    const html = renderEmbedPage({ ...baseChart, width: 800.9, height: 600.7 });
    expect(html).toContain('width="800"');
    expect(html).toContain('height="600"');
  });

  it('używa "Chart" jako domyślny tytuł gdy null', () => {
    const html = renderEmbedPage({ ...baseChart, title: null });
    expect(html).toContain('<title>Chart</title>');
  });
});
