# AKAD TRACKER v2.3 — Panduan Migrasi ke GitHub Pages

KUA Kecamatan Sawoo · Ahzani Labs · Frontend GitHub Pages + Google Apps Script (REST API) + Google Sheets

## Apa yang berubah, apa yang tidak

| | v1.10 (lama) | v2.0 (baru) |
|---|---|---|
| Tampilan aplikasi | Disajikan Apps Script (HtmlService), di dalam bingkai halaman Google | Berkas statis di **GitHub Pages**, terbuka langsung tanpa bingkai |
| Komunikasi | `google.script.run` | `fetch()` ke URL `/exec` yang sama (POST JSON) |
| Backend | `Code.gs` + 4 file HTML | **`Code.gs` saja** (file HTML dihapus) |
| Data | Google Sheets AKAD_TRACKER_DB | **Tetap sama, tidak dipindah atau diubah** |
| Fitur | — | **Sama persis.** Semua 136 uji tampilan v1.x tetap lulus di versi baru |
| Password tim, kode aktivasi | — | Tetap sama |
| URL `/exec` | Alamat aplikasi | Tetap sama, sekarang berfungsi sebagai alamat **server data** |

Yang terasa berbeda bagi pengguna:

- **Alamat baru:** `https://USERNAME.github.io/akad-tracker/`. Setiap HP/laptop perlu **masuk sekali lagi** dengan password yang sama, karena salinan login tersimpan per alamat.
- **Link dan QR lama tetap jalan.** Begitu tim membuka alamat baru dan masuk satu kali, link `/exec` lama (termasuk QR form yang sudah dicetak) otomatis meneruskan ke alamat baru.
- **v2.2:** AKAD TRACKER **tidak lagi berupa PWA** (tidak bisa dipasang sebagai aplikasi). Aplikasi dibuka sebagai halaman web biasa di browser atau dari katalog LABUKU EVO.
- **v2.3:** folder Drive pindah ke **Database by Ahzani Labs / AKAD TRACKER**, dan pendaftaran dari **KUA-Link** otomatis masuk ke jadwal. Lihat **Bagian 11**.
- Celah putih dan tampilan "ter-zoom" di HP berasal dari bingkai halaman Google, dan bingkai itu sudah tidak dipakai.

---

## Urutan kerja (agar aplikasi tidak lama terputus)

1. **Bagian 1** — siapkan frontend di GitHub sampai online. Aplikasi lama masih berjalan normal selama langkah ini.
2. **Bagian 2** — perbarui `Code.gs` di Apps Script (±5 menit). **Sejak titik ini aplikasi lama berhenti** dan alamat baru mulai dipakai.
3. **Bagian 3** — uji, lalu umumkan alamat baru ke tim.

> Instalasi baru (belum pernah memasang AKAD TRACKER)? Kerjakan **Bagian 4** dulu untuk mendapatkan URL `/exec`, lalu Bagian 1 dan 3.

---

## Bagian 1 — Frontend di GitHub Pages

Isi paket `akad-tracker.zip`:

```
akad-tracker\              ← folder hasil ekstrak = folder yang di-git init
├── index.html             ← harus terlihat langsung di sini
├── form.html
├── sw.js              (pemutus PWA lama, jangan dihapus)
├── README.md
├── PANDUAN-INSTALASI.md
├── css\   style.css, form.css
├── js\    config.js, api.js, app.js, form.js
└── icons\ 5 ikon PNG
```

Tidak ada `Code.gs` di dalam ZIP. Itu disengaja: berkas backend hanya untuk editor Apps Script.

### 1.1 Ekstrak & isi `js/config.js`

