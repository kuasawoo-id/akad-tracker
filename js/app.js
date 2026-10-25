/* AKAD TRACKER — aplikasi dashboard (dari JavaScript.html v1.10; hanya lapisan koneksi yang diganti) */
/* ============================================================
   AKAD TRACKER — Logika client Dashboard (SPA)
   Prinsip instant UX:
   1) SPA: semua view dimuat sekali, navigasi show/hide (0 ms, URL tidak berubah)
   2) Optimistic UI: aksi cepat langsung tampil, sinkron server di latar (antrian per jadwal)
   3) Data lokal: filter/cari/ringkasan dihitung dari state lokal (tanpa round-trip)
   4) Batch: 1 panggilan getBootstrap untuk master + setting + jadwal
   ============================================================ */
(function () {
'use strict';

// ── Konstanta & state ────────────────────────────────────────
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const LS = { token: 'akd_token', who: 'akd_who', sum: 'akd_sum', bootCache: 'akd_boot_cache' };
const REFRESH_MS = 120000;
const DESK = window.matchMedia('(min-width: 1024px)');
// PENTING: jangan menulis dua garis miring berurutan di luar komentar.
// HtmlService membuang komentar dengan tokenizer yang tidak mengenal template literal,
// sehingga 'https:' + garis miring ganda di dalam backtick memotong kode (layar macet "Memuat…").
const WA_BASE = ['https:', '', 'wa.me', ''].join('/');

const TINDAKAN = {
  nopeng: 'Belum Ada Penghulu', ulang: 'Perlu Kirim Ulang',
  dup: 'Kemungkinan Duplikat', batal_cek: 'Batal — Perlu Dicek', bentrok: 'Bentrok'
};
// Status otomatis (tidak diisi manual): Terjadwal = tanggal+jam belum lewat, Terlaksana = sudah lewat
const STATUS_LBL = { TERJADWAL: 'Terjadwal', TERLAKSANA: 'Terlaksana' };
const AKSI_LBL = { BIMWIN: 'Bimwin', CREATE: 'Jadwal dibuat', UPDATE: 'Diubah', ASSIGN: 'Penugasan', VERIFY: 'Verifikasi', STATUS: 'Status', SEND_CATIN: 'Kirim ke catin', SEND_MODIN: 'Rekap ke modin', ARCHIVE: 'Diarsipkan', RESTORE: 'Dipulihkan', DELETE: 'Dihapus' };
const FIELD_LBL = { bimwin_status: 'Status bimwin', catin_pria: 'Catin pria', catin_wanita: 'Catin wanita', wali: 'Wali', tanggal: 'Tanggal', jam: 'Jam', tempat: 'Tempat', desa: 'Desa', modin: 'Modin', penghulu: 'Penghulu', no_pendaftaran: 'No. pendaftaran', keterangan: 'Keterangan', status: 'Status', verifikasi: 'Verifikasi', kirim_status: 'Status kirim', batal_alasan: 'Alasan batal', batal_oleh: 'Dibatalkan oleh', batal_perlu_cek: 'Batal perlu dicek', duplikat_flag: 'Tanda duplikat', arsip: 'Arsip', rekap_modin: 'Rekap' };

const S = {
  token: null, who: '', boot: null, jadwal: [], today: '', serverNow: '',
  view: 'jadwal', tab: 'bulan',
  f: { penghulu: '', tindakan: '', status: '', tempat: '', wali: '', from: '', to: '', bulan: false, q: '' },
  skew: 0,
  range: { from: '', to: '' }, customRange: false,
  selectedId: null, queue: {}, pending: {}, bentrok: {},
  bimwin: [], bwPending: 0, idMap: {},
  bw: { tab: 'catin', st: 'BELUM', q: '', sel: {} },
  rekap: { tanggal: '', modin: '', onlyDesa: false, penghulu: '' },
  setTab: 'desa', mdraft: {}, arsipList: null,
  scrollToday: false, lastSync: null, memStore: {}
};
window.AKD = S; // untuk debugging di konsol

// ── Util umum ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls) => `<svg class="icon ${cls || ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const pad = (n) => ('0' + n).slice(-2);
const clone = (o) => JSON.parse(JSON.stringify(o));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** localStorage aman (bisa gagal di browser dalam aplikasi WhatsApp) — fallback memori. */
function lsGet(k) { try { const v = localStorage.getItem(k); return v === null ? (S.memStore[k] ?? null) : v; } catch (e) { return S.memStore[k] ?? null; } }
function lsSet(k, v) { S.memStore[k] = v; try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
/** v1.9: menu bawah HP rapat ke dasar layar (default). Jarak aman sistem hanya bila dinyalakan di Pengaturan. */
const navSafeOn = () => lsGet('akd_nav_safe') === '1';
const applyNavSafe = () => document.documentElement.classList.toggle('nav-rapat', !navSafeOn());
applyNavSafe();
function safeInsetPx() {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;visibility:hidden;height:env(safe-area-inset-bottom, 0px)';
  document.body.appendChild(d); const h = Math.round(d.getBoundingClientRect().height); d.remove(); return h;
}

// Tanggal (disimpan sebagai teks yyyy-MM-dd → tidak bergeser zona waktu)
const pd = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const ds = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const hariOf = (s) => HARI[pd(s).getDay()];
const tglOf = (s) => { const d = pd(s); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const fmtLong = (s) => s ? `${hariOf(s)}, ${tglOf(s)}` : '—';
const fmtDM = (s) => { const d = pd(s); return `${d.getDate()} ${BLN3[d.getMonth()]}`; };
const jamDot = (j) => String(j || '').replace(':', '.');
const toMin = (j) => { const p = String(j || '0:0').split(':'); return (+p[0]) * 60 + (+p[1]); };
function weekRange(t) { const d = pd(t); const dow = (d.getDay() + 6) % 7; const mon = addDays(t, -dow); return [mon, addDays(mon, 6)]; }
function yearRange(t) { const y = String(t).slice(0, 4); return [y + '-01-01', y + '-12-31']; }
// Pilihan jam per 30 menit (05.00–21.30) — permohonan waktu akad per 30 menit
const JAM_OPTS = (() => { const o = []; for (let h = 5; h <= 21; h++) { o.push(pad(h) + ':00'); o.push(pad(h) + ':30'); } return o; })();
function monthRange(t) { const d = pd(t); return [ds(new Date(d.getFullYear(), d.getMonth(), 1)), ds(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
function stampShort(s) {
  if (!s) return '';
  const [dPart, tPart] = String(s).split(' ');
  if (!dPart || dPart.length < 10) return s;
  return `${fmtDM(dPart)} ${(tPart || '').slice(0, 5).replace(':', '.')}`;
}
const firstWord = (s) => String(s || '').trim().split(/\s+/)[0] || '';
/** Rekap modin: kata pertama nama, huruf awal besar ("AHMAD FAUZAN" → "Ahmad"). */
const namaDepan = (s) => { const w = firstWord(s).toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); };
const tempatLbl = (t) => t === 'KANTOR' ? 'Kantor KUA' : 'Luar Kantor';
const tempatShort = (t) => t === 'KANTOR' ? 'Kantor' : 'Luar Kantor';
const waliLbl = (w) => w === 'HAKIM' ? 'Hakim' : 'Nasab';
/** Nama catin selalu KAPITAL (sama dengan aturan server). */
const upName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();

// ── Master helpers ───────────────────────────────────────────
const penghuluList = (all) => (S.boot ? S.boot.penghulu : []).filter((p) => all || p.aktif);
function colorOf(nama) { const p = (S.boot ? S.boot.penghulu : []).find((x) => x.nama === nama); return p ? p.warna_hex : '#475569'; }
/**
 * Daftar "Masuk sebagai siapa": Tim aktif + nama penghulu aktif TERBARU dari master Penghulu.
 * Baris Tim berlabel Penghulu yang namanya sudah tidak ada di master Penghulu (mis. "Penghulu A"
 * setelah diganti nama) tidak ditampilkan.
 */
function whoOptions() {
  const peng = penghuluList().map((p) => p.nama);
  const out = [];
  const seen = {};
  const add = (nama, label) => { const k = String(nama).toLowerCase(); if (!nama || seen[k]) return; seen[k] = true; out.push({ nama, label }); };
  (S.boot ? S.boot.tim || [] : []).forEach((t) => {
    if (!t.aktif) return;
    if (t.label === 'Penghulu' && peng.indexOf(t.nama) < 0) return;
    add(t.nama, t.label);
  });
  peng.forEach((n) => add(n, 'Penghulu'));
  return out;
}
function labelOfWho(n) { const t = whoOptions().find((x) => x.nama === n); return t ? t.label : ''; }

/** Jam sekarang (jam perangkat dikoreksi ke jam server) → 'yyyy-MM-dd HH:mm'. */
function nowKey() { const d = new Date(Date.now() + (S.skew || 0)); return `${ds(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function setSkew(serverNow) { const t = new Date(String(serverNow || '').replace(' ', 'T')).getTime(); if (!isNaN(t)) S.skew = t - Date.now(); }
const isPast = (j) => `${j.tanggal} ${j.jam || '00:00'}` <= nowKey();
const autoStatus = (j) => isPast(j) ? 'TERLAKSANA' : 'TERJADWAL';
const byId = (id) => S.jadwal.find((j) => j.id === id);
const settings = () => (S.boot ? S.boot.settings : {});
const kuaName = () => 'KUA ' + (settings().nama_kua || (window.__BOOT__ && window.__BOOT__.nama_kua) || 'Sawoo');

// ============================================================
// API — fetch ke Web App Apps Script (REST JSON) berbasis Promise
// Amplop & penanganan galat sama persis dengan versi HtmlService sebelumnya.
// ============================================================
function api(fn, ...args) {
  return new Promise((resolve, reject) => {
    window.AkdApi.call(fn, args).then((res) => {
      if (!res) { reject({ code: 'ERROR', message: 'Respons server kosong.' }); return; }
      if (res.success) {
        if (fn === 'getBootstrap' && res.data) res.data.appUrl = window.AkdApi.base;   // link dashboard & form = alamat frontend ini
        resolve(res.data); return;
      }
      if (res.code === 'AUTH') authLost(res.message);
      reject(res);
    }, (err) => reject({ code: 'NETWORK', message: (err && err.message) || 'Koneksi bermasalah. Coba lagi.' }));
  });
}

function authLost(msg) {
  lsSet(LS.token, null);
  lsSet(LS.bootCache, null);
  S.token = null;
  closeAll();
  showScreen('login');
  $('loginSub').textContent = msg || 'Sesi berakhir. Silakan masuk kembali.';
}

// ============================================================
// Toast & modal
// ============================================================
function toast(msg, type, action) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  const ic = type === 'ok' ? 'check-circle' : type === 'err' ? 'x-circle' : type === 'warn' ? 'alert' : 'info';
  el.innerHTML = `${icon(ic)}<div>${esc(msg)}</div>${action ? `<button class="t-act">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('.t-act').onclick = () => { action.fn(); el.remove(); };
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), action ? 7000 : (type === 'err' ? 6000 : 3200));
}

function errMsg(e) { return (e && e.message) || 'Terjadi kesalahan.'; }

/**
 * Modal generik. opts: { title, body (HTML), foot (HTML), onMount(el), dismissable }
 */
function openModal(opts) {
  const m = $('modal');
  m.innerHTML = `<div class="sheet-handle"></div>
    <div class="sheet-head"><div><h2>${opts.title}</h2>${opts.sub ? `<div class="small muted mt8">${opts.sub}</div>` : ''}</div>
    ${opts.dismissable === false ? '' : `<button class="btn btn-ghost btn-icon x" data-act="modal-close" aria-label="Tutup">${icon('x')}</button>`}</div>
    <div class="sheet-body">${opts.body || ''}</div>${opts.foot ? `<div class="sheet-foot">${opts.foot}</div>` : ''}`;
  m.dataset.dismissable = opts.dismissable === false ? '0' : '1';
  $('modalBackdrop').classList.add('show');
  m.classList.add('show');
  if (opts.onMount) opts.onMount(m);
  const f = m.querySelector('[autofocus]');
  if (f) setTimeout(() => f.focus(), 250);
  return m;
}
function closeModal(force) {
  const m = $('modal');
  if (!force && m.dataset.dismissable === '0') return;
  m.classList.remove('show');
  $('modalBackdrop').classList.remove('show');
}
const modalOpen = () => $('modal').classList.contains('show');

/** Konfirmasi sederhana → Promise<boolean>. */
function confirmBox(title, html, okLabel, okCls) {
  return new Promise((resolve) => {
    openModal({
      title, body: `<div>${html}</div>`,
      foot: `<button class="btn" data-x="no">Batal</button><button class="btn ${okCls || 'btn-primary'}" data-x="yes">${okLabel || 'Ya'}</button>`,
      onMount: (m) => {
        m.querySelector('[data-x="no"]').onclick = () => { closeModal(true); resolve(false); };
        m.querySelector('[data-x="yes"]').onclick = () => { closeModal(true); resolve(true); };
      }
    });
  });
}

function setBtnBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${label ? ' ' + esc(label) : ''}`; }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

function closeAll() { closeModal(true); closeDetail(); }

// ============================================================
// Layar & navigasi SPA
// ============================================================
function showScreen(name) {
  $('screenBoot').hidden = name !== 'boot';
  $('screenLogin').hidden = name !== 'login';
  $('screenActivate').hidden = name !== 'activate';
  $('screenApp').hidden = name !== 'app';
  if (name === 'login') setTimeout(() => $('pw').focus(), 50);
  if (name === 'activate') setTimeout(() => $('actCode').focus(), 50);
}

function navigateTo(view) {
  S.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === view));
  $('fab').hidden = view !== 'jadwal';
  if (view !== 'jadwal') closeDetail();
  if (view === 'bimwin') renderBimwin();
  if (view === 'rekap') renderRekap();
  if (view === 'setting') renderSetting();
  window.scrollTo(0, 0);
}

// ============================================================
// Badge, bentrok, filter
// ============================================================
function computeBentrok() {
  const jarak = Number(settings().jarak_bentrok_menit) || 60;
  const groups = {};
  S.jadwal.forEach((j) => {
    if (j.arsip || j.status !== 'TERJADWAL' || !j.penghulu) return;
    const k = j.penghulu + '|' + j.tanggal;
    (groups[k] = groups[k] || []).push(j);
  });
  const out = {};
  Object.values(groups).forEach((g) => {
    for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) {
      if (Math.abs(toMin(g[a].jam) - toMin(g[b].jam)) < jarak) {
        (out[g[a].id] = out[g[a].id] || []).push(g[b].id);
        (out[g[b].id] = out[g[b].id] || []).push(g[a].id);
      }
    }
  });
  S.bentrok = out;
}

/** Bentrok hipotetis untuk peringatan saat memilih penghulu / menyimpan. */
function bentrokFor(j, penghulu, tanggal, jam) {
  if (!penghulu) return [];
  const jarak = Number(settings().jarak_bentrok_menit) || 60;
  return S.jadwal.filter((x) => x.id !== (j && j.id) && !x.arsip && x.status === 'TERJADWAL' && x.penghulu === penghulu &&
    x.tanggal === tanggal && Math.abs(toMin(x.jam) - toMin(jam)) < jarak);
}

function flagsOf(j) {
  const f = [];
  if (j.status === 'BATAL') {
    f.push('batal');
    if (j.batal_perlu_cek) f.push('batal_cek');
    return f;
  }
  if (j.duplikat_flag) f.push('dup');
  // Status otomatis: tanggal + jam akad sudah lewat → Terlaksana (peringatan lain tidak relevan lagi)
  if (isPast(j)) { f.push('terlaksana'); return f; }
  if (S.bentrok[j.id]) f.push('bentrok');
  if (!j.penghulu) f.push('nopeng');
  if (j.kirim_status === 'PERLU_ULANG') f.push('ulang');
  f.push('terjadwal');
  return f;
}
const BADGE = {
  batal: ['b-danger', 'x', 'Batal', 1], batal_cek: ['b-warn', 'alert', 'Batal — Perlu Dicek', 1],
  verif: ['b-warn', 'alert', 'Perlu Verifikasi', 2], dup: ['b-warn', 'layers', 'Kemungkinan Duplikat', 2],
  bentrok: ['b-clash', 'alert', 'Bentrok', 3], nopeng: ['b-warn', 'alert', 'Belum Ada Penghulu', 3],
  ulang: ['b-warn', 'send', 'Perlu Kirim Ulang', 4], selesai: ['b-success', 'check', 'Selesai', 5],
  terlaksana: ['b-success', 'check', 'Terlaksana', 5],
  terjadwal: ['b-neutral', '', 'Terjadwal', 6]
};
function badgeHtml(k) { const b = BADGE[k]; return `<span class="badge ${b[0]}">${b[1] ? icon(b[1]) : ''}${b[2]}</span>`; }
function badgesHtml(j, max) {
  const fl = flagsOf(j).sort((a, b) => BADGE[a][3] - BADGE[b][3]);
  const shown = max ? fl.slice(0, max) : fl;
  const more = fl.length - shown.length;
  return shown.map(badgeHtml).join('') + (more > 0 ? `<span class="badge b-more">+${more}</span>` : '');
}
const ACTION_KEYS = ['dup', 'bentrok', 'nopeng', 'ulang', 'batal_cek'];
const needsAction = (j) => flagsOf(j).some((k) => ACTION_KEYS.indexOf(k) >= 0);

function tabRange(tab) {
  if (tab === 'hari') return [S.today, S.today];
  if (tab === 'minggu') return weekRange(S.today);
  if (tab === 'bulan') return monthRange(S.today);
  if (tab === 'tahun') return yearRange(S.today);
  if (tab === 'filter') return [S.f.from || '', S.f.to || ''];
  return [S.range.from || '', S.range.to || ''];
}

function filtered(opts) {
  const o = opts || {};
  const tab = o.tab || S.tab;
  const f = o.f || S.f;
  const [from, to] = tabRange(tab);
  const [mFrom, mTo] = monthRange(S.today);
  const q = norm(f.q);
  return S.jadwal.filter((j) => {
    if (j.arsip) return false;
    if (from && j.tanggal < from) return false;
    if (to && j.tanggal > to) return false;
    if (f.bulan && (j.tanggal < mFrom || j.tanggal > mTo)) return false;
    if (o.penghuluOnly !== undefined) { if (j.penghulu !== o.penghuluOnly) return false; }
    else if (f.penghulu) { if (f.penghulu === '__none' ? !!j.penghulu : j.penghulu !== f.penghulu) return false; }
    if (f.status && autoStatus(j) !== f.status) return false;
    if (f.tempat && j.tempat !== f.tempat) return false;
    if (f.wali && j.wali !== f.wali) return false;
    if (f.tindakan) {
      const fl = flagsOf(j);
      if (f.tindakan === 'any' ? !fl.some((k) => ACTION_KEYS.indexOf(k) >= 0) : fl.indexOf(f.tindakan) < 0) return false;
    }
    if (q) {
      const hay = norm(j.catin_pria + ' ' + j.catin_wanita + ' ' + j.desa + ' ' + j.no_pendaftaran);
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }).sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
}

/**
 * Urutan modul Jadwal (prinsip persiapan): tanggal TERBARU di atas → terlama di bawah.
 * Dalam satu hari: belum ada penghulu paling atas, lalu per penghulu (urutan master), jam terpagi dulu.
 */
function sortForView(list) {
  const order = {};
  penghuluList(true).forEach((p, i) => { order[p.nama] = i + 1; });
  const rank = (j) => (!j.penghulu ? 0 : (order[j.penghulu] || 999));
  return list.slice().sort((a, b) => b.tanggal.localeCompare(a.tanggal) || rank(a) - rank(b) ||
    String(a.penghulu || '').localeCompare(String(b.penghulu || '')) || String(a.jam).localeCompare(String(b.jam)));
}

function groupByDate(list) {
  const g = [];
  let cur = null;
  list.forEach((j) => {
    if (!cur || cur.tanggal !== j.tanggal) { cur = { tanggal: j.tanggal, items: [] }; g.push(cur); }
    cur.items.push(j);
  });
  return g;
}

// ============================================================
// RENDER — Jadwal (ringkasan, toolbar, daftar)
// ============================================================
function renderAll() {
  scheduleBootCacheSave();
  computeBentrok();
  renderHeader();
  renderSummary();
  renderToolbar();
  renderActiveFilters();
  renderList();
  if (S.selectedId) renderDetail();
  if (S.view === 'bimwin') renderBimwin();
  if (S.view === 'rekap') renderRekapPreview();
}

function renderHeader() {
  $('idName').textContent = S.who || 'Pilih nama';
  $('idName').classList.toggle('has-who', !!S.who);
  const kua = kuaName();
  $('brandSub').textContent = kua + (settings().wilayah ? ' · ' + settings().wilayah : '');
  $('footKua').textContent = 'AKAD TRACKER by Ahzani Labs';
  const logo = settings().logo_url;
  $('brandLogo').classList.toggle('has-img', !!logo);
  $('brandLogo').innerHTML = logo ? `<img src="${esc(logo)}" alt="">` : icon('landmark', 'icon-lg');
  if (S.serverNow) {
    const [d, t] = S.serverNow.split(' ');
    $('footUpdated').textContent = `Terakhir Diperbarui: ${fmtLong(d)} · ${(t || '').slice(0, 5).replace(':', '.')} WIB`;
  }
  document.title = 'AKAD TRACKER — ' + kua;
}

/**
 * Ringkasan atas: Total Akad Bulan Ini, Total Akad Tahun Ini, lalu satu kartu per penghulu
 * (otomatis bertambah bila penghulu ditambah). Kartu penghulu mengikuti tab terpilih
 * (Bulanan / Tahunan / Semua). Dihitung lokal dari data yang sudah dimuat (0 ms).
 */
function renderSummary() {
  const base = S.jadwal.filter((j) => !j.arsip && j.status !== 'BATAL');
  const inR = (r) => base.filter((j) => (!r[0] || j.tanggal >= r[0]) && (!r[1] || j.tanggal <= r[1]));
  const mList = inR(monthRange(S.today));
  const yList = inR(yearRange(S.today));
  const pList = inR(tabRange(S.tab));
  const perLbl = { bulan: 'Bulan ini', tahun: 'Tahun ini', filter: 'Filter' }[S.tab] || '';
  const d0 = pd(S.today || ds(new Date()));
  const items = [
    { k: 'bulan', ic: 'calendar', lbl: 'Total Akad Bulan Ini', num: mList.length, note: BULAN[d0.getMonth()], active: S.tab === 'bulan' },
    { k: 'tahun', ic: 'calendar-check', lbl: 'Total Akad Tahun Ini', num: yList.length, note: String(d0.getFullYear()), active: S.tab === 'tahun' }
  ];
  penghuluList().forEach((p) => items.push({ k: 'p:' + p.nama, color: p.warna_hex, lbl: p.nama, num: pList.filter((j) => j.penghulu === p.nama).length, note: perLbl, active: S.f.penghulu === p.nama }));
  const kosong = pList.filter((j) => !j.penghulu && j.tanggal >= S.today).length;
  if (kosong) items.push({ k: 'p:__none', ic: 'user-plus', lbl: 'Belum Ada Penghulu', num: kosong, note: perLbl, warn: true, active: S.f.penghulu === '__none' });
  const lead = (it) => it.color ? `<span class="dot" style="background:${esc(it.color)};width:10px;height:10px"></span>` : icon(it.ic);
  if (DESK.matches) {
    $('summary').innerHTML = `<div class="kpi-grid">${items.map((it) => `
      <button class="kpi-card ${it.warn ? 'warn' : ''} ${it.active ? 'active' : ''}" data-act="kpi" data-k="${esc(it.k)}" ${it.color ? `style="--accent:${esc(it.color)}"` : ''} title="Tampilkan di daftar">
        <div class="kc-top"><span>${esc(it.lbl)}</span>${lead(it)}</div>
        <div class="kc-val"><span class="kc-num tnum">${it.num}</span><span class="kc-unit">Akad</span><span class="kc-note">${esc(it.note)}</span></div>
      </button>`).join('')}</div>`;
  } else {
    $('summary').innerHTML = `<div class="kpis">${items.map((it) => `<button class="kpi ${it.warn ? 'kpi-warn' : ''} ${it.active ? 'kpi-active' : ''}" data-act="kpi" data-k="${esc(it.k)}">
        ${it.color ? lead(it) : ''}<span class="kpi-num tnum">${it.num}</span><span class="kpi-lbl">${esc(it.color || it.warn ? it.lbl : it.lbl.replace('Total Akad ', ''))}</span></button>`).join('')}</div>`;
  }
}

function countAction() { return filtered({ f: Object.assign({}, S.f, { tindakan: 'any' }) }).length; }

function renderToolbar() {
  const ae = document.activeElement;
  const keepQ = ae && ae.id === 'q' ? [ae.selectionStart, ae.selectionEnd] : null;
  renderToolbarInner();
  if (keepQ) { const q = $('q'); q.focus(); try { q.setSelectionRange(keepQ[0], keepQ[1]); } catch (e) { /* abaikan */ } }
}

function renderToolbarInner() {
  // Tab ke-3 "Filter Tanggal" membuka jendela filter (status, nikah di, wali, penghulu, rentang tanggal)
  const tabs = `<div class="tabs" role="tablist">${[['bulan', 'Bulanan'], ['tahun', 'Tahunan'], ['filter', 'Filter Tanggal']].map(([k, l]) =>
    `<button role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'active' : ''}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>`;
  const search = `<div class="search-wrap">${icon('search')}<input class="input" id="q" type="search" placeholder="Cari nama catin atau desa…" value="${esc(S.f.q)}" aria-label="Cari">
    ${S.f.q ? `<button class="btn btn-ghost btn-icon search-clear" data-act="q-clear" aria-label="Hapus pencarian">${icon('x')}</button>` : ''}</div>`;
  const pChips = penghuluList().map((p) => `<button class="chip" data-act="f-peng" data-v="${esc(p.nama)}" aria-pressed="${S.f.penghulu === p.nama}">
      <span class="dot" style="background:${esc(p.warna_hex)}"></span>${esc(p.nama)}</button>`).join('');
  const more = `<button class="chip" data-act="export">${icon('download', 'icon-sm')}Export</button>`;
  if (DESK.matches) {
    const pOpts = `<option value="">Semua Penghulu</option>${penghuluList(true).map((p) => `<option value="${esc(p.nama)}" ${S.f.penghulu === p.nama ? 'selected' : ''}>${esc(p.nama)}${p.aktif ? '' : ' (nonaktif)'}</option>`).join('')}<option value="__none" ${S.f.penghulu === '__none' ? 'selected' : ''}>Belum ada penghulu</option>`;
    $('toolbar').innerHTML = `<div class="tb-row">${tabs}<span class="tb-div"></span>${search}</div>
      <div class="tb-row">
        <select class="select" id="selPeng" aria-label="Filter penghulu">${pOpts}</select>
        <button class="btn" data-act="export">${icon('download')}Export Excel</button>
        <button class="btn btn-primary" data-act="new">${icon('plus')}Jadwal</button>
      </div>`;
    $('selPeng').onchange = (e) => { S.f.penghulu = e.target.value; renderAfterFilter(); };
  } else {
    $('toolbar').innerHTML = `${tabs}${search}<div class="scroll-x filter-row">${pChips}${more}</div>`;
  }
  const qi = $('q');
  let t;
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.f.q = qi.value; renderActiveFilters(); renderList(); }, 200); };
}

function renderAfterFilter() { renderToolbar(); renderActiveFilters(); renderList(); }

function renderActiveFilters() {
  const f = S.f;
  const chips = [];
  if (f.penghulu) chips.push(['penghulu', 'Penghulu: ' + (f.penghulu === '__none' ? 'Belum ada' : f.penghulu)]);
  if (f.tindakan) chips.push(['tindakan', f.tindakan === 'any' ? 'Perlu Tindakan' : TINDAKAN[f.tindakan]]);
  if (f.status) chips.push(['status', 'Status: ' + STATUS_LBL[f.status]]);
  if (f.tempat) chips.push(['tempat', tempatLbl(f.tempat)]);
  if (f.wali) chips.push(['wali', 'Wali ' + waliLbl(f.wali)]);
  if (S.tab === 'filter' && (f.from || f.to)) chips.push(['tgl', 'Tanggal: ' + (f.from ? fmtDM(f.from) + ' ' + f.from.slice(0, 4) : 'awal') + ' – ' + (f.to ? fmtDM(f.to) + ' ' + f.to.slice(0, 4) : 'seterusnya')]);
  if (f.bulan) chips.push(['bulan', 'Bulan Ini']);
  if (f.q) chips.push(['q', 'Cari: “' + f.q + '”']);
  if (S.customRange) chips.push(['range', 'Periode: ' + (S.range.from ? fmtDM(S.range.from) : '…') + ' – ' + (S.range.to ? fmtDM(S.range.to) : 'seterusnya')]);
  const el = $('activeFilters');
  el.hidden = !chips.length;
  el.innerHTML = chips.map(([k, l]) => `<span class="af">${esc(l)}<button data-act="af-x" data-k="${k}" aria-label="Hapus filter ${esc(l)}">${icon('x', 'icon-sm')}</button></span>`).join('') +
    (chips.length > 1 ? `<button class="btn btn-ghost btn-sm" data-act="af-clear">Hapus semua</button>` : '');
}

function emptyHtml(title, sub) {
  return `<div class="empty"><div class="e-ico">${icon('calendar', 'icon-lg')}</div><h4>${esc(title)}</h4><div class="small">${esc(sub || '')}</div></div>`;
}

function renderList() {
  closeRowMenu();   // baris digambar ulang → menu AKSI lama ditutup
  const list = filtered();
  const el = $('list');
  if (!list.length) {
    const anyFilter = S.f.penghulu || S.f.tindakan || S.f.status || S.f.tempat || S.f.wali || S.f.q || S.f.bulan || (S.tab === 'filter' && (S.f.from || S.f.to));
    el.innerHTML = emptyHtml(anyFilter ? 'Tidak ada jadwal yang cocok' : ({ bulan: 'Belum ada akad bulan ini', tahun: 'Belum ada akad tahun ini' }[S.tab] || 'Belum ada jadwal'),
      anyFilter ? 'Coba hapus sebagian filter.' : 'Tambahkan jadwal dengan tombol + Jadwal.');
    return;
  }
  const groups = groupByDate(sortForView(list));
  const ae = document.activeElement;
  const keep = ae && ae.dataset && ae.dataset.edit && el.contains(ae) ? { id: ae.closest('tr').dataset.id, f: ae.dataset.edit, s: ae.selectionStart } : null;
  el.innerHTML = DESK.matches ? groups.map(tableGroupHtml).join('') : groups.map((g) => cardGroupHtml(g, false)).join('');
  if (keep) {
    const n = el.querySelector(`tr[data-id="${keep.id}"] [data-edit="${keep.f}"]`);
    if (n) { n.focus(); try { if (keep.s != null) n.setSelectionRange(keep.s, keep.s); } catch (e) { /* select */ } }
  }
  if (S.scrollToday) {
    S.scrollToday = false;
    const target = groups.find((g) => g.tanggal >= S.today);
    if (target) {
      const node = el.querySelector(`[data-date="${target.tanggal}"]`);
      if (node) setTimeout(() => { const y = node.getBoundingClientRect().top + window.scrollY - (DESK.matches ? 90 : 64); window.scrollTo({ top: y, behavior: 'smooth' }); }, 30);
    }
  }
}

function dayHeadHtml(g) {
  return `<div class="day-head" data-date="${g.tanggal}"><h3>${icon('calendar')}${esc(fmtLong(g.tanggal))}${g.tanggal === S.today ? '<span class="today-tag">HARI INI</span>' : ''}</h3>
    <span class="day-count">${g.items.filter((j) => j.status !== 'BATAL').length} akad</span></div>`;
}

function cardHtml(j, withActions) {
  const cls = ['card'];
  const fl = flagsOf(j);
  if (fl.indexOf('bentrok') >= 0) cls.push('is-clash');
  if (j.status === 'TERJADWAL' && !j.penghulu) cls.push('is-empty');
  if (j.status === 'BATAL') cls.push('is-batal');
  if (S.selectedId === j.id) cls.push('is-selected');
  const accent = j.penghulu ? colorOf(j.penghulu) : 'transparent';
  const ph = j.penghulu
    ? `<span class="ph ph-pill" style="color:${esc(accent)}"><span class="dot" style="background:${esc(accent)}"></span>${esc(j.penghulu)}</span>`
    : `<span class="ph ph-pill">Belum Diplot</span>`;
  // Kantor = kuning, Wali Hakim = merah (mudah dikenali sekilas)
  const lokasi = j.tempat === 'KANTOR' ? `${icon('building', 'icon-sm')}<span>Desa ${esc(j.desa)} · <b class="tag-kantor">Kantor</b></span>` : `${icon('pin', 'icon-sm')}<span>Desa ${esc(j.desa)} · <b>Luar Kantor</b></span>`;
  // v1.8: status wali selalu tampil (Nasab/Hakim); v1.9: dipindah ke atas, di samping penghulu
  const hakim = j.wali === 'HAKIM' ? '<span class="badge b-danger tag-hakim">Wali Hakim</span>' : '<span class="badge b-neutral tag-nasab">Wali Nasab</span>';
  const note = String(j.keterangan || '').trim() ? `<button type="button" class="badge b-note" data-act="note" data-id="${esc(j.id)}" aria-label="Lihat catatan">${icon('msg')}Catatan</button>` : '';
  const line2 = j.penghulu
    ? `${icon('user', 'icon-sm')}<span>Modin: ${esc(j.modin || '—')}</span>`
    : `<span style="color:var(--danger-fg);display:flex;gap:8px;align-items:center">${icon('help', 'icon-sm')}Penghulu: — (Kosong)</span>`;
  const actions = withActions ? cardActionsHtml(j) : '';
  return `<article class="${cls.join(' ')}" style="--accent:${esc(accent)}" data-act="open" data-id="${esc(j.id)}" tabindex="0" role="button" aria-label="Detail ${esc(j.catin_pria)} dan ${esc(j.catin_wanita)} jam ${jamDot(j.jam)}">
    <div class="card-top"><div class="jam tnum">${jamDot(j.jam)}<small>WIB</small>${S.pending[j.id] ? '<span class="pend-dot" title="Menyimpan…"></span>' : ''}</div><div class="card-top-r">${hakim}${ph}</div></div>
    <div class="names">${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}</div>
    <div class="meta"><div>${lokasi}</div><div>${line2}</div></div>
    <div class="card-foot"><div class="badges">${bwBadge(j)}${badgesHtml(j, 2)}${note}${klBadge(j)}</div></div>${actions}
  </article>`;
}

function cardActionsHtml(j) {
  const canSend = j.penghulu && j.status !== 'BATAL';
  return `<div class="card-actions">
    <button class="btn btn-primary btn-sm" data-act="send" data-id="${esc(j.id)}" ${canSend ? '' : 'disabled'}>${icon('send', 'icon-sm')}Kirim Jadwal</button>
    <button class="btn btn-sm btn-danger" data-act="del" data-id="${esc(j.id)}">${icon('x-circle', 'icon-sm')}Hapus</button>
  </div>`;
}

function cardGroupHtml(g, withActions) {
  return `<section class="day">${dayHeadHtml(g)}<div class="cards">${g.items.map((j) => cardHtml(j, withActions)).join('')}</div></section>`;
}

/** Opsi <select>; nilai lama yang tidak ada di daftar tetap ditampilkan agar tidak hilang. */
function optHtml(list, cur, blank) {
  const vals = list.slice();
  if (cur && vals.indexOf(cur) < 0) vals.unshift(cur);
  return (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
    vals.map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
}
function optPairs(pairs, cur) { return pairs.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join(''); }
const jamOptHtml = (cur) => JAM_OPTS.concat(cur && JAM_OPTS.indexOf(cur) < 0 ? [cur] : []).sort().map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${jamDot(v)}</option>`).join('');

/** Desktop: setiap baris langsung bisa diedit lewat dropdown/isian — tersimpan otomatis. */
function tableGroupHtml(g) {
  const desa = (S.boot.desa || []).filter((d) => d.aktif).map((d) => d.nama);
  const modin = (S.boot.modin || []).filter((m) => m.aktif).map((m) => m.nama);
  const peng = penghuluList().map((p) => p.nama);
  const rows = g.items.map((j, idx) => {
    const cls = [];
    if (idx > 0 && (g.items[idx - 1].penghulu || '') !== (j.penghulu || '')) cls.push('grp-start');   // pemisah antar-penghulu
    if (j.status === 'BATAL') cls.push('is-batal');
    if (S.bentrok[j.id] && j.tanggal >= S.today) cls.push('is-clash-row');
    const pc = j.penghulu ? colorOf(j.penghulu) : '';
    return `<tr class="${cls.join(' ')}" data-id="${esc(j.id)}" ${pc ? `style="--accent:${esc(pc)}"` : ''}>
      <td class="t-jam"><select class="cell cell-jam tnum" data-edit="jam" aria-label="Jam">${jamOptHtml(j.jam)}</select>
        <input class="cell cell-date tnum" type="date" data-edit="tanggal" value="${esc(j.tanggal)}" aria-label="Tanggal">${S.pending[j.id] ? '<span class="pend-dot"></span>' : ''}</td>
      <td class="t-names"><input class="cell cell-strong upper" data-edit="catin_pria" value="${esc(j.catin_pria)}" maxlength="120" aria-label="Catin pria">
        <input class="cell cell-sub upper" data-edit="catin_wanita" value="${esc(j.catin_wanita)}" maxlength="120" aria-label="Catin wanita"></td>
      <td class="col-wali"><select class="cell ${j.wali === 'HAKIM' ? 'cell-hakim' : ''}" data-edit="wali" aria-label="Wali">${optPairs([['NASAB', 'Nasab'], ['HAKIM', 'Hakim']], j.wali)}</select></td>
      <td><select class="cell ${j.tempat === 'KANTOR' ? 'cell-kantor' : ''}" data-edit="tempat" aria-label="Nikah di">${optPairs([['KANTOR', 'Kantor'], ['LUAR_KANTOR', 'Luar Kantor']], j.tempat)}</select></td>
      <td><select class="cell" data-edit="desa" aria-label="Desa">${optHtml(desa, j.desa)}</select></td>
      <td class="col-modin"><select class="cell" data-edit="modin" aria-label="Modin">${optHtml(modin, j.modin, '—')}</select></td>
      <td><select class="cell cell-ph ${j.penghulu ? '' : 'is-none'}" data-edit="penghulu" aria-label="Penghulu" ${pc ? `style="color:${esc(pc)}"` : ''}>${optHtml(peng, j.penghulu, '— Belum ada —')}</select></td>
      <td class="col-ket"><div class="ket-view ${String(j.keterangan || '').trim() ? '' : 'is-empty'}" data-act="ket" data-id="${esc(j.id)}" tabindex="0" role="button" aria-label="Lihat / ubah keterangan" title="Klik untuk membaca &amp; mengubah keterangan">${String(j.keterangan || '').trim() ? esc(j.keterangan) : 'Alamat / keterangan'}</div></td>
      <td><div class="badges">${badgesHtml(j, 2)}</div></td>
      <td>${bwSelectHtml(j)}</td>
      <td class="t-act"><button class="btn btn-sm btn-aksi" data-act="row-menu" data-id="${esc(j.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Aksi untuk ${esc(j.catin_pria)}">AKSI${icon('chev-down', 'icon-sm')}</button></td></tr>`;
  }).join('');
  return `<div class="table-wrap" data-date="${g.tanggal}">
    <div class="tbl-day">${icon('calendar')}<h3>${esc(fmtLong(g.tanggal))}</h3><span class="sep">•</span><span class="cnt">${g.items.filter((j) => j.status !== 'BATAL').length} akad terdaftar</span>
      ${g.tanggal === S.today ? '<span class="badge b-neutral">Hari Ini</span>' : ''}<span class="tz">Zona Waktu: WIB</span></div>
    <div class="tbl-scroll"><table class="jt jt-edit"><colgroup><col class="w-jam"><col class="w-nama"><col class="w-wali col-wali"><col class="w-tempat"><col class="w-desa"><col class="w-modin col-modin"><col class="w-ph"><col class="w-ket col-ket"><col class="w-status"><col class="w-bw"><col class="w-act"></colgroup><thead><tr><th>Jam / Tanggal</th><th>Pasangan</th><th class="col-wali">Wali</th><th>Nikah di</th><th>Desa</th><th class="col-modin">Modin</th><th>Penghulu</th><th class="col-ket">Keterangan</th><th>Status</th><th>Bimwin</th><th>Aksi</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

const EDIT_KEYS = ['catin_pria', 'catin_wanita', 'wali', 'tanggal', 'jam', 'tempat', 'desa', 'modin', 'penghulu', 'no_pendaftaran', 'keterangan'];
/** Simpan satu sel yang diubah (optimistic: tampil langsung, server menyusul). */
function actInlineEdit(id, field, value) {
  const j = byId(id);
  if (!j) return;
  value = String(value == null ? '' : value).trim();
  if (field === 'catin_pria' || field === 'catin_wanita') value = upName(value);
  if (String(j[field] || '') === value) return;
  if (!value && ['catin_pria', 'catin_wanita', 'tanggal', 'jam', 'desa'].indexOf(field) >= 0) { toast('Kolom ini wajib diisi.', 'warn'); renderList(); return; }
  if (field === 'penghulu') {
    optimistic(id, (x) => { const b = clone(x); x.penghulu = value; applyLocalKirimRule(b, x); },
      (x) => api('setPenghulu', S.token, id, value, x.version, who()),
      { warnBentrok: true });   // tanpa toast: titik biru "menyimpan" di baris sudah jadi umpan balik
    return;
  }
  optimistic(id, (x) => { const b = clone(x); x[field] = value; applyLocalKirimRule(b, x); },
    (x) => { const d = { id: id, force: true }; EDIT_KEYS.forEach((k) => { d[k] = x[k]; }); return api('saveJadwal', S.token, d, x.version, who()); },
    { warnBentrok: true });
}

/**
 * v1.9: popup keterangan di tabel desktop — ukurannya mengikuti panjang catatan, langsung bisa diedit.
 * Simpan: tombol Simpan, Ctrl+Enter, atau klik di luar popup. Batal: tombol Batal / Esc.
 */
function ketPop(cell, id) {
  closeKetPop(true);
  const j = byId(id);
  if (!j) return;
  const v = String(j.keterangan || '');
  const p = document.createElement('div');
  p.className = 'ket-pop'; p.id = 'ketPop'; p.dataset.id = id; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Keterangan');
  p.innerHTML = `<div class="ket-pop-head"><b>Keterangan</b><span>${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)} · ${jamDot(j.jam)}</span></div>
    <textarea class="ket-pop-ta" maxlength="500" placeholder="Alamat / keterangan" aria-label="Keterangan">${esc(v)}</textarea>
    <div class="ket-pop-foot"><span class="ket-cnt tnum"></span><span class="grow"></span><button type="button" class="btn btn-sm" data-x="no">Batal</button><button type="button" class="btn btn-sm btn-primary" data-x="ok">${icon('check')}Simpan</button></div>`;
  document.body.appendChild(p);
  const r = cell.getBoundingClientRect();
  const w = Math.round(Math.min(window.innerWidth - 16, Math.max(r.width + 40, 360, Math.min(680, 300 + v.length * 1.6))));
  p.style.width = w + 'px';
  const ta = p.querySelector('textarea');
  const cnt = p.querySelector('.ket-cnt');
  const fit = () => {
    cnt.textContent = ta.value.length + ' / 500';
    ta.style.height = 'auto';
    ta.style.height = Math.min(Math.round(window.innerHeight * 0.6), Math.max(88, ta.scrollHeight + 2)) + 'px';
  };
  fit();
  const h = p.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left - 4));
  const top = r.top - 4 + h + 8 > window.innerHeight ? Math.max(8, window.innerHeight - h - 8) : Math.max(8, r.top - 4);
  p.style.left = (left + window.scrollX) + 'px';
  p.style.top = (top + window.scrollY) + 'px';
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeKetPop(false); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeKetPop(true); }
  });
  p.querySelector('[data-x="no"]').onclick = () => closeKetPop(true);
  p.querySelector('[data-x="ok"]').onclick = () => closeKetPop(false);
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function closeKetPop(cancel) {
  const p = $('ketPop');
  if (!p) return;
  const id = p.dataset.id, val = p.querySelector('textarea').value;
  p.remove();
  if (!cancel) actInlineEdit(id, 'keterangan', val);
  const c = document.querySelector(`tr[data-id="${id}"] .ket-view`);
  if (c) c.focus({ preventScroll: true });
}

/** Riwayat (desktop, tanpa panel detail). */
/** v1.8: popup catatan (keterangan) dari kartu mobile. */
function noteModal(id) {
  const j = byId(id);
  if (!j) return;
  openModal({
    title: 'Catatan', sub: `${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)} · ${jamDot(j.jam)} · ${esc(fmtLong(j.tanggal))}`,
    body: `<div class="note-full">${esc(j.keterangan || '')}</div>`,
    foot: `<button class="btn" data-act="modal-close">Tutup</button>`
  });
}

function histModal(id) {
  const j = byId(id);
  if (!j) return;
  openModal({
    title: 'Riwayat Aktivitas', sub: `${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)} · ${jamDot(j.jam)} · ${esc(fmtLong(j.tanggal))}`,
    body: `<div id="rwBody"><div class="small muted">Memuat…</div></div><span id="rwCount" hidden></span>`,
    onMount: () => {
      api('getRiwayat', S.token, id).then((rows) => { riwayatCache[id] = rows; drawRiwayat(rows); })
        .catch((e) => { if ($('rwBody')) $('rwBody').innerHTML = `<div class="small" style="color:var(--danger-fg)">${esc(errMsg(e))}</div>`; });
    }
  });
}

// ============================================================
// DETAIL JADWAL (panel kanan di desktop / lembar bawah di HP)
// ============================================================
function openDetail(id) {
  S.selectedId = id;
  // Desktop + view Jadwal → panel kanan; selain itu → lembar (bawah di HP, laci kanan di desktop)
  S.detailMode = (DESK.matches && S.view === 'jadwal') ? 'panel' : 'sheet';
  if (S.detailMode === 'panel') {
    $('split').classList.add('has-detail');
    renderDetail();
    renderList();
  } else {
    renderDetail();
    $('sheetBackdrop').classList.add('show');
    $('detailSheet').classList.add('show');
    if (!DESK.matches) document.body.style.overflow = 'hidden';
  }
}

function closeDetail() {
  if (!S.selectedId) return;
  const wasPanel = S.detailMode === 'panel';
  S.selectedId = null;
  $('split').classList.remove('has-detail');
  $('detailPanel').innerHTML = '';
  $('sheetBackdrop').classList.remove('show');
  $('detailSheet').classList.remove('show');
  document.body.style.overflow = '';
  if (wasPanel) renderList();
}

function renderDetail() {
  const j = byId(S.selectedId);
  const host = S.detailMode === 'panel' ? $('detailPanel') : $('detailSheet');
  if (!j) { closeDetail(); return; }
  const accOpen = host.querySelector('.acc.open') ? ' open' : '';
  const scroll = host.querySelector('.sheet-body') ? host.querySelector('.sheet-body').scrollTop : 0;
  host.innerHTML = `${S.detailMode === 'panel' || DESK.matches ? '' : '<div class="sheet-handle"></div>'}
    <div class="sheet-head"><div><h2>Detail Jadwal <span class="id-tag tnum">${esc(j.id)}</span>${S.pending[j.id] ? '<span class="pend-dot" title="Menyimpan…"></span>' : ''}</h2>
      <div class="sub tnum">${jamDot(j.jam)} · ${esc(fmtLong(j.tanggal))}</div></div>
      <button class="btn btn-ghost btn-icon x" data-act="close-detail" aria-label="Tutup detail">${icon('x')}</button></div>
    <div class="sheet-body">${detailBodyHtml(j, accOpen)}</div>`;
  const b = host.querySelector('.sheet-body');
  if (b) b.scrollTop = scroll;
  if (accOpen) loadRiwayat(j.id);
}

function detailBodyHtml(j, accOpen) {
  const parts = [];
  parts.push(`<div class="badges">${badgesHtml(j)}</div>`);

  // Callout kondisi khusus
  if (j.status === 'BATAL') {
    parts.push(`<div class="callout callout-danger"><div class="c-head"><span>${icon('x-circle', 'icon-sm')} Dibatalkan oleh ${esc(j.batal_oleh || '—')}</span></div>
      <div class="c-body">Alasan: ${esc(j.batal_alasan || '—')}</div>
      ${j.batal_perlu_cek ? `<div class="c-body mt8">Dibatalkan oleh penghulu — mohon dicek Kepala KUA/staf. <button class="linkbtn" data-act="clear-cek" data-id="${esc(j.id)}">Sudah Dicek</button></div>` : ''}</div>`);
  }
  if (j.duplikat_flag) {
    const sim = similarTo(j);
    parts.push(`<div class="callout callout-warn"><div class="c-head"><span>${icon('layers', 'icon-sm')} Kemungkinan duplikat</span>
      <button class="linkbtn" data-act="clear-dup" data-id="${esc(j.id)}">Bukan Duplikat</button></div>
      <div class="c-body">${sim.length ? 'Mirip dengan: ' + sim.map((x) => `<button class="linkbtn" data-act="open" data-id="${esc(x.id)}">${esc(x.catin_pria)} &amp; ${esc(x.catin_wanita)} (${fmtDM(x.tanggal)} ${jamDot(x.jam)})</button>`).join(', ') : 'Jadwal yang mirip tidak ada di periode yang dimuat (mungkin sudah diarsip/batal).'}</div></div>`);
  }
  const clash = S.bentrok[j.id] || [];
  if (clash.length && j.status === 'TERJADWAL') {
    parts.push(`<div class="callout callout-warn"><div class="c-head"><span>${icon('alert', 'icon-sm')} Bentrok jadwal ${esc(j.penghulu)}</span></div>
      <div class="c-body">Selisih &lt; ${esc(settings().jarak_bentrok_menit || 60)} menit dengan: ${clash.map((id) => { const x = byId(id); return x ? `<button class="linkbtn" data-act="open" data-id="${esc(x.id)}">${jamDot(x.jam)} ${esc(x.catin_pria)} &amp; ${esc(x.catin_wanita)}</button>` : ''; }).join(', ')}. Pertimbangkan ganti penghulu atau jam.</div></div>`);
  }

  const phHtml = j.penghulu ? `<span class="ph" style="color:${esc(colorOf(j.penghulu))}"><span class="dot" style="background:${esc(colorOf(j.penghulu))}"></span>${esc(j.penghulu)}</span>` : '<span class="ph ph-none">Belum ditentukan</span>';
  parts.push(`<dl class="dl">
    <div class="dl-row"><dt>Pasangan Calon</dt><dd>${esc(j.catin_pria)}<br><span style="font-weight:500">&amp; ${esc(j.catin_wanita)}</span></dd></div>
    <div class="dl-row"><dt>Status Wali</dt><dd>${waliLbl(j.wali)}</dd></div>
    <div class="dl-row"><dt>Lokasi Nikah</dt><dd>${tempatLbl(j.tempat)}${j.tempat === 'LUAR_KANTOR' ? ' (Desa ' + esc(j.desa) + ')' : ''}</dd></div>
    <div class="dl-row"><dt>Desa</dt><dd>${esc(j.desa)}</dd></div>
    <div class="dl-row"><dt>Modin Desa</dt><dd>${esc(j.modin || '—')}</dd></div>
    <div class="dl-row"><dt>Penghulu KUA</dt><dd>${phHtml}</dd></div>
    <div class="dl-row"><dt>Bimwin</dt><dd>${bwBadge(j)} <button class="linkbtn" data-act="bw-edit" data-id="${esc(j.id)}">Ubah</button></dd></div>
    ${j.no_pendaftaran ? `<div class="dl-row"><dt>No. Pendaftaran</dt><dd class="tnum">${esc(j.no_pendaftaran)}</dd></div>` : ''}
    <div class="dl-row"><dt>Sumber</dt><dd>${sumberLbl(j)}${j.pengisi_form ? '<br><span style="font-weight:500">Pengisi: ' + esc(j.pengisi_form) + '</span>' : ''}</dd></div>
    ${/^https:\/\//.test(j.kualink_pdf || '') ? `<div class="dl-row"><dt>Berkas Desa</dt><dd><a class="linkbtn" href="${esc(j.kualink_pdf)}" target="_blank" rel="noopener">Buka PDF paket surat desa</a></dd></div>` : ''}
    <div class="dl-row"><dt>Diperbarui</dt><dd class="small" style="font-weight:500">${esc(stampShort(j.updated_at))} · ${esc(j.updated_by)}</dd></div>
    ${j.keterangan ? `<div class="dl-block"><dt>Alamat / Keterangan</dt><dd>${esc(j.keterangan)}</dd></div>` : ''}
  </dl>`);

  // Status kirim WA
  const k = j.kirim_status;
  const last = j.kirim_terakhir_at ? `Terakhir dikirim ${esc(stampShort(j.kirim_terakhir_at))} oleh ${esc(j.kirim_terakhir_oleh)}` : '';
  if (k === 'PERLU_ULANG') parts.push(`<div class="callout callout-warn"><div class="c-head"><span>${icon('msg', 'icon-sm')} Status Kirim WA</span><span>Perlu kirim ulang</span></div><div class="c-body">${last}. Ada perubahan tanggal/jam/tempat/desa/penghulu sesudahnya.</div></div>`);
  else if (k === 'TERKIRIM') parts.push(`<div class="callout callout-ok"><div class="c-head"><span>${icon('msg', 'icon-sm')} Status Kirim WA</span><span>Terkirim</span></div><div class="c-body">${last}. (Artinya WhatsApp sudah dibuka, bukan konfirmasi diterima catin.)</div></div>`);
  else parts.push(`<div class="callout callout-neutral"><div class="c-head"><span>${icon('msg', 'icon-sm')} Status Kirim WA</span><span>Belum dikirim</span></div></div>`);

  // Tombol aksi
  const canSend = j.penghulu && j.status !== 'BATAL';
  const sendReason = j.status === 'BATAL' ? 'Jadwal batal' : (!j.penghulu ? 'Tentukan penghulu dulu' : '');
  const id = esc(j.id);
  const a = [];
  a.push(`<button class="btn btn-primary btn-lg full" data-act="send" data-id="${id}" ${canSend ? '' : 'disabled'}>${icon('msg')}${k === 'PERLU_ULANG' ? 'Kirim Ulang Jadwal ke Catin' : 'Kirim Jadwal ke Catin'}</button>`);
  if (!canSend) a.push(`<div class="full small muted" style="margin-top:-4px">${icon('info', 'icon-sm')} ${sendReason}</div>`);
  if (j.status !== 'BATAL') a.push(`<button class="btn" data-act="assign" data-id="${id}">${icon('user-plus')}${j.penghulu ? 'Ganti Penghulu' : 'Tentukan Penghulu'}</button>`);
  a.push(`<button class="btn" data-act="edit" data-id="${id}">${icon('edit')}Edit</button>`);
  a.push(`<button class="btn btn-danger" data-act="del" data-id="${id}">${icon('x-circle')}Hapus</button>`);
  parts.push(`<div class="actions-grid">${a.join('')}</div>`);

  parts.push(`<div class="acc${accOpen || ''}" id="accRiwayat"><button data-act="riwayat" data-id="${id}" aria-expanded="${!!accOpen}">${icon('history')}Riwayat Aktivitas<span class="small muted" id="rwCount"></span>${icon('chev-down', 'chev')}</button>
    <div class="acc-body" id="rwBody"><div class="small muted">Memuat…</div></div></div>`);
  return parts.join('');
}

function similarTo(j) {
  const key = norm(j.catin_pria) + '|' + norm(j.catin_wanita) + '|' + j.tanggal + '|' + norm(j.desa);
  const reg = norm(j.no_pendaftaran);
  return S.jadwal.filter((x) => x.id !== j.id && !x.arsip && x.status !== 'BATAL' &&
    ((reg && norm(x.no_pendaftaran) === reg) || (norm(x.catin_pria) + '|' + norm(x.catin_wanita) + '|' + x.tanggal + '|' + norm(x.desa)) === key));
}

const riwayatCache = {};
function loadRiwayat(id) {
  const body = $('rwBody');
  if (riwayatCache[id]) drawRiwayat(riwayatCache[id]);
  api('getRiwayat', S.token, id).then((rows) => {
    riwayatCache[id] = rows;
    if (S.selectedId === id) drawRiwayat(rows);
  }).catch((e) => { if (body && S.selectedId === id) body.innerHTML = `<div class="small" style="color:var(--danger-fg)">${esc(errMsg(e))}</div>`; });
}
function drawRiwayat(rows) {
  const body = $('rwBody');
  if (!body) return;
  $('rwCount').textContent = `(${rows.length})`;
  if (!rows.length) { body.innerHTML = '<div class="small muted">Belum ada riwayat.</div>'; return; }
  body.innerHTML = `<ul class="tl">${rows.map((r) => {
    let what = AKSI_LBL[r.aksi] || r.aksi;
    if (r.field && r.field !== '-') {
      const fl = FIELD_LBL[r.field] || r.field;
      what = r.aksi === 'SEND_CATIN' || r.aksi === 'SEND_MODIN' ? `${what}: ${r.nilai_baru}` : `${fl}: ${r.nilai_lama || '—'} → ${r.nilai_baru || '—'}`;
    } else if (r.nilai_baru) what += ': ' + r.nilai_baru;
    return `<li><span class="tdot"></span><div><div class="who">${esc(r.oleh)}</div><div class="what">${esc(what)}</div></div><span class="when">${esc(stampShort(r.waktu))}</span></li>`;
  }).join('')}</ul>`;
}

// ============================================================
// AKSI OPTIMISTIC — UI dulu, server menyusul (antrian per jadwal)
// ============================================================
/**
 * @param {string} id
 * @param {Function} mutate   ubah objek lokal (instan)
 * @param {Function} call     (j) => Promise ke server; dipanggil saat giliran antrian (versi terbaru)
 * @param {Object}   opt      { ok: pesan sukses, after: fn(res) }
 */
function optimistic(id, mutate, call, opt) {
  const j = byId(id);
  if (!j) return Promise.resolve();
  const snapshot = clone(j);
  mutate(j);
  S.pending[id] = (S.pending[id] || 0) + 1;
  renderAll();
  if (opt && opt.ok) toast(opt.ok, 'ok', opt.undo ? { label: 'Urungkan', fn: opt.undo } : null);
  const prev = S.queue[id] || Promise.resolve();
  const p = prev.catch(() => {}).then(() => call(byId(id) || j)).then((res) => {
    S.pending[id]--;
    const cur = byId(id);
    if (res && res.jadwal && cur) {
      if (S.pending[id] > 0) { cur.version = res.jadwal.version; }
      else Object.assign(cur, res.jadwal);
    }
    if (!S.pending[id]) delete S.pending[id];
    delete riwayatCache[id];
    if (res && res.bentrok && res.bentrok.length && opt && opt.warnBentrok) {
      toast(`Peringatan: ${res.jadwal.penghulu} bentrok dengan ${res.bentrok.map((b) => jamDot(b.jam) + ' ' + b.catin_pria).join(', ')}.`, 'warn');
    }
    if (opt && opt.after) opt.after(res);
    renderAll();
    return res;
  }).catch((e) => {
    S.pending[id]--;
    if (!S.pending[id]) delete S.pending[id];
    const cur = byId(id);
    if (cur) Object.assign(cur, snapshot);
    else S.jadwal.push(snapshot);
    if (e && e.code === 'CONFLICT') conflictModal(e);
    else if (e && e.code !== 'AUTH') toast('Gagal disimpan: ' + errMsg(e) + ' Perubahan dibatalkan.', 'err');
    renderAll();
    quietReload();
  });
  S.queue[id] = p;
  return p;
}

function conflictModal(e) {
  if (e.data && e.data.jadwal) { const cur = byId(e.data.jadwal.id); if (cur) Object.assign(cur, e.data.jadwal); }
  openModal({
    title: 'Data sudah berubah', body: `<div class="callout callout-warn mt0">${icon('alert', 'icon-sm')} ${esc(e.message)}</div>`,
    foot: `<button class="btn btn-primary btn-block" data-x="reload">${icon('refresh')}Muat Ulang</button>`,
    onMount: (m) => { m.querySelector('[data-x="reload"]').onclick = () => { closeModal(true); reloadAll(); }; }
  });
}

const who = () => S.who || 'Tanpa Nama';

function actVerify(id) {
  optimistic(id, (j) => { j.verifikasi = 'OK'; }, (j) => api('verifyJadwal', S.token, id, j.version, who()), { ok: 'Jadwal terverifikasi.' });
}
function actClearCek(id) {
  optimistic(id, (j) => { j.batal_perlu_cek = false; }, () => api('clearBatalCek', S.token, id, who()), { ok: 'Tanda "Perlu Dicek" dihapus.' });
}
function actClearDup(id) {
  optimistic(id, (j) => { j.duplikat_flag = false; }, () => api('clearDuplikat', S.token, id, who()), { ok: 'Tanda duplikat dihapus.' });
}

function applyLocalKirimRule(before, after) {
  if (before.kirim_status !== 'TERKIRIM') return;
  if (['tanggal', 'jam', 'tempat', 'desa', 'penghulu'].some((f) => String(before[f] || '') !== String(after[f] || ''))) after.kirim_status = 'PERLU_ULANG';
}

function actAssign(id) {
  const j = byId(id);
  if (!j) return;
  const list = penghuluList();
  const opts = list.map((p) => {
    const clash = bentrokFor(j, p.nama, j.tanggal, j.jam);
    return `<label class="radio-item"><input type="radio" name="ph" value="${esc(p.nama)}" ${j.penghulu === p.nama ? 'checked' : ''}>
      <span class="dot" style="background:${esc(p.warna_hex)};width:12px;height:12px"></span>
      <span class="grow"><b>${esc(p.nama)}</b>${clash.length ? `<div class="ri-sub" style="color:var(--warn-fg)">${icon('alert', 'icon-sm')} Bentrok: ${clash.map((x) => jamDot(x.jam) + ' ' + esc(x.catin_pria)).join(', ')}</div>` : `<div class="ri-sub">${countDay(p.nama, j.tanggal)} akad pada hari itu</div>`}</span></label>`;
  }).join('');
  openModal({
    title: 'Tentukan Penghulu', sub: `${jamDot(j.jam)} · ${esc(fmtLong(j.tanggal))} · ${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}`,
    body: `<div class="radio-list">${opts}<label class="radio-item"><input type="radio" name="ph" value="" ${!j.penghulu ? 'checked' : ''}><span class="grow">Kosongkan (belum ditentukan)</span></label></div>
      ${j.kirim_status === 'TERKIRIM' ? `<div class="callout callout-info">${icon('info', 'icon-sm')} Jadwal sudah dikirim ke catin. Mengganti penghulu akan menandai <b>Perlu Kirim Ulang</b>.</div>` : ''}`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" data-x="save">${icon('check')}Simpan</button>`,
    onMount: (m) => {
      m.querySelector('[data-x="save"]').onclick = () => {
        const v = (m.querySelector('input[name="ph"]:checked') || {}).value || '';
        closeModal(true);
        if (v === (j.penghulu || '')) return;
        optimistic(id, (x) => { const b = clone(x); x.penghulu = v; applyLocalKirimRule(b, x); },
          (x) => api('setPenghulu', S.token, id, v, x.version, who()),
          { ok: v ? `Ditugaskan ke ${v}.` : 'Penghulu dikosongkan.', warnBentrok: true });
      };
    }
  });
}
const countDay = (nama, tgl) => S.jadwal.filter((x) => !x.arsip && x.status !== 'BATAL' && x.penghulu === nama && x.tanggal === tgl).length;

