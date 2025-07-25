const express = require('express');
const puppeteer = require('puppeteer');
const router = express.Router();

// Sadece özel semboller için slug + kategori eşlemesi
const investingMap = {
  'GLDTR': {
    slug: 'istanbul-gold-etf',
    category: 'etfs'
  },
  'ALTIN.S1': {
    slug: 'turkiye-cumhuriyeti-hazine-ve',
    category: 'equities'
  }
};

router.get('/:symbol', async (req, res) => {
  const inputSymbol = req.params.symbol.toUpperCase();
  const info = investingMap[inputSymbol];

  if (!info) {
    return res.status(400).send(`Investing slug bulunamadı: ${inputSymbol}`);
  }

  const url = `https://tr.investing.com/${info.category}/${info.slug}-historical-data`;

  try {
    const browser = await puppeteer.launch({
      headless: false, // Gözlemlemek için açık bırak
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/118 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Cookie banner'ı kapat
    await page.evaluate(() => {
      const btn = document.querySelector('button.js-accept-all-push');
      if (btn) btn.click();
    });

    // Sayfa geçişi için "Geçmiş Veriler" sekmesine tıkla
    await page.click('a[data-tab-id="historical_data"]');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Stabilite için kısa bekleme
    await new Promise(resolve => setTimeout(resolve, 3000));

    const html = await page.content();
    require('fs').writeFileSync('investing_debug.html', html);


    // Tabloyu bekle, timeout belirliyoruz
    await page.waitForSelector('table.genTbl.closedTbl.historicalTbl', { timeout: 15000 });


    const data = await page.evaluate(() => {
      const rows = document.querySelectorAll('table.genTbl.closedTbl.historicalTbl tbody tr');
      const result = [];

      for (const row of rows) {
        const cols = row.querySelectorAll('td');
        if (cols.length < 2) continue;

        const dateStr = cols[0].innerText.trim();
        const closeStr = cols[1].innerText.trim().replace('.', '').replace(',', '.');

        const dateParts = dateStr.split('.');
        if (dateParts.length !== 3) continue;

        const date = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`; // YYYY-MM-DD
        const close = parseFloat(closeStr);
        if (!isNaN(close)) {
          result.push({ date, close });
        }
      }

      return result;
    });

    await browser.close();
    res.json({ symbol: inputSymbol, source: 'investing', data });
  } catch (err) {
    console.error(`Investing scraping hatası: ${err.message}`);
    res.status(500).send('Veri çekme hatası: ' + err.message);
  }
});

module.exports = router;
