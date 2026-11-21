// iPhone uygulamasından Safari tabanlı güvenli pencerede açılır (WebAuth eklentisi). Google gömülü web görünümünde girişe izin
// vermediği için giriş burada yapılır. su_gapp çerezi sunucuya dönüşün uygulamaya (swipeup://google?g=…) gideceğini söyler.
(function () {
  var msg = document.getElementById('msg');
  var fail = function (t) { msg.textContent = t; };
  document.cookie = 'su_gapp=1; Max-Age=600; Path=/; Secure; SameSite=None';
  fetch('/api/config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (cfg) {
    var id = cfg && cfg.oauth && cfg.oauth.google;
    if (!id) return fail('Google ile giriş şu an kapalı.');
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onerror = function () { fail('Google yüklenemedi. İnternet bağlantını kontrol et.'); };
    s.onload = function () {
      var g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) return fail('Google yüklenemedi.');
      g.initialize({ client_id: id, ux_mode: 'redirect', login_uri: location.origin + '/api/auth/google/cb', auto_select: false, itp_support: true });
      var dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
      g.renderButton(document.getElementById('g'), { theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'tr', logo_alignment: 'center', width: 300 });
    };
    document.head.appendChild(s);
  }).catch(function () { fail('Bağlantı kurulamadı. Tekrar dene.'); });
})();