async function actDone(id) {
  const j = byId(id);
  if (!j) return;
  if (!j.penghulu) { toast('Tentukan penghulu terlebih dahulu.', 'warn'); return; }
  if (j.tanggal > S.today) {
    const ok = await confirmBox('Tanggal akad belum tiba', `Akad ini dijadwalkan <b>${esc(fmtLong(j.tanggal))}</b>. Yakin tandai selesai sekarang?`, 'Tetap Tandai Selesai');
    if (!ok) return;
  }
  optimistic(id, (x) => { x.status = 'SELESAI'; }, (x) => api('setStatus', S.token, id, 'SELESAI', '', x.version, who()), { ok: 'Ditandai selesai.' });
}

function actCancel(id) {
  const j = byId(id);
  if (!j) return;
  const isPeng = labelOfWho(S.who) === 'Penghulu';
  openModal({
    title: 'Batalkan Jadwal', sub: `${jamDot(j.jam)} · ${esc(fmtLong(j.tanggal))} · ${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}`,
    body: `<div class="field" id="fAlasan"><label class="label" for="alasan">Alasan pembatalan <span class="req">*</span></label>
      <textarea class="textarea" id="alasan" maxlength="300" placeholder="Contoh: Catin membatalkan, ganti tanggal, dll." autofocus></textarea>
      <div class="err-msg">${icon('alert', 'icon-sm')}<span>Alasan wajib diisi</span></div></div>
      <div class="small muted">Tercatat: “Dibatalkan oleh ${esc(who())}”.${isPeng ? ' Karena identitas berlabel Penghulu, jadwal akan diberi tanda <b>Batal — Perlu Dicek</b>.' : ''}</div>`,
    foot: `<button class="btn" data-act="modal-close">Kembali</button><button class="btn btn-danger" data-x="ok">${icon('x-circle')}Batalkan Jadwal</button>`,
    onMount: (m) => {
      m.querySelector('[data-x="ok"]').onclick = () => {
        const a = $('alasan').value.trim();
        if (!a) { $('fAlasan').classList.add('has-error'); $('alasan').focus(); return; }
        closeModal(true);
        optimistic(id, (x) => { x.status = 'BATAL'; x.batal_alasan = a; x.batal_oleh = who(); x.batal_perlu_cek = isPeng; },
          (x) => api('setStatus', S.token, id, 'BATAL', a, x.version, who()), { ok: 'Jadwal dibatalkan.' });
      };
    }
  });
}

