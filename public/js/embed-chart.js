// Chart embedding functionality
// This script expects the following global variables to be set by the HTML:
// - window.chartData (the chart data object)
// - window.chartType (string like 'bar', 'line', etc.)
// - window.chartTheme (string like 'light' or 'dark')

(function() {
  'use strict';

  // Wait for Chart.js to be loaded
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    return;
  }

  // Get chart data from global variables
  const chartData = window.chartData;
  const chartType = window.chartType;
  const theme = window.chartTheme;

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
  const textColor = theme === 'dark' ? '#ffffff' : '#333333';
  const gridColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  // Default colors if not specified in data
  if (chartData.datasets && !chartData.datasets[0].backgroundColor) {
    const colors = [
      'rgba(255, 99, 132, 0.2)',
      'rgba(54, 162, 235, 0.2)',
      'rgba(255, 205, 86, 0.2)',
      'rgba(75, 192, 192, 0.2)',
      'rgba(153, 102, 255, 0.2)',
      'rgba(255, 159, 64, 0.2)'
    ];
    const borderColors = [
      'rgba(255, 99, 132, 1)',
      'rgba(54, 162, 235, 1)',
      'rgba(255, 205, 86, 1)',
      'rgba(75, 192, 192, 1)',
      'rgba(153, 102, 255, 1)',
      'rgba(255, 159, 64, 1)'
    ];

    chartData.datasets.forEach((dataset, index) => {
      dataset.backgroundColor = colors[index % colors.length];
      dataset.borderColor = borderColors[index % borderColors.length];
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
              size: 12
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

  // Initialize chart
  new Chart(ctx, config);
})();