/**
 * RESAP — Main Entry
 * Initializes Lucide icons and shared functionality.
 */
import { createIcons, icons } from 'lucide';
import { initNavbar } from './navbar.js';

// Make lucide available globally for dynamic rendering
window.lucide = { createIcons: () => createIcons({ icons }) };

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  createIcons({ icons });

  // Initialize navbar
  initNavbar();

  // Initialize FAQ accordions
  initAccordions();

  // Initialize "Try a Random Tool" button
  initRandomToolBtn();
});

function initAccordions() {
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const wasActive = item.classList.contains('active');

      // Close all siblings
      const parent = item.parentElement;
      parent.querySelectorAll('.accordion-item.active').forEach(active => {
        active.classList.remove('active');
      });

      // Toggle current
      if (!wasActive) {
        item.classList.add('active');
      }
    });
  });
}

function initRandomToolBtn() {
  const btn = document.getElementById('randomToolBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const { getRandomTool } = await import('./tools-data.js');
    const tool = getRandomTool();
    if (tool) {
      window.location.href = tool.url;
    }
  });
}
