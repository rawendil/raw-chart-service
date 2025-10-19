// Chart initialization for Puppeteer screenshot generation
// This script expects window.chartConfig to be set by the HTML

(function() {
  'use strict';

  // Wait for Chart.js to be loaded
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  // Get chart configuration from global variable
  const chartConfig = window.chartConfig;

  if (!chartConfig) {
    console.error('Chart configuration not provided');
    return;
  }

  // Get canvas element
  const canvas = document.getElementById('chart-canvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  const ctx = canvas.getContext('2d');

  // Initialize chart
  new Chart(ctx, chartConfig);
})();