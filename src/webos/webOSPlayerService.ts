// High-Performance Hardware-Accelerated Video Player Service for LG webOS TV
import { AudioTrackOption } from '../types';
import { Preferences } from '../storage/preferences';
import { RemoteLogger } from '../logger';

export interface WebOSPlayerCallbacks {
  onTimeUpdate?: (currentTimeSecs: number, durationSecs: number) => void;
  onStateChange?: (isPlaying: boolean, isBuffering: boolean) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
  onTracksChanged?: (tracks: AudioTrackOption[]) => void;
}

export class WebOSPlayerService {
  private videoEl: HTMLVideoElement | null = null;
  private videoContainer: HTMLElement | null = null;
  private rootEl: HTMLElement | null = null;

  private isPrepared: boolean = false;
  private isPlayingState: boolean = false;
  private isSeeking: boolean = false;
  private isBufferingState: boolean = false;
  private durationSecs: number = 0;
  private currentPosSecs: number = 0;
  private isAudioRemux: boolean = false;
  private baseStreamUrl: string = '';
  private remuxTimeOffset: number = 0;
  private lastTogglePlayTime: number = 0;
  private seekSafetyTimer: any = null;
  private queuedSeek: { target: number } | null = null;
  private isHardwareBusy: boolean = false;
  private callbacks: WebOSPlayerCallbacks = {};

  // Track event listeners for clean disposal
  private boundOnTimeUpdate: any = null;
  private boundOnWaiting: any = null;
  private boundOnPlaying: any = null;
  private boundOnPause: any = null;
  private boundOnEnded: any = null;
  private boundOnError: any = null;
  private boundOnLoadedMetadata: any = null;

  private initElements() {
    if (!this.videoEl) {
      this.videoEl = document.getElementById('webos-video-element') as HTMLVideoElement;
    }
    if (!this.videoContainer) {
      this.videoContainer = document.getElementById('webos-video-container');
    }
    if (!this.rootEl) {
      this.rootEl = document.getElementById('root');
    }

    // Fallback if index.html elements are missing
    if (!this.videoContainer) {
      this.videoContainer = document.createElement('div');
      this.videoContainer.id = 'webos-video-container';
      this.videoContainer.style.cssText = 'position:fixed;top:0;left:0;width:1920px;height:1080px;z-index:0;background:#000;display:none;';
      document.body.prepend(this.videoContainer);
    }
    if (!this.videoEl) {
      this.videoEl = document.createElement('video');
      this.videoEl.id = 'webos-video-element';
      this.videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;';
      this.videoEl.setAttribute('playsinline', '');
      this.videoContainer.appendChild(this.videoEl);
    }
  }

  public getCurrentPos(): number {
    return this.currentPosSecs;
  }

  public setKnownDuration(dur: number) {
    if (dur > 0) this.durationSecs = dur;
  }

  public setAspectRatio(aspect: 'FIT' | 'ZOOM' | 'STRETCH') {
    this.initElements();
    if (!this.videoEl) return;
    RemoteLogger.info('WEBOS_PLAYER', `setAspectRatio called: ${aspect}`);
    this.videoEl.style.objectFit = aspect === 'STRETCH' ? 'fill' : aspect === 'ZOOM' ? 'cover' : 'contain';
  }

  public setCallbacks(callbacks: WebOSPlayerCallbacks) {
    this.callbacks = callbacks;
  }

  public setAudioRemux(enabled: boolean) {
    this.isAudioRemux = enabled;
  }

