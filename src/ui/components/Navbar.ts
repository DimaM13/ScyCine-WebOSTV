// Native Cinema TV Sidebar Navigation Rail for LG webOS TV

import { Icons } from '../icons';
import { Preferences } from '../../storage/preferences';
import { Library } from '../../types';

export interface NavItemDef {
  id: string;
  label: string;
  iconHtml: string;
  library?: Library;
}

export class Navbar {
  private container: HTMLElement;
  private currentScreen: string = 'home';
  private onSelectCallback: (screen: string, library?: Library) => void;
  private onLogoutCallback: () => void;
  private libraries: Library[] = [];
  private items: NavItemDef[] = [];

  constructor(
    onSelect: (screen: string, library?: Library) => void,
    onLogout: () => void
  ) {
    this.onSelectCallback = onSelect;
    this.onLogoutCallback = onLogout;
    this.container = document.createElement('aside');
    this.container.className = 'nav-rail';

    this.rebuildItems();
    this.render();

    // Auto expand/collapse sidebar on focus
    window.addEventListener('skycine_focus_changed', (e: any) => {
      const el = e.detail?.element as HTMLElement;
      if (el && this.container.contains(el)) {
        this.container.classList.add('expanded');
      } else {
        this.container.classList.remove('expanded');
      }
    });
  }

  public setLibraries(libraries: Library[]) {
    this.libraries = libraries;
    this.rebuildItems();
    this.render();
  }

  private getLibraryIcon(lib: Library): string {
    const nameLower = (lib.name || '').toLowerCase();
    const typeUpper = (lib.type || '').toUpperCase();

    if (nameLower.includes('мульт') || nameLower.includes('cartoon') || nameLower.includes('детск')) {
      return Icons.sparkles(24);
    }
    if (nameLower.includes('песн') || nameLower.includes('музык') || nameLower.includes('audio') || nameLower.includes('music')) {
      return Icons.music(24);
    }
    if (typeUpper === 'VIDEOS' || nameLower.includes('видео') || nameLower.includes('клип')) {
      return Icons.folder(24);
    }
    if (typeUpper === 'SHOWS' || nameLower.includes('сериал') || nameLower.includes('аниме') || nameLower.includes('anime') || nameLower.includes('шоу')) {
      return Icons.tv(24);
    }
    return Icons.film(24);
  }

  private rebuildItems() {
    const list: NavItemDef[] = [
      { id: 'home', label: 'Главная', iconHtml: Icons.home(24) }
    ];

    if (this.libraries.length > 0) {
      this.libraries.forEach((lib) => {
        list.push({
          id: `lib_${lib.id}`,
          label: lib.name,
          iconHtml: this.getLibraryIcon(lib),
          library: lib
        });
      });
    } else {
      // Fallback while libraries are loading
      list.push(
        { id: 'movies', label: 'Фильмы', iconHtml: Icons.film(24) },
        { id: 'shows', label: 'Сериалы', iconHtml: Icons.tv(24) }
      );
    }

    list.push(
      { id: 'search', label: 'Поиск', iconHtml: Icons.search(24) },
      { id: 'rooms', label: 'Вместе', iconHtml: Icons.users(24) },
      { id: 'settings', label: 'Настройки', iconHtml: Icons.settings(24) }
    );

    this.items = list;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public setActive(screen: string) {
    this.currentScreen = screen;
    const allBtns = this.container.querySelectorAll('.nav-item');
    allBtns.forEach((btn) => {
      const id = btn.getAttribute('data-screen-id');
      if (id === screen) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  public render() {
    const user = Preferences.getUser();

    this.container.innerHTML = `
      <!-- Brand Logo -->
      <div class="nav-rail-logo">
        <div class="nav-logo-icon">
          ${Icons.clapperboard(26, '#07090e')}
        </div>
        <div class="nav-logo-text">
          <div class="nav-logo-title">SKY<span>CINE</span></div>
          <div class="nav-logo-sub">Cinema TV</div>
        </div>
      </div>

      <!-- Menu Items Container -->
      <nav class="nav-menu">
        ${this.items
          .map(
            (item) => `
          <button 
            type="button"
            class="nav-item ${this.currentScreen === item.id ? 'active' : ''}"
            data-tv-focus="true"
            data-focus-id="nav-${item.id}"
            data-screen-id="${item.id}"
            tabindex="0"
          >
            <div class="nav-item-icon">${item.iconHtml}</div>
            <span class="nav-item-label">${item.label}</span>
          </button>
        `
          )
          .join('')}
      </nav>

      <!-- Footer: User & Logout -->
      <div class="nav-footer">
        ${
          user
            ? `
          <div class="nav-user-info" style="display: none; padding: 0 16px;">
            <div style="font-size: 11px; color: #64748b; font-weight: 700;">ПРОФИЛЬ</div>
            <div style="font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.username}</div>
          </div>
        `
            : ''
        }
        <button 
          type="button"
          class="nav-item"
          data-tv-focus="true"
          data-focus-id="nav-logout"
          tabindex="0"
          style="color: #f87171;"
        >
          <div class="nav-item-icon">${Icons.logout(24, '#f87171')}</div>
          <span class="nav-item-label">Выйти</span>
        </button>
      </div>
    `;

    // Attach click handlers
    this.items.forEach((item) => {
      const btn = this.container.querySelector(`[data-focus-id="nav-${item.id}"]`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.setActive(item.id);
          this.onSelectCallback(item.id, item.library);
        });
      }
    });

    const logoutBtn = this.container.querySelector('[data-focus-id="nav-logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.onLogoutCallback();
      });
    }
  }
}