1. Klik kanan `akad-tracker.zip` → **Extract All…** → misalnya ke `Documents`. Hasilnya folder `Documents\akad-tracker\` yang **langsung** berisi `index.html`.
2. Buka `js\config.js` dengan Notepad. Ganti baris ini:
   ```js
   window.GAS_URL = 'https://script.google.com/macros/s/GANTI_DENGAN_ID_DEPLOYMENT/exec';
   ```
   dengan URL `/exec` AKAD TRACKER yang sekarang dipakai (Apps Script → **Terapkan → Kelola deployment** → salin URL Aplikasi web). Simpan.

> URL ini memang publik (sama dengan link yang selama ini dibagikan ke tim). File frontend tidak memuat password atau rahasia apa pun.

### 1.2 Cek Git (sekali per komputer)

Buka **Git Bash** dan jalankan:

```bash
git --version
git config --global user.name
git config --global user.email
```

Kalau versi Git dan identitas sudah tampil, lanjut. Kalau belum: pasang Git dari `https://git-scm.com/download/win` (pengaturan default), lalu:

```bash
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

### 1.3 Buat repository di GitHub

github.com → **+** → **New repository**:

- Repository name: `akad-tracker`
- **Public** (wajib untuk GitHub Pages gratis)
- **Jangan** centang README, .gitignore, atau license.

Klik **Create repository**, lalu biarkan halamannya terbuka.

> Sudah pernah membuat repository untuk folder `akad-tracker-pwa` (v1.5–v1.10)? Repository itu boleh dipakai ulang. Lihat **Bagian 6 → Repository PWA lama**.

### 1.4 Masuk ke folder yang benar, lalu verifikasi

```bash
cd ~/Documents/akad-tracker
ls
```

Yang **harus** terlihat: `index.html  form.html  css/  js/  icons/ …`

- Kalau yang terlihat justru satu folder `akad-tracker/` lagi, berarti Anda satu level terlalu tinggi. Jalankan `cd akad-tracker` dulu, lalu `ls` lagi.
- Jangan lanjut sebelum `index.html` terlihat di daftar. Git tidak akan memprotes folder yang salah, dan hasilnya situs 404.

### 1.5 Push pertama

Jalankan satu per satu:

```bash
git init
git add .
git commit -m "Migrasi AKAD TRACKER v2.0 ke GitHub Pages"
```

```bash
git branch -M main
git remote add origin https://github.com/USERNAME/akad-tracker.git
git push -u origin main
```

- Ganti `USERNAME` dengan username GitHub Anda.
- Kalau diminta password, gunakan **Personal Access Token**, bukan password akun. Saat mengetik/menempel token, layar memang kosong; itu normal.
- Tanda berhasil: `Writing objects: 100%` dan `* [new branch] main -> main`.

**Membuat token** (bila diminta): `https://github.com/settings/tokens` → **Generate new token (classic)** → Note: `akad-tracker` → Expiration: 90 days → centang **repo** → **Generate token** → salin `ghp_…` (hanya tampil sekali) → jalankan `git push -u origin main` lagi, lalu tempel token sebagai password.

### 1.6 Aktifkan GitHub Pages

Di repository: **Settings** → **Pages**

| Kolom | Nilai |
|---|---|
| Source | Deploy from a branch |
| Branch | **main** · **/ (root)** → Save |
| Enforce HTTPS | ✅ centang |

Tunggu 1–2 menit, lalu refresh. Akan muncul: *Your site is live at `https://USERNAME.github.io/akad-tracker/`*.

Buka alamat itu. Sebelum Bagian 2 dikerjakan, layar masuk **wajar** menampilkan pesan galat dari server, karena `Code.gs` lama belum punya pintu API. Lanjut ke Bagian 2.

---

## Bagian 2 — Perbarui backend (`Code.gs`)

1. Buka proyek Apps Script **AKAD TRACKER** yang sudah ada (akun pemilik yang sama).
2. Buka `Code.gs` → pilih semua (Ctrl+A) → tempel isi **`Code.gs` v2.0** → Simpan (Ctrl+S).
3. **Hapus** empat file HTML lama: `Index`, `Stylesheet`, `JavaScript`, `Form` (titik tiga di samping nama file → **Hapus**). `Impor.gs` boleh dihapus juga, karena impor sudah selesai.
4. `appsscript.json` tidak berubah. Isinya harus tetap `"executeAs": "USER_DEPLOYING"` dan `"access": "ANYONE_ANONYMOUS"`.
5. **Terapkan → Kelola deployment → ikon pensil → Versi: Versi baru → Terapkan.**
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja** (bukan "Siapa saja yang memiliki Akun Google")
   - URL `/exec` **tetap sama**. Jangan membuat "Deployment baru", karena URL-nya akan berganti dan `js/config.js` harus diisi ulang.
