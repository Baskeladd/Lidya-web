const cors = require('cors');
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();
app.use(cors());
const PORT = 3000;


// ROUTES BURAYA 👇
app.use('/investing', require('./routes/investing'));
app.use('/investing-ajax', require('./routes/investingAjax'));



// Test endpoint
app.get('/', (req, res) => {
  res.send('Lidya Backend çalışıyor!');
});

// USD/TRY verisi
app.get('/usdtry', async (req, res) => {
  try {
    const response = await axios.get(
      'https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?interval=1d&range=3y'
    );

    const result = response.data.chart.result[0];
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const simplifiedData = timestamps.map((ts, i) => {
      const date = new Date(ts * 1000).toISOString().split('T')[0];
      const close = closes[i];
      return { date, close };
    }).filter(entry => entry.close !== null);

    res.json(simplifiedData);
  } catch (error) {
    res.status(500).send('Veri çekilemedi: ' + error.message);
  }
});

// Hisse grafik verisi
app.get('/chart/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  const range = req.query.range || '1y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;

  try {
    const response = await axios.get(url);
    const result = response.data.chart.result?.[0];

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      return res.status(404).send(`Veri bulunamadı: ${symbol}`);
    }

    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;

    const simplified = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      close: closes[i]
    })).filter(entry => entry.close !== null);

    res.json(simplified);
  } catch (err) {
    console.error(`Hata: ${symbol}`, err.message);
    res.status(500).send('Veri çekme hatası: ' + err.message);
  }
});

app.get('/tefas/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const url = `https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod=${symbol}`;

  try {
    const browser = await puppeteer.launch({
      headless: false, // Gözle görünür tarayıcı açılır
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.goto(url, { waitUntil: 'networkidle0' });
    const html = await page.content();

    // Tarihleri çek
    const dateMatch = html.match(/categories"\s*:\s*\[(.*?)\]/s);
    const priceMatch = html.match(/"name"\s*:\s*"Fiyat"\s*,\s*"data"\s*:\s*\[(.*?)\]/s);

    if (!dateMatch || !priceMatch) {
      return res.status(500).send('Tarih veya fiyat verisi bulunamadı (regex eşleşmedi)');
    }

    const dates = dateMatch[1]
      .split(',')
      .map(d => d.trim().replace(/"/g, ''));

    const prices = priceMatch[1]
      .split(',')
      .map(p => parseFloat(p.trim()))
      .filter(p => !isNaN(p));

    if (dates.length !== prices.length) {
      return res.status(500).send('Tarih ve fiyat sayısı eşleşmiyor');
    }

    const merged = dates.map((date, i) => ({
      date,
      price: prices[i]
    }));

    await browser.close();
    res.json(merged);
  } catch (err) {
    console.error('TEFAS veri çekme hatası:', err.message);
    res.status(500).send('Veri çekme hatası: ' + err.message);
  }
});


app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
