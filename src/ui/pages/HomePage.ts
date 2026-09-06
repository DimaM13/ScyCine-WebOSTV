// Native Cinema TV Home Screen (Hero Billboard + Widescreen Carousels) for LG webOS TV

import { MediaItem, Library } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Billboard } from '../components/Billboard';
import { Carousel } from '../components/Carousel';
import { focusManager } from '../../webos/webOSFocusManager';

export class HomePage {
  private container: HTMLElement;
  private billboard: Billboard;
  private continueShelf: Carousel;
  private shelvesContainer: HTMLElement;

  private onPlayCallback: (item: MediaItem) => void;
  private onDetailCallback: (item: MediaItem) => void;

  private featuredItem: MediaItem | null = null;

  constructor(
    onPlay: (item: MediaItem) => void,
    onDetail: (item: MediaItem) => void
  ) {
    this.onPlayCallback = onPlay;
    this.onDetailCallback = onDetail;

    this.container = document.createElement('div');
    this.container.className = 'main-content';

    this.billboard = new Billboard(
      (item) => this.onPlayCallback(item),
      (item) => this.onDetailCallback(item)
    );

    this.continueShelf = new Carousel('Продолжить просмотр');
    this.shelvesContainer = document.createElement('div');

    this.container.appendChild(this.billboard.getElement());
    this.container.appendChild(this.continueShelf.getElement());
    this.container.appendChild(this.shelvesContainer);
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public async loadData() {
    try {
      const [continueItems, libraries] = await Promise.all([
        SkyCineApi.getContinueWatching().catch(() => []),
        SkyCineApi.getLibraries().catch(() => [])
      ]);

      // 1. Populate Continue Watching Shelf
      if (continueItems && continueItems.length > 0) {
        this.continueShelf.setItems(
          continueItems.map((item: any) => ({
            ...item,
            id: item.mediaId || item.id,
            effectiveId: item.mediaId || item.id
          })),
          (item) => this.onPlayCallback(item),
          'cont'
        );
      } else {
        this.continueShelf.getElement().style.display = 'none';
      }

      this.shelvesContainer.innerHTML = '';
      const allLoadedItems: MediaItem[] = [];

      // 2. Load shelves dynamically per library
      if (libraries && libraries.length > 0) {
        for (const lib of libraries) {
          try {
            const isShows = (lib.type || '').toUpperCase() === 'SHOWS';
            const items = isShows
              ? await SkyCineApi.getShows(lib.id)
              : await SkyCineApi.getMovies(lib.id);

            if (items && items.length > 0) {
              allLoadedItems.push(...items);
              const shelf = new Carousel(lib.name);
              shelf.setItems(
                items,
                (item) => this.onDetailCallback(item),
                `lib-${lib.id}`
              );
              this.shelvesContainer.appendChild(shelf.getElement());
            }
          } catch (e) {
            console.error(`[HomePage] Error loading items for library ${lib.name}:`, e);
          }
        }
      } else {
        // Fallback if no libraries configured
        const [movies, shows] = await Promise.all([
          SkyCineApi.getMovies().catch(() => []),
          SkyCineApi.getShows().catch(() => [])
        ]);
        allLoadedItems.push(...movies, ...shows);

        if (movies.length > 0) {
          const moviesShelf = new Carousel('Фильмы медиатеки');
          moviesShelf.setItems(movies, (item) => this.onDetailCallback(item), 'movie');
          this.shelvesContainer.appendChild(moviesShelf.getElement());
        }
        if (shows.length > 0) {
          const showsShelf = new Carousel('Популярные сериалы');
          showsShelf.setItems(shows, (item) => this.onDetailCallback(item), 'show');
          this.shelvesContainer.appendChild(showsShelf.getElement());
        }
      }

      // 3. Set Featured Item for Billboard from loaded items
      const candidates = allLoadedItems.filter(m => m.backdropPath && (m.title || m.showTitle));
      if (candidates.length > 0) {
        const sorted = [...candidates].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        this.featuredItem = sorted[0];
      } else if (allLoadedItems.length > 0) {
        this.featuredItem = allLoadedItems[0];
      }

      this.billboard.setItem(this.featuredItem);

      // 4. Initial Focus
      setTimeout(() => {
        const firstFocus = this.container.querySelector(
          '[data-focus-id="hero-play-btn"], [data-focus-id^="cont-"], [data-focus-id^="lib-"], [data-focus-id^="movie-"]'
        ) as HTMLElement;
        if (firstFocus) {
          focusManager.focus(firstFocus);
        }
      }, 100);

    } catch (err) {
      console.error('[HomePage] Error loading home content:', err);
    }
  }
}

