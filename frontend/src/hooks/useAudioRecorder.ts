import { useState, useRef, useCallback } from 'react';
import { API_BASE } from '../config';

export interface AudioRecorderState {
  isRecording: boolean;
  durationMs: number;
  isTranscribing: boolean;
  isSupported: boolean;
}

export function useAudioRecorder(onSend: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const startRecording = useCallback(async () => {
    if (!isSupported) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick a supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(250); // Collect data every 250ms
      setIsRecording(true);
      setDurationMs(0);

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      console.error('[audio] Failed to start recording:', err);
    }
  }, [isSupported]);

  const cleanup = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop all tracks to release the microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      return;
    }

    recorder.onstop = async () => {
      cleanup();

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      chunksRef.current = [];

      // Only transcribe if we recorded something meaningful (>0.3s)
      if (durationMs < 300) return;

      setIsTranscribing(true);
      try {
        const text = await transcribeAudio(blob);
        if (text.trim()) {
          onSend(text.trim());
        }
      } catch (err) {
        console.error('[audio] Transcription failed:', err);
      } finally {
        setIsTranscribing(false);
        setDurationMs(0);
      }
    };

    recorder.stop();
  }, [cleanup, durationMs, onSend]);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    chunksRef.current = [];
    setDurationMs(0);
  }, [cleanup]);

  return {
    isRecording,
    durationMs,
    isTranscribing,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const formData = new FormData();
  // Determine file extension from MIME
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'wav';
  formData.append('audio', blob, `recording.${ext}`);

  const res = await fetch(`${API_BASE}/api/audio/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Transcription failed: ${res.status}`);
  }

  const data = await res.json();
  return data.text ?? '';
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