6. Uji server: buka `URL_EXEC?action=ping` di browser (tambahkan `?action=ping` di belakang URL `/exec`). Harus tampil teks seperti:
   ```
   {"success":true,"code":"OK","message":"OK","data":{"app":"AKAD TRACKER", ...}}
   ```

Tidak perlu menjalankan `setup` lagi. Izin Drive/Dokumen/Sheets sama seperti v1.10.

---

## Bagian 3 — Uji & beralih

1. Buka `https://USERNAME.github.io/akad-tracker/` → masuk dengan password tim yang sama → pilih nama.
2. Cek cepat: jadwal tampil, ubah satu penghulu (tersimpan), Rekap Modin, Jadwal Bimwin, Export Excel.
3. **Pengaturan → Umum**: link form dan QR sekarang memakai alamat GitHub. QR lama yang sudah dicetak **tetap bisa dipakai**, jadi tidak wajib cetak ulang.
4. Buka link `/exec` lama. Halaman "AKAD TRACKER sudah pindah alamat" harus muncul dan langsung meneruskan ke alamat baru. Ini baru aktif setelah langkah 1 (server mencatat alamat baru saat tim pertama kali masuk).
5. Uji form modin: buka `…/akad-tracker/form.html` di HP → kirim satu jadwal uji → cek di dashboard → hapus.
6. Hapus ikon aplikasi AKAD TRACKER yang pernah dipasang di HP/laptop (PWA lama, folder `akad-tracker-pwa`, atau pintasan `/exec`). Sejak v2.2 aplikasi tidak lagi dipasang; buka lewat browser atau katalog LABUKU EVO.
7. Umumkan alamat baru ke tim. Setiap perangkat cukup masuk sekali.

---

## Bagian 4 — Instalasi baru (belum pernah memasang)

1. Login dengan **akun dinas/kantor** → `https://script.google.com` → **Proyek baru** → beri nama `AKAD TRACKER`.
2. Ganti isi `Code.gs` dengan `Code.gs` v2.0. Tidak ada file HTML yang perlu dibuat.
3. **Setelan proyek (ikon roda gigi)** → centang **Tampilkan file manifes "appsscript.json"** → ganti isinya dengan `appsscript.json` dari paket. Simpan.
4. Pilih fungsi **`setup`** → **▶ Jalankan** → izinkan akses (Tinjau izin → pilih akun → Lanjutan → Buka AKAD TRACKER → Izinkan). Catat **KODE AKTIVASI** di Log eksekusi (juga tertulis di sheet **MULAI_DI_SINI**).
   - Folder Drive **Database by Ahzani Labs / AKAD TRACKER** (Database, Template, Undangan, Daftar Hadir) dan spreadsheet **AKAD_TRACKER_DB** dibuat otomatis. Bila folder **Database by Ahzani Labs** sudah dibuat aplikasi lain (mis. KUA-Link), folder itu yang dipakai.
   - Tambahkan juga berkas **`KUALink.gs`** (**+ → Skrip** → nama `KUALink`) bila ingin tersambung dengan KUA-Link (Bagian 11).
5. **Terapkan → Deployment baru → Aplikasi web** → Jalankan sebagai **Saya**, akses **Siapa saja** → **Terapkan** → salin URL `/exec`.
6. Kerjakan **Bagian 1** (isi `js/config.js` dengan URL itu).
7. Buka alamat GitHub → layar **Aktivasi Pertama** → masukkan kode aktivasi → buat password tim → **Aktifkan & Masuk**.
8. Lengkapi **Pengaturan**: Desa, Modin + nomor WA, Penghulu + warna, Tim, Umum (Kabupaten, logo), Bimwin (template).

