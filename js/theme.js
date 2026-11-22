/**
 * RESAP — Theme Manager
 */
const THEME_KEY = 'resap-theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcons(theme);
}

function updateThemeIcons(theme) {
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    const sunIcon = btn.querySelector('.sun-icon');
    const moonIcon = btn.querySelector('.moon-icon');
    if (sunIcon && moonIcon) {
      sunIcon.style.display = theme === 'dark' ? 'none' : 'block';
      moonIcon.style.display = theme === 'dark' ? 'block' : 'none';
    }
  });
}

export function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}
