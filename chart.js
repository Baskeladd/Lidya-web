async function drawPortfolioChart() {
  const keys = await getAllStoredMonths();
  const uniqueMonths = [...new Set(keys.map(k => k.slice(0, 7)))].sort();

  const chartLabels = [];
  const chartData = [];

  for (const month of uniqueMonths) {
    const { tl, usd } = await getBothCurrencies(month);

    const tlUsd = tl?.totalTLPortfolioValueInUSD || 0;
    const usdUsd = usd?.totalUSDPortfolioInUSD || 0;
    const total = tlUsd + usdUsd;

    if (total > 0) {
      chartLabels.push(month);
      chartData.push(total.toFixed(2));
    }
  }

  const ctx = document.getElementById('portfolioChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Toplam Portföy (USD)',
        data: chartData,
        borderColor: '#1d4ed8',
        backgroundColor: 'rgba(29, 78, 216, 0.1)',
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Aylık Toplam Portföy (USD)',
          font: { size: 18 }
        },
        legend: {
          display: true
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => `$${value}`
          }
        }
      }
    }
  });
}
