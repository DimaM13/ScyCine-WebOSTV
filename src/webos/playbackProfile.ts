/**
 * Локальная копия серверного профиля (SOURCE OF TRUTH):
 * MyPlex/server/src/services/tv-profiles/webos.profile.ts
 * При расхождении править серверный файл и синхронизировать сюда.
 *
 * LG webOS: direct для H.264/HEVC/AV1/VP9 + DD/DD+/AAC/MP3/PCM/Opus в
 * mp4/mkv/ts/avi/mpg/vob/3gp; HLS для DTS/DTS-HD/DTS:X/TrueHD, FLAC/Vorbis/WMA/ALAC,
 * VC-1/WMV/WEBM и неизвестных кодеков. HLS — нативно (<video src=m3u8>),
 * не через hls.js (на старых прошивках MSE draft-версий).
 */

export interface TvMediaProbe {
  videoCodec?: string;
  audioCodec?: string;
  filePath?: string;
  width?: number;
  height?: number;
}

export interface PlaybackDecision {
  mode: 'direct' | 'hls';
  reasons: string[];
}

export const WEBOS_MASTER_PARAMS = {
  isApple: 0,
  quality: 'original',
} as const;
// Сервер включает ТВ-движок по ?client=webos (маркер _tvwebos в sessionId):
// audio-copy AAC/AC3/EAC3/MP3, video-copy только H.264/HEVC, всегда fMP4,
// плейлист без EXT-X-INDEPENDENT-SEGMENTS. Без маркера — PC-правила.

export const WEBOS_NATIVE_VIDEO = [
  'h264',
  'hevc',
  'h265',
  'av1',
  'vp9',
  'vp8',
  'mpeg4',
  'mpeg2',
  'mpeg1',
  'mjpeg',
] as const;

export const WEBOS_NATIVE_AUDIO = [
  'ac3',
  'eac3',
  'aac',
  'mp3',
  'pcm',
  'opus',
  'ac4',
  'mpegh',
] as const;

export const WEBOS_NATIVE_CONTAINERS = [
  'mp4', 'm4v', 'mov', 'mkv',
  'ts', 'trp', 'tp', 'mts',
  'avi', 'mpg', 'mpeg', 'dat', 'vob',
  '3gp', '3g2',
] as const;

export function webosExtOf(filePath?: string): string {
  if (!filePath) return '';
  const m = filePath.toLowerCase().match(/\.([a-z0-9]+)(?:[?#].*)?$/);
  return m ? m[1] : '';
}

export function normalizeWebosVideoCodec(raw?: string): string {
  const c = (raw || '').toLowerCase().trim();
  if (!c) return '';
  if (['avc1', 'avc', 'h264', 'x264'].includes(c)) return 'h264';
  if (['hev1', 'hev', 'hevc', 'h265', 'hvc1', 'x265'].includes(c)) return 'hevc';
  if (['av01', 'av1'].includes(c)) return 'av1';
  if (['vp09', 'vp9'].includes(c)) return 'vp9';
  if (['vp80', 'vp8'].includes(c)) return 'vp8';
  if (['mp4v', 'mpeg4', 'xvid', 'divx', 'dx50'].includes(c)) return 'mpeg4';
  if (['mpeg2video', 'mpeg2'].includes(c)) return 'mpeg2';
  if (['mpeg1video', 'mpeg1'].includes(c)) return 'mpeg1';
  if (['mjpeg', 'mjpg', 'jpeg'].includes(c)) return 'mjpeg';
  if (['wmv3', 'wmva', 'vc1', 'vc-1'].includes(c)) return 'vc1';
  return c;
}

export function normalizeWebosAudioCodec(raw?: string): string {
  const c = (raw || '').toLowerCase().trim();
  if (!c) return '';
  if (['mp4a', 'mp4a.40.2', 'mp4a.40.5', 'aac', 'aac-lc', 'he-aac', 'heaac'].includes(c)) return 'aac';
  if (['ac-3', 'ac3', 'dolby_digital'].includes(c)) return 'ac3';
  if (['ec-3', 'ec3', 'eac3', 'dd+', 'dolby_digital_plus', 'atmos_eac3', 'atmos'].includes(c)) return 'eac3';
  if (['mp3', 'mpga', 'mp1', 'mp2'].includes(c)) return 'mp3';
  if (c.includes('dts')) return 'dts';
  if (['truehd', 'mlp', 'atmos_truehd'].includes(c)) return 'truehd';
  if (['vorbis', 'ogg'].includes(c)) return 'vorbis';
  if (['flac'].includes(c)) return 'flac';
  if (['opus'].includes(c)) return 'opus';
  if (['pcm', 'lpcm', 's16le', 's24le', 'wav', 'dvd-lpcm'].includes(c)) return 'pcm';
  if (['wma', 'wmav2'].includes(c)) return 'wma';
  if (['alac'].includes(c)) return 'alac';
  if (['ac-4', 'ac4'].includes(c)) return 'ac4';
  if (['mpeg-h', 'mpegh', '360ra'].includes(c)) return 'mpegh';
  if (['amr-nb', 'amr-wb', 'amr'].includes(c)) return 'amr';
  return c;
}

export function decideWebosPlayback(probe: TvMediaProbe): PlaybackDecision {
  const reasons: string[] = [];
  const v = normalizeWebosVideoCodec(probe.videoCodec);
  const a = normalizeWebosAudioCodec(probe.audioCodec);
  const ext = webosExtOf(probe.filePath);

  if (!v || !(WEBOS_NATIVE_VIDEO as readonly string[]).includes(v)) {
    reasons.push(
      v === 'vc1'
        ? 'видео VC-1/WMV поддерживается лишь частью моделей webOS — через HLS-транскод в H.264'
        : `видео ${v || 'unknown'} не в direct-белом списке webOS — через HLS-транскод в H.264`,
    );
  }
  if (!a || !(WEBOS_NATIVE_AUDIO as readonly string[]).includes(a)) {
    reasons.push(
      a === 'dts' || a === 'truehd'
        ? `аудио ${a.toUpperCase()} не поддерживается webOS стабильно (DTS — со сноской model-dependent, TrueHD — вовсе нет) — через HLS с перекодом звука в AAC`
        : `аудио ${a || 'unknown'} не в direct-белом списке webOS (FLAC/Vorbis/WMA/ALAC) — через HLS с перекодом в AAC`,
    );
  }
  if (ext && !(WEBOS_NATIVE_CONTAINERS as readonly string[]).includes(ext)) {
    reasons.push(`контейнер .${ext} не открывается webOS нативно (ASF/WMV/WEBM) — через HLS`);
  }
  if ((probe.width || 0) > 4096 || (probe.height || 0) > 2304) {
    reasons.push('кадр больше 4K — direct не гарантирован даже на UHD-моделях, через HLS');
  }
  return reasons.length === 0
    ? { mode: 'direct', reasons: ['видео+аудио+контейнер нативны для webOS'] }
    : { mode: 'hls', reasons };
}
