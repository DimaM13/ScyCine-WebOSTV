// Native Cinema TV Series & Movie Detail View for LG webOS TV (100% Opaque - Zero Overlap)

import { MediaItem, Episode } from '../../types';
import { SkyCineApi } from '../../api/client';
import { Icons } from '../icons';
import { createEpisodeCard, createCinemaCard } from '../components/Card';
import { focusManager } from '../../webos/webOSFocusManager';

export class DetailPage {
  private container: HTMLElement;
  private media: MediaItem;
  private episodes: Episode[] = [];
  private selectedSeason: number = 1;
  private relatedMovies: MediaItem[] = [];
  private streamInfo: any = null;

  private onCloseCallback: () => void;
  private onPlayCallback: (media: MediaItem, episode?: Episode, list?: Episode[]) => void;

  constructor(
    media: MediaItem,
    onClose: () => void,
    onPlay: (media: MediaItem, episode?: Episode, list?: Episode[]) => void
  ) {
    this.media = media;
    this.onCloseCallback = onClose;
    this.onPlayCallback = onPlay;

    this.container = document.createElement('div');
    this.container.className = 'detail-view';

    // Register Back button handler in focus manager
    focusManager.pushBackHandler(() => {
      this.close();
      return true;
    });

    this.render();
    this.loadEpisodesIfShow();
    this.loadMovieExtraData();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public close() {
    focusManager.popBackHandler();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.onCloseCallback();
  }

  private async loadEpisodesIfShow() {
    const isShow = this.media.type === 'SHOW' || this.media.type === 'EPISODE' || Boolean(this.media.showTitle);
    if (!isShow) return;

    const showTitle = this.media.showTitle || this.media.title || '';
    try {
      const epList = await SkyCineApi.getShowEpisodes(showTitle);
      this.episodes = epList;
      if (epList.length > 0) {
        if (this.media.seasonNumber) {
          this.selectedSeason = this.media.seasonNumber;
        } else {
          const inProgress = epList.find(e => (e.progressSeconds || 0) > 0 && !e.isCompleted);
          this.selectedSeason = inProgress?.seasonNumber || epList[0].seasonNumber || 1;
        }
      }
      this.render();
    } catch (e) {
      console.error('[DetailPage] Error loading episodes:', e);
    }
  }

  private async loadMovieExtraData() {
    const isShow = this.media.type === 'SHOW' || this.media.type === 'EPISODE' || Boolean(this.media.showTitle);
    if (isShow) return;

    try {
      const [moviesRes, streamInfoRes] = await Promise.allSettled([
        SkyCineApi.getMovies(this.media.libraryId),
        this.media.id ? SkyCineApi.getStreamInfo(this.media.id) : Promise.resolve(null)
      ]);

      if (moviesRes.status === 'fulfilled' && Array.isArray(moviesRes.value)) {
        this.relatedMovies = moviesRes.value.filter(m => m.id !== this.media.id);
      }
      if (streamInfoRes.status === 'fulfilled' && streamInfoRes.value) {
        this.streamInfo = streamInfoRes.value;
      }
      const prevFocusedId = focusManager.getCurrentFocusedId();
      this.render();
      if (prevFocusedId) {
        focusManager.focus(prevFocusedId, false);
      }
    } catch (e) {
      console.error('[DetailPage] Error loading extra movie data:', e);
    }
  }

  public render() {
    const media = this.media;
    const isShow = media.type === 'SHOW' || media.type === 'EPISODE' || Boolean(media.showTitle);
    const backdropUrl = SkyCineApi.getImageUrl(media.backdropPath || media.posterPath);
    const title = media.showTitle || media.title || media.displayTitle || 'Без названия';

    const seasons = Array.from(new Set(this.episodes.map(e => e.seasonNumber))).sort((a, b) => a - b);
    const currentEpisodes = this.episodes.filter(e => e.seasonNumber === this.selectedSeason);

    const resumeEp = isShow
      ? (this.episodes.find(e => (e.progressSeconds || 0) > 0 && !e.isCompleted) || this.episodes[0])
      : null;

    const playBtnText = isShow
      ? (resumeEp && (resumeEp.progressSeconds || 0) > 0
          ? `Продолжить S${resumeEp.seasonNumber}:E${resumeEp.episodeNumber}`
          : 'Смотреть с 1 серии')
      : 'Смотреть фильм';

    // Movie Extra Data Calculations
    const durSec = media.durationSeconds || this.streamInfo?.durationSeconds || 0;
    const durHours = Math.floor(durSec / 3600);
    const durMins = Math.floor((durSec % 3600) / 60);
    const durationFormatted = durHours > 0 ? `${durHours} ч ${durMins} мин` : durMins > 0 ? `${durMins} мин` : '—';

    const resolution = media.resolution
      ? (media.resolution.includes('4K') || media.resolution.includes('2160') ? '4K Ultra HD' : media.resolution.includes('1080') ? '1080p Full HD' : media.resolution.includes('720') ? '720p HD' : media.resolution)
      : (media.videoCodec ? '1080p Full HD' : 'HD');
    const videoCodec = (media.videoCodec || this.streamInfo?.videoCodec || 'H.264').toUpperCase();

    const rawAudio = (this.streamInfo?.tracks?.find((t: any) => t.type === 'AUDIO')?.codec || media.audioCodec || 'AC3').toUpperCase();
    let audioLabel = rawAudio;
    if (/dts|dca|truehd|mlp/i.test(rawAudio)) {
      audioLabel = 'Dolby Audio 5.1 (DTS Remux)';
    } else if (rawAudio.includes('EAC3') || rawAudio.includes('ATMOS')) {
      audioLabel = 'Dolby Atmos / EAC3';
    } else if (rawAudio.includes('AC3')) {
      audioLabel = 'Dolby Digital 5.1';
    } else if (rawAudio.includes('AAC')) {
      audioLabel = 'AAC Стерео';
    }

    const filePath = media.filePath || '';
    const ext = filePath ? (filePath.split('.').pop()?.toUpperCase() || 'MKV') : 'MKV';
    const formatLabel = `${ext} • Direct Stream`;

    this.container.innerHTML = `
      <!-- Top Hero Showcase -->
      <div class="detail-hero">
        ${backdropUrl ? `<img class="hero-backdrop-img" src="${backdropUrl}" alt="${title}" />` : ''}
        <div class="hero-gradient-bottom"></div>
        <div class="hero-gradient-left"></div>

        <!-- Back Button -->
        <button 
          type="button" 
          class="tv-btn tv-btn-secondary detail-back-btn" 
          data-tv-focus="true" 
          data-focus-id="detail-back-btn"
          tabindex="0"
        >
          ${Icons.arrowLeft(20, '#ffffff')}
          <span>Назад к списку</span>
        </button>

        <div class="hero-content">
          <div class="hero-badges">
            ${
              media.rating
                ? `
              <div class="badge-rating">
                ${Icons.star(14, '#e5a93c')}
                <span>${media.rating.toFixed(1)}</span>
              </div>
            `
                : ''
            }
            ${media.year ? `<span class="badge-meta">${media.year}</span>` : ''}
            ${media.resolution ? `<span class="badge-meta" style="border: 1px solid rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 6px; font-size: 11px;">${media.resolution}</span>` : ''}
            ${
              durSec > 0
                ? `<span class="badge-meta">${durationFormatted}</span>`
                : ''
            }
          </div>

          <h1 class="hero-title">${title}</h1>

          ${
            media.overview
              ? `<p class="hero-overview">${media.overview}</p>`
              : ''
          }

          <div class="hero-actions">
            <button 
              type="button" 
              class="tv-btn tv-btn-primary" 
              data-tv-focus="true" 
              data-focus-id="detail-play-btn"
              tabindex="0"
            >
              ${Icons.play(22, '#07090e')}
              <span>${playBtnText}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- TV Series Episodes Browser -->
      ${
        isShow
          ? `
        <div class="detail-episodes-wrap">
          <!-- Season Selector Tabs -->
          ${
            seasons.length > 1
              ? `
            <div class="season-tabs-bar">
              <span style="font-size: 13px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-right: 10px;">Сезоны:</span>
              ${seasons
                .map(
                  (sNum) => `
                <button 
                  type="button" 
                  class="season-tab-btn ${this.selectedSeason === sNum ? 'active' : ''}"
                  data-tv-focus="true" 
                  data-focus-id="season-tab-${sNum}"
                  data-season="${sNum}"
                  tabindex="0"
                >
                  ${sNum} сезон
                </button>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }

          <!-- Episodes Section Header -->
          <div style="font-size: 20px; font-weight: 900; color: #ffffff; margin-bottom: 24px;">
            Серии (${currentEpisodes.length})
          </div>

          <!-- Episode Cards Grid -->
          <div class="episodes-grid" id="episodes-grid-mount"></div>
        </div>
      `
          : `
        <!-- Movie Details (Specs Bar & Recommendations) -->
        <div class="detail-movie-wrap">
          <!-- 4 Glassmorphism Spec Cards -->
          <div class="detail-specs-bar">
            <!-- Video Quality -->
            <div class="spec-card">
              <div class="spec-card-icon" style="color: #38bdf8;">
                ${Icons.film(24, '#38bdf8')}
              </div>
              <div class="spec-card-content">
                <span class="spec-card-label">Качество видео</span>
                <span class="spec-card-value">${resolution} • ${videoCodec}</span>
              </div>
            </div>

            <!-- Audio Format -->
            <div class="spec-card">
              <div class="spec-card-icon" style="color: #a855f7;">
                ${Icons.volume(24, '#a855f7')}
              </div>
              <div class="spec-card-content">
                <span class="spec-card-label">Аудиодорожка</span>
                <span class="spec-card-value">${audioLabel}</span>
              </div>
            </div>

            <!-- Duration -->
            <div class="spec-card">
              <div class="spec-card-icon" style="color: #22c55e;">
                ${Icons.clock(24, '#22c55e')}
              </div>
              <div class="spec-card-content">
                <span class="spec-card-label">Длительность</span>
                <span class="spec-card-value">${durationFormatted}</span>
              </div>
            </div>

            <!-- File Format -->
            <div class="spec-card">
              <div class="spec-card-icon" style="color: #f59e0b;">
                ${Icons.clapperboard(24, '#f59e0b')}
              </div>
              <div class="spec-card-content">
                <span class="spec-card-label">Формат файла</span>
                <span class="spec-card-value">${formatLabel}</span>
              </div>
            </div>
          </div>

          <!-- Recommendations Carousel -->
          ${
            this.relatedMovies.length > 0
              ? `
            <div class="detail-related-section">
              <div class="detail-related-header">
                <div class="detail-related-pill"></div>
                <h2 class="detail-related-title">Вам может понравиться</h2>
              </div>
              <div class="detail-related-carousel" id="related-movies-mount"></div>
            </div>
          `
              : ''
          }
        </div>
      `
      }
    `;

    // Attach Back Button Handler
    const backBtn = this.container.querySelector('[data-focus-id="detail-back-btn"]');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.close());
    }

