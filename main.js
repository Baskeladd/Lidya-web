function normalizeTr(str) {
  return str
    .normalize("NFD") // <- Unicode birleşik karakterleri ayır
    .replace(/[\u0300-\u036f]/g, '') // <- diakritik (nokta, şapka vs.) sil
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i');
}



async function getUsdTryForMonthEnd(year, month) {
  const response = await fetch('https://lidya-web.onrender.com/usdtry');
  const data = await response.json();

  // Örn: month = "05", year = "2025"
  const targetPrefix = `${year}-${month}`;
  const filtered = data.filter(entry => entry.date.startsWith(targetPrefix));
  if (filtered.length === 0) return null;

  const lastEntry = filtered[filtered.length - 1]; // Ayın son kapanış verisi
  return lastEntry.close;
}


function parsePortfolioTL(flatArray) { //PDF'deki metinleri düz bir dizi olarak alır
  const text = flatArray.join(' '); //kelimeleri birleştirir
  const tokens = text.split(/\s+/); //boşluklara göre kelimeleri ayırır bu kelimelere tokens denir
  const parsed = []; //sonuçlar parsed isimli dizide saklanır
  let i = 0; //döngü için sayaç

  while (i < tokens.length - 8) { 
    if (
      tokens[i + 3] === "TRY" && // TRY ile başlayan ve 8 kelime sonrasına kadar devam eden bir set arar
      tokens[i + 5] === "TRY" && // 5. kelime TRY ise
      tokens[i + 7] === "TRY" // 7. kelime TRY ise
    ) {
      const amount = parseFloat(tokens[i + 1].replace(',', '.')); // 1. kelime miktarıdır, virgülü nokta ile değiştirir
      const avgPrice = parseFloat(tokens[i + 2].replace(',', '.'));
      const profit = parseFloat(tokens[i + 4].replace(',', '.'));
      const totalValue = parseFloat(tokens[i + 6].replace(',', '.'));

      // Hisse adı için: "-" öncesi token
      let name = ''; // Hisse adını tutacak değişken
      for (let j = i - 1; j >= 0; j--) { // Geriye doğru bakar. 
        if (tokens[j] === '-') { 
          if (j - 1 >= 0) { 
            name = tokens[j - 1]; // Eğer "-" işaretinden önce bir kelime varsa, o hisse adıdır
          }
          break;
        }
      }

      parsed.push({ // Sonuçları parsed dizisine ekler
        name,
        amount,
        avgPrice,
        profit,
        totalValue
      });

      i += 8; 
    } else {
      i++;
    }
  }

  return parsed; // parsed dizisini döndürür
}


function parsePortfolioUSD(flatArray) {
  const text = flatArray.join(' ');
  const tokens = text.split(/\s+/);

  const parsed = [];
  let i = 0;

  while (i < tokens.length - 8) {
    const currencySet =
      tokens[i + 3] === "USD" &&
      tokens[i + 5] === "USD" &&
      tokens[i + 7] === "USD";

    if (currencySet) {
      const amount = parseFloat(tokens[i + 1].replace(',', '.'));
      const avgPrice = parseFloat(tokens[i + 2].replace(',', '.'));
      const profit = parseFloat(tokens[i + 4].replace(',', '.'));
      const totalValue = parseFloat(tokens[i + 6].replace(',', '.'));

      // Geriye doğru bak ve "-" işaretini bulunca onun bir öncesini al
      let name = '';
      for (let j = i - 1; j >= 0; j--) {
        if (tokens[j] === '-') {
          if (j - 1 >= 0) {
            name = tokens[j - 1];
          }
          break;
        }
      }

      parsed.push({
        name,
        amount,
        avgPrice,
        profit,
        totalValue
      });

      i += 8;
    } else {
      i++;
    }
  }

  return parsed;
}

