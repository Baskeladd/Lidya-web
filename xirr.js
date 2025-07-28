async function fetchUsdTryData() {
  const res = await fetch("https://lidya-web.onrender.com/usdtry");
  return await res.json(); // [{ date: "2025-07-19", close: 33.2 }, ...]
}

function getUsdRateForDate(dateStr, usdtryData) {
  const targetDate = new Date(dateStr);

  for (let i = 0; i < 5; i++) {
    const iso = new Date(targetDate.getTime() - i * 86400000).toISOString().slice(0, 10);
    const found = usdtryData.find(entry => entry.date === iso);
    if (found?.close) return found.close;
  }

  return null; // 5 gün boyunca da yoksa null
}

function parseDateFromDDMMYY(str) {
  const [dd, mm, yy] = str.split("/");
  const fullYear = +yy > 50 ? "19" + yy : "20" + yy;
  return `${fullYear}-${mm}-${dd}`;
}

async function getXirrCashflows() {
  const keys = await getAllStoredMonths();
  const monthlyKeys = keys.filter(k => k.endsWith("TL") || k.endsWith("USD"));
  const monthMap = {};

  monthlyKeys.forEach(k => {
    const [year, month] = k.split("-");
    const key = `${year}-${month}`;
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(k);
  });

  const sortedMonths = Object.keys(monthMap).sort();
  if (sortedMonths.length < 2) {
    console.warn("📭 XIRR için en az 2 ay gerekli");
    return [];
  }

  const usdtryData = await fetchUsdTryData();
  const cashflows = [];

  for (let i = 0; i < sortedMonths.length; i++) {
    const month = sortedMonths[i];
    const keys = monthMap[month];

    const tlKey = keys.find(k => k.endsWith("TL"));
    const usdKey = keys.find(k => k.endsWith("USD"));

    const tlData = tlKey ? await getMonthlyData(tlKey) : null;
    const usdData = usdKey ? await getMonthlyData(usdKey) : null;

    const isFirst = i === 0;
    const isLast = i === sortedMonths.length - 1;

    const totalTL = tlData?.totalTLPortfolioValueInUSD || 0;
    const totalUSD = usdData?.totalUSDPortfolioInUSD || 0;
    const total = totalTL + totalUSD;

    const dateStr = `${month}-28`;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn(`⚠️ Geçersiz tarih atlandı: ${dateStr}`);
      continue;
    }

    if (isFirst || isLast) {
      if (total > 0) {
        cashflows.push({
          amount: isFirst ? -total : total,
          date: date
        });
      }
    }

    if (!isFirst) {
      const accounts = [...(tlData?.accounts || []), ...(usdData?.accounts || [])];
      const dailyTotals = {};

      for (const tx of accounts) {
        if (tx.type !== "Para Yatırma" && tx.type !== "Para Çekme") continue;

        const dateKey = parseDateFromDDMMYY(tx.date);
        const rate = tx.currency === "TRY" ? getUsdRateForDate(dateKey, usdtryData) : 1;
        if (!rate) {
          console.warn(`❌ Kur bulunamadı: ${dateKey} → ${tx.amount} ${tx.currency}`);
          continue;
        }

        const usdValue = tx.amount / rate;
        const sign = tx.type === "Para Yatırma" ? -1 : 1;
        const key = `${dateKey}`;

        if (!dailyTotals[key]) {
          dailyTotals[key] = { date: new Date(dateKey), amount: 0 };
        }

        dailyTotals[key].amount += usdValue * sign;
      }

      for (const entry of Object.values(dailyTotals)) {
        if (entry.amount !== 0) {
          cashflows.push({
            amount: parseFloat(entry.amount.toFixed(2)),
            date: entry.date
          });
        }
      }
    }
  }

  return cashflows;
}

function calculateXirr(cashflows, guess = 0.1) {
  const maxIterations = 100;
  const tol = 1e-6;

  function xirrResult(rate) {
    const t0 = cashflows[0].date.getTime();
    return cashflows.reduce((acc, cf) => {
      const t = (cf.date.getTime() - t0) / (1000 * 60 * 60 * 24 * 365);
      return acc + cf.amount / Math.pow(1 + rate, t);
    }, 0);
  }

  function xirrDerivative(rate) {
    const t0 = cashflows[0].date.getTime();
    return cashflows.reduce((acc, cf) => {
      const t = (cf.date.getTime() - t0) / (1000 * 60 * 60 * 24 * 365);
      return acc - (t * cf.amount) / Math.pow(1 + rate, t + 1);
    }, 0);
  }

  let rate = guess;
  for (let i = 0; i < maxIterations; i++) {
    const f = xirrResult(rate);
    const fPrime = xirrDerivative(rate);
    if (!isFinite(fPrime) || Math.abs(fPrime) < 1e-10) {
    throw new Error(`Türev çok küçük veya sonsuz! rate=${rate}, fPrime=${fPrime}`);
}
    const newRate = rate - f / fPrime;
    console.log(`[${i}] rate=${rate}, f=${f}, f'=${fPrime}, newRate=${newRate}`);
    if (Math.abs(newRate - rate) < tol) return newRate;
    rate = newRate;
  }

  throw new Error("XIRR hesaplaması yakınsamadı");
}

window.runXirrCalculation = async function () {
  const cashflows = await getXirrCashflows();
  console.log("📊 Cashflows:", cashflows);

  const resultBox = document.getElementById("xirrResult");

  try {
    const xirr = calculateXirr(cashflows);
    const percent = (xirr * 100).toFixed(2);
    console.log(`📈 Yıllık getiri (XIRR): ${percent}%`);

    resultBox.textContent = `📈 Yıllık USD bazlı getiri (XIRR): %${percent}`;
    resultBox.style.color = "#065f46";
  } catch (e) {
    console.error("❌ XIRR hesaplama hatası:", e);
    resultBox.textContent = "❌ XIRR hesaplama hatası: " + e.message;
    resultBox.style.color = "#b91c1c";
  }
};