function actReopen(id) {
  optimistic(id, (x) => { x.status = 'TERJADWAL'; x.batal_perlu_cek = false; x.batal_alasan = ''; x.batal_oleh = ''; },
    (x) => api('setStatus', S.token, id, 'TERJADWAL', '', x.version, who()), { ok: 'Dikembalikan ke Terjadwal.' });
}

async function actArchive(id) {
  const j = byId(id);
  if (!j) return;
  const ok = await confirmBox('Pindahkan ke Arsip?', `<b>${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}</b> akan disembunyikan dari daftar. Data <b>tidak dihapus</b> dan bisa dipulihkan dari Pengaturan → Arsip.`, 'Arsipkan', 'btn-primary');
  if (!ok) return;
  closeDetail();
  optimistic(id, (x) => { x.arsip = true; }, () => api('archiveJadwal', S.token, id, who()), {
    ok: 'Dipindahkan ke arsip.',
    undo: () => optimistic(id, (x) => { x.arsip = false; }, () => api('restoreJadwal', S.token, id, who()), { ok: 'Dipulihkan.' })
  });
}

/**
 * Hapus langsung (tanpa konfirmasi): hilang dari layar seketika, server menyusul.
 * Toast "Urungkan" mengembalikan data dari salinan di RIWAYAT.
 */
/** Desktop: menu AKSI per baris (Kirim WA · Riwayat · Hapus) — melayang di atas tabel. */
function rowMenu(btn, id) {
  const open = $('rowMenu');
  const same = open && open.dataset.id === id;
  closeRowMenu();
  if (same) return;
  const j = byId(id);
  if (!j) return;
  const canSend = j.penghulu && j.status !== 'BATAL';
  const m = document.createElement('div');
  m.className = 'row-menu'; m.id = 'rowMenu'; m.dataset.id = id; m.setAttribute('role', 'menu');
  m.innerHTML = `<button role="menuitem" data-act="send" data-id="${esc(id)}" ${canSend ? '' : 'disabled'}>${icon('send')}<span>Kirim WA ke catin${canSend ? '' : '<small>Tentukan penghulu dulu</small>'}</span></button>
    <button role="menuitem" data-act="hist" data-id="${esc(id)}">${icon('history')}<span>Riwayat</span></button>
    <button role="menuitem" class="t-del" data-act="del" data-id="${esc(id)}">${icon('x-circle')}<span>Hapus</span></button>`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  const first = m.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}
function closeRowMenu() {
  const m = $('rowMenu');
  if (!m) return;
  const b = document.querySelector(`[data-act="row-menu"][aria-expanded="true"]`);
  if (b) b.setAttribute('aria-expanded', 'false');
  m.remove();
}

/** Hapus selalu dikonfirmasi dulu (desktop & HP). */
async function actDelete(id) {
  const j = byId(id);
  if (!j) return;
  const ok = await confirmBox('Hapus jadwal?', `<b>${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}</b><div class="small muted mt8">${esc(fmtLong(j.tanggal))} · ${jamDot(j.jam)} WIB · Desa ${esc(j.desa)}</div><div class="small mt8">Jadwal dihapus dari daftar. Salinannya tetap tersimpan di riwayat dan bisa dikembalikan lewat tombol <b>Urungkan</b>.</div>`, 'Hapus', 'btn-danger');
  if (ok) hapusJadwal(id);
}

function hapusJadwal(id) {
  const j = byId(id);
  if (!j) return;
  const snap = clone(j);
  if (S.selectedId === id) closeDetail();
  S.jadwal = S.jadwal.filter((x) => x.id !== id);
  S.pending[id] = (S.pending[id] || 0) + 1;
  renderAll();
  const done = () => { S.pending[id]--; if (!S.pending[id]) delete S.pending[id]; };
  const p = (S.queue[id] || Promise.resolve()).catch(() => {}).then(() => api('deleteJadwal', S.token, id, who()))
    .then(() => { done(); delete riwayatCache[id]; })
    .catch((e) => { done(); if (!byId(id)) S.jadwal.push(snap); renderAll(); if (e && e.code !== 'AUTH') toast('Gagal menghapus: ' + errMsg(e), 'err'); throw e; });
  S.queue[id] = p;
  toast(`Jadwal ${snap.catin_pria} & ${snap.catin_wanita} dihapus.`, 'ok', { label: 'Urungkan', fn: () => {
    if (!byId(id)) S.jadwal.push(snap);
    S.pending[id] = (S.pending[id] || 0) + 1;
    renderAll();
    S.queue[id] = p.catch(() => null).then((r) => (r === null ? null : api('undeleteJadwal', S.token, id, who())))
      .then((res) => { done(); const cur = byId(id); if (res && res.jadwal && cur) Object.assign(cur, res.jadwal); renderAll(); toast('Jadwal dikembalikan.', 'ok'); })
      .catch((e) => { done(); S.jadwal = S.jadwal.filter((x) => x.id !== id); renderAll(); toast('Gagal mengembalikan: ' + errMsg(e), 'err'); });
  } });
}

/** Kirim ke catin: buka WhatsApp DULU (harus sinkron dengan klik), lalu tandai TERKIRIM. */
function actSend(id) {
  const j = byId(id);
  if (!j || !j.penghulu || j.status === 'BATAL') return;
  openWa('', buildCatinMsg(j));
  optimistic(id, (x) => { x.kirim_status = 'TERKIRIM'; x.kirim_terakhir_at = S.today + ' ' + nowHM() + ':00'; x.kirim_terakhir_oleh = who(); },
    () => api('markSent', S.token, id, who()), { ok: 'WhatsApp dibuka. Status: Terkirim.' });
}
const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

function openWa(number, text) {
  const url = WA_BASE + (number || '') + '?text=' + encodeURIComponent(text);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}

function fillTpl(tpl, map) {
  return String(tpl || '').replace(/\{([A-Z_]+)\}/g, (m, k) => Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m);
}
function msgMap(j) {
  return {
    HARI: hariOf(j.tanggal), TANGGAL: tglOf(j.tanggal), JAM: jamDot(j.jam), TEMPAT: tempatLbl(j.tempat),
    DESA: j.desa, PENGHULU: j.penghulu || '-', CATIN_PRIA: firstWord(j.catin_pria), CATIN_WANITA: firstWord(j.catin_wanita),
    CATIN_PRIA_LENGKAP: j.catin_pria, CATIN_WANITA_LENGKAP: j.catin_wanita, NAMA_KUA: settings().nama_kua || ''
  };
}
const buildCatinMsg = (j, tpl) => fillTpl(tpl || settings().template_wa_catin, msgMap(j));
/**
 * Rekap modin dikelompokkan per penghulu: nama penghulu sekali di atas, lalu daftar mantennya
 * (urut jam). Urutan penghulu mengikuti master; "Belum ada penghulu" di akhir.
 */