    // Attach Play Button Handler
    const playBtn = this.container.querySelector('[data-focus-id="detail-play-btn"]');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (isShow && this.episodes.length > 0) {
          const target = this.episodes.find(e => (e.progressSeconds || 0) > 0 && !e.isCompleted) || this.episodes[0];
          this.onPlayCallback(this.media, target, this.episodes);
        } else {
          this.onPlayCallback(this.media);
        }
      });
    }

    // Attach Season Tabs Handlers
    const tabBtns = this.container.querySelectorAll('[data-season]');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sNum = parseInt(btn.getAttribute('data-season') || '1', 10);
        this.selectedSeason = sNum;
        this.render();
        focusManager.focus(`season-tab-${sNum}`);
      });
    });

    // Populate Episode Cards
    const epGridMount = this.container.querySelector('#episodes-grid-mount');
    if (epGridMount && currentEpisodes.length > 0) {
      currentEpisodes.forEach((ep) => {
        const epCard = createEpisodeCard(ep, () => {
          this.onPlayCallback(this.media, ep, this.episodes);
        });
        epGridMount.appendChild(epCard);
      });
    }

    // Populate Related Movie Cards
    const relMount = this.container.querySelector('#related-movies-mount');
    if (relMount && this.relatedMovies.length > 0) {
      this.relatedMovies.forEach((m) => {
        const card = createCinemaCard(m, (item) => {
          this.media = item;
          this.relatedMovies = [];
          this.streamInfo = null;
          this.render();
          this.loadMovieExtraData();
          focusManager.focus('detail-play-btn');
        }, 'rel');
        relMount.appendChild(card);
      });
    }

    // Auto Focus Main Action if no focus inside this view
    const currentFocused = focusManager.getCurrentFocusedElement();
    if (!currentFocused || !this.container.contains(currentFocused)) {
      setTimeout(() => {
        focusManager.focus('detail-play-btn');
      }, 80);
    }
  }
}
