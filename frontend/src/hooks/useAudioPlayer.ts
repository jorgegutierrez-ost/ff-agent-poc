import { useRef, useState, useCallback } from 'react';
import { API_BASE } from '../config';

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const playText = useCallback(async (text: string) => {
    // Stop any current playback
    stop();

    if (!text.trim()) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/api/audio/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      // Bail silently if TTS fails — don't waste user attention on it
      if (!res.ok) return;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('audio')) return;

      const blob = await res.blob();
      if (blob.size < 100) return; // too small to be real audio

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsPlaying(true);

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch {
      // Fail silently — TTS is optional
      setIsPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return { isPlaying, playText, stop };
}