---

## Bagian 5 — Memperbarui di kemudian hari

**Perubahan tampilan** (berkas di folder `akad-tracker`): dari Git Bash di folder itu:

```bash
git add .
git commit -m "Deskripsi singkat perubahan"
git push
```

GitHub Pages memperbarui situs dalam 1–2 menit. Di HP, tutup lalu buka ulang aplikasi. Di laptop, tekan **Ctrl+Shift+R**.

**Perubahan server** (`Code.gs`): tempel kode baru → **Kelola deployment → Versi baru**. `js/config.js` tidak perlu diubah selama URL `/exec` sama.

---

## Bagian 6 — Masalah umum

| Yang terlihat | Penyebab | Solusi |
|---|---|---|
| Layar masuk: "Alamat server belum diatur…" | `js/config.js` belum diisi | Isi `GAS_URL`, lalu `git add .` → `git commit -m "isi config"` → `git push` |
| "Server mengirim halaman, bukan data…" | `Code.gs` belum v2.0, akses deployment bukan **Siapa saja**, atau URL yang dipakai `/dev` | Kerjakan ulang Bagian 2 langkah 2–5. Salin URL dari **Kelola deployment** (berakhiran `/exec`) |
| "Fungsi API tidak dikenal" | `Code.gs` di Apps Script masih versi lama atau belum di-deploy versi baru | Bagian 2 langkah 5 |
| "Koneksi bermasalah…" | Internet putus, atau Apps Script sedang lambat | Coba lagi; data yang sudah tampil tetap aman |
| Link `/exec` lama menampilkan "Minta link terbaru ke admin KUA" | Server belum tahu alamat baru | Masuk sekali di alamat GitHub (Bagian 3 langkah 1) |
| Situs 404, dan di GitHub terlihat folder `akad-tracker/` di dalam repository | `git init` dijalankan satu level terlalu tinggi | `cd` ke folder yang berisi `index.html`, lalu `git init` → `git add .` → `git commit` → `git push -u origin main --force` (menimpa isi repository yang salah) |
| Tampilan polos tanpa warna | Folder `css/` atau `js/` tidak ikut terunggah | Selalu push lewat terminal, jangan "Upload files" di web GitHub |
| Masih tampil versi lama | Cache browser | Ctrl+Shift+R, atau tutup lalu buka ulang aplikasi |
| `Password authentication is not supported` | GitHub tidak menerima password akun | Buat Personal Access Token (Bagian 1.5) |
| `remote origin already exists` | Remote sudah pernah dipasang | Lewati, lanjut `git push` |

**Repository PWA lama.** Kalau dulu folder `akad-tracker-pwa` sudah diunggah ke GitHub Pages, repository itu bisa dipakai lagi agar alamat yang sudah dipasang di HP tidak berubah:

1. Clone repository itu: `git clone https://github.com/USERNAME/NAMA-REPO.git`, lalu `cd NAMA-REPO`.
2. Hapus isi lamanya: `git rm -r -q .`
3. Salin **seluruh isi** folder `akad-tracker` baru ke folder ini (`index.html` harus berada langsung di folder ini).
4. Lalu jalankan:
   ```bash
   git add .
   git commit -m "Ganti cangkang PWA dengan aplikasi v2.0"
   git push
   ```

---

## Bagian 7 — Catatan teknis

