// Reads chart inputs from DOM: #chart-payload JSON, #chart-theme JSON, [data-chart-type]

(function() {
  'use strict';

  // Wait for Chart.js to be loaded
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  const payloadEl = document.getElementById('chart-payload');
  const container = document.querySelector('.chart-container');

  let chartData;
  try {
    chartData = JSON.parse(payloadEl.textContent);
  } catch (e) {
    console.error('Failed to parse chart payload', e);
    return;
  }

  const chartType = container && container.dataset.chartType;

  // Theme colors are injected by the server (single source of truth: src/config/themes.ts).
  const themeDefaults = { text: '#000000', grid: '#e5e7eb', palette: ['#3b82f6'] };
  let themeColors = themeDefaults;
  const themeEl = document.getElementById('chart-theme');
  if (themeEl) {
    try {
      themeColors = Object.assign({}, themeDefaults, JSON.parse(themeEl.textContent));
    } catch (e) {
      console.error('Failed to parse chart theme', e);
    }
  }

  // Convert a #rrggbb hex to an rgba() string with the given alpha (for translucent fills).
  function hexToRgba(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    return 'rgba(' + parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16) + ', ' + alpha + ')';
  }

  if (!chartData || !chartType) {
    console.error('Chart data or type not provided');
    return;
  }

  // Get canvas element
  const chartCanvas = document.getElementById('chartCanvas');
  if (!chartCanvas) {
    console.error('Canvas element not found');
    return;
  }

  const ctx = chartCanvas.getContext('2d');

  // Theme-based colors
  const textColor = themeColors.text;
  const gridColor = themeColors.grid;

  // Default colors if not specified in data
  if (chartData.datasets && !chartData.datasets[0].backgroundColor) {
    const palette = (themeColors.palette && themeColors.palette.length) ? themeColors.palette : themeDefaults.palette;
    // Circular charts (pie/doughnut/polarArea) have one dataset whose data points are the
    // slices, so each slice needs its own palette color (solid, like the PNG renderer).
    // Other chart types get one translucent fill per dataset.
    const isCircular = ['pie', 'doughnut', 'polarArea'].includes(chartType);
    chartData.datasets.forEach((dataset, index) => {
      if (isCircular) {
        const count = Array.isArray(dataset.data) ? dataset.data.length : 0;
        const sliceColors = [];
        for (let i = 0; i < count; i++) {
          sliceColors.push(palette[i % palette.length]);
        }
        dataset.backgroundColor = sliceColors;
        dataset.borderColor = sliceColors;
      } else {
        const color = palette[index % palette.length];
        dataset.backgroundColor = hexToRgba(color, 0.2);
        dataset.borderColor = color;
      }
      dataset.borderWidth = 2;
    });
  }

  // Get canvas dimensions (already declared above as chartCanvas)
  const rect = chartCanvas.getBoundingClientRect();

  const config = {
    type: chartType,
    data: chartData,
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: {
              size: 20
            }
          }
        },
        title: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          }
        },
        y: {
          ticks: {
            color: textColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          }
        }
      }
    }
  };

  // Circular charts (pie/doughnut/polarArea) have no cartesian axes; leaving x/y
  // scales in place draws a stray grid behind the chart. Keep this in sync with the
  // server-side PNG renderer (ChartGeneratorService.getScaleOptions).
  if (['pie', 'doughnut', 'polarArea'].includes(chartType)) {
    delete config.options.scales;
  }

  // Initialize chart
  new Chart(ctx, config);
})();