function parseInvestmentTransactions(tokens) { // Yatırım işlemlerini parse eder
  const parsed = [];
  let i = 0;

  while (i < tokens.length - 13) {
    const datePattern = /^\d{2}\/\d{2}\/\d{2}$/;
    const timePattern = /^\d{2}:\d{2}:\d{2}$/;

    if (datePattern.test(tokens[i]) && timePattern.test(tokens[i + 1])) {
      const date = tokens[i]; // sadece gün/ay/yıl kısmı

      const type = tokens[i + 5]; // Alış / Satış
      const status = tokens[i + 6]; // Gerçekleşti / İptal Edildi

      if (status !== "Gerçekleşti") {
        i += 14;
        continue;
      }

      const symbol = tokens[i + 4];
      const currency = tokens[i + 7];
      const quantity = parseFloat(tokens[i + 10].replace(',', '.'));
      const avgPrice = tokens[i + 11] === "-" ? 0 : parseFloat(tokens[i + 11].replace(',', '.'));
      const fee = tokens[i + 12] === "-" ? 0 : parseFloat(tokens[i + 12].replace(',', '.'));
      const total = parseFloat(tokens[i + 13].replace(',', '.'));

      parsed.push({
        date,
        symbol,
        type,
        currency,
        quantity,
        avgPrice,
        fee,
        total
      });

      i += 14; // işlem satırını geç
    } else {
      i++;
    }
  }

  return parsed;
}

function parseAccountTransactions(tokens) {
  const parsed = [];
  let i = 0;

  while (i < tokens.length - 10) {
    const datePattern = /^\d{2}\/\d{2}\/\d{2}$/;
    const timePattern = /^\d{2}:\d{2}:\d{2}$/;

    // 2 tarih ve saat eşleşirse
    if (
      datePattern.test(tokens[i]) && timePattern.test(tokens[i + 1]) &&
      datePattern.test(tokens[i + 2]) && timePattern.test(tokens[i + 3])
    ) {
      const date = tokens[i + 2]; // İşlem tarihi
      const type = tokens[i + 4] + " " + tokens[i + 5]; // Para Yatırma, Para Çekme, Diğer Gelir

      // "Gerçekleşti" kelimesi neredeyse onu bul
      let statusIndex = i + 6;
      let found = false;

      while (statusIndex < tokens.length && statusIndex < i + 20) {
        if (tokens[statusIndex] === "Gerçekleşti") {
          found = true;
          break;
        }
        statusIndex++;
      }

      if (!found) {
        i += 1;
        continue;
      }

      // Gerçekleşti'den sonra gelen 2 token → tutar ve kur
      const amountToken = tokens[statusIndex + 1];
      const currencyToken = tokens[statusIndex + 2];

      if (!amountToken || !currencyToken) {
        i = statusIndex + 3;
        continue;
      }

      const amount = parseFloat(amountToken.replace('.', '').replace(',', '.'));
      const currency = currencyToken.replace(/[^A-Z]/g, '').slice(0, 3);

      parsed.push({
        date,
        type,
        amount,
        currency
      });

      i = statusIndex + 3;
    } else {
      i++;
    }
  }

  return parsed;
}

function parseDividendTransactions(tokens) {
  const parsed = [];
  let i = 0;

  while (i < tokens.length - 7) {
    const datePattern = /^\d{2}\/\d{2}\/\d{2}$/;

    if (datePattern.test(tokens[i])) {
      const date = tokens[i];
      let stockCode = "";

      // "-" karakterini bul, öncesindeki kelime hisse kodu
      for (let j = i + 1; j < i + 6; j++) {
        if (tokens[j] === "-") {
          stockCode = tokens[j - 1];
          break;
        }
      }

      if (!stockCode) {
        i++;
        continue;
      }

      // TRY veya USD token'ı bul, öncesindeki sayı netAmount
      let netAmount = null;
      let currency = null;

      for (let j = i + 6; j < i + 12; j++) {
        const curr = tokens[j];
        if (curr === "TRY" || curr === "USD") {
          const amountCandidate = tokens[j - 1];
          const parsedAmount = parseFloat(amountCandidate.replace(',', '.'));
          if (!isNaN(parsedAmount)) {
            netAmount = parsedAmount;
            currency = curr;
            break;
          }
        }
      }

      if (netAmount === null || !currency) {
        i++;
        continue;
      }

      parsed.push({
        date,
        stockCode,
        netAmount,
        currency
      });

      i += 8;
    } else {
      i++;
    }
  }

  return parsed;
}











