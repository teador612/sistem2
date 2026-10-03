# Ayrı Spor Toto uygulaması

Bu klasör `sistem2` uygulamasından bağımsızdır. Yalnızca mevcut `data/matches.json` dosyasını okur; kendi veri dosyasını içermez. Listede yalnızca `weekId` taşıyan resmi Spor Toto haftası kayıtları gösterilir; diğer lig ve Maçkolik maçları filtrelenir.

GitHub reposunda klasör yapısı şöyle olmalı:

```text
index.html
data/matches.json       # sistem2'den kullanılan tek dosya
spor-toto-ayri/
  index.html
  styles.css
  app.js
```

Uygulamayı `/spor-toto-ayri/` adresinden aç. `app.js`, `../data/matches.json` yolunu kullanır. `file://` ile açmak yerine GitHub Pages veya yerel web sunucısı kullan.