- **Arsitektur v2.0.** `index.html`/`form.html` (GitHub Pages) → `fetch` POST ke `/exec`, dengan body JSON `{ fn, args }` dan `Content-Type: text/plain`. Jenis ini tidak memicu preflight CORS yang ditolak Apps Script. `doPost` hanya menjalankan fungsi yang ada di daftar `apiTable_()`, lalu membalas `{ success, code, message, data }` dalam format yang sama seperti v1.10.
- **Keamanan lebih ketat dari v1.10.** Dulu `google.script.run` bisa memanggil fungsi apa pun di `Code.gs` yang namanya tidak berakhiran `_`, termasuk `resetPassword` dan `isiDataContoh`. Kini hanya fungsi aplikasi di daftar putih yang bisa dipanggil dari luar. Fungsi pemeliharaan (`setup`, `resetPassword`, `isiDataContoh`, `kapitalkanNamaCatin`, `bersihkanCache`) hanya bisa dijalankan dari editor.
- **Akses "Siapa saja" (tanpa login Google) wajib.** Permintaan dari GitHub dikirim tanpa cookie Google. Data tetap dilindungi password tim dan token sesi, sama seperti sebelumnya. Hanya data layar masuk (nama KUA, logo) dan form publik yang terbuka.
- **Alamat frontend dicatat otomatis** (Script Properties `FRONTEND_URL`), hanya dari sesi tim yang sudah masuk dan hanya alamat `https`. Alamat ini dipakai untuk meneruskan link/QR `/exec` lama dan untuk sheet MULAI_DI_SINI.
- **Buka lebih cepat.**
  - Data layar masuk dan daftar desa/modin di form disimpan di perangkat, jadi halaman langsung tampil lalu diperbarui di latar belakang.
  - Data jadwal memakai salinan terakhir seperti v1.10. Tombol **Keluar** menghapus salinan jadwal.
- **PWA dihapus (v2.2).** `manifest.webmanifest` dihapus, dan panel "Pasang sebagai aplikasi" di Pengaturan ditiadakan. `sw.js` kini hanya pemutus: perangkat yang dulu memasang service worker akan menghapus cache lamanya dan mencabut service worker itu sendiri. Hal yang sama juga dilakukan `js/api.js` setiap kali aplikasi dibuka.
- **Bug "Maaf, saat ini tidak dapat membuka file"** di HP yang login dengan akun pemilik script tidak lagi berlaku untuk dashboard. Aplikasi tidak dibuka lewat halaman Google lagi, dan permintaan data dikirim tanpa akun Google.
- **Lupa password:** di editor, jalankan **`resetPassword`**. Semua perangkat keluar dan kode aktivasi baru muncul di Log eksekusi serta sheet MULAI_DI_SINI. Buka dashboard, lalu aktivasi ulang.
- **Uji coba:** jalankan **`isiDataContoh`** di editor untuk menambah 4 akad contoh hari ini. Hapus setelah selesai.
- **Menu bawah HP:** bila tombol navigasi HP menutupi tulisan menu, buka **Pengaturan → Umum → Menu bawah (khusus HP ini)**, lalu nyalakan **Beri jarak aman di bawah menu**.
- **Fitur & aturan aplikasi tidak berubah dari v1.10:**
  - urutan Jadwal;
  - tombol AKSI;
  - format Rekap Modin;
  - status otomatis;
  - Filter Tanggal;
  - modul Bimwin (template `{{…}}`, sesi, kehadiran, PDF);
  - arsip per tahun;
  - nama catin KAPITAL;
  - logo di sheet SETTING;
  - kunci 5 menit setelah 5× salah password.

  Cara memakai modul Bimwin ada di Bagian 8.

---

## Bagian 8 — Modul Bimwin (tidak berubah dari v1.10)

**Template (sekali saja)**