// Midas uygulamasından alınan yatırım PDF’inin içinden, sadece PORTFÖY ÖZETİ kısmını çıkartmak ve işlemeye hazır hale getirmek.
function parseMidasPDFText(text) {
  const sectionPatterns = {
    portfolio: /PORTFÖY ÖZETİ.*?(?=YATIRIM İŞLEMLERİ|HESAP İŞLEMLERİ|TEMETTÜ İŞLEMLERİ|HİSSE TRANSFERLERİ|$)/s,
    trades: /YATIRIM İŞLEMLERİ.*?(?=HESAP İŞLEMLERİ|TEMETTÜ İŞLEMLERİ|HİSSE TRANSFERLERİ|$)/s,
    dividends: /TEMETTÜ İŞLEMLERİ.*?(?=HİSSE TRANSFERLERİ|$)/s,
    transfers: /HİSSE TRANSFERLERİ.*?$/s
  };

  const sections = {};

  // Özel: Hesap işlemleri birden fazla kez geçebilir → tüm eşleşmeleri al
  const accountMatches = [...text.matchAll(/HESAP İŞLEMLERİ.*?(?=TEMETTÜ İŞLEMLERİ|HİSSE TRANSFERLERİ|www\.midasmenkul\.com|$)/gs)];
  if (accountMatches.length > 0) {
    const joinedText = accountMatches.map(m => m[0]).join(' ');
    const cleaned = joinedText
      .replace(/\s{2,}/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/TRYMidas/g, 'TRY')
      .replace(/USDwww\.midasmenkul\.com/g, 'USD')
      .replace(/www\.midasmenkul\.com/g, '')
      .trim()
      .split(' ')
      .filter(x => x.trim() !== '');
    sections.account = cleaned;
  } else {
    sections.account = [];
  }

  // Diğer bölümler normal eşleşmeyle alınır
  for (const key in sectionPatterns) {
    const pattern = sectionPatterns[key];
    const match = text.match(pattern);

    if (match) {
      const cleaned = match[0]
        .replace(/\s{2,}/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/TRYMidas/g, 'TRY')
        .replace(/USDwww\.midasmenkul\.com/g, 'USD')
        .replace(/www\.midasmenkul\.com/g, '')
        .trim()
        .split(' ')
        .filter(x => x.trim() !== '');
      sections[key] = cleaned;
    } else {
      sections[key] = [];
    }
  }

  return sections;
}

function openDatabase() { // IndexedDB veritabanını açar veya oluşturur
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("LidyaDB", 1);

    request.onerror = () => reject("DB açılırken hata oluştu");
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("monthlyData")) {
        db.createObjectStore("monthlyData", { keyPath: "date" });
      }
    };
  });
}

async function saveMonthlyData(dateKey, data) {
  const db = await openDatabase();
  const tx = db.transaction("monthlyData", "readwrite");
  const store = tx.objectStore("monthlyData");
  store.put({ date: dateKey, ...data });
  await tx.complete;
  db.close();
}
async function deleteMonthlyData(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("LidyaDB", 1);
    request.onerror = () => reject("❌ IndexedDB erişim hatası");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("monthlyData", "readwrite");
      const store = tx.objectStore("monthlyData");
      const deleteRequest = store.delete(key);

      deleteRequest.onsuccess = () => {
        console.log(`🗑️ ${key} verisi silindi.`);
        resolve();
      };
      deleteRequest.onerror = () => reject("❌ Silme işlemi başarısız");
    };
  });
}


async function getMonthlyData(dateKey) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("monthlyData", "readonly");
    const store = tx.objectStore("monthlyData");
    const request = store.get(dateKey);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("Veri okunamadı");
  });
}

async function getBothCurrencies(month) {
  const tl = await getMonthlyData(`${month}-TL`);
  const usd = await getMonthlyData(`${month}-USD`);

  console.log("🔍 getBothCurrencies:", month, "→", { tl, usd });

  return { tl, usd };
}

async function getAllStoredMonths() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("monthlyData", "readonly");
    const store = tx.objectStore("monthlyData");
    const request = store.getAllKeys();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("Anahtarlar okunamadı");
  });
}

async function updateMonthDropdown() {
  const months = await getAllStoredMonths();
  const uniqueMonths = [...new Set(months.map(k => k.slice(0, 7)))];

  const select = document.getElementById("monthSelector");
  select.innerHTML = "";
  uniqueMonths.forEach(month => {
    const opt = document.createElement("option");
    opt.value = month;
    opt.textContent = month;
    select.appendChild(opt);
  });
}

