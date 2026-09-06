// High-Performance Deterministic Spatial & Magic Remote Focus Engine for LG webOS TV

import { WEBOS_KEYS, exitWebOSApp } from './webOSKeys';

export type FocusDirection = 'up' | 'down' | 'left' | 'right';

export class WebOSFocusManager {
  private currentFocusedId: string | null = null;
  private backStack: (() => boolean)[] = [];
  private isEnabled: boolean = true;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private mouseOverHandler: ((e: MouseEvent) => void) | null = null;
  private lastEnterTime: number = 0;
  private isCursorVisible: boolean = false;

  // Custom key interceptor (e.g. for Video Player seeking, OSD, or Virtual Keyboard)
  public customKeyHandler: ((keyCode: number, e: KeyboardEvent) => boolean) | null = null;

  public init() {
    this.destroy();

    // 1. Keyboard & D-Pad event handler
    this.keydownHandler = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.keydownHandler);

    // 2. LG Magic Remote Pointer hover support (Delegated)
    this.mouseOverHandler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-tv-focus="true"]:not([disabled])') as HTMLElement;
      if (target && target !== this.getCurrentFocusedElement()) {
        this.focus(target, false);
      }
    };
    document.addEventListener('mouseover', this.mouseOverHandler);

    // 3. LG webOS cursor visibility listener
    window.addEventListener('cursorStateChange', (e: any) => {
      this.isCursorVisible = Boolean(e?.detail?.visibility);
      console.log('[FocusManager] Magic Remote cursor visibility:', this.isCursorVisible);
    });

    console.log('[FocusManager] LG webOS Spatial & Magic Remote Focus Engine Initialized.');
  }

  public destroy() {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.mouseOverHandler) {
      document.removeEventListener('mouseover', this.mouseOverHandler);
      this.mouseOverHandler = null;
    }
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public pushBackHandler(handler: () => boolean) {
    this.backStack.push(handler);
  }

  public popBackHandler(handler?: () => boolean) {
    if (handler) {
      const idx = this.backStack.lastIndexOf(handler);
      if (idx !== -1) this.backStack.splice(idx, 1);
    } else {
      this.backStack.pop();
    }
  }

  public getCurrentFocusedId(): string | null {
    return this.currentFocusedId;
  }

  public getCurrentFocusedElement(): HTMLElement | null {
    // 1. Check currently active .tv-focused element in the live DOM
    const focused = document.querySelector('.tv-focused') as HTMLElement;
    if (focused && (focused.offsetParent !== null || focused.style.position === 'fixed')) {
      return focused;
    }
    // 2. Fallback to currentFocusedId
    if (this.currentFocusedId) {
      const el = document.querySelector(`[data-focus-id="${this.currentFocusedId}"]`) as HTMLElement;
      if (el && (el.offsetParent !== null || el.style.position === 'fixed')) return el;
    }
    return null;
  }

  public focus(idOrEl: string | HTMLElement, scroll = true) {
    const el: HTMLElement | null = typeof idOrEl === 'string'
      ? document.querySelector(`[data-focus-id="${idOrEl}"]:not([disabled])`)
      : idOrEl;

    if (!el) return;

    // Remove focus from previously focused element
    const prev = document.querySelectorAll('.tv-focused');
    prev.forEach(p => p.classList.remove('tv-focused'));

    // Apply focus class to target element
    el.classList.add('tv-focused');
    this.currentFocusedId = el.getAttribute('data-focus-id') || null;

    try {
      el.focus();
    } catch {}

    if (scroll) {
      try {
        el.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
          inline: 'nearest'
        });
      } catch {
        el.scrollIntoView(false);
      }
    }

    // Dispatch global focus changed event
    window.dispatchEvent(
      new CustomEvent('skycine_focus_changed', {
        detail: { id: this.currentFocusedId, element: el }
      })
    );
  }

  public focusFirst(container?: HTMLElement | string) {
    let root: ParentNode | null = typeof container === 'string'
      ? document.querySelector(container)
      : (container || null);

    if (!root) {
      const playerView = document.querySelector('.player-view') as HTMLElement;
      const activeModal = document.querySelector('.webos-modal-active, .tizen-modal-active') as HTMLElement;
      const detailView = document.querySelector('.detail-view') as HTMLElement;

      if (playerView && playerView.style.display !== 'none') {
        root = playerView;
      } else if (activeModal && activeModal.style.display !== 'none') {
        root = activeModal;
      } else if (detailView && detailView.style.display !== 'none') {
        root = detailView;
      } else {
        root = document;
      }
    }

    const first = (root || document).querySelector('[data-tv-focus="true"]:not([disabled])') as HTMLElement;
    if (first) {
      this.focus(first);
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    const keyCode = e.keyCode || e.which;

    // 1. Custom key handler (e.g. video player controls or virtual keyboard)
    if (this.customKeyHandler && this.customKeyHandler(keyCode, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 2. Return / Back Key (LG webOS VK_BACK: 461 or Esc: 27)
    if (keyCode === WEBOS_KEYS.KEY_BACK || keyCode === WEBOS_KEYS.KEY_ESC) {
      e.preventDefault();
      e.stopPropagation();

      // Check stack handlers (modals, dialogs, player)
      if (this.backStack.length > 0) {
        const topHandler = this.backStack[this.backStack.length - 1];
        if (topHandler()) return;
      }

      // If in content, navigate back to sidebar menu first
      const current = this.getCurrentFocusedElement();
      const inSidebar = current && current.closest('.nav-rail');
      if (!inSidebar) {
        const targetNav = (document.querySelector('.nav-rail .nav-item.active') ||
                           document.querySelector('.nav-rail [data-tv-focus="true"]')) as HTMLElement;
        if (targetNav) {
          this.focus(targetNav);
          return;
        }
      }

      // If already in sidebar or root, exit application
      exitWebOSApp();
      return;
    }

    if (!this.isEnabled) return;

    // 3. OK / Enter Key (Wheel Click / Enter)
    if (keyCode === WEBOS_KEYS.KEY_ENTER) {
      e.preventDefault();
      e.stopPropagation();

      if (e.repeat) return; // Prevent remote key bounce

      const now = Date.now();
      if (now - this.lastEnterTime < 300) return;
      this.lastEnterTime = now;

      const current = this.getCurrentFocusedElement();
      if (current) {
        current.click();
      }
      return;
    }

    // 4. Directional D-pad Arrows (Up, Down, Left, Right)
    let dir: FocusDirection | null = null;
    if (keyCode === WEBOS_KEYS.KEY_UP) dir = 'up';
    else if (keyCode === WEBOS_KEYS.KEY_DOWN) dir = 'down';
    else if (keyCode === WEBOS_KEYS.KEY_LEFT) dir = 'left';
    else if (keyCode === WEBOS_KEYS.KEY_RIGHT) dir = 'right';

    if (!dir) return;

    e.preventDefault();
    e.stopPropagation();

    this.navigate(dir);
  }

  public navigate(dir: FocusDirection) {
    const current = this.getCurrentFocusedElement();
    if (!current) {
      this.focusFirst();
      return;
    }

    // 0. Dedicated Detail View Navigation (Seasons, Episodes, Play button)
    const currentDetail = current.closest('.detail-view');
    if (currentDetail) {
      if (current.matches('[data-focus-id="detail-back-btn"]')) {
        if (dir === 'down') {
          const playBtn = currentDetail.querySelector('[data-focus-id="detail-play-btn"]') as HTMLElement;
          if (playBtn) { this.focus(playBtn); return; }
        }
      } else if (current.matches('[data-focus-id="detail-play-btn"]')) {
        if (dir === 'up') {
          const backBtn = currentDetail.querySelector('[data-focus-id="detail-back-btn"]') as HTMLElement;
          if (backBtn) { this.focus(backBtn); return; }
        } else if (dir === 'down') {
          const firstTab = currentDetail.querySelector('.season-tab-btn.active, .season-tab-btn') as HTMLElement;
          if (firstTab) {
            this.focus(firstTab);
            return;
          }
          const firstEp = currentDetail.querySelector('.episode-card') as HTMLElement;
          if (firstEp) {
            this.focus(firstEp);
            return;
          }
        }
      } else if (current.classList.contains('season-tab-btn')) {
        const tabs = Array.from(currentDetail.querySelectorAll('.season-tab-btn')) as HTMLElement[];
        const tIdx = tabs.indexOf(current);
        if (dir === 'left' && tIdx > 0) {
          this.focus(tabs[tIdx - 1]);
          return;
        } else if (dir === 'right' && tIdx + 1 < tabs.length) {
          this.focus(tabs[tIdx + 1]);
          return;
        } else if (dir === 'up') {
          const playBtn = currentDetail.querySelector('[data-focus-id="detail-play-btn"]') as HTMLElement;
          if (playBtn) { this.focus(playBtn); return; }
        } else if (dir === 'down') {
          const firstEp = currentDetail.querySelector('.episode-card') as HTMLElement;
          if (firstEp) { this.focus(firstEp); return; }
        }
      } else if (current.classList.contains('episode-card')) {
        const epCards = Array.from(currentDetail.querySelectorAll('.episode-card')) as HTMLElement[];
        const eIdx = epCards.indexOf(current);
        if (dir === 'left' && eIdx > 0) {
          this.focus(epCards[eIdx - 1]);
          return;
        } else if (dir === 'right' && eIdx + 1 < epCards.length) {
          this.focus(epCards[eIdx + 1]);
          return;
        } else if (dir === 'up') {
          const activeTab = currentDetail.querySelector('.season-tab-btn.active, .season-tab-btn') as HTMLElement;
          if (activeTab) {
            this.focus(activeTab);
            return;
          }
          const playBtn = currentDetail.querySelector('[data-focus-id="detail-play-btn"]') as HTMLElement;
          if (playBtn) {
            this.focus(playBtn);
            return;
          }
        }
      }
      return;
    }

    // Active View Scoping: strictly prioritize topmost view
    let searchScope: ParentNode = document;
    const playerView = document.querySelector('.player-view') as HTMLElement;
    const activeModal = document.querySelector('.webos-modal-active, .tizen-modal-active') as HTMLElement;
    const detailView = document.querySelector('.detail-view') as HTMLElement;

    if (playerView && playerView.style.display !== 'none') {
      searchScope = playerView;
    } else if (activeModal && activeModal.style.display !== 'none') {
      searchScope = activeModal;
    } else if (detailView && detailView.style.display !== 'none') {
      searchScope = detailView;
    }

    // 1. Instant O(1) Sidebar Nav Rail Navigation
    const currentNav = current.closest('.nav-rail');
    if (currentNav) {
      if (dir === 'right') {
        const mainTarget = document.querySelector(
          '.hero-actions [data-tv-focus="true"], #catalog-grid-mount [data-tv-focus="true"], .shelf-carousel [data-tv-focus="true"], .main-content [data-tv-focus="true"]'
        ) as HTMLElement;
        if (mainTarget) {
          this.focus(mainTarget);
          return;
        }
      } else if (dir === 'down') {
        const navButtons = Array.from(currentNav.querySelectorAll('[data-tv-focus="true"]')) as HTMLElement[];
        const idx = navButtons.indexOf(current);
        if (idx !== -1 && idx + 1 < navButtons.length) {
          this.focus(navButtons[idx + 1]);
          return;
        }
      } else if (dir === 'up') {
        const navButtons = Array.from(currentNav.querySelectorAll('[data-tv-focus="true"]')) as HTMLElement[];
        const idx = navButtons.indexOf(current);
        if (idx > 0) {
          this.focus(navButtons[idx - 1]);
          return;
        }
      }
      return;
    }

    // 2. Instant O(1) 6-Column Catalog Grid Navigation
    const currentGrid = current.closest('#catalog-grid-mount');
    if (currentGrid) {
      const gridItems = Array.from(currentGrid.children) as HTMLElement[];
      const idx = gridItems.indexOf(current);
      if (idx !== -1) {
        const COLS = 6;
        if (dir === 'left') {
          if (idx % COLS === 0) {
            const activeNav = (document.querySelector('.nav-rail .nav-item.active') ||
                               document.querySelector('.nav-rail [data-tv-focus="true"]')) as HTMLElement;
            if (activeNav) {
              this.focus(activeNav);
              return;
            }
          } else if (idx > 0) {
            this.focus(gridItems[idx - 1]);
            return;
          }
        } else if (dir === 'right') {
          if (idx + 1 < gridItems.length && idx % COLS !== COLS - 1) {
            this.focus(gridItems[idx + 1]);
            return;
          }
        } else if (dir === 'up') {
          if (idx >= COLS) {
            this.focus(gridItems[idx - COLS]);
            return;
          }
        } else if (dir === 'down') {
          if (idx + COLS < gridItems.length) {
            this.focus(gridItems[idx + COLS]);
            return;
          }
        }
        return;
      }
    }

    // 3. Instant O(1) Hero Billboard Actions Navigation (Main Page)
    const currentHero = current.closest('.hero-billboard .hero-actions');
    if (currentHero) {
      if (dir === 'left') {
        const prevBtn = current.previousElementSibling as HTMLElement;
        if (prevBtn && prevBtn.getAttribute('data-tv-focus') === 'true') {
          this.focus(prevBtn);
          return;
        }
        const activeNav = (document.querySelector('.nav-rail .nav-item.active') ||
                           document.querySelector('.nav-rail [data-tv-focus="true"]')) as HTMLElement;
        if (activeNav) {
          this.focus(activeNav);
          return;
        }
      } else if (dir === 'right') {
        const nextBtn = current.nextElementSibling as HTMLElement;
        if (nextBtn && nextBtn.getAttribute('data-tv-focus') === 'true') {
          this.focus(nextBtn);
          return;
        }
      } else if (dir === 'down') {
        const firstShelfCard = document.querySelector('.shelf-carousel [data-tv-focus="true"]') as HTMLElement;
        if (firstShelfCard) {
          this.focus(firstShelfCard);
          return;
        }
      }
      return;
    }

    // 4. Instant O(1) Horizontal Shelves / Carousels Navigation
    const currentCarousel = current.closest('.shelf-carousel');
    if (currentCarousel) {
      if (dir === 'left') {
        const prevCard = current.previousElementSibling as HTMLElement;
        if (prevCard && prevCard.getAttribute('data-tv-focus') === 'true') {
          this.focus(prevCard);
          return;
        } else {
          // At the start of shelf: jump to sidebar nav
          const activeNav = (document.querySelector('.nav-rail .nav-item.active') ||
                             document.querySelector('.nav-rail [data-tv-focus="true"]')) as HTMLElement;
          if (activeNav && searchScope === document) {
            this.focus(activeNav);
            return;
          }
        }
      } else if (dir === 'right') {
        const nextCard = current.nextElementSibling as HTMLElement;
        if (nextCard && nextCard.getAttribute('data-tv-focus') === 'true') {
          this.focus(nextCard);
          return;
        }
      } else if (dir === 'down') {
        const currentSection = current.closest('.shelf-section');
        if (currentSection) {
          const nextSection = currentSection.nextElementSibling;
          if (nextSection) {
            const firstCard = nextSection.querySelector('[data-tv-focus="true"]') as HTMLElement;
            if (firstCard) {
              this.focus(firstCard);
              return;
            }
          }
        }
      } else if (dir === 'up') {
        const currentSection = current.closest('.shelf-section');
        if (currentSection) {
          const prevSection = currentSection.previousElementSibling;
          if (prevSection && prevSection.classList.contains('shelf-section')) {
            const firstCard = prevSection.querySelector('[data-tv-focus="true"]') as HTMLElement;
            if (firstCard) {
              this.focus(firstCard);
              return;
            }
          } else {
            const heroBtn = document.querySelector('.hero-actions [data-tv-focus="true"]') as HTMLElement;
            if (heroBtn) {
              this.focus(heroBtn);
              return;
            }
          }
        }
      }
      return;
    }

    // 5. Fallback: Geometric Spatial Search for Dynamic Modals & Custom Screens
    this.geometricMove(current, dir, searchScope);
  }

  private geometricMove(current: HTMLElement, dir: FocusDirection, scope: ParentNode) {
    const candidates = Array.from(
      scope.querySelectorAll('[data-tv-focus="true"]:not([disabled])')
    ) as HTMLElement[];

    const curRect = current.getBoundingClientRect();
    const curCenter = {
      x: curRect.left + curRect.width / 2,
      y: curRect.top + curRect.height / 2
    };

    let bestCandidate: HTMLElement | null = null;
    let lowestScore = Infinity;

    for (const el of candidates) {
      if (el === current) continue;
      if (el.offsetParent === null && el.style.position !== 'fixed') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const elCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      let dPrimary = 0;
      let dCross = 0;
      let isValid = false;

      if (dir === 'right') {
        const dx = elCenter.x - curCenter.x;
        if (dx > 4 && rect.left >= curRect.left - 10) {
          dPrimary = Math.max(0, rect.left - curRect.right);
          const overlapY = Math.max(0, Math.min(curRect.bottom, rect.bottom) - Math.max(curRect.top, rect.top));
          if (overlapY > 0) {
            dCross = Math.abs(elCenter.y - curCenter.y);
            isValid = true;
          } else {
            const gapY = rect.top > curRect.bottom ? rect.top - curRect.bottom : curRect.top - rect.bottom;
            if (gapY < 140) {
              dCross = 5000 + (gapY * 10);
              isValid = true;
            }
          }
        }
      } else if (dir === 'left') {
        const dx = curCenter.x - elCenter.x;
        if (dx > 4 && rect.right <= curRect.right + 10) {
          dPrimary = Math.max(0, curRect.left - rect.right);
          const overlapY = Math.max(0, Math.min(curRect.bottom, rect.bottom) - Math.max(curRect.top, rect.top));
          if (overlapY > 0) {
            dCross = Math.abs(elCenter.y - curCenter.y);
            isValid = true;
          } else {
            const gapY = rect.top > curRect.bottom ? rect.top - curRect.bottom : curRect.top - rect.bottom;
            if (gapY < 140) {
              dCross = 5000 + (gapY * 10);
              isValid = true;
            }
          }
        }
      } else if (dir === 'down') {
        const dy = elCenter.y - curCenter.y;
        if (dy > 4 && rect.top >= curRect.top - 10) {
          dPrimary = Math.max(0, rect.top - curRect.bottom);
          const overlapX = Math.max(0, Math.min(curRect.right, rect.right) - Math.max(curRect.left, rect.left));
          if (overlapX > 0) {
            dCross = Math.abs(elCenter.x - curCenter.x);
            isValid = true;
          } else {
            const gapX = rect.left > curRect.right ? rect.left - curRect.right : curRect.left - rect.right;
            if (gapX < 140) {
              dCross = 5000 + (gapX * 10);
              isValid = true;
            }
          }
        }
      } else if (dir === 'up') {
        const dy = curCenter.y - elCenter.y;
        if (dy > 4 && rect.bottom <= curRect.bottom + 10) {
          dPrimary = Math.max(0, curRect.top - rect.bottom);
          const overlapX = Math.max(0, Math.min(curRect.right, rect.right) - Math.max(curRect.left, rect.left));
          if (overlapX > 0) {
            dCross = Math.abs(elCenter.x - curCenter.x);
            isValid = true;
          } else {
            const gapX = rect.left > curRect.right ? rect.left - curRect.right : curRect.left - rect.right;
            if (gapX < 140) {
              dCross = 5000 + (gapX * 10);
              isValid = true;
            }
          }
        }
      }

      if (isValid) {
        const score = (dPrimary * 1.2) + dCross;
        if (score < lowestScore) {
          lowestScore = score;
          bestCandidate = el;
        }
      }
    }

    if (bestCandidate) {
      this.focus(bestCandidate);
    }
  }
}

export const focusManager = new WebOSFocusManager();