1. Buat dokumen di **Google Docs** dengan akun pemilik aplikasi: kop, isi surat, tanda tangan.
2. Tulis field di tempat yang diinginkan. Field ini bisa disalin dari **Pengaturan → Bimwin**: `{{nomor_surat}}`, `{{tanggal_surat}}`, `{{hari}}`, `{{tanggal}}`, `{{hari_tanggal}}`, `{{jam}}`, `{{tempat}}`, `{{keterangan}}`, `{{jumlah_pasangan}}`, `{{nama_kua}}`, `{{kabupaten}}`. Penulisan harus sama persis, huruf kecil.
3. Tulis `{{TABEL}}` di baris tersendiri, di tempat tabel nama / daftar hadir akan diletakkan. Tanpa penanda ini, tabel ditaruh di halaman baru di akhir dokumen. **(v2.1)** `{{TABEL}}` boleh ditulis lebih dari sekali: setiap penanda diisi tabel peserta yang sama. Lebar tabel otomatis selebar area tulis halaman (rata kiri-kanan), mengikuti ukuran kertas dan margin template. Daftar Hadir punya 8 kolom, jadi atur template-nya **landscape** (File → Penyiapan halaman → Lanskap).
4. Salin link dokumen → **Pengaturan → Bimwin** → tempel → **Pasang**. Aplikasi menyimpan salinannya di folder `Template`. Perubahan berikutnya cukup lewat tombol **Buka & edit template**, tanpa perlu dipasang ulang.
   - Punya file Word? Unggah ke Drive → **Buka dengan Google Dokumen** → **File → Simpan sebagai Google Dokumen**, lalu tempel link hasilnya.
   - Field `{{keterangan}}` yang kosong dan berdiri sendiri di satu baris akan dihapus barisnya.

**Alur mingguan**

1. **Bimwin → Catin**: centang pasangan (atau **Pilih semua yang Belum**) → **Buat Sesi**. Isi tanggal, jam, tempat, keterangan (opsional), dan nomor surat. Nomor surat terakhir otomatis muncul lagi untuk diedit.
2. **Bimwin → Sesi**:
   - **Undangan PDF**, **Daftar Hadir PDF** / **Excel**. PDF juga tersimpan di folder Drive.
   - **Kirim WA**: buka WhatsApp, pilih grup, lalu lampirkan PDF undangan bersama teks yang sudah terisi.
3. Setelah bimbingan: **Kehadiran** → **Semua hadir** → hapus centang yang tidak hadir → **Simpan**.
   - Hadir menjadi **Sudah Bimwin**.
   - Yang tidak hadir kembali **Belum Bimwin**. Namanya tetap tercatat di sesi itu dan bisa dimasukkan ke sesi minggu berikutnya.
4. Status juga bisa diubah langsung dari modul **Jadwal**: kolom **Bimwin** di tabel desktop, atau tombol **Ubah** di detail jadwal di HP.

Aturan:
- Hanya pasangan berstatus **Belum** yang bisa dimasukkan ke sesi.
- Menghapus sesi mengembalikan pesertanya yang belum hadir ke **Belum**.
- Tidak ada peringatan otomatis. Pantau lewat filter **Belum** di modul Bimwin.

---

## Bagian 9 — Perubahan v2.1

- **Sesi login permanen.** Setelah masuk, perangkat tetap masuk sampai pengguna menekan **Keluar**. Sesi juga berakhir bila password diganti (Pengaturan) atau `resetPassword` dijalankan. Ini sengaja dipertahankan: itulah satu-satunya cara mencabut akses HP yang hilang. Token lama (versi dengan batas 30 hari) otomatis dijadikan permanen saat dipakai lagi.
  - Catatan iPhone: Safari bisa menghapus data situs yang lama tidak dibuka. Bila itu terjadi, cukup masuk sekali lagi.
- **Urutan Bimwin.** Daftar Catin, peserta di tab Sesi, tabel PDF Undangan, tabel PDF/Excel Daftar Hadir, dan daftar di pesan WA diurutkan menurut desa (A–Z), lalu tanggal akad terdekat, lalu jam.
- **Daftar Hadir: satu baris per pasangan.** Kolomnya: No · Nama Catin Pria · Nama Catin Wanita · Desa · Tanggal Akad · No. HP · TTD Catin Pria · TTD Catin Wanita, lalu baris kosong.
- **Tabel PDF selebar halaman** dan **`{{TABEL}}` boleh lebih dari satu** (lihat Bagian 8 langkah 3).
- **Sesi Bimwin baru** otomatis berisi jam, tempat, dan keterangan dari sesi terakhir. Nomor surat terakhir tetap muncul seperti sebelumnya. Tanggal tetap dikosongkan.
- **Dibuka dari aplikasi LABUKU EVO (katalog).** Lihat Bagian 10: sejak v2.2 AKAD TRACKER bukan PWA lagi, sehingga terbuka sebagai tab biasa (dengan tombol ✕ untuk kembali ke katalog). Syaratnya, ikon aplikasi AKAD TRACKER lama sudah dihapus dari HP.