  public open(url: string, startPositionSeconds: number = 0, isAudioRemux: boolean = false) {
    RemoteLogger.info('WEBOS_PLAYER', `open() URL: ${url} at ${startPositionSeconds}s (remux: ${isAudioRemux})`);
    this.close();
    this.initElements();

    this.isAudioRemux = isAudioRemux;
    this.baseStreamUrl = url;
    this.remuxTimeOffset = isAudioRemux ? startPositionSeconds : 0;

    let targetUrl = url;
    if (this.isAudioRemux && startPositionSeconds > 0) {
      try {
        const u = new URL(url);
        u.searchParams.set('startTime', Math.floor(startPositionSeconds).toString());
        targetUrl = u.toString();
      } catch {
        targetUrl = `${url}${url.includes('?') ? '&' : '?'}startTime=${Math.floor(startPositionSeconds)}`;
      }
    }

    if (!this.videoEl || !this.videoContainer) {
      RemoteLogger.error('WEBOS_PLAYER', 'Failed to initialize video elements');
      this.callbacks.onError?.('Ошибка инициализации видеоплеера webOS');
      return;
    }

    // Activate hardware video plane
    this.videoContainer.style.display = 'block';
    if (this.rootEl) {
      this.rootEl.style.backgroundColor = 'transparent';
    }

    const aspect = Preferences.getAspectRatio();
    this.setAspectRatio(aspect);

    // Bind event handlers
    this.boundOnWaiting = () => {
      this.isBufferingState = true;
      this.callbacks.onStateChange?.(this.isPlayingState, true);
    };

    this.boundOnPlaying = () => {
      this.isPlayingState = true;
      this.isBufferingState = false;
      this.callbacks.onStateChange?.(true, false);
      if (this.queuedSeek) {
        setTimeout(() => this.processQueuedSeek(), 150);
      }
    };

    this.boundOnPause = () => {
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
    };

    this.boundOnTimeUpdate = () => {
      if (!this.isSeeking && this.videoEl) {
        this.currentPosSecs = this.isAudioRemux
          ? (this.remuxTimeOffset + this.videoEl.currentTime)
          : this.videoEl.currentTime;
        if (this.videoEl.duration && !isNaN(this.videoEl.duration) && this.videoEl.duration > 0) {
          this.durationSecs = this.isAudioRemux ? (this.durationSecs || this.videoEl.duration) : this.videoEl.duration;
        }
        this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);
      }
    };

    this.boundOnEnded = () => {
      RemoteLogger.info('WEBOS_PLAYER', 'Video playback ended');
      this.isPlayingState = false;
      this.callbacks.onStateChange?.(false, false);
      this.callbacks.onEnded?.();
    };

    this.boundOnError = (e: any) => {
      const err = this.videoEl?.error;
      const errMsg = err ? `Код ошибки: ${err.code} (${err.message})` : 'Сбой воспроизведения потока';
      RemoteLogger.error('WEBOS_PLAYER', `Video element error: ${errMsg}`, e);
      this.callbacks.onError?.(errMsg);
    };

    let seekDone = false;
    const applyStartSeek = () => {
      if (seekDone) return;
      seekDone = true;
      if (!this.isAudioRemux && startPositionSeconds > 2 && this.videoEl) {
        RemoteLogger.info('WEBOS_PLAYER', `Setting start currentTime: ${startPositionSeconds}s`);
        try {
          this.videoEl.currentTime = startPositionSeconds;
          this.currentPosSecs = startPositionSeconds;
        } catch (err: any) {
          RemoteLogger.warn('WEBOS_PLAYER', `Could not set initial currentTime: ${err.message}`);
        }
      }
    };

    this.boundOnLoadedMetadata = () => {
      this.isPrepared = true;
      if (this.videoEl?.duration && !isNaN(this.videoEl.duration) && this.videoEl.duration > 0) {
        this.durationSecs = this.videoEl.duration;
      }
      RemoteLogger.info('WEBOS_PLAYER', `Metadata loaded. Duration: ${this.durationSecs}s`);
      applyStartSeek();
      this.callbacks.onTimeUpdate?.(startPositionSeconds, this.durationSecs);
      this.notifyAudioTracks();
    };

    // Attach listeners to video element
    this.videoEl.addEventListener('waiting', this.boundOnWaiting);
    this.videoEl.addEventListener('playing', this.boundOnPlaying);
    this.videoEl.addEventListener('pause', this.boundOnPause);
    this.videoEl.addEventListener('timeupdate', this.boundOnTimeUpdate);
    this.videoEl.addEventListener('ended', this.boundOnEnded);
    this.videoEl.addEventListener('error', this.boundOnError);
    this.videoEl.addEventListener('loadedmetadata', this.boundOnLoadedMetadata);

