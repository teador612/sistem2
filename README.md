# Oran Analiz Sistemi

Excel geçmiş verisini JSON'a dönüştüren ve tarayıcıda çalışan mobil uyumlu MVP.

## Çalıştırma

Önce Excel'i dönüştürün:

```powershell
$py = "C:\Users\Süleyman\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $py scripts\convert_excel.py "C:\Users\Süleyman\Desktop\sistem\Excel-Açılış-Cep-Telefonu (2).xlsx" data\matches.json
```

Ardından proje klasöründe basit bir web sunucusu başlatın:

```powershell
& $py -m http.server 8000
```

Tarayıcıdan `http://localhost:8000` adresini açın. Dosyayı doğrudan çift tıklamak yerine web sunucusu kullanmak gerekir; tarayıcılar `fetch` ile yerel JSON okumayı engelleyebilir.

## Analiz mantığı

- Seçilen maçın tek bir açılış oranı son 60 gündeki aynı oran değeriyle eşleştirilir.
- Başarı oranı `%70` veya üzerindeyse öneri olarak gösterilir.
- `+` butonu diğer oran türlerini ve eşleşme sayılarını açar.
- Bitmiş maçlar sonuçlarına göre yeşil veya kırmızı, oynanmamış maçlar sarı görünür.
- Takım eşleştirme için büyük/küçük harf ve aksan farkları normalize edilir.

## GitHub Pages'e yayınlama

1. Bu klasörü bir GitHub repository'sine gönderin.
2. Repository ayarlarından **Settings → Pages** bölümüne girin.
3. **Source** olarak **GitHub Actions** seçin.
4. `main` branch'ine gönderilen her değişiklik otomatik yayınlanır.

`data/matches.json` dosyası da repository içinde bulunduğu için site ayrıca bir backend olmadan çalışır. GitHub Pages sürümünde veriler tarayıcı tarafından bu JSON dosyasından okunur.

## GitHub Pages veri güncelleme notu

`deploy-pages.yml` yayınlama işini hazırlar. Maçkolik'ten veri alma ve açılış oranlarını koruyarak birleştirme işlemi ayrı bir veri güncelleme scripti olarak eklenmelidir. Bu scriptin kaynak sayfadaki gerçek veri endpoint'i kesinleştirildikten sonra `repository_dispatch` ile tetiklenen bir workflow'a bağlanması gerekir. Böylece Pages arayüzü ile veri çekme işi birbirinden ayrılır.

## Maçkolik otomatik güncelleme

`update-data.yml` workflow'u `repository_dispatch` ve elle çalıştırma ile tetiklenir. Cron servisinde GitHub API'ye şu isteği POST olarak tanımlayın:

```text
POST https://api.github.com/repos/KULLANICI/REPOSITORY/dispatches
Authorization: Bearer GITHUB_TOKEN
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{"event_type":"mackolik-update"}
```

Çalışma sırasında önce Maçkolik'in güncel programı alınır. Mevcut maçın açılış oranları değiştirilmez. Yeni maç varsa eklenir; İY/MS skorları, sonuçlar ve maç durumu güncellenir. Maç eşleştirmesinde önce Maçkolik kodu, bulunamazsa tarih, saat ve büyük/küçük harf ile aksan farkları temizlenmiş takım adları kullanılır.