---

## Bagian 10 — Perubahan v2.2: PWA AKAD TRACKER dihapus

- AKAD TRACKER **tidak bisa dipasang lagi** sebagai aplikasi.
  - Berkas `manifest.webmanifest` dihapus.
  - Meta tag "web app" untuk Android/iPhone dihapus.
  - Panel **Pasang sebagai aplikasi** di Pengaturan → Umum ditiadakan.
- **Pembersihan otomatis.** Saat AKAD TRACKER dibuka, service worker dan cache PWA lama di perangkat itu otomatis dihapus.
- **Ikon yang sudah terpasang di HP/laptop tidak bisa dihapus dari kode.** Hapus manual sekali per perangkat:
  - Android: tekan lama ikon AKAD TRACKER → **Copot pemasangan / Hapus**.
  - iPhone: tekan lama ikon → **Hapus Bookmark**.
  - Laptop Chrome/Edge: buka `chrome://apps` (atau `edge://apps`) → klik kanan AKAD TRACKER → **Hapus**.
- **Sesudah ikon dihapus,** kartu AKAD TRACKER di katalog LABUKU EVO membuka AKAD TRACKER sebagai tab di atas katalog. Tombol ✕ / kembali mengembalikan ke katalog, tidak lagi "diambil alih".
- **Untuk tim yang tidak memakai katalog,** simpan alamat `https://USERNAME.github.io/akad-tracker/` sebagai bookmark browser.
- **Saat memperbarui repository,** hapus `manifest.webmanifest` dari repository: jalankan `git rm manifest.webmanifest`, lalu commit & push. `sw.js` **jangan dihapus**, karena masih dibutuhkan untuk membersihkan perangkat lama.

---

## Bagian 11 — Perubahan v2.3: folder "Database by Ahzani Labs" & integrasi KUA-Link

### 11.1 Folder Drive

```
My Drive/
└── Database by Ahzani Labs/      ← folder utama semua aplikasi Ahzani Labs (dipakai bersama KUA-Link)
    ├── AKAD TRACKER/             ← dulu "AKAD TRACKER by Ahzani Labs" di My Drive
    │   ├── Database/  (AKAD_TRACKER_DB)
    │   ├── Template/  Undangan/  Daftar Hadir/
    └── KUA-Link/ …
```

- Tidak ada langkah manual. Pada pemanggilan server pertama setelah `Code.gs` v2.3 ditempel dan di-deploy, folder lama **dipindah utuh** ke dalam **Database by Ahzani Labs** lalu diberi nama **AKAD TRACKER**.
- Bila **Database by Ahzani Labs** sudah ada (dibuat KUA-Link), folder itu yang dipakai. Bila belum ada, folder itu dibuat.
- ID folder dan file tidak berubah, jadi link spreadsheet, template, undangan, dan daftar hadir lama tetap bisa dibuka.
- Pemindahan hanya terjadi sekali (dicatat di Script Properties `APP_DI_INDUK`).
- Jangan membuat dua folder bernama **Database by Ahzani Labs**. Bila terlanjur ada dua, gabungkan isinya lalu buang yang kosong ke Sampah.

### 11.2 Integrasi KUA-Link → AKAD TRACKER

**Cara kerja:**

- KUA-Link mengirim data saat desa membuat **paket surat (cetak)** untuk pengajuan nikah di wilayah.
- **Tanpa tombol, tanpa trigger** di AKAD TRACKER.
- Kirim ulang (cetak ulang) tidak membuat jadwal dobel. Kuncinya adalah **nomor pengajuan KUA-Link**, yang disimpan di kolom **No. Pendaftaran**.