    // Set video source
    try {
      this.videoEl.src = targetUrl;
      this.videoEl.load();

      // Trigger playback
      const playPromise = this.videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isPlayingState = true;
            this.callbacks.onStateChange?.(true, false);
            RemoteLogger.info('WEBOS_PLAYER', 'Playback started successfully');
          })
          .catch((err) => {
            RemoteLogger.warn('WEBOS_PLAYER', `Autoplay prevented or pending: ${err.message}`);
          });
      }
    } catch (e: any) {
      RemoteLogger.error('WEBOS_PLAYER', `Exception in open: ${e.message}`);
      this.callbacks.onError?.(`Ошибка запуска видео: ${e.message}`);
    }
  }

  public play() {
    if (!this.videoEl) return;
    RemoteLogger.info('WEBOS_PLAYER', 'play() called');
    this.videoEl.play().then(() => {
      this.isPlayingState = true;
      this.callbacks.onStateChange?.(true, false);
    }).catch((err) => {
      RemoteLogger.warn('WEBOS_PLAYER', `play() failed: ${err.message}`);
    });
  }

  public pause() {
    if (!this.videoEl) return;
    RemoteLogger.info('WEBOS_PLAYER', 'pause() called');
    this.videoEl.pause();
    this.isPlayingState = false;
    this.callbacks.onStateChange?.(false, false);
  }

  public togglePlay() {
    const now = Date.now();
    if (now - this.lastTogglePlayTime < 400) {
      RemoteLogger.info('WEBOS_PLAYER', 'togglePlay ignored (debounced 400ms)');
      return;
    }
    this.lastTogglePlayTime = now;

    if (!this.videoEl) return;
    if (this.videoEl.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  public seekRelative(seconds: number) {
    const target = Math.max(1, this.currentPosSecs + seconds);
    this.seekTo(target);
  }

  public seekTo(seconds: number) {
    let target = Math.max(1, seconds);
    if (this.durationSecs > 0 && target > this.durationSecs - 2) {
      target = Math.max(1, this.durationSecs - 2);
    }

    RemoteLogger.info('WEBOS_PLAYER', `seekTo requested: ${target.toFixed(2)}s (current: ${this.currentPosSecs.toFixed(2)}s)`);

    this.isSeeking = true;
    this.currentPosSecs = target;
    this.callbacks.onTimeUpdate?.(this.currentPosSecs, this.durationSecs);

    clearTimeout(this.seekSafetyTimer);
    this.seekSafetyTimer = setTimeout(() => {
      this.isSeeking = false;
      this.isHardwareBusy = false;
    }, 3000);

    if (!this.videoEl) return;

    if (this.isAudioRemux) {
      this.remuxTimeOffset = target;
      let targetUrl = this.baseStreamUrl;
      try {
        const u = new URL(this.baseStreamUrl);
        u.searchParams.set('startTime', Math.floor(target).toString());
        targetUrl = u.toString();
      } catch {
        targetUrl = `${this.baseStreamUrl}${this.baseStreamUrl.includes('?') ? '&' : '?'}startTime=${Math.floor(target)}`;
      }

      RemoteLogger.info('WEBOS_PLAYER', `Remux seek to: ${target.toFixed(2)}s via URL ${targetUrl}`);
      const wasPlaying = !this.videoEl.paused;
      this.videoEl.src = targetUrl;
      this.videoEl.load();
      if (wasPlaying) {
        this.videoEl.play().catch(() => {});
        this.isPlayingState = true;
        this.callbacks.onStateChange?.(true, false);
      }
      setTimeout(() => {
        this.isSeeking = false;
        this.isHardwareBusy = false;
      }, 300);
      return;
    }

    if (this.isHardwareBusy || this.isBufferingState) {
      RemoteLogger.info('WEBOS_PLAYER', `Hardware busy or buffering, queuing seek to ${target.toFixed(2)}s`);
      this.queuedSeek = { target };
      return;
    }

    this.isHardwareBusy = true;
    const wasPlaying = !this.videoEl.paused;

    const performSeek = () => {
      if (!this.videoEl) {
        this.isHardwareBusy = false;
        this.isSeeking = false;
        return;
      }

      try {
        this.videoEl.currentTime = target;
        this.currentPosSecs = target;
        RemoteLogger.info('WEBOS_PLAYER', `Hardware currentTime set to ${target.toFixed(2)}s`);

        if (wasPlaying) {
          this.videoEl.play().catch(() => {});
          this.isPlayingState = true;
          this.callbacks.onStateChange?.(true, false);
        }

        setTimeout(() => {
          this.isHardwareBusy = false;
          this.isSeeking = false;
          this.processQueuedSeek();
        }, 300);
      } catch (err: any) {
        RemoteLogger.error('WEBOS_PLAYER', `Seek failed: ${err.message}`);
        this.isHardwareBusy = false;
        this.isSeeking = false;
      }
    };

    // Pausing 40ms before seek stabilizes the hardware demuxer on LG webOS chips
    if (wasPlaying) {
      this.videoEl.pause();
      setTimeout(performSeek, 40);
    } else {
      performSeek();
    }
  }

  private processQueuedSeek() {
    if (!this.queuedSeek) return;
    if (this.isHardwareBusy || this.isBufferingState) return;

    const next = this.queuedSeek;
    this.queuedSeek = null;
    RemoteLogger.info('WEBOS_PLAYER', `Processing queued seek to ${next.target.toFixed(2)}s`);
    this.seekTo(next.target);
  }

  public getAudioTracks(): AudioTrackOption[] {
    if (!this.videoEl) return [];
    try {
      const tracks = (this.videoEl as any).audioTracks;
      if (!tracks || tracks.length === 0) return [];

      const result: AudioTrackOption[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        result.push({
          index: i,
          id: t.id || String(i),
          label: t.label || t.language || `Дорожка ${i + 1}`,
          language: t.language || 'ru',
          channels: 2,
          codec: 'AAC',
          isSelected: Boolean(t.enabled)
        });
      }
      return result;
    } catch {
      return [];
    }
  }

  public selectAudioTrack(track: AudioTrackOption) {
    if (!this.videoEl) return;
    try {
      const tracks = (this.videoEl as any).audioTracks;
      if (!tracks) return;

      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = (i === track.index);
      }
      RemoteLogger.info('WEBOS_PLAYER', `Switched audio track to: ${track.label}`);
      this.notifyAudioTracks();
    } catch (e: any) {
      RemoteLogger.error('WEBOS_PLAYER', `Failed to select audio track: ${e.message}`);
    }
  }

  private notifyAudioTracks() {
    const tracks = this.getAudioTracks();
    if (tracks.length > 0) {
      this.callbacks.onTracksChanged?.(tracks);
    }
  }

  public close() {
    RemoteLogger.info('WEBOS_PLAYER', 'close() called');
    clearTimeout(this.seekSafetyTimer);
    this.isSeeking = false;
    this.isHardwareBusy = false;
    this.queuedSeek = null;
    this.isBufferingState = false;
    this.isPrepared = false;
    this.isPlayingState = false;
    this.isAudioRemux = false;
    this.baseStreamUrl = '';
    this.remuxTimeOffset = 0;

    if (this.videoEl) {
      // Remove listeners
      if (this.boundOnWaiting) this.videoEl.removeEventListener('waiting', this.boundOnWaiting);
      if (this.boundOnPlaying) this.videoEl.removeEventListener('playing', this.boundOnPlaying);
      if (this.boundOnPause) this.videoEl.removeEventListener('pause', this.boundOnPause);
      if (this.boundOnTimeUpdate) this.videoEl.removeEventListener('timeupdate', this.boundOnTimeUpdate);
      if (this.boundOnEnded) this.videoEl.removeEventListener('ended', this.boundOnEnded);
      if (this.boundOnError) this.videoEl.removeEventListener('error', this.boundOnError);
      if (this.boundOnLoadedMetadata) this.videoEl.removeEventListener('loadedmetadata', this.boundOnLoadedMetadata);

      try {
        this.videoEl.pause();
        this.videoEl.removeAttribute('src');
        this.videoEl.load();
      } catch {}
    }

    if (this.videoContainer) {
      this.videoContainer.style.display = 'none';
    }
    if (this.rootEl) {
      this.rootEl.style.backgroundColor = '#07090e';
    }
  }
}

export const webOSPlayerService = new WebOSPlayerService();
