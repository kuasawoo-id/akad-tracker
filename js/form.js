/* AKAD TRACKER — form publik modin (dari Form.html v1.10; hanya lapisan koneksi yang diganti) */
/* ============================================================
   FORM PUBLIK — logika client (ringan, tanpa dependensi)
   ============================================================ */
(function () {
  'use strict';
  var BOOT = window.__BOOT__ || {};
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var DRAFT_KEY = 'akd_form_draft';
  var JAM_OPTS = []; for (var h = 5; h <= 21; h++) { JAM_OPTS.push(('0' + h).slice(-2) + ':00'); JAM_OPTS.push(('0' + h).slice(-2) + ':30'); }
  function setJam(v) { $('jam').value = v; $('jamOut').textContent = v ? v.replace(':', '.') : '--.--'; }
  var state = { wali: '', tempat: '', sending: false, master: null };
  var $ = function (id) { return document.getElementById(id); };
  var form = $('pubForm');

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtTanggal(s) { var d = parseDate(s); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear(); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function applyMaster(m) {
    state.master = m;
    var kua = 'KUA ' + (m.nama_kua || 'Sawoo');
    $('fKua').textContent = kua; $('fKua2').textContent = '— ' + kua; $('fFoot').textContent = kua + ' • Administrasi Pernikahan';
    document.title = 'Form Jadwal Akad — ' + kua;
    if (m.logo_url) $('fLogo').innerHTML = '<img src="' + esc(m.logo_url) + '" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:10px;background:#fff">';
    var sel = $('desa');
    sel.innerHTML = '<option value="">-- Pilih Desa / Kelurahan --</option>' + (m.desa || []).map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('');
    renderModin();
  }

  /** Modin difilter sesuai desa terpilih; bila tidak ada, tampilkan semua. */
  function renderModin() {
    var m = state.master || {}; var desa = $('desa').value; var cur = $('modin').value;
    var all = m.modin || [];
    var list = desa ? all.filter(function (x) { return x.desa === desa; }) : all;
    if (!list.length) list = all;
    $('modin').innerHTML = '<option value="">-- Pilih Modin (opsional) --</option>' + list.map(function (x) {
      return '<option value="' + esc(x.nama) + '"' + (x.nama === cur ? ' selected' : '') + '>' + esc(x.nama) + (x.desa ? ' — ' + esc(x.desa) : '') + '</option>';
    }).join('');
  }

  function setSeg(name, v) {
    state[name] = v;
    document.querySelectorAll('[data-seg="' + name + '"] button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === v)); });
    clearErr(name);
  }

  function updateHari() {
    var v = $('tanggal').value;
    $('hariHint').innerHTML = v ? 'Hari: <b>' + HARI[parseDate(v).getDay()] + '</b>' : 'Hari: —';
    $('pastWarn').hidden = !(v && v < ((state.master && state.master.today) || todayStr()));
  }

  function fieldEl(name) { return form.querySelector('[data-f="' + name + '"]'); }
  function setErr(name, msg) { var f = fieldEl(name); if (!f) return; f.classList.add('has-error'); var s = f.querySelector('.err-msg span'); if (s && msg) s.textContent = msg; }
  function clearErr(name) { var f = fieldEl(name); if (f) f.classList.remove('has-error'); }

  function collect() {
    return {
      catin_pria: $('catin_pria').value.trim().toUpperCase(), catin_wanita: $('catin_wanita').value.trim().toUpperCase(),
      wali: state.wali, tanggal: $('tanggal').value, jam: $('jam').value, tempat: state.tempat,
      desa: $('desa').value, modin: $('modin').value, keterangan: $('keterangan').value.trim(), website: $('website').value
    };
  }

  function validate(d) {
    var errs = {};
    if (!d.catin_pria) errs.catin_pria = 'Wajib diisi';
    if (!d.catin_wanita) errs.catin_wanita = 'Wajib diisi';
    if (!d.wali) errs.wali = 'Pilih Nasab atau Hakim';
    if (!d.tanggal) errs.tanggal = 'Wajib diisi';
    if (!d.jam) errs.jam = 'Wajib diisi';
    if (!d.tempat) errs.tempat = 'Pilih lokasi nikah';
    if (!d.desa) errs.desa = 'Wajib diisi';
    return errs;
  }

  function showErrs(errs) {
    var first = null;
    Object.keys(errs).forEach(function (k) { setErr(k, errs[k]); if (!first) first = k; });
    if (first) { var f = fieldEl(first); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); var i = f.querySelector('input,select,textarea,button'); if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 300); } }
  }

  function saveDraft() { var d = collect(); delete d.website; store(DRAFT_KEY, d); }
  function restoreDraft() {
    var d = load(DRAFT_KEY); if (!d) return;
    ['catin_pria', 'catin_wanita', 'tanggal', 'keterangan'].forEach(function (k) { if (d[k]) $(k).value = d[k]; });
    if (d.jam) setJam(d.jam);
    if (d.desa) { $('desa').value = d.desa; renderModin(); }
    if (d.modin) $('modin').value = d.modin;
    if (d.wali) setSeg('wali', d.wali);
    if (d.tempat) setSeg('tempat', d.tempat);
    updateHari();
  }

  function setSending(on) {
    state.sending = on;
    var b = $('submitBtn'); b.disabled = on;
    b.innerHTML = on ? '<span class="spin"></span> Mengirim…' : 'Kirim Jadwal <svg class="icon"><use href="#i-send"/></svg>';
  }

  function showOk(d, res) {
    $('okDup').hidden = !(res && res.duplikat);
    var rows = [
      ['Catin', esc(d.catin_pria) + ' &amp; ' + esc(d.catin_wanita)],
      ['Hari/Tanggal', esc(fmtTanggal(d.tanggal))],
      ['Jam', esc(d.jam.replace(':', '.')) + ' WIB'],
      ['Tempat', d.tempat === 'KANTOR' ? 'Kantor KUA' : 'Luar Kantor'],
      ['Desa', esc(d.desa)],
      ['No. Registrasi', '<span class="tnum">' + esc(res && res.id) + '</span>']
    ];
    $('okSum').innerHTML = rows.map(function (r) { return '<div class="dl-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
    form.hidden = true; $('okView').hidden = false; window.scrollTo(0, 0);
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (state.sending) return;
    var d = collect();
    form.querySelectorAll('.has-error').forEach(function (f) { f.classList.remove('has-error'); });
    var errs = validate(d);
    if (Object.keys(errs).length) { showErrs(errs); return; }
    setSending(true);
    window.AkdApi.call('submitPublicForm', [d]).then(function (res) {
        setSending(false);
        if (res && res.success) { store(DRAFT_KEY, null); showOk(d, res.data); return; }
        if (res && res.data && res.data.fields) { showErrs(res.data.fields); return; }
        alert((res && res.message) || 'Gagal mengirim. Coba lagi.');
      }, function (err) {
        setSending(false);
        alert('Koneksi bermasalah, data Anda masih tersimpan di formulir. Coba kirim lagi.\n\n' + (err && err.message ? err.message : ''));
      });
  });

  // Interaksi
  document.querySelectorAll('[data-seg] button').forEach(function (b) {
    b.addEventListener('click', function () { setSeg(b.parentNode.dataset.seg, b.dataset.v); saveDraft(); });
  });
  $('tanggal').addEventListener('change', function () { updateHari(); clearErr('tanggal'); });
  $('desa').addEventListener('change', function () { renderModin(); clearErr('desa'); });
  ['catin_pria', 'catin_wanita', 'modin'].forEach(function (k) { $(k).addEventListener('input', function () { clearErr(k); }); });
  // Jam: tombol naik/turun per 30 menit (05.00–21.30), mudah untuk pengguna lansia
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = JAM_OPTS.indexOf($('jam').value);
      var step = Number(b.getAttribute('data-step'));
      if (i < 0) i = JAM_OPTS.indexOf('08:00') - step;
      i = Math.max(0, Math.min(JAM_OPTS.length - 1, i + step));
      setJam(JAM_OPTS[i]);
      clearErr('jam'); saveDraft();
    });
  });
  var draftT; form.addEventListener('input', function () { clearTimeout(draftT); draftT = setTimeout(saveDraft, 400); });
  form.addEventListener('change', function () { clearTimeout(draftT); draftT = setTimeout(saveDraft, 200); });
  $('againBtn').addEventListener('click', function () {
    form.reset(); setJam(''); state.wali = ''; state.tempat = '';
    document.querySelectorAll('[data-seg] button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    renderModin(); updateHari();
    $('okView').hidden = true; form.hidden = false; window.scrollTo(0, 0); $('catin_pria').focus();
  });

  // Inisialisasi: master dari salinan di perangkat (instan) atau dari server; fallback panggil server bila kosong.
  if (BOOT && BOOT.desa) { applyMaster(BOOT); restoreDraft(); }
  else {
    window.AkdApi.call('getFormMaster', []).then(function (r) {
      if (r && r.success) { applyMaster(r.data); restoreDraft(); }
      else { $('loadErr').hidden = false; $('loadErr').textContent = 'Data desa belum tersedia: ' + ((r && r.message) || '') ; }
    }, function (err) { $('loadErr').hidden = false; $('loadErr').textContent = 'Data desa belum tersedia: ' + ((err && err.message) || ''); });
  }
  // Data desa/modin terbaru dari server (latar belakang) → terapkan tanpa menghapus pilihan yang sedang diisi
  document.addEventListener('akd:fresh', function (ev) {
    var m = ev.detail; if (!m || !m.desa) return;
    var dv = $('desa').value, mv = $('modin').value;
    applyMaster(m);
    if (dv) { $('desa').value = dv; renderModin(); }
    if (mv) $('modin').value = mv;
  });
})();