| Kejadian di KUA-Link | Hasil di AKAD TRACKER |
|---|---|
| Pengajuan baru dicetak | Jadwal baru, sumber **KUA-Link (desa)**, badge **KUA-Link** di kartu, tautan **Berkas Desa** (PDF) di detail |
| Data diubah desa lalu dicetak ulang | Hanya field yang **diubah desa** yang ditimpa. Perubahan tim KUA (jam, penghulu, catatan, modin) tetap |
| Pengajuan dibatalkan | Status **BATAL** dengan tanda "perlu dicek". Data tidak dihapus dan riwayat tetap ada |
| Pengajuan diaktifkan lagi | Kembali **TERJADWAL** (hanya bila sebelumnya dibatalkan oleh KUA-Link) |
| Jenis pengajuan berubah menjadi rekomendasi | Diperlakukan sebagai BATAL |

**Pemetaan data:**

| AKAD TRACKER | Diisi dari data KUA-Link |
|---|---|
| Catin pria / wanita | Nama suami / istri (otomatis KAPITAL) |
| Wali | NASAB / HAKIM |
| Tanggal, Jam | Tanggal dan jam akad |
| Tempat | KANTOR bila lokasi akad "Kantor…", selain itu LUAR KANTOR |
| Desa | Nama desa pengaju |
| Keterangan | Alamat akad · nama wali (hubungan) / alasan wali hakim · syibhul iddah · "Dari KUA-Link · Desa …" |
| Modin, Penghulu | **Tidak dikirim KUA-Link** — diisi tim KUA |

**Langkah pemasangan (sekali):**

1. Apps Script AKAD TRACKER → `Code.gs` → pilih semua → tempel **`Code.gs` v2.3** → Simpan.
2. **+ → Skrip** → beri nama `KUALink` → tempel isi **`KUALink.gs`** → Simpan.
3. Pilih fungsi **`aturKunciKUALink`** → **▶ Jalankan**. Salin kunci **`AKD-…`** dari Log eksekusi.
   - Kunci hanya tersimpan di Script Properties (`KUALINK_KEY`).
   - **Jangan** menaruh kunci itu di `js/config.js` atau di GitHub.
4. **Terapkan → Kelola deployment → pensil → Versi baru → Terapkan.** URL `/exec` tetap sama.
5. GitHub: timpa **`js/app.js`** dengan versi v2.3 → `git add . && git commit -m "v2.3 KUA-Link" && git push`. **`js/config.js` jangan ditimpa.**
6. KUA-Link → **Data Master → Integrasi & WhatsApp → Akad Tracker**:
   - URL: URL `/exec` AKAD TRACKER (sama dengan `GAS_URL` di `js/config.js`);
   - Kunci: `AKD-…`;
   - **Simpan → Uji Koneksi** → harus muncul "Kunci cocok".
7. Uji: buat satu pengajuan uji di KUA-Link → cetak paket → cek jadwal muncul di AKAD TRACKER dengan badge KUA-Link → batalkan di KUA-Link → status jadi BATAL → hapus jadwal uji.

**Bila bermasalah:**

| Gejala | Penyebab & solusi |
|---|---|
| Uji Koneksi: "Kunci KUA-Link belum dibuat" | Langkah 3 belum dijalankan, atau deploy (langkah 4) belum dibuat versi baru |
| "Kunci KUA-Link salah" | Salin ulang kunci tanpa spasi. Mengganti kunci = jalankan `aturKunciKUALink` lagi lalu tempel kunci baru di KUA-Link |
| "Terlalu banyak percobaan kunci salah" | 5 kali kunci salah → dikunci 5 menit. Tunggu, lalu perbaiki kunci |
| "Fungsi API tidak dikenal: kualinkMasuk" | `Code.gs` masih versi lama, atau deploy belum versi baru |
| Kiriman gagal | Tidak menghambat cetak di KUA-Link. KUA-Link mencoba ulang otomatis tiap 30 menit |
