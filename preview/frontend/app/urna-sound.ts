'use client';
import { useEffect, useRef } from 'react';
export function useUrnaSound() {
  const audio = useRef<AudioContext | null>(null),
    confirmation = useRef<Promise<AudioBuffer> | null>(null);
  function context() {
    if (audio.current) return audio.current;
    const Constructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Constructor) return null;
    audio.current = new Constructor();
    return audio.current;
  }
  function unlock() {
    try {
      const current = context();
      if (!current) return;
      void current.resume().catch(() => {});
      if (!confirmation.current)
        confirmation.current = fetch('/audio/urna-confirma.mp3')
          .then((r) => {
            if (!r.ok) throw Error('Áudio indisponível');
            return r.arrayBuffer();
          })
          .then((bytes) => current.decodeAudioData(bytes))
          .catch((e) => {
            confirmation.current = null;
            throw e;
          });
      void confirmation.current.catch(() => {});
    } catch {}
  }
  function key() {
    unlock();
    try {
      const current = audio.current;
      if (!current || current.state !== 'running') return;
      const oscillator = current.createOscillator(),
        gain = current.createGain(),
        start = current.currentTime;
      oscillator.type = 'square';
      oscillator.frequency.value = 800;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.025, start + 0.005);
      gain.gain.linearRampToValueAtTime(0, start + 0.065);
      oscillator.connect(gain);
      gain.connect(current.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.07);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    } catch {}
  }
  async function confirm() {
    unlock();
    try {
      const current = audio.current,
        buffer = await confirmation.current;
      if (!current || !buffer) return;
      await current.resume();
      const source = current.createBufferSource(),
        gain = current.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.3;
      source.connect(gain);
      gain.connect(current.destination);
      source.start();
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    } catch {}
  }
  useEffect(
    () => () => {
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
      confirmation.current = null;
    },
    [],
  );
  return { unlock, key, confirm };
}