async function processSinglePDF(file) {
  const fileReader = new FileReader();

  return new Promise((resolve) => {
    fileReader.onload = async function () {
      const typedArray = new Uint8Array(this.result);
      const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

      let allText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        allText += pageText;
      }

      const parsed = parseMidasPDFText(allText);
      const tokens = parsed.portfolio;
      const isUSD = tokens.includes("USD");

      const portfolioObjects = isUSD ? parsePortfolioUSD(tokens) : parsePortfolioTL(tokens);
      const investmentObjects = parseInvestmentTransactions(parsed.trades);
      const accountObjects = parseAccountTransactions(parsed.account);
      const dividendObjects = parseDividendTransactions(parsed.dividends);

      const fileName = file.name.replace(".pdf", "").replace(/\s/g, "").toLowerCase();
      const match = fileName.match(/(\d{4})/);
      const year = match ? match[1] : "0000";

      const aylar = {
        ocak: "01", subat: "02", şubat: "02", mart: "03", nisan: "04", mayis: "05", mayıs: "05", haziran: "06",
        temmuz: "07", agustos: "08", ağustos: "08", eylul: "09", eylül: "09", ekim: "10", kasim: "11", kasım: "11", aralik: "12", aralık: "12"
      };

      const normalizedFileName = normalizeTr(fileName);
      const matchedKey = Object.keys(aylar).find(key => normalizedFileName.includes(normalizeTr(key))) || "";
      const month = aylar[matchedKey] || "00";
      const dateISO = `${year}-${month}`;
      const currencySuffix = isUSD ? "USD" : "TL";
      const finalKey = `${dateISO}-${currencySuffix}`;

      console.log("🧠 fileName:", fileName, "ayTr:", matchedKey, "finalKey:", finalKey);

      let usdtry = null;
      try {
        const response = await fetch('https://lidya-web.onrender.com/usdtry');
        const data = await response.json();
        const targetPrefix = `${year}-${month}`;
        const filtered = data.filter(entry => entry.date.startsWith(targetPrefix));
        if (filtered.length > 0) {
          const lastEntry = filtered[filtered.length - 1];
          usdtry = lastEntry.close;
        }
        console.log("📊 USD/TRY kapanış kuru:", usdtry);
      } catch (error) {
        console.error("❌ USD/TRY verisi çekilemedi:", error);
      }

      let totalTLPortfolioValueInUSD = null;
      let totalUSDPortfolioInUSD = null;
      let totalPortfolioValueInUSD = null;

      // 🧮 TL portföyünü USD'ye çevir
      if (!isUSD && usdtry && Array.isArray(portfolioObjects)) {
        const totalTL = portfolioObjects.reduce((sum, item) => {
          const val = parseFloat(String(item.totalValue).replace(',', '.'));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);

        totalTLPortfolioValueInUSD = totalTL / usdtry;
        console.log(`💰 ${finalKey} → TL portföy USD karşılığı: $${totalTLPortfolioValueInUSD.toFixed(2)}`);
      }

      // 🧮 USD portföy toplamı
      if (isUSD && Array.isArray(portfolioObjects)) {
        const totalUSD = portfolioObjects.reduce((sum, item) => {
          const val = parseFloat(String(item.totalValue).replace(',', '.'));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
        totalUSDPortfolioInUSD = totalUSD;
        console.log(`💰 ${finalKey} → USD portföy USD karşılığı: $${totalUSDPortfolioInUSD.toFixed(2)}`);
      }

      // 🧮 Toplam portföy
      if (totalTLPortfolioValueInUSD !== null || totalUSDPortfolioInUSD !== null) {
        totalPortfolioValueInUSD =
          (totalTLPortfolioValueInUSD || 0) + (totalUSDPortfolioInUSD || 0);
        console.log(`💼 ${finalKey} → Toplam portföy USD karşılığı: $${totalPortfolioValueInUSD.toFixed(2)}`);
      }

      // ✅ Kayıt verisi hazırla
      const saveObject = {
        portfolio: portfolioObjects,
        investments: investmentObjects,
        accounts: accountObjects,
        dividends: dividendObjects,
        usdtryAtMonthEnd: usdtry
      };

      if (!isUSD && totalTLPortfolioValueInUSD !== null) {
        saveObject.totalTLPortfolioValueInUSD = totalTLPortfolioValueInUSD;
      }

      if (isUSD && totalUSDPortfolioInUSD !== null) {
        saveObject.totalUSDPortfolioInUSD = totalUSDPortfolioInUSD;
      }

      if (totalPortfolioValueInUSD !== null) {
        saveObject.totalPortfolioValueInUSD = totalPortfolioValueInUSD;
      }

      await saveMonthlyData(finalKey, saveObject);
      console.log(`📁 ${file.name} kaydedildi → ${finalKey}`);
      resolve(); // Promise'i tamamla
    };

    fileReader.readAsArrayBuffer(file);
  });
}


document.getElementById('pdfInput').addEventListener('change', async function (e) {
  const files = Array.from(e.target.files);
  for (const file of files) {
    await processSinglePDF(file);
  }

  console.log("✅ Tüm PDF'ler işlendi ve IndexedDB'ye kaydedildi.");

  await updateMonthDropdown(); // Bu SATIR burada olmalı!
});







    

 

  //fileReader.readAsArrayBuffer(file);


//getMonthlyData("2025-05-TL").then(data => console.log("TL verisi:", data));
//getMonthlyData("2025-05-USD").then(data => console.log("USD verisi:", data));

// Sayfa yüklendikten sonra çağrılır
//getBothCurrencies("2025-05").then(data => {
//  console.log("📦 Mayıs 2025 verileri:", data);
//});

window.addEventListener("load", async () => {
  // 📤 PDF input temizleme
  const input = document.getElementById("pdfInput");
  if (input) input.value = ""; // Seçili dosyayı sıfırla

  // 📅 Dropdown'u doldur
  const months = await getAllStoredMonths();
  const uniqueMonths = [...new Set(months.map(k => k.slice(0, 7)))];

  const select = document.getElementById("monthSelector");
  if (!select) return; // HTML'de select yoksa hata çıkmasın
  select.innerHTML = "";
  uniqueMonths.forEach(month => {
    const opt = document.createElement("option");
    opt.value = month;
    opt.textContent = month;
    select.appendChild(opt);
  });
    // 🟢 Grafik çizimini başlat
    drawPortfolioChart();

});

document.getElementById("loadSelected").addEventListener("click", async () => {
  const month = document.getElementById("monthSelector").value;
  const data = await getBothCurrencies(month);
  const output = document.getElementById("dataOutput");

  // Ana JSON'u göster
  if (data.tl || data.usd) {
    output.textContent = JSON.stringify(data, null, 2);

    const container = document.createElement("div");
    container.style.marginTop = "1rem";

    const usdEquiv = data.tl?.totalTLPortfolioValueInUSD;
    if (usdEquiv) {
      const div1 = document.createElement("div");
      div1.textContent = `💸 ${month} ayı TL portföyün USD karşılığı: $${usdEquiv.toFixed(2)}`;
      div1.style.color = "#1d4ed8";
      div1.style.fontWeight = "bold";
      container.appendChild(div1);
    }

    const usdPart = data.usd?.totalUSDPortfolioInUSD;
    if (usdPart) {
      const div2 = document.createElement("div");
      div2.textContent = `💵 ${month} ayı USD portföyün USD karşılığı: $${usdPart.toFixed(2)}`;
      div2.style.color = "#059669";
      div2.style.fontWeight = "bold";
      container.appendChild(div2);
    }

    // Toplamı hesapla
    const total = (usdEquiv || 0) + (usdPart || 0);
    if (total > 0) {
      const div3 = document.createElement("div");
      div3.textContent = `💼 ${month} ayı toplam portföy USD karşılığı: $${total.toFixed(2)}`;
      div3.style.color = "#dc2626";
      div3.style.fontWeight = "bold";
      container.appendChild(div3);
    }

    output.appendChild(container);

  } else {
    output.textContent = "📭 Veri bulunamadı.";
  }
});



window.deleteMonthlyData = deleteMonthlyData;
getAllStoredMonths().then(keys => console.log("📦 IndexedDB'deki tüm key'ler:", keys));


document.getElementById("xirrButton").addEventListener("click", () => {
  runXirrCalculation(); // xirr.js'ten gelen fonksiyon
});