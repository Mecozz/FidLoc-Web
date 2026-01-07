// ThemeManager.js
// Handles light/dark/system theme preference

const THEME_KEY = 'fidloc-theme';

class ThemeManager {
  constructor() {
    this.listeners = [];
    this.init();
  }

  init() {
    // Load saved preference or default to 'system'
    const saved = localStorage.getItem(THEME_KEY) || 'system';
    this.applyTheme(saved);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (this.getTheme() === 'system') {
        this.applyTheme('system');
      }
    });
  }

  getTheme() {
    return localStorage.getItem(THEME_KEY) || 'system';
  }

  setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    this.applyTheme(theme);
    this.notifyListeners();
  }

  // Cycle through: light -> dark -> system -> light
  cycleTheme() {
    const current = this.getTheme();
    let next;
    if (current === 'light') {
      next = 'dark';
    } else if (current === 'dark') {
      next = 'system';
    } else {
      next = 'light';
    }
    this.setTheme(next);
    return next;
  }

  applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  // Get the actual applied theme (resolves 'system' to actual value)
  getAppliedTheme() {
    const theme = this.getTheme();
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notifyListeners() {
    const theme = this.getTheme();
    this.listeners.forEach(callback => callback(theme));
  }
}

const themeManager = new ThemeManager();
export default themeManager;
