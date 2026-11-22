
/**
 * RESAP — Navbar Controller
 * Light Theme Only
 */

import { searchTools } from './tools-data.js';

let megaMenuOpen = false;
let mobileMenuOpen = false;

export function initNavbar() {
  setupMegaMenu();
  setupMobileMenu();
  setupSearchModal();
  setupKeyboardShortcuts();
}

/* =========================================
   MEGA MENU
========================================= */

function setupMegaMenu() {
  const menuBtn = document.getElementById('allToolsBtn');
  const megaMenu = document.getElementById('megaMenu');
  const overlay = document.getElementById('megaMenuOverlay');
  const searchInput = document.getElementById('megaMenuSearch');

  if (!menuBtn || !megaMenu) return;

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMegaMenu();
  });

  overlay?.addEventListener('click', closeMegaMenu);
  // Close mega menu when clicking anywhere outside
document.addEventListener('click', (e) => {
  if (
    megaMenuOpen &&
    !megaMenu.contains(e.target) &&
    !menuBtn.contains(e.target)
  ) {
    closeMegaMenu();
  }
});

  searchInput?.addEventListener('input', (e) => {
    filterMegaMenuTools(e.target.value);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && megaMenuOpen) {
      closeMegaMenu();
    }
  });
}

function toggleMegaMenu() {
  if (megaMenuOpen) {
    closeMegaMenu();
  } else {
    openMegaMenu();
  }
}

function openMegaMenu() {
  const megaMenu = document.getElementById('megaMenu');
  const overlay = document.getElementById('megaMenuOverlay');
  const btn = document.getElementById('allToolsBtn');

  megaMenu?.classList.add('active');
  overlay?.classList.add('active');
  btn?.classList.add('menu-open');

  megaMenuOpen = true;

  const searchInput = document.getElementById('megaMenuSearch');

  if (searchInput) {
    setTimeout(() => searchInput.focus(), 100);
  }
}

function closeMegaMenu() {
  const megaMenu = document.getElementById('megaMenu');
  const overlay = document.getElementById('megaMenuOverlay');
  const btn = document.getElementById('allToolsBtn');

  megaMenu?.classList.remove('active');
  overlay?.classList.remove('active');
  btn?.classList.remove('menu-open');

  megaMenuOpen = false;

  const searchInput = document.getElementById('megaMenuSearch');

  if (searchInput) {
    searchInput.value = '';
    filterMegaMenuTools('');
  }
}

function filterMegaMenuTools(query) {
  const megaMenuBody = document.querySelector('.mega-menu-body');

  if (!megaMenuBody) return;

  if (!query || query.length < 2) {
    megaMenuBody.querySelectorAll('.mega-menu-category').forEach(category => {
      category.style.display = '';
    });

    megaMenuBody.querySelectorAll('.mega-menu-item').forEach(item => {
      item.style.display = '';
    });

    const empty = megaMenuBody.querySelector('.mega-menu-empty');

    if (empty) {
      empty.style.display = 'none';
    }

    return;
  }

  const q = query.toLowerCase();
  let anyVisible = false;

  megaMenuBody.querySelectorAll('.mega-menu-category').forEach(category => {
    let categoryVisible = false;

    category.querySelectorAll('.mega-menu-item').forEach(item => {
      const name = item.querySelector('.tool-name')?.textContent.toLowerCase() || '';
      const desc = item.querySelector('.tool-desc')?.textContent.toLowerCase() || '';

      const match = name.includes(q) || desc.includes(q);

      item.style.display = match ? '' : 'none';

      if (match) {
        categoryVisible = true;
      }
    });

    category.style.display = categoryVisible ? '' : 'none';

    if (categoryVisible) {
      anyVisible = true;
    }
  });

  let empty = megaMenuBody.querySelector('.mega-menu-empty');

  if (!anyVisible) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'mega-menu-empty';
      empty.textContent = 'No tools found matching your search.';
      megaMenuBody.appendChild(empty);
    }

    empty.style.display = '';
  } else if (empty) {
    empty.style.display = 'none';
  }
}