function buildModinMsg(tanggal, list, tpl) {
  const order = {};
  penghuluList(true).forEach((p, i) => { order[p.nama] = i + 1; });
  const groups = {};
  list.forEach((j) => { (groups[j.penghulu || ''] = groups[j.penghulu || ''] || []).push(j); });
  const rank = (k) => (k ? (order[k] || 900) : 999);
  const blocks = Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((k) =>
    `*${k ? 'Penghulu: ' + k : 'Belum ada penghulu'}*\n` + groups[k].slice().sort((a, b) => String(a.jam).localeCompare(String(b.jam)))
      .map((j, i) => `${i + 1}. ${jamDot(j.jam)} - ${String(j.desa || '-').toUpperCase()} - ${namaDepan(j.catin_pria)} & ${namaDepan(j.catin_wanita)} - ${tempatShort(j.tempat)}`).join('\n'));
  return fillTpl(tpl || settings().template_wa_modin, {
    NAMA_KUA: settings().nama_kua || '', HARI: hariOf(tanggal), TANGGAL: tglOf(tanggal),
    DAFTAR_AKAD: blocks.join('\n\n') || '(tidak ada akad)', JUMLAH: String(list.length)
  });
}

// ============================================================
// FORM TAMBAH / EDIT (dashboard)
// ============================================================
function jadwalForm(id) {
  const j = id ? byId(id) : null;
  const v = j ? clone(j) : { catin_pria: '', catin_wanita: '', wali: '', tanggal: S.today, jam: '08:00', tempat: '', desa: '', modin: '', penghulu: '', no_pendaftaran: '', keterangan: '' };
  const desaOpts = (S.boot.desa || []).filter((d) => d.aktif || d.nama === v.desa).map((d) => `<option ${d.nama === v.desa ? 'selected' : ''}>${esc(d.nama)}</option>`).join('');
  const phChips = penghuluList(true).filter((p) => p.aktif || p.nama === v.penghulu).map((p) =>
    `<button type="button" class="chip" data-ph="${esc(p.nama)}" aria-pressed="${v.penghulu === p.nama}"><span class="dot" style="background:${esc(p.warna_hex)}"></span>${esc(p.nama)}</button>`).join('');
  const segBtn = (name, val, lbl) => `<button type="button" data-seg="${name}" data-v="${val}" aria-pressed="${v[name] === val}">${lbl}</button>`;
  const fld = (name, label, inner, req, hint) => `<div class="field" data-f="${name}"><label class="label" for="ef_${name}">${label} ${req ? '<span class="req">*</span>' : '<span class="opt">(opsional)</span>'}</label>${inner}${hint || ''}<div class="err-msg">${icon('alert', 'icon-sm')}<span>Wajib diisi</span></div></div>`;
  openModal({
    title: j ? 'Edit Jadwal' : 'Tambah Jadwal',
    sub: j ? `<span class="id-tag">${esc(j.id)}</span>` : 'Isi data jadwal akad.',
    body: `<form id="ef" novalidate>
      ${fld('catin_pria', 'Nama Catin Pria', `<input class="input upper" id="ef_catin_pria" maxlength="120" value="${esc(v.catin_pria)}" autocomplete="off">`, true)}
      ${fld('catin_wanita', 'Nama Catin Wanita', `<input class="input upper" id="ef_catin_wanita" maxlength="120" value="${esc(v.catin_wanita)}" autocomplete="off">`, true)}
      <div class="field" data-f="wali"><span class="label">Wali <span class="req">*</span></span><div class="seg">${segBtn('wali', 'NASAB', 'Nasab')}${segBtn('wali', 'HAKIM', 'Hakim')}</div><div class="err-msg">${icon('alert', 'icon-sm')}<span>Pilih wali</span></div></div>
      <div class="row-dt">
        ${fld('tanggal', 'Tanggal', `<input class="input tnum" type="date" id="ef_tanggal" value="${esc(v.tanggal)}">`, true, `<div class="hint" id="ef_hari">${v.tanggal ? 'Hari: <b>' + hariOf(v.tanggal) + '</b>' : ''}</div>`)}
        ${fld('jam', 'Jam (WIB)', stepperHtml('ef_jam', v.jam), true)}
      </div>
      <div class="hint warn" id="ef_past" hidden style="margin:-8px 0 14px">Tanggal sudah lewat — tetap boleh disimpan.</div>
      <div class="field" data-f="tempat"><span class="label">Nikah di <span class="req">*</span></span><div class="seg">${segBtn('tempat', 'KANTOR', 'Kantor KUA')}${segBtn('tempat', 'LUAR_KANTOR', 'Luar Kantor')}</div><div class="err-msg">${icon('alert', 'icon-sm')}<span>Pilih lokasi</span></div></div>
      ${fld('desa', 'Desa', `<select class="select" id="ef_desa"><option value="">-- Pilih Desa --</option>${desaOpts}</select>`, true)}
      ${fld('modin', 'Modin', `<select class="select" id="ef_modin"></select>`, false)}
      <div class="field" data-f="penghulu"><span class="label">Penghulu <span class="opt">(opsional)</span></span><div class="flex wrap" id="ef_ph">${phChips}</div><div id="ef_clash"></div><div class="err-msg">${icon('alert', 'icon-sm')}<span>Tidak valid</span></div></div>
      ${fld('keterangan', 'Keterangan', `<textarea class="textarea" id="ef_keterangan" maxlength="500" placeholder="Alamat detail, patokan, dll.">${esc(v.keterangan)}</textarea>`, false)}
      ${j && j.kirim_status === 'TERKIRIM' ? `<div class="callout callout-info">${icon('info', 'icon-sm')} Sudah dikirim ke catin. Mengubah tanggal/jam/tempat/desa/penghulu akan menandai <b>Perlu Kirim Ulang</b>.</div>` : ''}
    </form>`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" id="efSave">${icon('check')}Simpan</button>`,
    onMount: (m) => {
      const st = { wali: v.wali, tempat: v.tempat, penghulu: v.penghulu };
      const modinSel = $('ef_modin');
      const drawModin = () => {
        const desa = $('ef_desa').value;
        const all = (S.boot.modin || []).filter((x) => x.aktif || x.nama === v.modin);
        let list = desa ? all.filter((x) => x.desa === desa) : all;
        if (!list.length) list = all;
        const cur = modinSel.value || v.modin;
        modinSel.innerHTML = '<option value="">-- Pilih Modin --</option>' + list.map((x) => `<option value="${esc(x.nama)}" ${x.nama === cur ? 'selected' : ''}>${esc(x.nama)}${x.desa ? ' — ' + esc(x.desa) : ''}</option>`).join('');
      };
      const drawClash = () => {
        const c = bentrokFor(j, st.penghulu, $('ef_tanggal').value, $('ef_jam').value);
        $('ef_clash').innerHTML = c.length ? `<div class="callout callout-warn">${icon('alert', 'icon-sm')} ${esc(st.penghulu)} bentrok dengan ${c.map((x) => jamDot(x.jam) + ' ' + esc(x.catin_pria)).join(', ')} (selisih &lt; ${esc(settings().jarak_bentrok_menit || 60)} menit). Tetap boleh disimpan.</div>` : '';
        const t = $('ef_tanggal').value;
        $('ef_hari').innerHTML = t ? 'Hari: <b>' + hariOf(t) + '</b>' : '';
        $('ef_past').hidden = !(t && t < S.today);
      };
      bindStepper(m, drawClash);
      drawModin(); drawClash();
      m.querySelectorAll('[data-seg]').forEach((b) => { b.onclick = () => { st[b.dataset.seg] = b.dataset.v; m.querySelectorAll(`[data-seg="${b.dataset.seg}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); b.closest('.field').classList.remove('has-error'); }; });
      m.querySelectorAll('[data-ph]').forEach((b) => { b.onclick = () => { st.penghulu = st.penghulu === b.dataset.ph ? '' : b.dataset.ph; m.querySelectorAll('[data-ph]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.ph === st.penghulu))); drawClash(); }; });
      $('ef_desa').onchange = () => { drawModin(); $('ef_desa').closest('.field').classList.remove('has-error'); };
      $('ef_tanggal').onchange = drawClash;
      m.querySelectorAll('input,textarea').forEach((i) => i.addEventListener('input', () => { const f = i.closest('.field'); if (f) f.classList.remove('has-error'); }));
      $('efSave').onclick = () => {
        const d = {
          id: j ? j.id : '', catin_pria: upName($('ef_catin_pria').value), catin_wanita: upName($('ef_catin_wanita').value), wali: st.wali,
          tanggal: $('ef_tanggal').value, jam: $('ef_jam').value, tempat: st.tempat, desa: $('ef_desa').value, modin: $('ef_modin').value,
          penghulu: st.penghulu, no_pendaftaran: v.no_pendaftaran || '', keterangan: $('ef_keterangan').value.trim()
        };
        const errs = {};
        ['catin_pria', 'catin_wanita', 'wali', 'tanggal', 'jam', 'tempat', 'desa'].forEach((k) => { if (!d[k]) errs[k] = 'Wajib diisi'; });
        if (Object.keys(errs).length) { showFieldErrs(m, errs); return; }
        // Cek duplikat lokal dulu (instan), server tetap memeriksa ulang
        const local = similarTo(Object.assign({}, d, { id: d.id || '__new' }));
        const dupChanged = !j || ['catin_pria', 'catin_wanita', 'tanggal', 'desa', 'no_pendaftaran'].some((k) => String(j[k] || '') !== String(d[k] || ''));
        if (local.length && dupChanged) { dupConfirm(local).then((go) => { if (go) submitJadwal(d, j, true); }); return; }
        submitJadwal(d, j, false);
      };
    }
  });
}

/** Pemilih jam ramah lansia: tombol ▲/▼ besar, langkah 30 menit. */
function stepperHtml(id, val) {
  return `<div class="stepper" data-stepper="${id}">
    <button type="button" class="st-btn" data-step="-1" aria-label="30 menit lebih awal">${icon('chev-down')}</button>
    <output class="st-val tnum" id="${id}_out">${val ? jamDot(val) : '--.--'}</output>
    <button type="button" class="st-btn" data-step="1" aria-label="30 menit lebih siang">${icon('chev-up')}</button>
    <input type="hidden" id="${id}" value="${esc(val || '')}"></div>`;
}
function bindStepper(root, onChange) {
  root.querySelectorAll('[data-stepper]').forEach((w) => {
    const inp = w.querySelector('input[type="hidden"]');
    const out = w.querySelector('output');
    w.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      const cur = inp.value;
      let i = JAM_OPTS.indexOf(cur);
      if (i < 0) i = JAM_OPTS.indexOf('08:00') - (+b.dataset.step);
      i = Math.max(0, Math.min(JAM_OPTS.length - 1, i + (+b.dataset.step)));
      inp.value = JAM_OPTS[i];
      out.textContent = jamDot(inp.value);
      const f = w.closest('.field'); if (f) f.classList.remove('has-error');
      if (onChange) onChange();
    });
  });
}

function showFieldErrs(root, errs) {
  let first = null;
  Object.keys(errs).forEach((k) => {
    const f = root.querySelector(`[data-f="${k}"]`);
    if (!f) return;
    f.classList.add('has-error');
    const s = f.querySelector('.err-msg span'); if (s) s.textContent = errs[k];
    if (!first) first = f;
  });
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function dupConfirm(matches) {
  return new Promise((resolve) => {
    // Simpan isi form yang sedang terbuka agar tidak hilang: gunakan modal kedua di atasnya via toast-style callout
    const html = `<div class="callout callout-warn mt0"><div class="c-head"><span>${icon('layers', 'icon-sm')} Kemungkinan duplikat</span></div>
      <div class="c-body">Sudah ada jadwal serupa:<ul style="margin:6px 0 0;padding-left:18px">${matches.map((x) => `<li>${esc(x.catin_pria)} &amp; ${esc(x.catin_wanita)} — ${esc(fmtLong(x.tanggal))} ${jamDot(x.jam)}, ${esc(x.desa)}</li>`).join('')}</ul></div></div>`;
    const m = $('modal');
    const prevHtml = m.innerHTML;
    const host = document.createElement('div');
    host.className = 'dup-overlay';
    host.style.cssText = 'position:absolute;inset:0;background:rgba(255,255,255,.97);z-index:5;display:flex;flex-direction:column;border-radius:inherit';
    host.innerHTML = `<div class="sheet-head"><h2>Simpan tetap?</h2></div><div class="sheet-body">${html}</div>
      <div class="sheet-foot"><button class="btn" data-x="no">Batal</button><button class="btn btn-primary" data-x="yes">Tetap Simpan</button></div>`;
    m.appendChild(host);
    host.querySelector('[data-x="no"]').onclick = () => { host.remove(); resolve(false); };
    host.querySelector('[data-x="yes"]').onclick = () => { host.remove(); resolve(true); };
    void prevHtml;
  });
}

function submitJadwal(d, j, force) {
  const btn = $('efSave');
  setBtnBusy(btn, true, 'Menyimpan…');
  d.force = !!force;
  api('saveJadwal', S.token, d, j ? j.version : null, who()).then((res) => {
    closeModal(true);
    const cur = byId(res.jadwal.id);
    if (cur) Object.assign(cur, res.jadwal); else S.jadwal.push(res.jadwal);
    delete riwayatCache[res.jadwal.id];
    toast(res.unchanged ? 'Tidak ada perubahan.' : (j ? 'Perubahan disimpan.' : 'Jadwal ditambahkan.'), 'ok');
    if (res.bentrok && res.bentrok.length) toast(`Peringatan bentrok: ${res.jadwal.penghulu} dengan ${res.bentrok.map((b) => jamDot(b.jam) + ' ' + b.catin_pria).join(', ')}.`, 'warn');
    if (!j) { const [a, b] = tabRange(S.tab); if ((a && res.jadwal.tanggal < a) || (b && res.jadwal.tanggal > b)) { if (res.jadwal.tanggal.slice(0, 4) === S.today.slice(0, 4)) S.tab = 'tahun'; else { S.tab = 'filter'; S.f.from = ''; S.f.to = ''; } } }
    renderAll();
    if (S.view === 'jadwal' && !DESK.matches) openDetail(res.jadwal.id);
  }).catch((e) => {
    setBtnBusy(btn, false);
    if (e.code === 'DUPLICATE') { dupConfirm(e.data.matches).then((go) => { if (go) submitJadwal(d, j, true); }); return; }
    if (e.code === 'VALIDATION' && e.data && e.data.fields) { showFieldErrs($('modal'), e.data.fields); return; }
    if (e.code === 'CONFLICT') { closeModal(true); conflictModal(e); return; }
    if (e.code !== 'AUTH') toast(errMsg(e), 'err');
  });
}

// ============================================================
// JADWAL SAYA
// ============================================================
// ============================================================
// BIMWIN — bimbingan perkawinan (v1.4)
// Status per pasangan: Belum (default) · Terjadwal (masuk sesi) · Sudah (hadir)
// Optimistic: tampilan berubah instan, server menyusul lewat antrian (bwQueue).
// ============================================================
const bwSt = (j) => (j && j.bimwin_status) || '';
const sesiById = (id) => S.bimwin.find((x) => x.id === id) || null;
const realId = (id) => S.idMap[id] || id;
const isTmp = (id) => String(id || '').indexOf('tmp-') === 0;
const snapOf = (j) => ({ id: j.id, p: j.catin_pria, w: j.catin_wanita, d: j.desa, t: j.tanggal, j: j.jam, h: '' });
const upcomingSesi = () => S.bimwin.filter((x) => x.tanggal >= S.today).sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
const sesiTitle = (x) => `${hariOf(x.tanggal)}, ${tglOf(x.tanggal)} · ${jamDot(x.jam)}`;

function bwLabel(j) {
  const st = bwSt(j);
  if (st === 'SUDAH') return 'Sudah Bimwin';
  if (st === 'TERJADWAL') { const x = sesiById(j.bimwin_sesi_id); return 'Bimwin ' + (x ? fmtDM(x.tanggal) : 'terjadwal'); }
  return 'Belum Bimwin';
}
/** v2.3: asal data jadwal — Form Publik (modin), KUA-Link (desa), atau Dashboard. */
function sumberLbl(j) { return j.sumber === 'FORM' ? 'Form Publik' : j.sumber === 'KUA-LINK' ? 'KUA-Link (desa)' : 'Dashboard'; }
function klBadge(j) { return j.sumber === 'KUA-LINK' ? '<span class="badge b-info" title="Didaftarkan desa lewat KUA-Link">KUA-Link</span>' : ''; }

function bwBadge(j) {
  const st = bwSt(j);
  const cls = st === 'SUDAH' ? 'b-success' : st === 'TERJADWAL' ? 'b-info' : 'b-danger';
  const ic = st === 'SUDAH' ? 'check' : st === 'TERJADWAL' ? 'calendar' : 'users';
  return `<span class="badge ${cls}">${icon(ic)}${esc(bwLabel(j))}</span>`;
}

/** Desktop: kolom Bimwin di tabel Jadwal (dropdown). Sesi hanya bisa dipilih bila status Belum. */
function bwSelectHtml(j) {
  const st = bwSt(j);
  let opts;
  if (st === 'TERJADWAL') opts = `<option value="TERJADWAL" selected>${esc(bwLabel(j))}</option><option value="">Belum</option><option value="SUDAH">Sudah</option>`;
  else if (st === 'SUDAH') opts = '<option value="SUDAH" selected>Sudah</option><option value="">Belum</option>';
  else {
    const up = upcomingSesi();
    opts = '<option value="" selected>Belum</option><option value="SUDAH">Sudah</option>' + (up.length
      ? `<optgroup label="Masukkan ke sesi">${up.map((x) => `<option value="S:${esc(x.id)}">${esc(hariOf(x.tanggal) + ' ' + fmtDM(x.tanggal) + ' · ' + jamDot(x.jam))}</option>`).join('')}</optgroup>`
      : '<option value="" disabled>Belum ada sesi (buat di menu Bimwin)</option>');
  }
  const cls = st === 'SUDAH' ? 'bw-sudah' : st === 'TERJADWAL' ? 'bw-jadwal' : 'bw-belum';
  return `<select class="cell cell-bw ${cls}" data-bw="${esc(j.id)}" aria-label="Status bimwin">${opts}</select>`;
}
function bwFromSelect(id, v) {
  if (v === 'TERJADWAL') return;
  if (v.indexOf('S:') === 0) actSetBimwin(id, 'TERJADWAL', v.slice(2));
  else actSetBimwin(id, v, '');
}

// ── Sinkron optimistic ──
let bwQueue = Promise.resolve();
function bwSnapshot() {
  if (!S.bwPending) return null;
  const m = {};
  S.jadwal.forEach((j) => { m[j.id] = [bwSt(j), j.bimwin_sesi_id || '']; });
  return { m, sesi: clone(S.bimwin) };
}
/** Data server masuk (muat ulang): bila aksi bimwin masih tersinkron, tampilan lokal dipertahankan. */
function bwFromServer(list, keep) {
  if (keep) {
    S.jadwal.forEach((j) => { const v = keep.m[j.id]; if (v) { j.bimwin_status = v[0]; j.bimwin_sesi_id = v[1]; } });
    S.bimwin = keep.sesi;
    return;
  }
  if (Array.isArray(list)) S.bimwin = list;
}
function bwMutate(local, call, opt) {
  const snapJ = {};
  S.jadwal.forEach((j) => { snapJ[j.id] = [bwSt(j), j.bimwin_sesi_id || '']; });
  const snapS = clone(S.bimwin);
  local();
  S.bwPending++;
  renderAll();
  if (opt && opt.ok) toast(opt.ok, 'ok');
  const p = bwQueue.catch(() => null).then(() => call()).then((res) => {
    S.bwPending--;
    if (opt && opt.tmp && res && res.sesi) S.idMap[opt.tmp] = res.sesi.id;
    ((res && res.jadwal) || []).forEach((x) => { const j = byId(x.id); if (j) { j.bimwin_status = x.bimwin_status; j.bimwin_sesi_id = x.bimwin_sesi_id; } });
    if (!S.bwPending && res && res.bimwin) S.bimwin = res.bimwin;
    if (res && res.skipped && res.skipped.length) toast(`${res.skipped.length} pasangan dilewati karena statusnya bukan Belum Bimwin: ${res.skipped.join(', ')}`, 'warn');
    if (opt && opt.after) opt.after(res);
    renderAll();
    return res;
  }).catch((e) => {
    S.bwPending--;
    S.jadwal.forEach((j) => { const v = snapJ[j.id]; if (v) { j.bimwin_status = v[0]; j.bimwin_sesi_id = v[1]; } });
    S.bimwin = snapS;
    if (e && e.code === 'CONFLICT') toast(errMsg(e), 'warn');
    else if (!e || e.code !== 'AUTH') toast('Gagal disimpan: ' + errMsg(e) + ' Perubahan dibatalkan.', 'err');
    renderAll();
    if (!S.bwPending) quietReload();
    return null;
  });
  bwQueue = p;
  return p;
}

function actSetBimwin(id, st, sid) {
  const j = byId(id);
  if (!j) return;
  if (st !== 'TERJADWAL' && st === bwSt(j)) return;
  if (st === 'TERJADWAL' && bwSt(j)) { toast('Hanya catin berstatus Belum Bimwin yang bisa dimasukkan ke sesi.', 'warn'); renderAll(); return; }
  bwMutate(() => {
    if (st === 'TERJADWAL') {
      const x = sesiById(sid);
      if (x && !x.peserta.some((p) => p.id === id)) x.peserta.push(snapOf(j));
      j.bimwin_status = 'TERJADWAL'; j.bimwin_sesi_id = sid;
    } else if (st === 'SUDAH') { j.bimwin_status = 'SUDAH'; }
    else { j.bimwin_status = ''; j.bimwin_sesi_id = ''; }
  }, () => api('setBimwinStatus', S.token, id, st, realId(sid), who()),
  { ok: st === 'SUDAH' ? 'Ditandai sudah bimwin.' : st === 'TERJADWAL' ? 'Dimasukkan ke sesi bimwin.' : 'Ditandai belum bimwin.' });
}

/** Ubah status bimwin satu pasangan (HP: dari detail / daftar Bimwin). */
function bwStatusModal(id) {
  const j = byId(id);
  if (!j) return;
  const st = bwSt(j);
  const cur = st === 'TERJADWAL' ? 'S:' + j.bimwin_sesi_id : st;
  const item = (v, l, sub, dis) => `<label class="radio-item ${dis ? 'disabled' : ''}"><input type="radio" name="bws" value="${esc(v)}" ${dis ? 'disabled' : ''} ${cur === v ? 'checked' : ''}><span class="grow"><b>${l}</b>${sub ? `<div class="ri-sub">${sub}</div>` : ''}</span></label>`;
  const sesi = upcomingSesi();
  const curSesi = st === 'TERJADWAL' ? sesiById(j.bimwin_sesi_id) : null;
  if (curSesi && !sesi.includes(curSesi)) sesi.unshift(curSesi);
  openModal({
    title: 'Status Bimwin', sub: `${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)} · akad ${esc(fmtLong(j.tanggal))}`,
    body: `<div class="radio-list">${item('', 'Belum Bimwin', '', false)}${item('SUDAH', 'Sudah Bimwin', 'Mis. sudah ikut bimwin di sesi lain / tempat lain', false)}</div>
      <span class="label mt16">Masukkan ke sesi</span>
      <div class="radio-list">${sesi.length ? sesi.map((x) => item('S:' + x.id, esc(sesiTitle(x)), `${esc(x.tempat)} · ${x.peserta.length} pasang`, st !== '' && cur !== 'S:' + x.id)).join('') : '<div class="small muted">Belum ada sesi mendatang. Buat sesi di menu Bimwin.</div>'}</div>
      ${st !== '' ? '<div class="small muted mt8">Sesi hanya bisa dipilih untuk catin berstatus Belum Bimwin.</div>' : ''}`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" data-x="ok">${icon('check')}Simpan</button>`,
    onMount: (m) => {
      m.querySelector('[data-x="ok"]').onclick = () => {
        const v = (m.querySelector('input[name="bws"]:checked') || {}).value;
        closeModal(true);
        if (v === undefined || v === cur) return;
        bwFromSelect(id, v);
      };
    }
  });
}

// ── Tampilan modul Bimwin ──
function renderBimwin() {
  const root = $('bimwinRoot');
  if (!root || !S.boot) return;
  const ae = document.activeElement;
  const keepQ = ae && ae.id === 'bwQ' ? [ae.selectionStart, ae.selectionEnd] : null;
  const all = S.jadwal.filter((j) => !j.arsip);
  const cnt = { BELUM: 0, TERJADWAL: 0, SUDAH: 0 };
  all.forEach((j) => { cnt[bwSt(j) || 'BELUM']++; });
  const tab = (k, l, n) => `<button role="tab" aria-selected="${S.bw.tab === k}" class="${S.bw.tab === k ? 'active' : ''}" data-act="bw-tab" data-v="${k}">${l}${n !== undefined ? ` <span class="count">${n}</span>` : ''}</button>`;
  root.innerHTML = `<div class="page-head"><div><h2>JADWAL BIMWIN</h2><p>Bimbingan perkawinan: pilih catin, buat sesi, unduh undangan &amp; daftar hadir.</p></div></div>
    <div class="tabs bw-tabs" role="tablist">${tab('catin', 'Catin', cnt.BELUM + ' belum')}${tab('sesi', 'Sesi', S.bimwin.length)}</div>
    ${S.bw.tab === 'sesi' ? bwSesiHtml() : bwCatinHtml(all, cnt)}`;
  const q = $('bwQ');
  if (q) {
    let t;
    q.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.bw.q = q.value; renderBimwin(); }, 200); };
    if (keepQ) { q.focus(); try { q.setSelectionRange(keepQ[0], keepQ[1]); } catch (e) { /* abaikan */ } }
  }
}

function bwCatinList(all) {
  const f = S.bw;
  const q = norm(f.q);
  return all.filter((j) => (f.st === 'SEMUA' || (bwSt(j) || 'BELUM') === f.st) &&
    (!q || norm(j.catin_pria + ' ' + j.catin_wanita + ' ' + j.desa).indexOf(q) >= 0))
    .sort((a, b) => bwUrut(a.desa, a.tanggal, a.jam, b.desa, b.tanggal, b.jam));
}
/** v2.1: urutan Bimwin — desa A–Z, lalu tanggal akad terdekat, lalu jam. */
function bwUrut(d1, t1, j1, d2, t2, j2) {
  return String(d1 || '').toLowerCase().localeCompare(String(d2 || '').toLowerCase()) || String(t1 || '').localeCompare(String(t2 || '')) || String(j1 || '').localeCompare(String(j2 || ''));
}

function bwCatinHtml(all, cnt) {
  const f = S.bw;
  Object.keys(f.sel).forEach((id) => { const j = byId(id); if (!j || bwSt(j) || j.arsip) delete f.sel[id]; });
  const list = bwCatinList(all);
  const selN = Object.keys(f.sel).length;
  const belumHere = list.filter((j) => !bwSt(j)).length;
  const chip = (k, l, n, cls) => `<button class="chip ${cls || ''}" data-act="bw-st" data-v="${k}" aria-pressed="${f.st === k}">${l}<span class="count">${n}</span></button>`;
  const rows = list.map((j) => {
    const can = !bwSt(j);
    const sel = !!f.sel[j.id];
    return `<div class="bw-row ${sel ? 'is-sel' : ''}">
      ${can ? `<label class="bw-check"><input type="checkbox" data-bwsel="${esc(j.id)}" ${sel ? 'checked' : ''} aria-label="Pilih ${esc(j.catin_pria)} dan ${esc(j.catin_wanita)}"></label>` : '<span class="bw-check"></span>'}
      <div class="grow"><div class="bw-names">${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}</div>
        <div class="small muted">Akad ${esc(fmtLong(j.tanggal))} · ${jamDot(j.jam)} · Desa ${esc(j.desa)}${j.penghulu ? ' · ' + esc(j.penghulu) : ''}</div></div>
      <div class="bw-side">${bwBadge(j)}<button class="linkbtn small" data-act="bw-edit" data-id="${esc(j.id)}">Ubah</button></div></div>`;
  }).join('');
  return `<div class="panel bw-filter">
      <div class="flex wrap">${chip('BELUM', 'Belum', cnt.BELUM)}${chip('TERJADWAL', 'Terjadwal', cnt.TERJADWAL)}${chip('SUDAH', 'Sudah', cnt.SUDAH)}${chip('SEMUA', 'Semua', all.length)}</div>
      <div class="search-wrap mt8">${icon('search')}<input class="input" id="bwQ" type="search" placeholder="Cari nama catin atau desa…" value="${esc(f.q)}" aria-label="Cari catin"></div>
      <div class="flex wrap mt8"><button class="btn btn-sm" data-act="bw-all" ${belumHere ? '' : 'disabled'}>${icon('check', 'icon-sm')}Pilih semua yang Belum (${belumHere})</button>
        ${selN ? `<button class="btn btn-sm btn-ghost" data-act="bw-clear">Batal pilih</button>` : ''}</div></div>
    <div class="bw-list">${rows || emptyHtml('Tidak ada catin', f.st === 'BELUM' ? 'Semua catin sudah terjadwal atau sudah bimwin.' : 'Coba ubah filter.')}</div>
    ${selN ? `<div class="bw-actbar" role="region" aria-label="Aksi pilihan"><span class="grow"><b class="tnum">${selN}</b> pasang dipilih</span>
      <button class="btn btn-sm" data-act="bw-add" ${S.bimwin.length ? '' : 'disabled'}>Tambah ke Sesi</button>
      <button class="btn btn-sm btn-primary" data-act="bw-new">${icon('plus', 'icon-sm')}Buat Sesi</button></div>` : ''}`;
}

/** Peserta terkini: nama/desa/tanggal dari Jadwal (bila diedit), selain itu salinan di sesi. Urut tanggal + jam akad. */
function bwPeserta(x) {
  return x.peserta.map((p) => { const j = byId(p.id); return Object.assign({}, p, j ? { p: j.catin_pria, w: j.catin_wanita, d: j.desa, t: j.tanggal, j: j.jam } : {}); })
    .sort((a, b) => bwUrut(a.d, a.t, a.j, b.d, b.t, b.j));
}

function bwSesiHtml() {
  const s = settings();
  const missing = [!s.bimwin_tpl_undangan ? 'Undangan' : '', !s.bimwin_tpl_hadir ? 'Daftar Hadir' : ''].filter(Boolean);
  const list = S.bimwin.slice().sort((a, b) => (b.tanggal + b.jam).localeCompare(a.tanggal + a.jam));
  return `<div class="flex mb12"><span class="grow small muted">Satu sesi = satu kelompok (anjuran 5–12 pasang).</span><button class="btn btn-primary btn-sm" data-act="bw-new-empty">${icon('plus', 'icon-sm')}Sesi Baru</button></div>
    ${missing.length ? `<div class="callout callout-warn">${icon('alert', 'icon-sm')} Template ${missing.join(' & ')} belum diatur. <button class="linkbtn" data-act="bw-goto-set">Atur di Pengaturan → Bimwin</button></div>` : ''}
    ${list.length ? `<div class="bw-sesi-grid">${list.map(bwSesiCard).join('')}</div>` : emptyHtml('Belum ada sesi', 'Pilih catin di tab Catin, lalu tekan Buat Sesi.')}`;
}

function bwSesiCard(x) {
  const ps = bwPeserta(x);
  const hadir = x.peserta.filter((p) => p.h === 'Y').length;
  const done = x.peserta.some((p) => p.h);
  const tmp = isTmp(x.id);
  const id = esc(x.id);
  const dis = tmp || !ps.length ? 'disabled' : '';
  const when = x.tanggal < S.today ? ['b-neutral', 'Sudah lewat'] : x.tanggal === S.today ? ['b-warn', 'Hari ini'] : ['b-info', 'Akan datang'];
  return `<article class="panel bw-sesi" data-sesi="${id}">
    <div class="bw-sh"><div class="grow"><h3>${esc(sesiTitle(x))} WIB</h3>
      <div class="small muted">${icon('pin', 'icon-sm')} ${esc(x.tempat)}${x.nomor_surat ? ' · No. ' + esc(x.nomor_surat) : ''}</div>
      ${x.keterangan ? `<div class="small mt8">${esc(x.keterangan)}</div>` : ''}</div>
      <div class="badges">${tmp ? '<span class="badge b-neutral">Menyimpan…</span>' : ''}<span class="badge ${when[0]}">${when[1]}</span><span class="badge b-neutral">${ps.length} pasang${done ? ' · ' + hadir + ' hadir' : ''}</span></div></div>
    <div class="bw-acts">
      <button class="btn btn-primary btn-sm" data-act="bw-doc" data-v="UNDANGAN" data-id="${id}" ${dis}>${icon('download', 'icon-sm')}Undangan PDF</button>
      <button class="btn btn-sm" data-act="bw-doc" data-v="HADIR" data-id="${id}" ${dis}>${icon('download', 'icon-sm')}Daftar Hadir PDF</button>
      <button class="btn btn-sm" data-act="bw-xls" data-id="${id}" ${ps.length ? '' : 'disabled'}>${icon('download', 'icon-sm')}Daftar Hadir Excel</button>
      <button class="btn btn-sm" data-act="bw-wa" data-id="${id}" ${ps.length ? '' : 'disabled'}>${icon('send', 'icon-sm')}Kirim WA</button>
      <button class="btn btn-sm" data-act="bw-hadir" data-id="${id}" ${dis}>${icon('user-check', 'icon-sm')}Kehadiran</button>
      <button class="btn btn-sm btn-ghost" data-act="bw-edit-sesi" data-id="${id}" ${tmp ? 'disabled' : ''}>${icon('edit', 'icon-sm')}Edit</button>
      <button class="btn btn-sm btn-ghost t-del" data-act="bw-del-sesi" data-id="${id}" ${tmp ? 'disabled' : ''}>${icon('x-circle', 'icon-sm')}Hapus</button>
    </div>
    ${ps.length ? `<ol class="bw-plist">${ps.map((p) => `<li><span class="grow"><b>${esc(p.p)}</b> &amp; <b>${esc(p.w)}</b><br><span class="small muted">${esc(p.d)} · akad ${esc(fmtDM(p.t))}</span></span>
      ${p.h === 'Y' ? '<span class="badge b-success">Hadir</span>' : p.h === 'T' ? '<span class="badge b-danger">Tidak hadir</span>' : ''}
      <button class="btn btn-ghost btn-icon btn-sm" data-act="bw-out" data-id="${id}" data-v="${esc(p.id)}" title="Keluarkan dari sesi" aria-label="Keluarkan ${esc(p.p)} dari sesi" ${tmp ? 'disabled' : ''}>${icon('x', 'icon-sm')}</button></li>`).join('')}</ol>`
      : '<div class="small muted">Belum ada peserta.</div>'}
    <button class="btn btn-ghost btn-sm mt8" data-act="bw-goto-catin">${icon('user-plus', 'icon-sm')}Tambah peserta dari daftar Belum</button>
  </article>`;
}

/** Form sesi: tanggal & hari dipilih, jam, tempat, keterangan (opsional), nomor surat (isian terakhir diingat). */
function sesiForm(id, selIds) {
  const x = id ? sesiById(id) : null;
  const st = settings();
  // v2.1: sesi baru → jam, tempat, keterangan otomatis dari sesi terakhir (bawaan Pengaturan bila belum ada sesi)
  const last = S.bimwin.slice().sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')) || String(b.id || '').localeCompare(String(a.id || '')))[0];
  const v = x ? clone(x) : { tanggal: '', jam: (last && last.jam) || st.bimwin_jam || '08:00', tempat: (last && last.tempat) || st.bimwin_tempat || '', keterangan: (last && last.keterangan) || '', nomor_surat: st.bimwin_nomor_terakhir || '' };
  const sel = (selIds || []).map(byId).filter((j) => j && !bwSt(j));
  const fld = (name, label, inner, req, hint) => `<div class="field" data-f="${name}"><label class="label" for="sf_${name}">${label} ${req ? '<span class="req">*</span>' : '<span class="opt">(opsional)</span>'}</label>${inner}${hint || ''}<div class="err-msg">${icon('alert', 'icon-sm')}<span>Wajib diisi</span></div></div>`;
  openModal({
    title: x ? 'Edit Sesi Bimwin' : 'Sesi Bimwin Baru',
    sub: x ? `<span class="id-tag">${esc(x.id)}</span>` : (sel.length ? `${sel.length} pasang akan diundang.` : 'Peserta bisa ditambahkan nanti dari tab Catin.'),
    body: `<form id="sf" novalidate>
      <div class="row-dt">
        ${fld('tanggal', 'Tanggal bimwin', `<input class="input tnum" type="date" id="sf_tanggal" value="${esc(v.tanggal)}">`, true, '<div class="hint" id="sf_hari"></div>')}
        ${fld('jam', 'Jam (WIB)', stepperHtml('sf_jam', v.jam), true)}
      </div>
      ${fld('tempat', 'Tempat', `<input class="input" id="sf_tempat" maxlength="150" value="${esc(v.tempat)}">`, true)}
      ${fld('keterangan', 'Keterangan', `<textarea class="textarea" id="sf_keterangan" maxlength="500" placeholder="Mis. membawa alat tulis, berpakaian rapi">${esc(v.keterangan)}</textarea>`, false, '<div class="hint">Kosong → baris {{keterangan}} di undangan dihapus.</div>')}
      ${fld('nomor_surat', 'Nomor surat', `<input class="input" id="sf_nomor_surat" maxlength="120" value="${esc(v.nomor_surat)}" placeholder="B-…/Kua.13.xx/PW.01/MM/YYYY">`, false, '<div class="hint">Isian terakhir otomatis muncul lagi — tinggal ubah nomornya.</div>')}
      <div id="sf_warn"></div>
      ${sel.length ? `<div class="small muted mt8"><b>Peserta:</b> ${sel.map((j) => esc(j.catin_pria + ' & ' + j.catin_wanita)).join('; ')}</div>` : ''}
    </form>`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" id="sfSave">${icon('check')}${x ? 'Simpan' : 'Buat Sesi'}</button>`,
    onMount: (m) => {
      bindStepper(m);
      const drawHari = () => {
        const t = $('sf_tanggal').value;
        $('sf_hari').innerHTML = t ? 'Hari: <b>' + hariOf(t) + '</b>' + (t < S.today ? ' · <span style="color:var(--warn-fg)">tanggal sudah lewat</span>' : '') : '';
        const ps = x ? bwPeserta(x).map((p) => ({ n: p.p + ' & ' + p.w, t: p.t })) : sel.map((j) => ({ n: j.catin_pria + ' & ' + j.catin_wanita, t: j.tanggal }));
        const early = t ? ps.filter((p) => p.t < t) : [];
        $('sf_warn').innerHTML = early.length ? `<div class="callout callout-warn">${icon('alert', 'icon-sm')} Akad ${early.length} pasangan lebih dulu dari tanggal bimwin: ${early.map((p) => esc(p.n) + ' (' + fmtDM(p.t) + ')').join(', ')}.</div>` : '';
      };
      $('sf_tanggal').onchange = () => { drawHari(); $('sf_tanggal').closest('.field').classList.remove('has-error'); };
      drawHari();
      $('sfSave').onclick = () => {
        const d = { tanggal: $('sf_tanggal').value, jam: $('sf_jam').value, tempat: $('sf_tempat').value.trim(), keterangan: $('sf_keterangan').value.trim(), nomor_surat: $('sf_nomor_surat').value.trim() };
        const errs = {};
        if (!d.tanggal) errs.tanggal = 'Pilih tanggal';
        if (!d.jam) errs.jam = 'Pilih jam';
        if (!d.tempat) errs.tempat = 'Tempat wajib diisi';
        if (Object.keys(errs).length) { showFieldErrs(m, errs); return; }
        closeModal(true);
        if (x) {
          bwMutate(() => { Object.assign(x, d); }, () => { const cur = sesiById(realId(id)); return api('bimwinSimpanSesi', S.token, Object.assign({ id: realId(id) }, d), [], cur ? cur.version : null, who()); }, { ok: 'Sesi diperbarui.' });
          return;
        }
        const tmp = 'tmp-' + Date.now();
        const ids = sel.map((j) => j.id);
        bwMutate(() => {
          S.bimwin.push(Object.assign({ id: tmp, tanggal_surat: S.today, peserta: sel.map(snapOf), version: 1 }, d));
          sel.forEach((j) => { j.bimwin_status = 'TERJADWAL'; j.bimwin_sesi_id = tmp; });
          S.bw.sel = {};
          S.bw.tab = 'sesi';
          settings().bimwin_nomor_terakhir = d.nomor_surat || settings().bimwin_nomor_terakhir;
        }, () => api('bimwinSimpanSesi', S.token, d, ids, null, who()), { tmp, ok: `Sesi dibuat${ids.length ? ' · ' + ids.length + ' pasang' : ''}.` });
      };
    }
  });
}

function bwAddModal() {
  const ids = Object.keys(S.bw.sel);
  if (!ids.length) return;
  const list = S.bimwin.slice().sort((a, b) => (b.tanggal + b.jam).localeCompare(a.tanggal + a.jam));
  const up = upcomingSesi()[0];
  openModal({
    title: 'Tambah ke Sesi', sub: `${ids.length} pasang dipilih`,
    body: `<div class="radio-list">${list.map((x) => `<label class="radio-item"><input type="radio" name="bwa" value="${esc(x.id)}" ${up && up.id === x.id ? 'checked' : ''}>
      <span class="grow"><b>${esc(sesiTitle(x))}</b><div class="ri-sub">${esc(x.tempat)} · ${x.peserta.length} pasang${x.tanggal < S.today ? ' · sudah lewat' : ''}</div></span></label>`).join('')}</div>`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" data-x="ok">${icon('check')}Tambahkan</button>`,
    onMount: (m) => {
      m.querySelector('[data-x="ok"]').onclick = () => {
        const sid = (m.querySelector('input[name="bwa"]:checked') || {}).value;
        if (!sid) { toast('Pilih sesi dulu.', 'warn'); return; }
        closeModal(true);
        const x = sesiById(sid);
        const js = ids.map(byId).filter((j) => j && !bwSt(j));
        bwMutate(() => {
          js.forEach((j) => { if (!x.peserta.some((p) => p.id === j.id)) x.peserta.push(snapOf(j)); j.bimwin_status = 'TERJADWAL'; j.bimwin_sesi_id = sid; });
          S.bw.sel = {};
        }, () => api('bimwinTambahPeserta', S.token, realId(sid), js.map((j) => j.id), who()), { ok: `${js.length} pasang ditambahkan ke sesi ${fmtDM(x.tanggal)}.` });
      };
    }
  });
}

/** Kehadiran: "Semua hadir" lalu hapus centang yang tidak hadir. */
function bwHadirModal(id) {
  const x = sesiById(id);
  if (!x) return;
  const ps = bwPeserta(x);
  openModal({
    title: 'Kehadiran Bimwin', sub: esc(sesiTitle(x)),
    body: `${x.tanggal > S.today ? `<div class="callout callout-info mt0">${icon('info', 'icon-sm')} Sesi ini belum berlangsung.</div>` : ''}
      <div class="flex mb12"><span class="grow small muted">Hadir → Sudah Bimwin. Tidak hadir → kembali Belum (nama tetap tercatat di sesi ini).</span>
        <button class="btn btn-sm" data-x="all">Semua hadir</button></div>
      <div class="radio-list">${ps.map((p) => `<label class="radio-item"><input type="checkbox" name="bwh" value="${esc(p.id)}" ${p.h !== 'T' ? 'checked' : ''}>
        <span class="grow"><b>${esc(p.p)} &amp; ${esc(p.w)}</b><div class="ri-sub">${esc(p.d)} · akad ${esc(fmtDM(p.t))}</div></span></label>`).join('')}</div>`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" data-x="ok">${icon('check')}Simpan Kehadiran</button>`,
    onMount: (m) => {
      m.querySelector('[data-x="all"]').onclick = () => m.querySelectorAll('input[name="bwh"]').forEach((c) => { c.checked = true; });
      m.querySelector('[data-x="ok"]').onclick = () => {
        const hadir = Array.from(m.querySelectorAll('input[name="bwh"]:checked')).map((c) => c.value);
        closeModal(true);
        bwMutate(() => {
          x.peserta.forEach((p) => {
            const h = hadir.indexOf(p.id) >= 0;
            p.h = h ? 'Y' : 'T';
            const j = byId(p.id);
            if (j && j.bimwin_sesi_id === x.id) { j.bimwin_status = h ? 'SUDAH' : ''; }
          });
        }, () => api('bimwinKehadiran', S.token, realId(id), hadir, who()), { ok: `Kehadiran disimpan: ${hadir.length} dari ${ps.length} pasang hadir.` });
      };
    }
  });
}

function bwOut(id, jid) {
  const x = sesiById(id);
  if (!x) return;
  bwMutate(() => {
    x.peserta = x.peserta.filter((p) => p.id !== jid);
    const j = byId(jid);
    if (j && j.bimwin_sesi_id === x.id && bwSt(j) !== 'SUDAH') { j.bimwin_status = ''; j.bimwin_sesi_id = ''; }
  }, () => api('bimwinKeluarkan', S.token, realId(id), jid, who()), { ok: 'Dikeluarkan dari sesi (status kembali Belum).' });
}

async function bwDelSesi(id) {
  const x = sesiById(id);
  if (!x) return;
  const ok = await confirmBox('Hapus sesi?', `Sesi <b>${esc(sesiTitle(x))}</b> dihapus. Peserta yang belum hadir kembali berstatus <b>Belum Bimwin</b>. File PDF yang sudah dibuat tetap ada di Drive.`, 'Hapus Sesi', 'btn-danger');
  if (!ok) return;
  bwMutate(() => {
    S.bimwin = S.bimwin.filter((s) => s !== x);
    S.jadwal.forEach((j) => { if (j.bimwin_sesi_id === x.id && bwSt(j) !== 'SUDAH') { j.bimwin_status = ''; j.bimwin_sesi_id = ''; } });
  }, () => api('bimwinHapusSesi', S.token, realId(id), who()), { ok: 'Sesi dihapus.' });
}

function downloadB64(b64, name, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** PDF dibuat di server dari template Docs (±3–8 detik), menunggu aksi bimwin yang masih tersinkron. */
function actBwDoc(id, jenis, btn) {
  const sid = realId(id);
  if (isTmp(sid)) { toast('Sesi masih disimpan. Coba lagi sebentar.', 'warn'); return; }
  setBtnBusy(btn, true, 'Menyiapkan PDF…');
  bwQueue.catch(() => null).then(() => api('bimwinDokumen', S.token, sid, jenis)).then((r) => {
    setBtnBusy(btn, false);
    downloadB64(r.base64, r.nama, 'application/pdf');
    toast(`${r.nama} diunduh. Salinannya tersimpan di folder Drive.`, 'ok');
  }).catch((e) => {
    setBtnBusy(btn, false);
    if (e && e.code === 'TEMPLATE') toast(errMsg(e), 'err', { label: 'Buka Pengaturan', fn: () => { S.setTab = 'bimwin'; navigateTo('setting'); } });
    else if (!e || e.code !== 'AUTH') toast(errMsg(e), 'err');
  });
}

function bwExcel(id) {
  const x = sesiById(id);
  if (!x) return;
  if (!window.XLSX) { toast('Pustaka Excel belum termuat. Periksa koneksi lalu coba lagi.', 'err'); return; }
  const s = settings();
  const rows = [];
  let n = 0;
  // v2.1: catin pria & wanita dalam satu baris (sama dengan PDF daftar hadir)
  bwPeserta(x).forEach((p) => { n++; rows.push([n, p.p, p.w, p.d, tglOf(p.t), '', '', '']); });
  const k = Math.max(0, Math.min(40, Number(s.bimwin_baris_kosong) || 0));
  for (let i = 0; i < k; i++) { n++; rows.push([n, '', '', '', '', '', '', '']); }
  const aoa = [['DAFTAR HADIR BIMBINGAN PERKAWINAN'], [kuaName() + (s.wilayah ? ' · ' + s.wilayah : '')], ['Hari/Tanggal', fmtLong(x.tanggal)],
    ['Jam', jamDot(x.jam) + ' WIB'], ['Tempat', x.tempat], [], ['No', 'Nama Catin Pria', 'Nama Catin Wanita', 'Desa', 'Tanggal Akad', 'No. HP', 'TTD Catin Pria', 'TTD Catin Wanita'], ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [5, 28, 28, 16, 20, 16, 18, 18].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Hadir');
  XLSX.writeFile(wb, `Daftar Hadir Bimwin ${x.tanggal}.xlsx`);
  toast('Daftar hadir Excel diunduh.', 'ok');
}

function bwWaText(x, tpl) {
  const ps = bwPeserta(x);
  return fillTpl(tpl || settings().template_wa_bimwin || (S.boot.defaults || {}).template_wa_bimwin, {
    NAMA_KUA: settings().nama_kua || '', HARI: hariOf(x.tanggal), TANGGAL: tglOf(x.tanggal), JAM: jamDot(x.jam), TEMPAT: x.tempat,
    KETERANGAN: x.keterangan ? 'Keterangan   : ' + x.keterangan : '', JUMLAH: String(ps.length),
    DAFTAR: ps.map((p, i) => `${i + 1}. ${p.p} & ${p.w} (${p.d})`).join('\n') || '-'
  }).replace(/\n{3,}/g, '\n\n');
}

/** Kirim WA ke grup kerja: teks dari template; PDF undangan dilampirkan sendiri. */
function bwWaModal(id) {
  const x = sesiById(id);
  if (!x) return;
  const text = bwWaText(x);
  openModal({
    title: 'Kirim ke WhatsApp', sub: esc(sesiTitle(x)),
    body: `<div class="callout callout-info mt0">${icon('info', 'icon-sm')} Unduh <b>Undangan PDF</b> dulu. Setelah WhatsApp terbuka, pilih grup, lalu lampirkan PDF bersama pesan ini.</div>
      <div class="msg-preview"><div class="msg-bubble" id="bwWaPrev"></div></div>`,
    foot: `<button class="btn" data-x="copy">${icon('copy')}Salin teks</button><button class="btn btn-primary" data-x="wa">${icon('send')}Buka WhatsApp</button>`,
    onMount: (m) => {
      $('bwWaPrev').textContent = text;
      m.querySelector('[data-x="copy"]').onclick = () => copyText(text);
      m.querySelector('[data-x="wa"]').onclick = () => { openWa('', text); closeModal(true); };
    }
  });
}

// ── Setting → Bimwin ──
const BW_FIELD_DESC = {
  nomor_surat: 'Nomor surat (diketik di sesi)', tanggal_surat: 'Tanggal sesi dibuat', hari: 'Hari bimwin', tanggal: 'Tanggal bimwin',
  hari_tanggal: 'Hari, tanggal bimwin', jam: 'Jam (mis. 08.00)', tempat: 'Tempat bimwin', keterangan: 'Keterangan (kosong → baris dihapus)',
  jumlah_pasangan: 'Jumlah pasangan', nama_kua: 'Nama KUA', kabupaten: 'Kabupaten', TABEL: 'Posisi tabel otomatis'
};
const BW_SAMPLE = () => ({ id: 'contoh', tanggal: S.today, jam: settings().bimwin_jam || '08:00', tempat: settings().bimwin_tempat || 'Aula KUA', keterangan: '',
  peserta: [{ id: 'x1', p: 'Ahmad Fauzan', w: 'Siti Aisyah', d: 'Sawoo', t: S.today, j: '08:00' }, { id: 'x2', p: 'Budi Santoso', w: 'Rina Lestari', d: 'Grogol', t: S.today, j: '09:00' }] });

function renderBimwinSetting() {
  const s = settings();
  const fields = (S.boot.bimwinFields || Object.keys(BW_FIELD_DESC).filter((k) => k !== 'TABEL')).concat(['TABEL']);
  const tplBox = (key, label, jenis) => {
    const id = s[key];
    const url = s[key + '_url'];
    return `<div class="mrow-card"><div class="flex wrap"><div class="grow"><b>${label}</b><div class="small ${id ? '' : 'muted'}">${id ? icon('check-circle', 'icon-sm') + ' Terpasang' : 'Belum diatur'}</div></div>
      ${url ? `<a class="btn btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('edit', 'icon-sm')}Buka &amp; edit template</a>` : ''}</div>
      <div class="link-box"><input class="input" id="tpl_${jenis}" placeholder="Tempel link Google Docs template ${label}" autocomplete="off"><button class="btn btn-primary" data-act="bw-tpl" data-v="${jenis}">${id ? 'Ganti' : 'Pasang'}</button></div>
      <div id="tplInfo_${jenis}"></div></div>`;
  };
  const ph = ['NAMA_KUA', 'HARI', 'TANGGAL', 'JAM', 'TEMPAT', 'KETERANGAN', 'JUMLAH', 'DAFTAR'];
  $('setBody').innerHTML = `<div class="panel"><h3>Template dokumen (Google Docs)</h3>
      <p class="small muted mt0">Buat template di Google Docs (kop, isi surat, tanda tangan), tulis field seperti <code>{{tanggal}}</code> di tempat yang diinginkan, lalu tempel link dokumennya di sini. Salinannya disimpan di Drive: <b>AKAD TRACKER by Ahzani Labs → Template</b>. Dokumen harus milik atau dibagikan ke akun pemilik aplikasi. Edit lewat tombol <b>Buka &amp; edit template</b> tidak perlu dipasang ulang.</p>
      ${tplBox('bimwin_tpl_undangan', 'Undangan', 'UNDANGAN')}${tplBox('bimwin_tpl_hadir', 'Daftar Hadir', 'HADIR')}</div>
    <div class="panel"><h3>Field yang tersedia</h3><p class="small muted mt0">Ketuk untuk menyalin, lalu tempel di Google Docs. Penulisan harus sama persis (huruf kecil, kecuali TABEL).</p>
      <div class="bw-fields">${fields.map((k) => `<button class="bw-field" data-act="copy" data-v="{{${k}}}"><code>{{${k}}}</code><span>${esc(BW_FIELD_DESC[k] || '')}</span></button>`).join('')}</div>
      <div class="small muted mt8">Tabel otomatis — <b>Undangan</b>: No, Nama Catin Pria, Nama Catin Wanita, Desa, Tanggal Akad. <b>Daftar Hadir</b>: No, Nama Catin Pria, Nama Catin Wanita, Desa, Tanggal Akad, No. HP, TTD Catin Pria, TTD Catin Wanita + baris kosong (template landscape disarankan). Urut desa A–Z, lalu tanggal akad. Lebar tabel otomatis selebar halaman. Boleh lebih dari satu <code>{{TABEL}}</code> (tabel yang sama diulang). Tanpa <code>{{TABEL}}</code>, tabel diletakkan di halaman baru di akhir dokumen.</div></div>
    <div class="panel"><h3>Bawaan sesi</h3>
      <div class="row-dt"><div class="field"><label class="label" for="bwJam">Jam bawaan</label><select class="select" id="bwJam">${jamOptHtml(s.bimwin_jam || '08:00')}</select></div>
      <div class="field"><label class="label" for="bwKosong">Baris kosong daftar hadir</label><input class="input tnum" id="bwKosong" type="number" min="0" max="40" value="${esc(s.bimwin_baris_kosong || '6')}"><div class="hint">Untuk peserta susulan yang ditulis tangan.</div></div></div>
      <div class="field"><label class="label" for="bwTempat">Tempat bawaan</label><input class="input" id="bwTempat" maxlength="150" value="${esc(s.bimwin_tempat || '')}"></div>
      <div class="flex"><span class="grow"></span><button class="btn btn-primary" data-act="bw-set-save">${icon('check')}Simpan</button></div></div>
    <div class="panel"><h3>Template WA undangan (ke grup kerja)</h3>
      <div class="ph-list">${ph.map((p) => `<code data-act="ins-ph" data-t="tplBw" data-v="{${p}}">{${p}}</code>`).join('')}</div>
      <textarea class="textarea mt8" id="tplBw" rows="12" style="font-family:ui-monospace,Menlo,monospace;font-size:13.5px;min-height:220px">${esc(s.template_wa_bimwin || '')}</textarea>
      <div class="flex mt8"><span class="small muted grow">Pratinjau dengan data contoh:</span><button class="btn btn-ghost btn-sm" data-act="bw-wa-default">Kembalikan default</button></div>
      <div class="msg-preview mt8"><div class="msg-bubble" id="tplBw_prev"></div></div>
      <div class="flex mt8"><span class="grow"></span><button class="btn btn-primary" data-act="bw-wa-save">${icon('check')}Simpan Template WA</button></div></div>`;
  const draw = () => { $('tplBw_prev').textContent = bwWaText(BW_SAMPLE(), $('tplBw').value); };
  $('tplBw').oninput = draw;
  draw();
}

function actSetTpl(jenis, btn) {
  const link = $('tpl_' + jenis).value.trim();
  if (!link) { toast('Tempel link Google Docs dulu.', 'warn'); return; }
  setBtnBusy(btn, true, 'Memeriksa…');
  api('bimwinSetTemplate', S.token, jenis, link).then((r) => {
    S.boot.settings = r.settings;
    renderSetBody();
    const msgs = [];
    if (r.unknown.length) msgs.push('Field tidak dikenal (tidak akan terisi): ' + r.unknown.map((k) => '{{' + k + '}}').join(', ') + '.');
    if (!r.hasTabel) msgs.push('Tidak ada {{TABEL}}: tabel akan diletakkan di halaman terakhir.');
    const info = $('tplInfo_' + jenis);
    if (info) info.innerHTML = msgs.length ? `<div class="callout callout-warn">${icon('alert', 'icon-sm')} ${esc(msgs.join(' '))}</div>`
      : `<div class="callout callout-ok">${icon('check-circle', 'icon-sm')} Template terpasang · ${r.fields.length} field dikenali.</div>`;
    toast('Template ' + (jenis === 'HADIR' ? 'Daftar Hadir' : 'Undangan') + ' terpasang.', 'ok');
  }).catch((e) => { setBtnBusy(btn, false); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
}

// ============================================================
// REKAP MODIN
// ============================================================
/** Modin yang punya akad pada tanggal terpilih (modin tercatat di jadwal, atau desa sama bila modin kosong). */
function rekapModins() {
  const day = S.jadwal.filter((j) => !j.arsip && j.status !== 'BATAL' && j.tanggal === S.rekap.tanggal);
  return (S.boot.modin || []).filter((m) => m.aktif && day.some((j) => j.modin === m.nama || (!j.modin && m.desa && j.desa === m.desa)));
}
function rkModinHtml() {
  const modins = rekapModins();
  if (S.rekap.modin && !modins.some((m) => m.nama === S.rekap.modin)) S.rekap.modin = '';
  return modins.length ? modins.map((m) => `<label class="radio-item ${m.no_wa ? '' : 'disabled'}"><input type="radio" name="rkm" value="${esc(m.nama)}" ${m.no_wa ? '' : 'disabled'} ${S.rekap.modin === m.nama ? 'checked' : ''}>
        <span class="grow"><b>${esc(m.nama)}</b><div class="ri-sub">${esc(m.desa || '—')} · ${m.no_wa ? esc('+' + m.no_wa) : 'Belum ada nomor WA — lengkapi di Pengaturan → Modin'}</div></span></label>`).join('')
    : `<div class="small muted">Tidak ada modin dengan akad pada ${esc(fmtLong(S.rekap.tanggal))}.</div>`;
}

function renderRekap() {
  if (!S.rekap.tanggal) S.rekap.tanggal = S.today;
  $('rekapRoot').innerHTML = `
    <div class="page-head"><div><h2>REKAP MODIN</h2><p>Kirim rekap harian ke modin lewat WhatsApp.</p></div></div>
    <div class="rk-grid"><div class="panel">
      <div class="field"><label class="label" for="rkTgl">Tanggal</label><input type="date" class="input tnum" id="rkTgl" value="${esc(S.rekap.tanggal)}"><div class="hint" id="rkHari"></div></div>
      <span class="label">Modin tujuan <span class="opt">(yang punya akad di tanggal ini)</span></span>
      <div class="radio-list" id="rkModin">${rkModinHtml()}</div>
      <span class="label mt16">Penghulu</span>
      <div class="flex wrap" id="rkPeng">${[['', 'Semua Penghulu']].concat(penghuluList().map((p) => [p.nama, p.nama])).map(([v, l]) => `<button type="button" class="chip" data-act="rk-peng" data-v="${esc(v)}" aria-pressed="${S.rekap.penghulu === v}">${v ? `<span class="dot" style="background:${esc(colorOf(v))}"></span>` : ''}${esc(l)}</button>`).join('')}</div>
      <label class="check mt8"><input type="checkbox" id="rkOnly" ${S.rekap.onlyDesa ? 'checked' : ''}><span>Hanya akad di desa modin terpilih <span class="small muted">(disarankan — data pribadi catin desa lain tidak ikut terkirim)</span></span></label>
    </div>
    <div class="panel"><h3>Pratinjau pesan</h3><div class="msg-preview"><div class="msg-bubble" id="rkPrev"></div></div>
      <div class="small muted mt8" id="rkInfo"></div>
      <button class="btn btn-primary btn-lg btn-block mt16" id="rkSend">${icon('send')}Kirim ke WhatsApp Modin</button></div></div>`;
  $('rkTgl').onchange = (e) => { S.rekap.tanggal = e.target.value; $('rkModin').innerHTML = rkModinHtml(); renderRekapPreview(); };
  $('rkOnly').onchange = (e) => { S.rekap.onlyDesa = e.target.checked; renderRekapPreview(); };
  $('rkModin').onchange = (e) => { if (e.target.name === 'rkm') { S.rekap.modin = e.target.value; renderRekapPreview(); } };
  $('rkSend').onclick = sendRekap;
  renderRekapPreview();
}

function rekapList() {
  const m = (S.boot.modin || []).find((x) => x.nama === S.rekap.modin);
  return S.jadwal.filter((j) => !j.arsip && j.status !== 'BATAL' && j.tanggal === S.rekap.tanggal && (!S.rekap.onlyDesa || !m || j.desa === m.desa) &&
    (!S.rekap.penghulu || j.penghulu === S.rekap.penghulu))
    .sort((a, b) => a.jam.localeCompare(b.jam));
}

function renderRekapPreview() {
  if (!$('rkPrev')) return;
  const t = S.rekap.tanggal;
  if (!t) return;
  $('rkHari').innerHTML = 'Hari: <b>' + hariOf(t) + '</b>';
  const list = rekapList();
  $('rkPrev').textContent = buildModinMsg(t, list);
  const outOfRange = S.range.from && t < S.range.from;
  $('rkInfo').innerHTML = `${list.length} akad pada ${esc(fmtLong(t))}${S.rekap.penghulu ? ' · ' + esc(S.rekap.penghulu) : ' · semua penghulu'} (tidak termasuk batal & arsip).${outOfRange ? ' <b>Tanggal di luar periode data yang dimuat</b> — ubah periode di Filter (tab Semua).' : ''}`;
  $('rkSend').disabled = !S.rekap.modin || !list.length;
}

function sendRekap() {
  const m = (S.boot.modin || []).find((x) => x.nama === S.rekap.modin);
  if (!m || !m.no_wa) { toast('Pilih modin yang memiliki nomor WA.', 'warn'); return; }
  const list = rekapList();
  openWa(m.no_wa, buildModinMsg(S.rekap.tanggal, list));
  api('logModinRekap', S.token, S.rekap.tanggal, m.nama, who())
    .then(() => { list.forEach((j) => delete riwayatCache[j.id]); toast(`Rekap untuk ${m.nama} dicatat di riwayat.`, 'ok'); })
    .catch((e) => toast('WhatsApp dibuka, tetapi pencatatan riwayat gagal: ' + errMsg(e), 'warn'));
}

// ============================================================
// SETTING
// ============================================================
const SET_TABS = [['desa', 'Desa'], ['modin', 'Modin'], ['penghulu', 'Penghulu'], ['tim', 'Tim'], ['template', 'Template WA'], ['bimwin', 'Bimwin'], ['umum', 'Umum'], ['keamanan', 'Keamanan'], ['arsip', 'Arsip']];
const MASTER_OF = { desa: 'DESA', modin: 'MODIN', penghulu: 'PENGHULU', tim: 'TIM' };

function renderSetting() {
  $('settingRoot').innerHTML = `<div class="page-head"><div><h2>PENGATURAN</h2><p>Data master, template, dan keamanan.</p></div></div>
    <div class="scroll-x set-tabs">${SET_TABS.map(([k, l]) => `<button class="chip" data-act="set-tab" data-v="${k}" aria-pressed="${S.setTab === k}">${l}</button>`).join('')}</div>
    <div id="setBody"></div>`;
  renderSetBody();
}

function renderSetBody() {
  const t = S.setTab;
  if (MASTER_OF[t]) return renderMaster(t);
  if (t === 'template') return renderTemplate();
  if (t === 'bimwin') return renderBimwinSetting();
  if (t === 'umum') return renderUmum();
  if (t === 'keamanan') return renderKeamanan();
  if (t === 'arsip') return renderArsip();
}

function masterSource(t) { return S.boot[t] || []; }

function renderMaster(t) {
  if (!S.mdraft[t]) S.mdraft[t] = clone(masterSource(t)).map((r) => Object.assign(r, { _saved: true, _orig: r.nama }));
  const rows = S.mdraft[t];
  const desaOpts = (sel) => `<option value="">— Desa —</option>${(S.boot.desa || []).map((d) => `<option ${d.nama === sel ? 'selected' : ''}>${esc(d.nama)}</option>`).join('')}`;
  const pal = S.boot.palette || [];
  const rowHtml = (r, i) => {
    const nameIn = `<input class="input" data-i="${i}" data-k="nama" value="${esc(r.nama)}" placeholder="Nama" maxlength="80" aria-label="Nama">`;
    const sw = `<label class="switch" title="${r.aktif ? 'Aktif' : 'Nonaktif'}"><input type="checkbox" data-i="${i}" data-k="aktif" ${r.aktif ? 'checked' : ''} aria-label="Aktif"><span></span></label>`;
    const rm = `<button class="btn btn-ghost btn-icon t-del" data-act="m-del" data-i="${i}" title="Hapus" aria-label="Hapus ${esc(r.nama)}">${icon('x-circle')}</button>`;
    let extra = '';
    if (t === 'modin') extra = `<div class="row-2"><select class="select" data-i="${i}" data-k="desa">${desaOpts(r.desa)}</select><input class="input tnum" data-i="${i}" data-k="no_wa" value="${esc(r.no_wa)}" placeholder="No WA, mis. 0812…" inputmode="tel"></div>`;
    if (t === 'penghulu') extra = `<div class="swatches">${pal.map((c) => `<button type="button" class="swatch" style="background:${c}" data-act="m-color" data-i="${i}" data-v="${c}" aria-pressed="${String(r.warna_hex).toUpperCase() === c}" aria-label="Warna ${c}"></button>`).join('')}</div>`;
    if (t === 'tim') extra = `<select class="select" data-i="${i}" data-k="label">${['Kepala KUA', 'Staf', 'Penghulu'].map((l) => `<option ${r.label === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `<div class="mrow-card ${r.aktif ? '' : 'inactive'}"><div class="mr-top">${t === 'penghulu' ? `<span class="dot" style="background:${esc(r.warna_hex || '#ccc')};width:14px;height:14px"></span>` : ''}${nameIn}${sw}${rm}</div>${extra}</div>`;
  };
  const notes = {
    desa: 'Desa nonaktif tidak muncul di form.',
    modin: 'Nomor WA otomatis dinormalisasi ke format 62…. Modin tanpa nomor tidak bisa dipilih di Rekap Modin.',
    penghulu: 'Warna dipilih dari palet yang tidak bertabrakan dengan warna status (merah/amber/hijau).',
    tim: 'Daftar nama untuk identitas. Label "Penghulu" membuat pembatalan diberi tanda Perlu Dicek.'
  };
  $('setBody').innerHTML = `<div class="panel"><h3>${SET_TABS.find((x) => x[0] === t)[1]}</h3><p class="small muted mt0">${notes[t]} Ubah nama langsung di kotaknya (jadwal lama ikut diperbarui), tombol ⊗ untuk menghapus, lalu tekan <b>Simpan</b>.</p>
    <div id="mrows">${rows.map(rowHtml).join('')}</div>
    <div class="flex mt16 wrap"><button class="btn" data-act="m-add">${icon('plus')}Tambah</button><span class="grow"></span>
    <button class="btn" data-act="m-reset">Batalkan Perubahan</button><button class="btn btn-primary" data-act="m-save">${icon('check')}Simpan</button></div></div>`;
  $('mrows').oninput = $('mrows').onchange = (e) => {
    const el = e.target; const i = +el.dataset.i; const k = el.dataset.k;
    if (!k || isNaN(i)) return;
    rows[i][k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'aktif') el.closest('.mrow-card').classList.toggle('inactive', !el.checked);
  };
}

function masterAction(act, el) {
  const t = S.setTab;
  const rows = S.mdraft[t];
  if (act === 'm-add') {
    const base = { nama: '', aktif: true };
    if (t === 'modin') Object.assign(base, { desa: '', no_wa: '' });
    if (t === 'penghulu') { const used = rows.map((r) => r.warna_hex); Object.assign(base, { warna_hex: (S.boot.palette || []).find((c) => used.indexOf(c) < 0) || S.boot.palette[0], urutan: rows.length + 1 }); }
    if (t === 'tim') base.label = 'Staf';
    rows.push(base); renderMaster(t);
    const ins = $('mrows').querySelectorAll('input[data-k="nama"]'); if (ins.length) ins[ins.length - 1].focus();
  } else if (act === 'm-del') { rows.splice(+el.dataset.i, 1); renderMaster(t); }
  else if (act === 'm-color') { rows[+el.dataset.i].warna_hex = el.dataset.v; renderMaster(t); }
  else if (act === 'm-reset') { delete S.mdraft[t]; renderMaster(t); }
  else if (act === 'm-save') {
    const payload = rows.map((r, i) => { const o = Object.assign({}, r); delete o._saved; if (!r._saved) delete o._orig; if (t === 'penghulu') o.urutan = i + 1; return o; });
    setBtnBusy(el, true, 'Menyimpan…');
    api('saveMaster', S.token, MASTER_OF[t], payload).then((res) => {
      Object.assign(S.boot, res);
      delete S.mdraft[t];
      toast(res.renamed ? `Data master disimpan. ${res.renamed} jadwal ikut diperbarui.` : 'Data master disimpan.', 'ok');
      renderSetBody(); renderAll();
      if (res.renamed) reloadJadwal().catch(() => {});
    }).catch((e) => { setBtnBusy(el, false); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
  }
}

const SAMPLE = { tanggal: '', jam: '08:00', catin_pria: 'Ahmad Fauzan', catin_wanita: 'Siti Aisyah', tempat: 'LUAR_KANTOR', desa: 'Sawoo', penghulu: 'Penghulu A' };
function renderTemplate() {
  const s = settings();
  const sample = Object.assign({}, SAMPLE, { tanggal: S.today });
  const sampleList = [sample, Object.assign({}, SAMPLE, { jam: '09:00', catin_pria: 'Budi Santoso', catin_wanita: 'Rina Lestari', tempat: 'KANTOR', desa: 'Tumpakpelem', penghulu: 'Penghulu B' })];
  const ph1 = ['HARI', 'TANGGAL', 'JAM', 'TEMPAT', 'DESA', 'PENGHULU', 'CATIN_PRIA', 'CATIN_WANITA', 'NAMA_KUA'];
  const ph2 = ['NAMA_KUA', 'HARI', 'TANGGAL', 'DAFTAR_AKAD', 'JUMLAH'];
  const block = (id, title, val, phs) => `<div class="panel"><h3>${title}</h3>
    <div class="ph-list">${phs.map((p) => `<code data-act="ins-ph" data-t="${id}" data-v="{${p}}">{${p}}</code>`).join('')}</div>
    <textarea class="textarea mt8 tnum" id="${id}" rows="12" style="font-family:ui-monospace,Menlo,monospace;font-size:13.5px;min-height:240px">${esc(val)}</textarea>
    <div class="flex mt8"><span class="small muted grow">Pratinjau dengan data contoh:</span><button class="btn btn-ghost btn-sm" data-act="tpl-default" data-t="${id}">Kembalikan default</button></div>
    <div class="msg-preview mt8"><div class="msg-bubble" id="${id}_prev"></div></div></div>`;
  $('setBody').innerHTML = block('tplCatin', 'Template pesan ke Catin', s.template_wa_catin, ph1) + block('tplModin', 'Template rekap ke Modin', s.template_wa_modin, ph2) +
    `<div class="flex"><span class="grow small muted">{CATIN_PRIA}/{CATIN_WANITA} = kata pertama nama. Rekap memakai nama lengkap.</span><button class="btn btn-primary" data-act="tpl-save">${icon('check')}Simpan Template</button></div>`;
  const draw = () => {
    $('tplCatin_prev').textContent = buildCatinMsg(sample, $('tplCatin').value);
    $('tplModin_prev').textContent = buildModinMsg(S.today, sampleList, $('tplModin').value);
  };
  $('tplCatin').oninput = draw; $('tplModin').oninput = draw; draw();
}

function renderUmum() {
  const s = settings();
  const formUrl = S.boot.appUrl ? S.boot.appUrl + '?page=form' : '';
  $('setBody').innerHTML = `<div class="panel"><h3>Identitas & aturan</h3>
    <div class="field"><label class="label" for="suKua">Nama KUA</label><input class="input" id="suKua" value="${esc(s.nama_kua)}" maxlength="60"><div class="hint">Tampil sebagai “KUA ${esc(s.nama_kua)}”.</div></div>
    <div class="field"><label class="label" for="suWil">Kabupaten</label><input class="input" id="suWil" value="${esc(s.wilayah)}" maxlength="60" placeholder="Contoh: Ponorogo"><div class="hint">Tampil di bawah judul: “KUA ${esc(s.nama_kua)} · ${esc(s.wilayah || 'Kabupaten')}”.</div></div>
    <div class="field"><span class="label">Logo <span class="opt">(opsional · JPG / PNG / WebP)</span></span>
      <div class="logo-row"><div class="logo-prev" id="suLogoPrev">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="Logo">` : icon('landmark', 'icon-lg')}</div>
        <input type="file" id="suLogoFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <button class="btn" type="button" data-act="logo-pick">${icon('upload')}Unggah Gambar</button>
        <button class="btn btn-ghost" type="button" data-act="logo-clear" ${s.logo_url ? '' : 'hidden'} id="suLogoClear">${icon('x')}Hapus Logo</button></div>
      <input type="hidden" id="suLogo" value="${esc(s.logo_url)}">
      <div class="hint">Tampil di kiri atas aplikasi dan di form. Gambar otomatis diperkecil. Klik <b>Simpan</b> setelah memilih.</div></div>
    <div class="field"><label class="label" for="suJarak">Jarak bentrok (menit)</label><input class="input tnum" id="suJarak" type="number" min="0" max="600" value="${esc(s.jarak_bentrok_menit)}"><div class="hint">Dua akad penghulu yang sama dengan selisih kurang dari ini ditandai Bentrok.</div></div>
    <div class="flex"><span class="grow"></span><button class="btn btn-primary" data-act="umum-save">${icon('check')}Simpan</button></div></div>
    <div class="panel"><h3>Link Form Publik (untuk modin)</h3>
    ${formUrl ? `<div class="qr-box"><div id="qrcode"></div><div class="grow" style="min-width:220px"><div class="link-box"><input class="input" readonly value="${esc(formUrl)}" id="formUrl"><button class="btn" data-act="copy" data-v="${esc(formUrl)}">${icon('copy')}Salin</button></div>
      <div class="qr-actions"><button class="btn btn-primary" data-act="qr-download">${icon('download')}Download QR (siap cetak)</button></div>
      <p class="small muted">Bagikan link/QR ini ke modin. Tidak perlu password. QR yang diunduh berisi judul, nama KUA, dan link — siap dicetak lalu ditempel di tempat yang mudah dijangkau.</p></div></div>
      <div class="link-box mt16"><input class="input" readonly value="${esc(S.boot.appUrl)}"><button class="btn" data-act="copy" data-v="${esc(S.boot.appUrl)}">${icon('copy')}Salin link dashboard</button></div>
      <p class="small muted">Link dashboard + password hanya untuk tim KUA (data pribadi catin — UU 27/2022 PDP).</p>` : '<p class="small muted">URL Web App belum tersedia (aplikasi belum di-deploy).</p>'}</div>
    <div class="panel mob-only"><h3>Menu bawah (khusus HP ini)</h3>
      <div class="flex"><div class="grow"><b>Beri jarak aman di bawah menu</b><div class="hint mt0">Biarkan <b>mati</b> agar menu menempel ke dasar layar tanpa celah. Nyalakan hanya bila tombol navigasi HP menutupi tulisan menu. Jarak aman yang dilaporkan HP: <b class="tnum">${safeInsetPx()} px</b>.</div></div>
        <label class="switch"><input type="checkbox" id="suNavSafe" ${navSafeOn() ? 'checked' : ''} aria-label="Beri jarak aman di bawah menu"><span></span></label></div></div>`;
  $('suNavSafe').onchange = (e) => { lsSet('akd_nav_safe', e.target.checked ? '1' : null); applyNavSafe(); };
  if (formUrl && window.QRCode) { try { new QRCode($('qrcode'), { text: formUrl, width: 128, height: 128, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { /* abaikan */ } }
  $('suLogoFile').onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    logoFromFile(file).then((data) => {
      $('suLogo').value = data;
      $('suLogoPrev').innerHTML = `<img src="${data}" alt="Logo">`;
      $('suLogoClear').hidden = false;
      toast('Logo siap. Klik Simpan untuk memakainya.', 'ok');
    }).catch((err) => toast(err.message, 'err'));
  };
}

/**
 * Logo unggahan diperkecil di perangkat (canvas) menjadi data URL kecil (maks. 45.000 karakter)
 * agar muat di satu sel Google Sheets — tanpa perlu tautan https / hosting gambar.
 */
function logoFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || String(file.type).indexOf('image') !== 0) { reject(new Error('Pilih file gambar (JPG, PNG, atau WebP).')); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error('Ukuran gambar maksimal 15 MB.')); return; }
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(src);
      const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
      for (const max of [160, 128, 96, 64]) {
        const k = Math.min(1, max / Math.max(W, H));
        const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const png = c.toDataURL('image/png');
        if (png.length <= 45000) { resolve(png); return; }
        ctx.globalCompositeOperation = 'destination-over';   // JPEG tanpa transparansi → latar putih
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        const jpg = c.toDataURL('image/jpeg', 0.85);
        if (jpg.length <= 45000) { resolve(jpg); return; }
      }
      reject(new Error('Gambar terlalu rumit untuk dijadikan logo. Coba gambar lain.'));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Gambar tidak bisa dibaca. Coba JPG atau PNG.')); };
    img.src = src;
  });
}

/** QR form publik siap cetak: judul, nama KUA, QR besar, link → PNG (unduh langsung + pratinjau). */
function downloadQr() {
  const url = S.boot.appUrl ? S.boot.appUrl + '?page=form' : '';
  if (!url) { toast('URL Web App belum tersedia.', 'err'); return; }
  if (!window.QRCode) { toast('Pustaka QR belum termuat. Periksa koneksi lalu coba lagi.', 'err'); return; }
  const tmp = document.createElement('div');
  new QRCode(tmp, { text: url, width: 760, height: 760, correctLevel: QRCode.CorrectLevel.M });
  const qr = tmp.querySelector('canvas');
  if (!qr) { toast('Browser tidak mendukung pembuatan gambar QR.', 'err'); return; }
  const finish = (logo) => {
    const W = 1200, H = (logo ? 1560 : 1440) + 34 * Math.max(0, Math.ceil(url.length / 60) - 1);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#1E3A5F'; x.lineWidth = 6; x.strokeRect(24, 24, W - 48, H - 48);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    let y = 130;
    if (logo) { const s = 110, k = s / Math.max(logo.width, logo.height); x.drawImage(logo, (W - logo.width * k) / 2, 70, logo.width * k, logo.height * k); y = 250; }
    x.fillStyle = '#0F172A'; x.font = `800 72px ${font}`; x.fillText('FORM JADWAL AKAD', W / 2, y);
    const s = settings();
    x.fillStyle = '#334155'; x.font = `600 42px ${font}`; x.fillText(`KUA ${s.nama_kua || ''}${s.wilayah ? ' · ' + s.wilayah : ''}`, W / 2, y + 66);
    const qy = y + 120;
    x.imageSmoothingEnabled = false;
    x.drawImage(qr, (W - 760) / 2, qy, 760, 760);
    x.imageSmoothingEnabled = true;
    x.fillStyle = '#0F172A'; x.font = `700 40px ${font}`; x.fillText('Scan untuk mengisi jadwal akad nikah', W / 2, qy + 830);
    x.fillStyle = '#475569'; x.font = `500 24px ui-monospace, Menlo, Consolas, monospace`;
    const lines = []; let cur = '';
    url.split('').forEach((ch) => { if (x.measureText(cur + ch).width > W - 160) { lines.push(cur); cur = ch; } else cur += ch; });
    if (cur) lines.push(cur);
    lines.forEach((l, i) => x.fillText(l, W / 2, qy + 890 + i * 34));
    x.fillStyle = '#94A3B8'; x.font = `600 24px ${font}`; x.fillText('AKAD TRACKER by Ahzani Labs', W / 2, H - 56);
    let data = '';
    try { data = c.toDataURL('image/png'); } catch (e) { toast('Gagal membuat gambar QR.', 'err'); return; }
    const name = `QR-Form-Jadwal-Akad-KUA-${String(s.nama_kua || '').replace(/[^A-Za-z0-9]+/g, '-')}.png`;
    const a = document.createElement('a');
    a.href = data; a.download = name; document.body.appendChild(a);
    try { a.click(); } catch (e) { /* pratinjau di bawah tetap tersedia */ }
    a.remove();
    openModal({
      title: 'QR Form Jadwal Akad', sub: 'File PNG sudah diunduh. Bila tidak muncul, tekan tombol di bawah atau tekan lama gambar lalu Simpan.',
      body: `<img src="${data}" alt="QR form jadwal akad" style="width:100%;max-width:420px;display:block;margin:0 auto;border:1px solid var(--border);border-radius:12px">`,
      foot: `<button class="btn" data-act="modal-close">Tutup</button><a class="btn btn-primary" href="${data}" download="${esc(name)}">${icon('download')}Download PNG</a>`
    });
  };
  // Logo hanya digambar bila berupa unggahan (data URL); tautan luar bisa memblokir pembuatan gambar
  const lg = settings().logo_url;
  if (lg && lg.indexOf('data:image') === 0) { const im = new Image(); im.onload = () => finish(im); im.onerror = () => finish(null); im.src = lg; }
  else finish(null);
}

function renderKeamanan() {
  $('setBody').innerHTML = `<div class="panel"><h3>Ganti password dashboard</h3>
    <p class="small muted mt0">Setelah diganti, semua perangkat (termasuk perangkat ini) diminta masuk ulang.</p>
    <form id="pwForm" novalidate>
    <div class="field" data-f="lama"><label class="label" for="pwOld">Password lama</label><input class="input" type="password" id="pwOld" autocomplete="current-password"><div class="err-msg">${icon('alert', 'icon-sm')}<span>Wajib diisi</span></div></div>
    <div class="field" data-f="baru"><label class="label" for="pwNew">Password baru (min. 6 karakter)</label><input class="input" type="password" id="pwNew" autocomplete="new-password"><div class="err-msg">${icon('alert', 'icon-sm')}<span>Minimal 6 karakter</span></div></div>
    <div class="field" data-f="ulang"><label class="label" for="pwNew2">Ulangi password baru</label><input class="input" type="password" id="pwNew2" autocomplete="new-password"><div class="err-msg">${icon('alert', 'icon-sm')}<span>Tidak sama</span></div></div>
    <button class="btn btn-primary" type="submit" id="pwSave">${icon('lock')}Ganti Password</button></form></div>
    <div class="panel"><h3>Perangkat ini</h3><p class="small muted mt0">Keluar akan menghapus sesi di perangkat ini saja.</p><button class="btn btn-danger" data-act="logout">${icon('logout')}Keluar</button></div>`;
  $('pwForm').onsubmit = (e) => {
    e.preventDefault();
    const root = $('pwForm');
    root.querySelectorAll('.has-error').forEach((x) => x.classList.remove('has-error'));
    const lama = $('pwOld').value, baru = $('pwNew').value, ulang = $('pwNew2').value;
    const errs = {};
    if (!lama) errs.lama = 'Wajib diisi';
    if (baru.length < 6) errs.baru = 'Minimal 6 karakter';
    if (baru !== ulang) errs.ulang = 'Tidak sama';
    if (Object.keys(errs).length) { showFieldErrs(root, errs); return; }
    const btn = $('pwSave');
    setBtnBusy(btn, true, 'Menyimpan…');
    api('changePassword', S.token, lama, baru).then(() => {
      toast('Password diganti. Silakan masuk dengan password baru.', 'ok');
      authLost('Password telah diganti. Masuk dengan password baru.');
    }).catch((e2) => { setBtnBusy(btn, false); if (e2.code === 'WRONG') showFieldErrs(root, { lama: 'Password lama salah' }); else if (e2.code !== 'AUTH') toast(errMsg(e2), 'err'); });
  };
}

function renderArsip() {
  // Tahun yang SEMUA akadnya sudah terlaksana (tanggal < hari ini) → boleh diarsip sekaligus
  const byYear = {};
  S.jadwal.filter((j) => !j.arsip).forEach((j) => {
    const y = j.tanggal.slice(0, 4);
    const o = byYear[y] = byYear[y] || { n: 0, last: '' };
    o.n++; if (j.tanggal > o.last) o.last = j.tanggal;
  });
  const years = Object.keys(byYear).sort();
  const yHtml = years.length ? years.map((y) => {
    const ok = byYear[y].last < S.today;
    return `<div class="mrow-card"><div class="flex"><div class="grow"><b>Tahun ${y}</b><div class="small muted">${byYear[y].n} akad belum diarsip${ok ? ' · semua sudah terlaksana' : ' · masih ada akad yang belum terlaksana'}</div></div>
      <button class="btn btn-sm ${ok ? 'btn-primary' : ''}" data-act="arsip-year" data-v="${y}" ${ok ? '' : 'disabled'}>${icon('archive', 'icon-sm')}Arsipkan ${y}</button></div></div>`;
  }).join('') : '<div class="small muted">Tidak ada data.</div>';
  $('setBody').innerHTML = `<div class="panel"><h3>Arsipkan per tahun</h3><p class="small muted mt0">Bila semua akad di satu tahun sudah terlaksana (mis. sudah ganti tahun), seluruh jadwal tahun itu bisa diarsip sekaligus agar aplikasi tetap ringan.</p>${yHtml}</div>
    <div class="panel"><h3>Arsip jadwal</h3><p class="small muted mt0">Jadwal yang diarsip tidak tampil di daftar. Pulihkan untuk menampilkan kembali, atau hapus permanen.</p><div id="arsipList"><div class="skel" style="height:80px"></div></div></div>`;
  api('listJadwal', S.token, { arsip: 'only' }).then((res) => {
    S.arsipList = res.jadwal.sort((a, b) => (b.tanggal + b.jam).localeCompare(a.tanggal + a.jam));
    drawArsip();
  }).catch((e) => { if ($('arsipList')) $('arsipList').innerHTML = `<div class="small" style="color:var(--danger-fg)">${esc(errMsg(e))}</div>`; });
}
function drawArsip() {
  const el = $('arsipList');
  if (!el) return;
  const list = S.arsipList || [];
  if (!list.length) { el.innerHTML = emptyHtml('Arsip kosong', ''); return; }
  el.innerHTML = list.map((j) => `<div class="mrow-card"><div class="flex wrap"><div class="grow"><b>${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}</b>
    <div class="small muted tnum">${esc(fmtLong(j.tanggal))} · ${jamDot(j.jam)} · ${esc(j.desa)}${j.penghulu ? ' · ' + esc(j.penghulu) : ''}</div>
    <div class="small muted">Diarsip ${esc(stampShort(j.arsip_at))} oleh ${esc(j.arsip_oleh)}</div></div>
    <button class="btn btn-sm" data-act="unarchive" data-id="${esc(j.id)}">${icon('undo', 'icon-sm')}Pulihkan</button>
    <button class="btn btn-sm btn-danger" data-act="arsip-del" data-id="${esc(j.id)}">${icon('x-circle', 'icon-sm')}Hapus</button></div></div>`).join('');
}
async function actArchiveYear(y, btn) {
  const n = S.jadwal.filter((j) => !j.arsip && j.tanggal.slice(0, 4) === y).length;
  const ok = await confirmBox(`Arsipkan tahun ${y}?`, `<b>${n} akad</b> tahun ${y} akan dipindah ke arsip dan tidak tampil di daftar. Bisa dipulihkan kapan saja.`, 'Arsipkan', 'btn-primary');
  if (!ok) return;
  // Optimistic: langsung hilang dari daftar, server menulis sekali (batch)
  const ids = S.jadwal.filter((j) => !j.arsip && j.tanggal.slice(0, 4) === y).map((j) => j.id);
  ids.forEach((id) => { const j = byId(id); if (j) j.arsip = true; });
  renderAll(); renderArsip();
  api('archiveYear', S.token, y, who()).then((r) => { toast(`${r.jumlah} akad tahun ${y} diarsipkan.`, 'ok'); reloadJadwal().then(() => { if (S.setTab === 'arsip' && S.view === 'setting') renderArsip(); }).catch(() => {}); })
    .catch((e) => { ids.forEach((id) => { const j = byId(id); if (j) j.arsip = false; }); renderAll(); if (S.setTab === 'arsip') renderArsip(); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
}
async function actDeleteArchived(id, btn) {
  const j = (S.arsipList || []).find((x) => x.id === id);
  if (!j) return;
  const ok = await confirmBox('Hapus permanen?', `<b>${esc(j.catin_pria)} &amp; ${esc(j.catin_wanita)}</b> (${esc(fmtLong(j.tanggal))}) dihapus dari arsip.`, 'Hapus', 'btn-danger');
  if (!ok) return;
  S.arsipList = S.arsipList.filter((x) => x.id !== id);
  drawArsip();
  api('deleteJadwal', S.token, id, who()).then(() => toast('Dihapus dari arsip.', 'ok'))
    .catch((e) => { S.arsipList.push(j); drawArsip(); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
}
function actUnarchive(id, btn) {
  setBtnBusy(btn, true);
  api('restoreJadwal', S.token, id, who()).then((res) => {
    S.arsipList = (S.arsipList || []).filter((x) => x.id !== id);
    const cur = byId(id);
    if (cur) Object.assign(cur, res.jadwal); else S.jadwal.push(res.jadwal);
    toast('Jadwal dipulihkan.', 'ok');
    drawArsip(); renderAll();
  }).catch((e) => { setBtnBusy(btn, false); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
}

// ============================================================
// FILTER LAIN, EXPORT, IDENTITAS
// ============================================================
const emptyFilter = () => ({ penghulu: '', tindakan: '', status: '', tempat: '', wali: '', from: '', to: '', bulan: false, q: '' });

/** Tab "Filter Tanggal": status, nikah di, wali, penghulu, lalu rentang tanggal akad. Disaring lokal (0 ms). */
function filterTanggalModal() {
  const f = S.f;
  const opt = (name, val, lbl, cur) => `<button type="button" class="chip" data-fm="${name}" data-v="${esc(val)}" aria-pressed="${cur === val}">${lbl}</button>`;
  openModal({
    title: 'Filter Tanggal', sub: 'Saring jadwal yang belum diarsip. Kosongkan tanggal untuk semua periode.',
    body: `<div class="field"><span class="label">Status</span><div class="flex wrap">${opt('status', '', 'Semua', f.status)}${Object.keys(STATUS_LBL).map((k) => opt('status', k, STATUS_LBL[k], f.status)).join('')}</div></div>
      <div class="field"><span class="label">Nikah di</span><div class="flex wrap">${opt('tempat', '', 'Semua', f.tempat)}${opt('tempat', 'KANTOR', 'Kantor KUA', f.tempat)}${opt('tempat', 'LUAR_KANTOR', 'Luar Kantor', f.tempat)}</div></div>
      <div class="field"><span class="label">Wali</span><div class="flex wrap">${opt('wali', '', 'Semua', f.wali)}${opt('wali', 'NASAB', 'Nasab', f.wali)}${opt('wali', 'HAKIM', 'Hakim', f.wali)}</div></div>
      <div class="field"><span class="label">Penghulu</span><div class="flex wrap">${opt('penghulu', '', 'Semua', f.penghulu)}${penghuluList(true).map((p) => opt('penghulu', p.nama, esc(p.nama), f.penghulu)).join('')}${opt('penghulu', '__none', 'Belum ada', f.penghulu)}</div></div>
      <div class="field"><span class="label">Rentang tanggal akad</span><div class="row-dt"><input type="date" class="input tnum" id="fmFrom" value="${esc(f.from)}" aria-label="Dari tanggal"><input type="date" class="input tnum" id="fmTo" value="${esc(f.to)}" aria-label="Sampai tanggal"></div>
        <div class="hint">Dari – sampai (boleh salah satu saja).</div></div>`,
    foot: `<button class="btn" data-x="reset">Reset</button><button class="btn btn-primary" data-x="apply">${icon('check')}Terapkan</button>`,
    onMount: (m) => {
      const draft = Object.assign({}, f);
      m.querySelectorAll('[data-fm]').forEach((b) => b.onclick = () => {
        draft[b.dataset.fm] = b.dataset.v;
        m.querySelectorAll(`[data-fm="${b.dataset.fm}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === b.dataset.v)));
      });
      const done = () => { closeModal(true); S.tab = 'filter'; S.scrollToday = false; renderSummary(); renderAfterFilter(); };
      m.querySelector('[data-x="reset"]').onclick = () => { S.f = Object.assign(emptyFilter(), { q: f.q }); done(); };
      m.querySelector('[data-x="apply"]').onclick = () => {
        let from = $('fmFrom').value, to = $('fmTo').value;
        if (from && to && from > to) { const x = from; from = to; to = x; }
        S.f = Object.assign(draft, { from, to, tindakan: '', bulan: false });
        done();
      };
    }
  });
}

function periodLabel() {
  const [a, b] = S.f.bulan ? monthRange(S.today) : tabRange(S.tab);
  if (S.f.bulan) return S.today.slice(0, 7);
  if (a && a === b) return a;
  return `${a || 'awal'}_sd_${b || 'seterusnya'}`;
}

function exportModal() {
  openModal({
    title: 'Export Excel',
    body: `<p class="mt0">Mengekspor jadwal sesuai <b>tab & filter aktif</b> (${esc(periodLabel().replace('_sd_', ' s.d. '))}).</p>
      <label class="check"><input type="checkbox" id="exArsip"><span>Sertakan jadwal yang diarsip</span></label>
      <div class="small muted mt8">File berisi 2 sheet: <b>Data</b> dan <b>Rekap</b>. Berisi data pribadi catin — simpan di folder kantor.</div>`,
    foot: `<button class="btn" data-act="modal-close">Batal</button><button class="btn btn-primary" id="exGo">${icon('download')}Unduh .xlsx</button>`,
    onMount: () => { $('exGo').onclick = () => doExport($('exArsip').checked, $('exGo')); }
  });
}

function doExport(inclArsip, btn) {
  if (!window.XLSX) { toast('Pustaka Excel belum termuat. Periksa koneksi lalu coba lagi.', 'err'); return; }
  const [from, to] = S.f.bulan ? monthRange(S.today) : tabRange(S.tab);
  setBtnBusy(btn, true, 'Menyiapkan…');
  api('exportData', S.token, { from, to, arsip: inclArsip }).then((rows) => {
    // Terapkan filter aktif yang sama dengan daftar (kecuali status arsip)
    const keep = new Set(filtered().map((j) => j.id));
    const fActive = S.f.penghulu || S.f.tindakan || S.f.status || S.f.tempat || S.f.wali || S.f.q;
    const data = rows.filter((r) => !fActive || keep.has(r.id) || (r.arsip && matchesBasic(r)))
      .sort((a, b) => (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam));
    const head = ['ID', 'Hari', 'Tanggal', 'Jam', 'Catin Pria', 'Catin Wanita', 'Wali', 'Tempat', 'Desa', 'Modin', 'Penghulu', 'No. Pendaftaran', 'Keterangan', 'Status', 'Verifikasi', 'Status Kirim WA', 'Terakhir Kirim', 'Dikirim Oleh', 'Kemungkinan Duplikat', 'Alasan Batal', 'Dibatalkan Oleh', 'Sumber', 'Pengisi Form', 'Status Bimwin', 'Arsip', 'Dibuat', 'Dibuat Oleh', 'Diubah', 'Diubah Oleh'];
    const body = data.map((r) => [r.id, hariOf(r.tanggal), r.tanggal, jamDot(r.jam), r.catin_pria, r.catin_wanita, waliLbl(r.wali), tempatLbl(r.tempat), r.desa, r.modin, r.penghulu,
      r.no_pendaftaran, r.keterangan, STATUS_LBL[autoStatus(r)], r.verifikasi, r.kirim_status, r.kirim_terakhir_at, r.kirim_terakhir_oleh, r.duplikat_flag ? 'Ya' : '',
      r.batal_alasan, r.batal_oleh, sumberLbl(r), r.pengisi_form, bwLabel(r), r.arsip ? 'Ya' : '', r.created_at, r.created_by, r.updated_at, r.updated_by]);
    const cnt = (fn) => data.filter(fn).length;
    const rekap = [['Rekap AKAD TRACKER — ' + kuaName()], ['Periode', periodLabel().replace('_sd_', ' s.d. ')], ['Total jadwal', data.length], [],
      ['Per Penghulu', 'Jumlah'], ...[...new Set(data.map((r) => r.penghulu || '(Belum ada)'))].sort().map((p) => [p, cnt((r) => (r.penghulu || '(Belum ada)') === p)]), [],
      ['Tempat', 'Jumlah'], ['Kantor KUA', cnt((r) => r.tempat === 'KANTOR')], ['Luar Kantor', cnt((r) => r.tempat === 'LUAR_KANTOR')], [],
      ['Wali', 'Jumlah'], ['Nasab', cnt((r) => r.wali === 'NASAB')], ['Hakim', cnt((r) => r.wali === 'HAKIM')], [],
      ['Status', 'Jumlah'], ['Terjadwal', cnt((r) => autoStatus(r) === 'TERJADWAL')], ['Terlaksana', cnt((r) => autoStatus(r) === 'TERLAKSANA')]];
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([head, ...body]);   // sel bertipe teks → tidak dieksekusi sebagai formula
    ws1['!cols'] = head.map((h, i) => ({ wch: [22, 8, 11, 6, 24, 24, 7, 11, 14, 14, 14, 16, 30][i] || 14 }));
    ws1['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: head.length - 1 } }) };
    const ws2 = XLSX.utils.aoa_to_sheet(rekap);
    ws2['!cols'] = [{ wch: 28 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Data');
    XLSX.utils.book_append_sheet(wb, ws2, 'Rekap');
    XLSX.writeFile(wb, `AKAD-TRACKER_${periodLabel()}.xlsx`);
    closeModal(true);
    toast(`${data.length} jadwal diekspor.`, 'ok');
  }).catch((e) => { setBtnBusy(btn, false); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
}
/** Untuk baris arsip (tidak ada di state lokal): cocokkan filter dasar. */
function matchesBasic(r) {
  const f = S.f;
  if (f.penghulu && (f.penghulu === '__none' ? !!r.penghulu : r.penghulu !== f.penghulu)) return false;
  if (f.status && autoStatus(r) !== f.status) return false;
  if (f.tempat && r.tempat !== f.tempat) return false;
  if (f.wali && r.wali !== f.wali) return false;
  if (f.q && norm(r.catin_pria + ' ' + r.catin_wanita + ' ' + r.desa).indexOf(norm(f.q)) < 0) return false;
  return !f.tindakan;
}

function whoModal(first) {
  const tim = whoOptions();
  openModal({
    title: first ? 'Siapa Anda?' : 'Ganti identitas',
    sub: 'Nama hanya untuk catatan Riwayat, bukan hak akses. Pilihan diingat di perangkat ini.',
    dismissable: !first,
    body: `<div class="who-list" data-who-first="${first ? 1 : 0}">${tim.map((t) => `<button class="who-item ${S.who === t.nama ? 'current' : ''}" data-who="${esc(t.nama)}"><span class="av">${esc(t.nama.replace(/^(Staf|Penghulu)\s*[—-]?\s*/i, '').charAt(0) || t.nama.charAt(0))}</span><span class="grow"><b>${esc(t.nama)}</b><div class="lbl">${esc(t.label)}</div></span>${S.who === t.nama ? icon('check') : ''}</button>`).join('')}</div>
      ${tim.length ? '' : '<div class="small muted">Daftar Tim kosong. Isi sheet MASTER_TIM.</div>'}`,
    foot: first ? '' : `<button class="btn btn-danger" data-act="logout">${icon('logout')}Keluar</button>`,
    onMount: (m) => m.querySelectorAll('[data-who]').forEach((b) => b.onclick = () => {
      S.who = b.dataset.who;
      lsSet(LS.who, S.who);
      closeModal(true);
      renderHeader();
      toast('Masuk sebagai ' + S.who + '.', 'ok');
    })
  });
}

function logout() {
  const t = S.token;
  lsSet(LS.token, null);
  lsSet(LS.bootCache, null);   // data catin tidak tertinggal di perangkat
  S.token = null;
  closeAll();
  showScreen('login');
  $('loginSub').textContent = 'Anda telah keluar.';
  if (t) api('logout', t).catch(() => {});
}

// ============================================================
// DATA: bootstrap, reload, auto-refresh
// ============================================================
function defaultRange() { return { from: '', to: '' }; }   // semua yang belum diarsip (arsip per tahun menjaga data tetap ringan)

function applyBoot(data) {
  S.boot = data;
  S.today = data.today;
  S.serverNow = data.serverNow;
  if (!S.customRange) S.range = defaultRange();
  S.jadwal = data.jadwal || [];
  S.bimwin = data.bimwin || [];
}

/**
 * Prinsip 2 (gas-instant-ux): stale-while-revalidate.
 * Data terakhir dari localStorage langsung dirender (0 ms, tanpa spinner),
 * lalu getBootstrap di latar belakang menggantinya dengan data terbaru.
 */
let bootSaveT = null;
function scheduleBootCacheSave() {
  if (!S.token || !S.boot) return;
  clearTimeout(bootSaveT);
  bootSaveT = setTimeout(() => {
    try { lsSet(LS.bootCache, JSON.stringify({ at: Date.now(), range: S.range, custom: S.customRange, boot: Object.assign({}, S.boot, { jadwal: S.jadwal, bimwin: S.bimwin }) })); }
    catch (e) { /* kuota penuh / mode privat → abaikan */ }
  }, 800);
}
function readBootCache() {
  try { const c = JSON.parse(lsGet(LS.bootCache) || 'null'); return c && c.boot && Array.isArray(c.boot.jadwal) ? c : null; } catch (e) { return null; }
}

function enterApp() {
  showScreen('app');
  const saved = lsGet(LS.who);
  const valid = whoOptions().some((t) => t.nama === saved);
  S.who = valid ? saved : '';
  navigateTo(S.view || 'jadwal');
  renderAll();
  if (!S.who && !modalOpen()) whoModal(true);
}

function bootstrap() {
  const cached = readBootCache();
  let fromCache = false;
  if (cached) {
    fromCache = true;
    if (cached.custom) { S.customRange = true; S.range = cached.range; }
    applyBoot(Object.assign({}, cached.boot, { today: ds(new Date()) }));
    enterApp();
    $('footUpdated').textContent = 'Menyinkronkan data terbaru…';
    $('refreshBtn').classList.add('loading');
  } else {
    showScreen('boot');
  }
  const r = S.customRange ? S.range : defaultRange();
  return api('getBootstrap', S.token, r).then((data) => {
    setSkew(data.serverNow);
    if (fromCache) {
      // Pertahankan aksi yang sedang tersinkron (optimistic) saat data segar masuk
      const fresh = data.jadwal;
      data.jadwal = S.jadwal;
      S.boot = data; S.today = data.today; S.serverNow = data.serverNow;
      if (!S.customRange) S.range = defaultRange();
      const keepBw = bwSnapshot();
      mergeServerList(fresh);
      bwFromServer(data.bimwin, keepBw);
      renderAll();
      if (S.view === 'setting' && !Object.keys(S.mdraft).length) renderSetBody();
      if (S.who && !whoOptions().some((t) => t.nama === S.who)) { S.who = ''; lsSet(LS.who, null); renderHeader(); whoModal(true); }
      else if (!S.who && document.querySelector('#modal.show [data-who-first="1"]')) whoModal(true);   // daftar nama dari salinan lama → segarkan
    } else {
      applyBoot(data);
      enterApp();
    }
    startAutoRefresh();
  }).catch((e) => {
    if (e.code === 'AUTH') return;
    if (fromCache) { toast('Gagal menyinkronkan: ' + errMsg(e) + ' Data yang tampil adalah salinan terakhir.', 'warn'); startAutoRefresh(); return; }
    showScreen('login');
    $('loginSub').textContent = errMsg(e);
  }).finally(() => $('refreshBtn').classList.remove('loading'));
}

function reloadJadwal() {
  return api('listJadwal', S.token, { from: S.range.from, to: S.range.to }).then((res) => {
    const keepBw = bwSnapshot();
    mergeServerList(res.jadwal);
    bwFromServer(res.bimwin, keepBw);
    S.today = res.today; S.serverNow = res.serverNow; setSkew(res.serverNow);
    renderAll();
  });
}

/** Ganti data lokal dengan data server, tetapi jangan timpa jadwal yang aksi-nya masih tersinkron. */
function mergeServerList(list) {
  const pendingIds = Object.keys(S.pending);
  if (!pendingIds.length) { S.jadwal = list; return; }
  const keep = S.jadwal.filter((j) => S.pending[j.id]);
  S.jadwal = list.filter((j) => !S.pending[j.id]).concat(keep);
}

function reloadAll(btn) {
  const b = $('refreshBtn');
  b.classList.add('loading');
  return api('getBootstrap', S.token, { from: S.range.from, to: S.range.to }).then((data) => {
    const jad = data.jadwal;
    data.jadwal = S.jadwal;
    S.boot = data; S.today = data.today; S.serverNow = data.serverNow; setSkew(data.serverNow);
    const keepBw = bwSnapshot();
    mergeServerList(jad);
    bwFromServer(data.bimwin, keepBw);
    Object.keys(riwayatCache).forEach((k) => delete riwayatCache[k]);
    renderAll();
    if (S.view === 'setting' && !Object.keys(S.mdraft).length) renderSetBody();
    if (btn) toast('Data diperbarui.', 'ok');
  }).catch((e) => { if (e.code !== 'AUTH' && btn) toast(errMsg(e), 'err'); })
    .finally(() => b.classList.remove('loading'));
}

let quietT = null;
function quietReload() { clearTimeout(quietT); quietT = setTimeout(() => { if (S.token && !Object.keys(S.pending).length && !S.bwPending) reloadJadwal().catch(() => {}); }, 1500); }

let refreshTimer = null;
function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || !S.token || Object.keys(S.pending).length || S.bwPending || modalOpen()) return;
    const ae = document.activeElement;
    if (ae && ae.dataset && ae.dataset.edit) return;   // sedang mengedit sel di tabel → jangan ditimpa
    $('refreshBtn').classList.add('loading');
    reloadJadwal().catch(() => {}).finally(() => $('refreshBtn').classList.remove('loading'));
  }, REFRESH_MS);
}

// ============================================================
// EVENT — delegasi klik tunggal
// ============================================================
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-act="row-menu"]')) closeRowMenu();   // klik di mana pun (termasuk item menu) menutup menu AKSI
  const navBtn = e.target.closest('[data-nav]');
  if (navBtn) { navigateTo(navBtn.dataset.nav); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  if (el.disabled) return;
  // Tombol di dalam kartu tidak boleh ikut membuka detail
  if (act !== 'open') e.stopPropagation();
  switch (act) {
    case 'open': openDetail(id); break;
    case 'close-detail': closeDetail(); break;
    case 'modal-close': closeModal(); break;
    case 'send': actSend(id); break;
    case 'assign': actAssign(id); break;
    case 'del': actDelete(id); break;
    case 'row-menu': rowMenu(el, id); break;
    case 'hist': histModal(id); break;
    case 'note': noteModal(id); break;
    case 'ket': ketPop(el, id); break;
    case 'edit': jadwalForm(id); break;
    case 'unarchive': actUnarchive(id, el); break;
    case 'clear-cek': actClearCek(id); break;
    case 'clear-dup': actClearDup(id); break;
    case 'new': jadwalForm(null); break;
    case 'riwayat': {
      const acc = $('accRiwayat');
      acc.classList.toggle('open');
      el.setAttribute('aria-expanded', String(acc.classList.contains('open')));
      if (acc.classList.contains('open')) loadRiwayat(id);
      break;
    }
    case 'tab':
      if (el.dataset.v === 'filter') { filterTanggalModal(); break; }
      S.tab = el.dataset.v; S.f.bulan = false; S.scrollToday = S.tab !== 'bulan'; renderSummary(); renderAfterFilter(); break;
    case 'kpi': applyKpi(el.dataset.k); break;
    case 'f-peng': S.f.penghulu = S.f.penghulu === el.dataset.v ? '' : el.dataset.v; renderAfterFilter(); break;
    case 'f-tindakan': S.f.tindakan = S.f.tindakan ? '' : 'any'; renderAfterFilter(); break;
    case 'export': exportModal(); break;
    case 'q-clear': S.f.q = ''; renderAfterFilter(); break;
    case 'af-x': {
      const k = el.dataset.k;
      if (k === 'bulan') S.f.bulan = false;
      else if (k === 'range') { S.customRange = false; S.range = defaultRange(); reloadJadwal().catch(() => {}); }
      else if (k === 'tgl') { S.f.from = ''; S.f.to = ''; }
      else S.f[k] = '';
      renderSummary(); renderAfterFilter(); break;
    }
    case 'af-clear': S.f = emptyFilter(); renderSummary(); renderAfterFilter(); break;
    case 'rk-peng': S.rekap.penghulu = el.dataset.v; renderRekap(); break;
    case 'arsip-year': actArchiveYear(el.dataset.v, el); break;
    case 'arsip-del': actDeleteArchived(id, el); break;
    case 'set-tab': S.setTab = el.dataset.v; renderSetting(); break;
    case 'm-add': case 'm-del': case 'm-color': case 'm-reset': case 'm-save': masterAction(act, el); break;
    case 'ins-ph': {
      const ta = $(el.dataset.t); const v = el.dataset.v;
      const s0 = ta.selectionStart || ta.value.length, s1 = ta.selectionEnd || s0;
      ta.value = ta.value.slice(0, s0) + v + ta.value.slice(s1); ta.focus(); ta.selectionStart = ta.selectionEnd = s0 + v.length;
      ta.dispatchEvent(new Event('input')); break;
    }
    case 'tpl-default': { const ta = $(el.dataset.t); ta.value = el.dataset.t === 'tplCatin' ? S.boot.defaults.template_wa_catin : S.boot.defaults.template_wa_modin; ta.dispatchEvent(new Event('input')); break; }
    case 'tpl-save': saveSettingsBtn(el, { template_wa_catin: $('tplCatin').value, template_wa_modin: $('tplModin').value }); break;
    case 'umum-save': saveSettingsBtn(el, { nama_kua: $('suKua').value, wilayah: $('suWil').value, logo_url: $('suLogo').value, jarak_bentrok_menit: $('suJarak').value }); break;
    case 'copy': copyText(el.dataset.v); break;
    case 'qr-download': downloadQr(); break;
    // ── Bimwin ──
    case 'bw-tab': S.bw.tab = el.dataset.v; renderBimwin(); break;
    case 'bw-st': S.bw.st = el.dataset.v; renderBimwin(); break;
    case 'bw-all': bwCatinList(S.jadwal.filter((j) => !j.arsip)).filter((j) => !bwSt(j)).forEach((j) => { S.bw.sel[j.id] = true; }); renderBimwin(); break;
    case 'bw-clear': S.bw.sel = {}; renderBimwin(); break;
    case 'bw-new': sesiForm(null, Object.keys(S.bw.sel)); break;
    case 'bw-new-empty': sesiForm(null, []); break;
    case 'bw-add': bwAddModal(); break;
    case 'bw-edit': bwStatusModal(id); break;
    case 'bw-doc': actBwDoc(id, el.dataset.v, el); break;
    case 'bw-xls': bwExcel(id); break;
    case 'bw-wa': bwWaModal(id); break;
    case 'bw-hadir': bwHadirModal(id); break;
    case 'bw-edit-sesi': sesiForm(id, []); break;
    case 'bw-del-sesi': bwDelSesi(id); break;
    case 'bw-out': bwOut(id, el.dataset.v); break;
    case 'bw-goto-catin': S.bw.tab = 'catin'; S.bw.st = 'BELUM'; renderBimwin(); window.scrollTo(0, 0); break;
    case 'bw-goto-set': S.setTab = 'bimwin'; navigateTo('setting'); break;
    case 'bw-tpl': actSetTpl(el.dataset.v, el); break;
    case 'bw-set-save': saveSettingsBtn(el, { bimwin_jam: $('bwJam').value, bimwin_tempat: $('bwTempat').value, bimwin_baris_kosong: $('bwKosong').value }); break;
    case 'bw-wa-save': saveSettingsBtn(el, { template_wa_bimwin: $('tplBw').value }); break;
    case 'bw-wa-default': { const ta = $('tplBw'); ta.value = S.boot.defaults.template_wa_bimwin || ''; ta.dispatchEvent(new Event('input')); break; }
    case 'logo-pick': $('suLogoFile').click(); break;
    case 'logo-clear': $('suLogo').value = ''; $('suLogoPrev').innerHTML = icon('landmark', 'icon-lg'); el.hidden = true; break;
    case 'logout': closeModal(true); logout(); break;
    default: break;
  }
});

// Keyboard: Enter/Spasi pada kartu & baris, Escape menutup
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if ($('ketPop')) { closeKetPop(true); return; } if ($('rowMenu')) { closeRowMenu(); return; } if (modalOpen()) closeModal(); else closeDetail(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-act="open"]')) { e.preventDefault(); openDetail(e.target.dataset.id); }
});
// Desktop: edit langsung di baris — dropdown tersimpan saat dipilih, isian teks saat keluar kolom/Enter
$('list').addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.bw) { bwFromSelect(el.dataset.bw, el.value); return; }
  if (!el.dataset || !el.dataset.edit) return;
  const tr = el.closest('tr[data-id]');
  if (tr) actInlineEdit(tr.dataset.id, el.dataset.edit, el.value);
});
$('list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-edit]')) e.target.blur();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.ket-view')) { e.preventDefault(); ketPop(e.target, e.target.dataset.id); }
});
// v1.9: klik di luar popup keterangan = simpan
document.addEventListener('mousedown', (e) => {
  const p = $('ketPop');
  if (p && !p.contains(e.target)) closeKetPop(false);
}, true);
$('bimwinRoot').addEventListener('change', (e) => {
  const el = e.target;
  if (!el.dataset || !el.dataset.bwsel) return;
  if (el.checked) S.bw.sel[el.dataset.bwsel] = true; else delete S.bw.sel[el.dataset.bwsel];
  renderBimwin();
});
$('modalBackdrop').addEventListener('click', () => closeModal());
window.addEventListener('scroll', closeRowMenu, true);
window.addEventListener('resize', closeRowMenu);
$('sheetBackdrop').addEventListener('click', closeDetail);
$('fab').addEventListener('click', () => jadwalForm(null));
$('idBtn').addEventListener('click', () => whoModal(false));
$('refreshBtn').addEventListener('click', () => reloadAll(true));

function applyKpi(k) {
  // Kartu Bulan/Tahun → ganti tab; kartu penghulu → saring daftar per penghulu (klik lagi untuk lepas)
  if (k === 'bulan' || k === 'tahun') { S.tab = k; S.f.penghulu = ''; }
  else if (k.indexOf('p:') === 0) { const p = k.slice(2); S.f.penghulu = S.f.penghulu === p ? '' : p; }
  S.scrollToday = false;
  renderSummary();
  renderAfterFilter();
  const l = $('list');
  setTimeout(() => window.scrollTo({ top: l.getBoundingClientRect().top + window.scrollY - (DESK.matches ? 100 : 70), behavior: 'smooth' }), 30);
}

function saveSettingsBtn(btn, payload) {
  setBtnBusy(btn, true, 'Menyimpan…');
  api('saveSettings', S.token, payload).then((s) => {
    S.boot.settings = s;
    toast('Pengaturan disimpan.', 'ok');
    setBtnBusy(btn, false);
    computeBentrok(); renderAll(); renderSetBody();
  }).catch((e) => { setBtnBusy(btn, false); if (e.code !== 'AUTH') toast(errMsg(e), 'err'); });
}

function copyText(t) {
  const done = () => toast('Disalin.', 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(fallback); else fallback();
  function fallback() { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Salin manual: ' + t, 'warn'); } ta.remove(); }
}

// Login
$('pwToggle').addEventListener('click', () => {
  const i = $('pw'); const show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  $('pwToggle').innerHTML = icon(show ? 'eye-off' : 'eye');
  $('pwToggle').setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
});
$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const pw = $('pw').value;
  const f = $('fPw');
  f.classList.remove('has-error');
  if (!pw) { $('pwErr').textContent = 'Masukkan password'; f.classList.add('has-error'); return; }
  const btn = $('loginBtn');
  setBtnBusy(btn, true, 'Memeriksa…');
  api('login', pw).then((res) => {
    S.token = res.token;
    lsSet(LS.token, res.token);
    $('pw').value = '';
    setBtnBusy(btn, false);
    bootstrap();
  }).catch((err) => {
    setBtnBusy(btn, false);
    if (err.code === 'NEEDS_ACTIVATION') { showScreen('activate'); return; }
    $('pwErr').textContent = errMsg(err);
    f.classList.add('has-error');
    $('pw').select();
  });
});

// Aktivasi pertama (kode dari setup + password baru)
$('actForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const root = $('actForm');
  root.querySelectorAll('.has-error').forEach((x) => x.classList.remove('has-error'));
  const kode = $('actCode').value.replace(/\s/g, '');
  const pw = $('actPw').value;
  const pw2 = $('actPw2').value;
  const errs = {};
  if (!/^\d{8}$/.test(kode)) errs.kode = 'Kode aktivasi 8 digit angka';
  if (pw.length < 6) errs.pw = 'Minimal 6 karakter';
  if (pw !== pw2) errs.pw2 = 'Tidak sama';
  if (Object.keys(errs).length) { showFieldErrs(root, errs); return; }
  const btn = $('actBtn');
  setBtnBusy(btn, true, 'Mengaktifkan…');
  api('activate', kode, pw).then((res) => {
    S.token = res.token;
    lsSet(LS.token, res.token);
    setBtnBusy(btn, false);
    root.reset();
    toast('Aktivasi berhasil. Bagikan password ini hanya ke tim KUA.', 'ok');
    bootstrap();
  }).catch((err) => {
    setBtnBusy(btn, false);
    if (err.code === 'ACTIVE') { showScreen('login'); $('loginSub').textContent = err.message; return; }
    if (err.data && err.data.fields) { showFieldErrs(root, err.data.fields); return; }
    showFieldErrs(root, { kode: errMsg(err) });
  });
});
$('actToLogin').addEventListener('click', () => showScreen('login'));

// Responsif: pindah tabel ⇄ kartu, panel ⇄ lembar
DESK.addEventListener('change', () => {
  const sel = S.selectedId;
  if (sel) { closeDetail(); }
  if (S.boot) renderAll();
  if (sel && S.view === 'jadwal') openDetail(sel);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.token && S.lastHidden && Date.now() - S.lastHidden > REFRESH_MS) reloadJadwal().catch(() => {});
  if (document.visibilityState === 'hidden') S.lastHidden = Date.now();
});

// ── Start ───────────────────────────────────────────────────
(function init() {
  window.__AKD_READY__ = true;   // tanda untuk pengaman layar memuat (watchdog di Index.html)
  const b = window.__BOOT__ || {};
  if (b.nama_kua) $('brandSub').textContent = 'KUA ' + b.nama_kua + (b.wilayah ? ' · ' + b.wilayah : '');
  if (b.setupError) { showScreen('login'); $('loginSub').textContent = 'Database belum siap: ' + b.setupError; return; }
  S.token = lsGet(LS.token);
  if (b.needsActivation) { lsSet(LS.token, null); lsSet(LS.bootCache, null); S.token = null; showScreen('activate'); return; }
  if (S.token) bootstrap(); else { showScreen('login'); if (window.__BOOT_ERR__) $('loginSub').textContent = window.__BOOT_ERR__; }
})();

})();
