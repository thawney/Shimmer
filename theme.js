(function() {
  'use strict';

  var STORAGE_KEY = 'shimmer-theme';

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }

  function updateToggleLabels(theme) {
    var dark = theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(function(btn) {
      btn.textContent = dark ? 'Light mode' : 'Dark mode';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  function applyTheme(theme, opts) {
    var options = opts || {};
    var finalTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = finalTheme;
    document.documentElement.style.colorScheme = finalTheme;
    updateToggleLabels(finalTheme);
    if (options.persist !== false) setStoredTheme(finalTheme);
    window.dispatchEvent(new CustomEvent('shimmer-theme-change', {
      detail: { theme: finalTheme }
    }));
  }

  function initThemeToggle() {
    var currentTheme = document.documentElement.dataset.theme || getStoredTheme() || 'light';
    applyTheme(currentTheme, { persist: false });

    document.querySelectorAll('[data-theme-toggle]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle, { once: true });
  } else {
    initThemeToggle();
  }
})();
