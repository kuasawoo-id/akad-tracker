# AKAD TRACKER — frontend (GitHub Pages)

Papan kerja jadwal akad nikah, bimwin, dan rekap modin · KUA Kecamatan Sawoo · by Ahzani Labs

Repository ini berisi **tampilan aplikasi saja** (HTML, CSS, JavaScript). Data tetap disimpan di Google Sheets
dan diolah oleh Google Apps Script (`Code.gs`) yang di-deploy sebagai Web App (REST API JSON).

```
index.html            dashboard tim KUA (perlu password)
form.html             form publik untuk modin (tanpa password)
sw.js                 pemutus PWA lama (v2.2: aplikasi tidak lagi bisa dipasang; berkas ini membersihkan perangkat lama)
css/style.css         gaya aplikasi
css/form.css          gaya khusus form publik
js/config.js          ← SATU-SATUNYA yang perlu diisi: GAS_URL (URL /exec Apps Script)
js/api.js             penghubung ke Apps Script (fetch POST text/plain)
js/app.js             logika dashboard
js/form.js            logika form publik
icons/                ikon aplikasi
```

**Alamat setelah online**

- Dashboard: `https://USERNAME.github.io/NAMA-REPO/`
- Form modin: `https://USERNAME.github.io/NAMA-REPO/form.html` (link lama `…/?page=form` juga diteruskan ke sini)

Langkah lengkap ada di **PANDUAN-INSTALASI.md**.

Berkas backend (`Code.gs`, `appsscript.json`) **tidak** disimpan di repository ini. Tempel berkas itu di editor Apps Script.
