/* ============================================================
   AKAD TRACKER — penghubung ke backend Google Apps Script (REST API)
   - AkdApi.call(fn, args): POST JSON ke /exec → amplop { success, code, message, data }
     Content-Type text/plain → tidak memicu CORS preflight (diblokir GAS).
   - AkdApi.boot(kind): data awal halaman dari salinan di perangkat (instan),
     lalu diperbarui di latar belakang (stale-while-revalidate).
   ============================================================ */
(function () {
  'use strict';
  var GAS = String(window.GAS_URL || '').trim();
  var URL_OK = /^https:\/\/script\.google\.com\/.+\/exec$/.test(GAS) && GAS.indexOf('GANTI_') < 0;
  var BASE = new URL('./', location.href).href;   // alamat frontend ini (dipakai untuk link & QR form)

  function call(fn, args) {
    if (!URL_OK) return Promise.reject(new Error('Alamat server belum diatur. Isi GAS_URL di js/config.js dengan URL /exec Apps Script.'));
    return fetch(GAS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args || [], base: BASE }),
      redirect: 'follow',
      credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error('Server menjawab HTTP ' + r.status + '. Coba lagi.');
      return r.text();
    }, function () {
      throw new Error('Koneksi bermasalah. Periksa internet lalu coba lagi.');
    }).then(function (t) {
      try { return JSON.parse(t); } catch (e) {
        throw new Error(/^\s*</.test(t)
          ? 'Server mengirim halaman, bukan data. Pastikan Web App di-deploy dengan akses "Siapa saja" dan GAS_URL di js/config.js benar.'
          : 'Respons server tidak bisa dibaca.');
      }
    });
  }

  function readJ(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mode privat / kuota penuh */ } }
  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = s.onerror = function () { resolve(); };
      document.body.appendChild(s);
    });
  }

  /**
   * kind 'app'  → getPublicBoot (nama KUA, logo, perlu aktivasi?) lalu memuat js/app.js
   * kind 'form' → getFormMaster (desa, modin, nama KUA) lalu memuat js/form.js
   */
  function boot(kind) {
    var isForm = kind === 'form';
    var key = isForm ? 'akd_form_master' : 'akd_public_boot';
    var src = isForm ? 'js/form.js' : 'js/app.js';
    var cached = readJ(key);
    var usable = !!cached && (isForm ? !!cached.desa : !cached.needsActivation && !cached.setupError);
    var fresh = call(isForm ? 'getFormMaster' : 'getPublicBoot', []).then(function (res) {
      if (res && res.success && res.data && !res.data.error) { writeJ(key, res.data); return res.data; }
      throw new Error((res && (res.message || (res.data && res.data.error))) || 'Gagal memuat data awal.');
    });
    if (usable) {
      window.__BOOT__ = cached;
      var loaded = loadScript(src);
      Promise.all([fresh, loaded]).then(function (r) {
        var d = r[0];
        if (isForm) { document.dispatchEvent(new CustomEvent('akd:fresh', { detail: d })); return; }
        // Status aktivasi/database berubah sejak salinan terakhir → muat ulang dengan data baru
        if (!!d.needsActivation !== !!cached.needsActivation || !!d.setupError !== !!cached.setupError) location.reload();
      }).catch(function () { /* tetap pakai salinan */ });
    } else {
      fresh.then(function (d) { window.__BOOT__ = d; }, function (err) {
        window.__BOOT__ = {};
        window.__BOOT_ERR__ = err && err.message;
      }).then(function () { loadScript(src); });
    }
  }

  // v2.2: PWA dihapus. Bersihkan service worker & cache cangkang lama yang pernah terpasang di perangkat ini.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
  }
  if (window.caches && caches.keys) {
    caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf('akad-tracker') === 0) caches.delete(k); }); }).catch(function () {});
  }

  window.AkdApi = { call: call, boot: boot, base: BASE, configured: URL_OK };
})();
