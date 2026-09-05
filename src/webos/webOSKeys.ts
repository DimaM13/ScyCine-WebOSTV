// LG Smart TV (webOS) Remote Control Keys Specification

export const WEBOS_KEYS = {
  // Navigation D-Pad & Action
  KEY_ENTER: 13,
  KEY_LEFT: 37,
  KEY_UP: 38,
  KEY_RIGHT: 39,
  KEY_DOWN: 40,

  // Return / Back Key (LG VK_BACK: 461)
  KEY_BACK: 461,
  KEY_ESC: 27,

  // Media Playback Controls
  KEY_PLAY: 415,
  KEY_PAUSE: 19,
  KEY_STOP: 413,
  KEY_FAST_FORWARD: 417,
  KEY_REWIND: 412,
  KEY_PLAY_PAUSE: 10252,
  KEY_MEDIA_PLAY_PAUSE: 179,

  // LG Magic Remote Color Buttons
  KEY_RED: 403,
  KEY_GREEN: 404,
  KEY_YELLOW: 405,
  KEY_BLUE: 406
} as const;

export function registerWebOSKeys() {
  console.log('[webOS] Keys listener initialized.');
}

export function exitWebOSApp() {
  console.log('[webOS] Exiting application via webOS platform API');
  if (typeof window !== 'undefined') {
    if ((window as any).webOS && typeof (window as any).webOS.platformBack === 'function') {
      (window as any).webOS.platformBack();
    } else {
      try {
        window.close();
      } catch (e) {
        console.warn('[webOS] window.close() failed:', e);
      }
    }
  }
}
