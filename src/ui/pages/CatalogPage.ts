// Native Cinema TV Catalog Grid Page for LG webOS TV (Specific Libraries & Generic Collections)

import { MediaItem, Library } from '../../types';
import { SkyCineApi } from '../../api/client';
import { createCinemaCard } from '../components/Card';
import { focusManager } from '../../webos/webOSFocusManager';

export class CatalogPage {
  private container: HTMLElement;
  private library: Library | null = null;
  private legacyType: 'movies' | 'shows' | null = null;
  private onDetailCallback: (item: MediaItem) => void;

  constructor(
    target: Library | 'movies' | 'shows',
    onDetail: (item: MediaItem) => void
  ) {
    if (typeof target === 'string') {
      this.legacyType = target;
    } else {
      this.library = target;
    }
    this.onDetailCallback = onDetail;

    this.container = document.createElement('div');
    this.container.className = 'main-content';

    this.render();
    this.loadData();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  private isShowsType(): boolean {
    if (this.library) {
      return (this.library.type || '').toUpperCase() === 'SHOWS';
    }
    return this.legacyType === 'shows';
  }

  private getTitle(): string {
    if (this.library) {
      return this.library.name;
    }
    return this.legacyType === 'movies' ? 'Фильмы медиатеки' : 'Сериалы';
  }

  private formatCount(count: number): string {
    const isShow = this.isShowsType();
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (isShow) {
      if (mod10 === 1 && mod100 !== 11) return `${count} сериал`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} сериала`;
      return `${count} сериалов`;
    } else {
      if (mod10 === 1 && mod100 !== 11) return `${count} фильм`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} фильма`;
      return `${count} фильмов`;
    }
  }

  private async loadData() {
    try {
      const isShow = this.isShowsType();
      const libraryId = this.library ? this.library.id : undefined;

      const items = isShow
        ? await SkyCineApi.getShows(libraryId)
        : await SkyCineApi.getMovies(libraryId);

      const gridMount = this.container.querySelector('#catalog-grid-mount');
      const countEl = this.container.querySelector('#catalog-count');

      if (countEl) countEl.textContent = this.formatCount(items.length);

      if (gridMount) {
        gridMount.innerHTML = '';
        if (items.length === 0) {
          gridMount.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 60px; text-align: center; color: #64748b; font-size: 18px; font-weight: 700;">
              В этой категории пока нет файлов. Добавьте медиа на сервере SkyCine.
            </div>
          `;
          return;
        }

        const prefix = this.library ? `cat-lib-${this.library.id}` : `cat-${this.legacyType}`;
        items.forEach((item, index) => {
          const card = createCinemaCard(item, (m) => this.onDetailCallback(m), `${prefix}-${index}`);
          gridMount.appendChild(card);
        });

        // Focus first card
        setTimeout(() => {
          const first = gridMount.querySelector('[data-tv-focus="true"]') as HTMLElement;
          if (first) focusManager.focus(first);
        }, 100);
      }
    } catch (e) {
      console.error('[CatalogPage] Error loading catalog:', e);
    }
  }

  public render() {
    const title = this.getTitle();

    this.container.innerHTML = `
      <div style="padding: 48px 64px 20px 64px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; margin-right: 16px;">
          <div class="shelf-pill" style="height: 32px; width: 8px;"></div>
          <h1 style="font-size: 32px; font-weight: 900; color: #ffffff;">${title}</h1>
        </div>
        <span id="catalog-count" style="font-size: 15px; font-weight: 800; color: #e5a93c;">Загрузка...</span>
      </div>

      <div 
        id="catalog-grid-mount" 
        style="display: grid; grid-template-columns: repeat(6, 1fr); grid-gap: 24px; gap: 24px; padding: 20px 64px 80px 64px;"
      ></div>
    `;
  }
}

