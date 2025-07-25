const express = require('express');
const puppeteer = require('puppeteer');
const router = express.Router();

const investingMap = {
  'GLDTR': {
    slug: 'istanbul-gold-etf',
    category: 'etfs',
    curr_id: 1176473
  },
  'ALTIN.S1': {
    slug: 'turkiye-cumhuriyeti-hazine-ve',
    category: 'equities',
    curr_id: 1176563
  }
};

router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const info = investingMap[symbol];
  if (!info) return res.status(400).send('Investing bilgisi bulunamadı');

  const today = new Date();
  const lastYear = new Date(today);
  lastYear.setFullYear(today.getFullYear() - 1);

  const formatDate = (d) => {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const st_date = formatDate(lastYear);
  const end_date = formatDate(today);

  const postData = new URLSearchParams({
    curr_id: info.curr_id,
    st_date,
    end_date,
    interval_sec: 'Daily',
    sort_col: 'date',
    sort_ord: 'DESC',
    action: 'historical_data'
  }).toString();

  const url = `https://tr.investing.com/${info.category}/${info.slug}-historical-data`;

  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Sayfa içinde AJAX çağrısını yap
    const html = await page.evaluate(async (postData) => {
      const res = await fetch('/instruments/HistoricalDataAjax', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: postData
      });

      return await res.text(); // HTML döner
    }, postData);

    await browser.close();

    // Cheerio ile parse et
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const data = [];

    $('table tbody tr').each((_, row) => {
      const cols = $(row).find('td');
      const dateStr = $(cols[0]).text().trim();
      const closeStr = $(cols[1]).text().trim().replace('.', '').replace(',', '.');

      const [dd, mm, yyyy] = dateStr.split('.');
      const date = `${yyyy}-${mm}-${dd}`;
      const close = parseFloat(closeStr);

      if (!isNaN(close)) {
        data.push({ date, close });
      }
    });

    res.json({ symbol, source: 'investing-puppeteer', data });
  } catch (err) {
    console.error('Investing scraping hatası:', err.message);
    res.status(500).send('Veri çekme hatası: ' + err.message);
  }
});

module.exports = router;