/* =========================================
   MOBILE MENU
========================================= */

function setupMobileMenu() {
  const toggle = document.getElementById('mobileMenuToggle');
  const menu = document.getElementById('mobileMenu');

  if (!toggle || !menu) return;

  function closeMobileMenu() {
    mobileMenuOpen = false;

    menu.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');

    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();

    mobileMenuOpen = !mobileMenuOpen;

    menu.classList.toggle('active', mobileMenuOpen);

    toggle.setAttribute(
      'aria-expanded',
      String(mobileMenuOpen)
    );

    document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
  });

  // Category expansion
  menu.querySelectorAll('.mobile-category-header').forEach(header => {
    header.addEventListener('click', () => {
      const category = header.parentElement;
      category.classList.toggle('expanded');
    });
  });

  // Close after clicking navigation links
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (
      mobileMenuOpen &&
      !menu.contains(e.target) &&
      !toggle.contains(e.target)
    ) {
      closeMobileMenu();
    }
  });

  // Close with Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenuOpen) {
      closeMobileMenu();
    }
  });
}


/* =========================================
   SEARCH MODAL
========================================= */

function setupSearchModal() {
  const searchBtns = document.querySelectorAll('.search-trigger-btn');
  const modal = document.getElementById('searchModal');

  if (!modal) return;

  const overlay = modal;
  const input = modal.querySelector('.search-modal-input');
  const results = modal.querySelector('.search-modal-results');

  searchBtns.forEach(btn => {
    btn.addEventListener('click', () => openSearchModal());
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeSearchModal();
    }
  });

  input?.addEventListener('input', (e) => {
    renderSearchResults(e.target.value, results);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();

      if (modal.classList.contains('active')) {
        closeSearchModal();
      } else {
        openSearchModal();
      }
    }

    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeSearchModal();
    }
  });
}

function openSearchModal() {
  const modal = document.getElementById('searchModal');

  if (!modal) return;

  modal.classList.add('active');

  const input = modal.querySelector('.search-modal-input');

  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }

  renderSearchResults(
    '',
    modal.querySelector('.search-modal-results')
  );
}

function closeSearchModal() {
  const modal = document.getElementById('searchModal');

  if (!modal) return;

  modal.classList.remove('active');
}

function renderSearchResults(query, container) {
  if (!container) return;

  if (!query || query.length < 2) {
    container.innerHTML =
      '<div class="search-modal-empty">Type to search for tools...</div>';

    return;
  }

  const results = searchTools(query);

  if (results.length === 0) {
    container.innerHTML =
      '<div class="search-modal-empty">No tools found for "' +
      escapeHtml(query) +
      '"</div>';

    return;
  }

  container.innerHTML = results.map(tool => `
    <a href="${tool.url}" class="search-result-item">
      <div class="result-icon">
        <i data-lucide="${tool.icon}"></i>
      </div>

      <div>
        <div class="result-name">
          ${highlightMatch(tool.name, query)}
        </div>

        <div class="result-category">
          ${escapeHtml(tool.category)}
        </div>
      </div>
    </a>
  `).join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());

  if (idx === -1) {
    return escapeHtml(text);
  }

  const before = text.substring(0, idx);
  const match = text.substring(idx, idx + query.length);
  const after = text.substring(idx + query.length);

  return (
    escapeHtml(before) +
    '<strong>' +
    escapeHtml(match) +
    '</strong>' +
    escapeHtml(after)
  );
}

function escapeHtml(str) {
  const div = document.createElement('div');

  div.textContent = str;

  return div.innerHTML;
}


/* =========================================
   KEYBOARD SHORTCUTS
========================================= */

function setupKeyboardShortcuts() {
  // Ctrl + K for search is handled in setupSearchModal.
}
