import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const dataPath = path.join(root, "data", "matches.json");
const dataDir = path.join(root, "data");
const historyDir = path.join(dataDir, "history");
const manifestPath = path.join(dataDir, "manifest.json");
const sourceUrl =
  "https://arsiv.mackolik.com/AjaxHandlers/ProgramDataHandler.ashx";
const clean = (value) =>
  String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeTeam = (value) =>
  clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9çğıöşü]+/gi, "");
const scoreValue = (value) =>
  /^\d+$/.test(clean(value))
    ? clean(value)
    : null;
const scoreText = (home, away) => {
  const h = scoreValue(home);
  const a = scoreValue(away);
  return h != null && a != null
    ? `${h}-${a}`
    : null;
};
function parseSource(raw) {
  console.log("====================================");
  console.log("MACKOLIK HAM CEVAP KONTROL");
  console.log("====================================");
  console.log(
    "Cevap uzunluğu:",
    raw.length
  );
  console.log(
    "İlk 200 karakter:",
    raw.slice(0, 200)
  );
  if (!/^\s*\{m:/.test(raw)) {
    throw new Error(
      "Mackolik cevabı beklenen {m:[...]} formatında değil."
    );
  }
  return vm.runInNewContext(
    `(${raw})`,
    Object.create(null),
    {
      timeout: 5000
    }
  );
}
async function fetchRows() {
  const now = new Date();
  const day =
    String(now.getDate()).padStart(2, "0");
  const month =
    String(now.getMonth() + 1).padStart(2, "0");
  const today =
    `${day}.${month}.${now.getFullYear()}`;
  console.log("");
  console.log("====================================");
  console.log("MACKOLIK İSTEK");
  console.log("====================================");
  console.log("GitHub zamanı:", now.toISOString());
  console.log("İstenen tarih:", today);
  const params = new URLSearchParams({
    type: "6",
    sortValue: "DATE",
    day: today,
    sort: "-1",
    sortDir: "-1",
    groupId: "-1",
    np: "0",
    sport: "1"
  });
  const url =
    `${sourceUrl}?${params.toString()}`;
  console.log("URL:", url);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Referer":
        "https://arsiv.mackolik.com/Genis-Iddaa-Programi"
    }
  });
  console.log(
    "HTTP:",
    response.status
  );
  const raw = await response.text();
  console.log(
    "Ham veri alındı:",
    raw.length,
    "karakter"
  );
  const parsed =
    parseSource(raw);
  const rows =
    (parsed.m ?? []).flatMap(
      (group) => group.m ?? []
    );
  console.log(
    "Toplam Mackolik satırı:",
    rows.length
  );
  return rows;
}
async function loadExisting() {
  console.log("");
  console.log("====================================");
  console.log("HISTORY KONTROL");
  console.log("====================================");
  try {
    const manifest =
      JSON.parse(
        await fs.readFile(
          manifestPath,
          "utf8"
        )
      );
    console.log(
      "Manifest bulundu."
    );
    console.log(
      "Manifest dosyaları:",
      JSON.stringify(
        manifest.files,
        null,
        2
      )
    );
    const files =
      Object.values(
        manifest.files ?? {}
      );
    const all = [];
    for (const file of files) {
      try {
        const filePath =
          path.join(root, file);
        const data =
          JSON.parse(
            await fs.readFile(
              filePath,
              "utf8"
            )
          );
        console.log(
          file,
          "=>",
          data.length,
          "maç"
        );
        all.push(...data);
      } catch (error) {
        console.log(
          "DOSYA OKUNAMADI:",
          file,
          error.message
        );
      }
    }
    return all;
  } catch (error) {
    console.log(
      "Manifest okunamadı:",
      error.message
    );
    try {
      const data =
        JSON.parse(
          await fs.readFile(
            dataPath,
            "utf8"
          )
        );
      return data;
    } catch {
      return [];
    }
  }
}
const rows =
  await fetchRows();
console.log("");
console.log("====================================");
console.log("KAYMAN - PORTO RİKO ARAMA");
console.log("====================================");
let foundMackolik = 0;
for (const row of rows) {
  const home =
    clean(row[1]);
  const away =
    clean(row[3]);
  const text =
    `${home} ${away}`
      .toLocaleLowerCase(
        "tr-TR"
      );
  if (
    text.includes("kayman") ||
    text.includes("porto") ||
    text.includes("puerto")
  ) {
    foundMackolik++;
    console.log("");
    console.log(
      "******** MACKOLIK MAÇI BULUNDU ********"
    );
    console.log(
      "ID:",
      row[0]
    );
    console.log(
      "Ev sahibi:",
      row[1]
    );
    console.log(
      "Deplasman:",
      row[3]
    );
    console.log(
      "Status:",
      row[5]
    );
    console.log(
      "Saat:",
      row[6]
    );
    console.log(
      "Tarih:",
      row[7]
    );
    console.log(
      "MS ev:",
      row[8]
    );
    console.log(
      "MS dep:",
      row[9]
    );
    console.log(
      "İY ev:",
      row[11]
    );
    console.log(
      "İY dep:",
      row[12]
    );
    console.log(
      "Lig:",
      row[26]
    );
    console.log(
      "TÜM ROW:",
      JSON.stringify(row)
    );
    console.log(
      "***************************************"
    );
  }
}
console.log("");
if (foundMackolik === 0) {
  console.log(
    "❌ Mackolik cevabında Kayman / Porto / Puerto içeren maç bulunamadı."
  );
} else {
  console.log(
    "✅ Mackolik cevabında",
    foundMackolik,
    "ilgili maç bulundu."
  );
}
const existing =
  await loadExisting();
console.log("");
console.log("====================================");
console.log("HISTORY'DE KAYMAN ARAMA");
console.log("====================================");
let foundHistory = 0;
for (const item of existing) {
  const home =
    clean(
      item.homeTeam ??
      item.home ??
      ""
    );
  const away =
    clean(
      item.awayTeam ??
      item.away ??
      ""
    );
  const text =
    `${home} ${away}`
      .toLocaleLowerCase(
        "tr-TR"
      );
  if (
    text.includes("kayman") ||
    text.includes("porto") ||
    text.includes("puerto")
  ) {
    foundHistory++;
    console.log("");
    console.log(
      "******** HISTORY MAÇI BULUNDU ********"
    );
    console.log(
      "ID:",
      item.id
    );
    console.log(
      "Tarih:",
      item.date
    );
    console.log(
      "Saat:",
      item.time
    );
    console.log(
      "Ev sahibi:",
      item.homeTeam
    );
    console.log(
      "Deplasman:",
      item.awayTeam
    );
    console.log(
      "İY skoru:",
      item.halfTimeScore
    );
    console.log(
      "MS skoru:",
      item.fullTimeScore
    );
    console.log(
      "Status:",
      item.status
    );
    console.log(
      "Results:",
      JSON.stringify(
        item.results
      )
    );
    console.log(
      "****************************************"
    );
  }
}
if (foundHistory === 0) {
  console.log(
    "❌ History içinde Kayman / Porto / Puerto içeren kayıt bulunamadı."
  );
} else {
  console.log(
    "✅ History içinde",
    foundHistory,
    "ilgili kayıt bulundu."
  );
}
console.log("");
console.log("====================================");
console.log("SONUÇ");
console.log("====================================");
console.log(
  "Mackolik eşleşmesi:",
  foundMackolik
);
console.log(
  "History eşleşmesi:",
  foundHistory
);
console.log("");
console.log(
  "BU SÜRÜM VERİYİ DEĞİŞTİRMEZ."
);
console.log(
  "Sadece teşhis yapar."
);
