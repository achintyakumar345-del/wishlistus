(function () {
  if (window.__wishlistus) return;
  window.__wishlistus = true;

  var KEY = 'wishlistus:items';
  var root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  var PROXY = root + 'apps/wishlist';

  // Keep in sync with DEFAULTS in app/routes/app.settings.jsx
  var DEFAULTS = {
    toastEnabled: true,
    toastAddedText: 'Added to your wishlist',
    toastRemovedText: 'Removed from your wishlist',
    toastPosition: 'bottom',
    toastDuration: 3,
    animation: 'pop'
  };

  var loggedIn = false;
  var items = readLocal();
  var toastEl = null;
  var toastTimer = null;

  // ---- merchant settings (saved from the app's Settings page) ----
  function getSettings() {
    var settings = {};
    var el = document.querySelector('[data-wl-settings]');
    try { settings = (el && JSON.parse(el.textContent)) || {}; } catch (e) {}
    var merged = {};
    for (var k in DEFAULTS) merged[k] = settings[k] != null ? settings[k] : DEFAULTS[k];
    return merged;
  }

  // ---- browser storage (guests) ----
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function writeLocal(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
  }
  function clearLocal() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  // ---- saving ----
  function save() {
    if (loggedIn) {
      fetch(PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      }).catch(function () {});
    } else {
      writeLocal(items);
    }
  }

  // Ask the app if the shopper is logged in; if so, load their saved list and merge in guest items
  function syncFromAccount() {
    return fetch(PROXY, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.loggedIn) { loggedIn = false; return; }
        loggedIn = true;
        var merged = (data.items || []).slice();
        readLocal().forEach(function (h) {
          if (merged.indexOf(h) === -1) merged.push(h);
        });
        items = merged;
        if (merged.length !== (data.items || []).length) save();
        clearLocal();
      })
      .catch(function () { loggedIn = false; });
  }

  // Returns true if the product was added, false if it was removed
  function toggle(handle) {
    var i = items.indexOf(handle);
    if (i === -1) items.push(handle); else items.splice(i, 1);
    save();
    render();
    return i === -1;
  }

  // ---- feedback ----
  // The toast element is created up front so screen readers are already watching it
  function createToast() {
    if (toastEl) return;
    toastEl = document.createElement('div');
    toastEl.className = 'wl-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }

  function showToast(added) {
    var s = getSettings();
    if (!s.toastEnabled) return;
    createToast();
    toastEl.textContent = added ? s.toastAddedText : s.toastRemovedText;
    toastEl.classList.toggle('wl-toast--top', s.toastPosition === 'top');
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, (Number(s.toastDuration) || DEFAULTS.toastDuration) * 1000);
  }

  function animate(btn) {
    var name = getSettings().animation;
    var heart = btn.querySelector('.wl-heart');
    if (!heart || ['pop', 'bounce', 'pulse'].indexOf(name) === -1) return;
    var cls = 'wl-anim-' + name;
    heart.classList.remove(cls);
    void heart.getBoundingClientRect(); // restart the animation on repeat clicks
    heart.classList.add(cls);
    heart.addEventListener('animationend', function () { heart.classList.remove(cls); }, { once: true });
  }

  // ---- rendering ----
  function renderButtons() {
    document.querySelectorAll('.wl-btn').forEach(function (btn) {
      var on = items.indexOf(btn.dataset.wlHandle) !== -1;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.querySelector('.wl-label').textContent = on ? btn.dataset.wlRemove : btn.dataset.wlAdd;
    });
  }

  function formatMoney(cents) {
    var currency = (window.Shopify && Shopify.currency && Shopify.currency.active) || 'USD';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency }).format(cents / 100);
    } catch (e) {
      return (cents / 100).toFixed(2);
    }
  }

  function renderPages() {
    var pages = document.querySelectorAll('[data-wl-page]');
    if (!pages.length) return;

    Promise.all(items.map(function (handle) {
      return fetch(root + 'products/' + encodeURIComponent(handle) + '.js')
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    })).then(function (products) {
      var found = products.filter(Boolean);

      pages.forEach(function (page) {
        var grid = page.querySelector('[data-wl-grid]');
        grid.innerHTML = '';

        if (!found.length) {
          var empty = document.createElement('p');
          empty.className = 'wl-empty';
          empty.textContent = page.dataset.wlEmpty;
          grid.appendChild(empty);
          return;
        }

        found.forEach(function (p) {
          var card = document.createElement('div');
          card.className = 'wl-card';

          var link = document.createElement('a');
          link.className = 'wl-card__link';
          link.href = p.url;

          if (p.featured_image) {
            var img = document.createElement('img');
            img.className = 'wl-card__img';
            img.src = p.featured_image;
            img.alt = p.title;
            img.loading = 'lazy';
            link.appendChild(img);
          }

          var title = document.createElement('span');
          title.className = 'wl-card__title';
          title.textContent = p.title;

          var price = document.createElement('span');
          price.className = 'wl-card__price';
          price.textContent = formatMoney(p.price);

          link.appendChild(title);
          link.appendChild(price);

          var remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'wl-card__remove';
          remove.dataset.wlRemoveHandle = p.handle;
          remove.textContent = 'Remove';

          card.appendChild(link);
          card.appendChild(remove);
          grid.appendChild(card);
        });
      });
    });
  }

  function render() {
    renderButtons();
    renderPages();
  }

  // ---- events ----
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.wl-btn');
    if (btn) {
      showToast(toggle(btn.dataset.wlHandle));
      animate(btn);
      return;
    }
    var rm = e.target.closest('[data-wl-remove-handle]');
    if (rm) showToast(toggle(rm.dataset.wlRemoveHandle));
  });

  window.addEventListener('storage', function (e) {
    if (!loggedIn && e.key === KEY) { items = readLocal(); render(); }
  });
  document.addEventListener('shopify:section:load', render);

  function start() {
    createToast();
    render();
    syncFromAccount().then(render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();