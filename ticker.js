/* GnC Verdict -- ticker.js
   Live Binance price marquee scrolling right -> left, on every page.
   Reuses the .ticker / .ticker-track CSS already in styles.css
   (animation: translateX(-50%) loop -> content is duplicated for a seamless run).
   Data: https://data-api.binance.vision (public, no API key). Refreshes every 30s.
   Falls back to a single honest "unavailable" item if Binance can't be reached.
*/
(function () {
  'use strict';

  var SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT',
              'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT', 'DOTUSDT', 'LTCUSDT',
              'BCHUSDT', 'SHIBUSDT', 'XLMUSDT', 'UNIUSDT'];

  function ensureBar() {
    var track = document.getElementById('gncTickerTrack');
    if (track) return; // page already has the ticker markup
    var bar = document.createElement('div');
    bar.className = 'ticker';
    bar.innerHTML = '<div class="ticker-track" id="gncTickerTrack">' +
      '<span>Connecting to Binance...</span></div>';
    var anchor = document.querySelector('.topbar') || document.querySelector('nav');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  async function refresh() {
    var track = document.getElementById('gncTickerTrack');
    if (!track) return;
    try {
      var url = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' +
        encodeURIComponent(JSON.stringify(SYMS));
      var r = await fetch(url);
      var arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) throw new Error('bad payload');
      var html = arr.map(function (t) {
        var p = parseFloat(t.lastPrice);
        var c = parseFloat(t.priceChangePercent || 0);
        if (!isFinite(p)) return '';
        var shown = t.symbol.indexOf('USDT') > -1 ? t.symbol.replace('USDT', '/USDT') : t.symbol;
        var price = '$' + p.toLocaleString(undefined, { maximumFractionDigits: p < 1 ? 6 : 2 });
        return '<span><b>' + shown + '</b> ' + price +
          ' <b class="' + (c >= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '▲' : '▼') +
          ' ' + Math.abs(c).toFixed(2) + '%</b></span>';
      }).join('');
      // duplicated -> the -50% translate loops seamlessly
      track.innerHTML = html + html;
    } catch (e) {
      track.innerHTML = '<span>⚠️ Live Binance ticker unavailable right now</span>';
    }
  }

  ensureBar();
  refresh();
  setInterval(refresh, 30000);
})();
