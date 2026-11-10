/* ==========================================================================
   Tab switching for the homepage. No dependencies.
   ========================================================================== */

(function () {
  'use strict';

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('[role="tabpanel"]'));
  if (!tabs.length) return;

  var valid = {};
  tabs.forEach(function (tab) {
    valid[tab.getAttribute('data-tab')] = true;
  });

  function activate(name, options) {
    options = options || {};

    tabs.forEach(function (tab) {
      var on = tab.getAttribute('data-tab') === name;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });

    panels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });

    if (options.updateHash !== false && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + name);
    }

    if (options.focus) {
      tabs.some(function (tab) {
        if (tab.getAttribute('data-tab') === name) {
          tab.focus();
          return true;
        }
        return false;
      });
    }
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () {
      activate(tab.getAttribute('data-tab'));
    });

    tab.addEventListener('keydown', function (event) {
      var next = null;

      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;

      if (next !== null) {
        event.preventDefault();
        activate(tabs[next].getAttribute('data-tab'), { focus: true });
      }
    });
  });

  var initial = window.location.hash.replace('#', '');
  activate(valid[initial] ? initial : tabs[0].getAttribute('data-tab'), {
    updateHash: false
  });

  window.addEventListener('hashchange', function () {
    var name = window.location.hash.replace('#', '');
    if (valid[name]) activate(name, { updateHash: false });
  });
})();
