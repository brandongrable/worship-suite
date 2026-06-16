import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { getKeyOptions, formatTime } from "@worship/core";
import { supabase } from "./lib/supabase";
import { songToMixerSong } from "./lib/mixer-adapter";
import PianoRoll from "./PianoRoll.jsx";

/* ── Color System ── */
const PART_COLORS = { soprano: "#E8C840", alto: "#D94545", tenor: "#4FBCD0", baritone: "#5B8C3E" };
const UNISON_COLOR = "#9B6AD8";
const HARMONY_PARTS = ["soprano", "alto", "tenor", "baritone"];

/* ── Track Definitions ── */
const TRACKS = [
  { id: "click", label: "Click", color: "#8A8A8A", icon: "⏎", group: "util" },
  { id: "band", label: "Band", color: "#4A9EE5", icon: "♪", group: "music" },
  { id: "lead", label: "Lead", color: "#5BB8D4", icon: "◆", group: "vocal" },
  { id: "soprano", label: "Soprano", color: "#E8C840", icon: "S", group: "harmony" },
  { id: "alto", label: "Alto", color: "#D94545", icon: "A", group: "harmony" },
  { id: "tenor", label: "Tenor", color: "#4FBCD0", icon: "T", group: "harmony" },
  { id: "baritone", label: "Baritone", color: "#5B8C3E", icon: "Br", group: "harmony" },
];

/* ═══════════════════════════════════════════════ */
/* ── Song Library ── */
/* ═══════════════════════════════════════════════ */
const SONG_LIBRARY = {
  tgif: {
    id: "tgif", title: "Thank God I'm Free", artist: "Elevation Rhythm",
    originalKey: "D", bpm: 128, time: "4/4", duration: 300.072,
    sections: [
      { id: "intro", label: "Intro", shortLabel: "INT", startTime: 0.000, endTime: 18.186, partStatus: { soprano: "inactive", alto: "inactive", tenor: "inactive", baritone: "inactive" } },
      { id: "v1", label: "Verse 1", shortLabel: "V1", startTime: 18.186, endTime: 33.186, partStatus: { soprano: "unison", alto: "unison", tenor: "unison", baritone: "inactive" } },
      { id: "v2", label: "Verse 2", shortLabel: "V2", startTime: 33.186, endTime: 48.175, partStatus: { soprano: "unison", alto: "unison", tenor: "unison", baritone: "inactive" } },
      { id: "c1", label: "Chorus 1", shortLabel: "C1", startTime: 48.175, endTime: 63.186, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "pc1", label: "Post-Chorus", shortLabel: "PC1", startTime: 63.186, endTime: 78.201, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "turn", label: "Turnaround", shortLabel: "TR", startTime: 78.201, endTime: 86.062, partStatus: { soprano: "inactive", alto: "inactive", tenor: "inactive", baritone: "inactive" } },
      { id: "v3", label: "Verse 3", shortLabel: "V3", startTime: 86.062, endTime: 101.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "c2", label: "Chorus 2", shortLabel: "C2", startTime: 101.062, endTime: 116.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "pc2", label: "Post-Chorus", shortLabel: "PC2", startTime: 116.062, endTime: 131.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "b1", label: "Bridge 1", shortLabel: "B1", startTime: 131.062, endTime: 146.062, partStatus: { soprano: "unison", alto: "unison", tenor: "unison", baritone: "inactive" } },
      { id: "b2", label: "Bridge 2", shortLabel: "B2", startTime: 146.062, endTime: 161.062, partStatus: { soprano: "unison", alto: "unison", tenor: "harmony", baritone: "inactive" } },
      { id: "b3", label: "Bridge 3", shortLabel: "B3", startTime: 161.062, endTime: 176.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "rf1", label: "Refrain", shortLabel: "RF1", startTime: 176.062, endTime: 191.062, partStatus: { soprano: "unison", alto: "unison", tenor: "harmony", baritone: "inactive" } },
      { id: "c3", label: "Chorus 3", shortLabel: "C3", startTime: 191.062, endTime: 206.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "pc3", label: "Post-Chorus", shortLabel: "PC3", startTime: 206.062, endTime: 221.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "b4", label: "Bridge 4", shortLabel: "B4", startTime: 221.062, endTime: 236.062, partStatus: { soprano: "unison", alto: "unison", tenor: "harmony", baritone: "inactive" } },
      { id: "b5", label: "Bridge 5", shortLabel: "B5", startTime: 236.062, endTime: 251.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "rf2", label: "Refrain", shortLabel: "RF2", startTime: 251.062, endTime: 266.062, partStatus: { soprano: "unison", alto: "unison", tenor: "harmony", baritone: "inactive" } },
      { id: "pc4", label: "Post-Chorus B", shortLabel: "PCb", startTime: 266.062, endTime: 281.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "pc5", label: "Post-Chorus C", shortLabel: "PCc", startTime: 281.062, endTime: 296.062, partStatus: { soprano: "unison", alto: "harmony", tenor: "harmony", baritone: "inactive" } },
      { id: "end", label: "Ending", shortLabel: "END", startTime: 296.062, endTime: 300.072, partStatus: { soprano: "inactive", alto: "inactive", tenor: "inactive", baritone: "inactive" } },
    ],
    lyrics: [
      { start: 18.186, end: 25.5, text: "I'm shaking off the heaviness, I'm dancing out of my regrets" },
      { start: 25.5, end: 33.186, text: "I'm throwing caution to the wind, no I am not ashamed to praise like this" },
      { start: 33.186, end: 40.5, text: "Some would say it's foolishness, but I say it's worth the risk" },
      { start: 40.5, end: 48.175, text: "I can't forget what Jesus did, no I am not ashamed to praise like this" },
      { start: 48.175, end: 52.0, text: "Where are those chains that once held me" },
      { start: 52.0, end: 55.6, text: "I'm free, I'm free, I'm free, I'm free" },
      { start: 55.6, end: 59.5, text: "My sin is gone, how can it be" },
      { start: 59.5, end: 63.186, text: "I'm free, I'm free, I'm free, I'm free" },
      { start: 63.186, end: 70.5, text: "And look at what The Lord has done, I'm never going back to the way I was" },
      { start: 70.5, end: 78.201, text: "I'll sing, I'll dance 'cause I believe, I'm free, I'm free, thank God I'm free" },
      { start: 86.062, end: 93.5, text: "I found a friend that never quits, no other love's as good as this" },
      { start: 93.5, end: 101.062, text: "And I don't care what anyone says, I'll never be ashamed to praise like this" },
      { start: 101.062, end: 105.0, text: "Where are those chains that once held me" },
      { start: 105.0, end: 108.5, text: "I'm free, I'm free, I'm free, I'm free" },
      { start: 108.5, end: 112.5, text: "My sin is gone, how can it be" },
      { start: 112.5, end: 116.062, text: "I'm free, I'm free, I'm free, I'm free" },
      { start: 116.062, end: 123.5, text: "And look at what The Lord has done, I'm never going back to the way I was" },
      { start: 123.5, end: 131.062, text: "I'll sing, I'll dance 'cause I believe, I'm free, I'm free, thank God I'm free" },
      { start: 131.062, end: 134.8, text: "You took the cross and You broke Your body" },
      { start: 134.8, end: 138.5, text: "You shed Your blood now the sinner can sing" },
      { start: 138.5, end: 142.2, text: "My debt is paid and my record is clean" },
      { start: 142.2, end: 146.062, text: "I couldn't do it so You did it for me" },
      { start: 146.062, end: 149.8, text: "You took the cross and You broke Your body" },
      { start: 149.8, end: 153.5, text: "You shed Your blood now the sinner can sing" },
      { start: 153.5, end: 157.2, text: "My debt is paid and my record is clean" },
      { start: 157.2, end: 161.062, text: "I couldn't do it so You did it for me" },
      { start: 176.062, end: 183.5, text: "I couldn't do it so You did it for me" },
      { start: 183.5, end: 191.062, text: "I couldn't do it so You did it for me" },
      { start: 191.062, end: 195.0, text: "Where are those chains that once held me" },
      { start: 195.0, end: 198.5, text: "I'm free, I'm free, I'm free, I'm free" },
      { start: 198.5, end: 202.5, text: "My sin is gone, how can it be" },
      { start: 202.5, end: 206.062, text: "I'm free, I'm free, I'm free, I'm free" },
      { start: 206.062, end: 213.5, text: "And look at what The Lord has done, I'm never going back to the way I was" },
      { start: 213.5, end: 221.062, text: "I'll sing, I'll dance 'cause I believe, I'm free, I'm free, thank God I'm free" },
      { start: 251.062, end: 258.5, text: "I couldn't do it so You did it for me" },
      { start: 258.5, end: 266.062, text: "I couldn't do it so You did it for me" },
      { start: 266.062, end: 273.5, text: "Look at what The Lord has done, I'm never going back to the way I was" },
      { start: 273.5, end: 281.062, text: "Look at what The Lord has done, I'm never going back to the way I was" },
      { start: 281.062, end: 288.5, text: "Look at what The Lord has done, I'm never going back to the way I was" },
      { start: 288.5, end: 296.062, text: "Look at what The Lord has done, I'm never going back to the way I was" },
    ],
  },
  goodness: { id: "goodness", title: "Goodness of God", artist: "Bethel Music", originalKey: "A", bpm: 68, time: "4/4", duration: 284, sections: [], lyrics: [] },
  buildmylife: { id: "buildmylife", title: "Build My Life", artist: "Housefires", originalKey: "G", bpm: 68, time: "4/4", duration: 312, sections: [], lyrics: [] },
  greatareyou: { id: "greatareyou", title: "Great Are You Lord", artist: "All Sons & Daughters", originalKey: "D", bpm: 78, time: "6/8", duration: 295, sections: [], lyrics: [] },
  battlebelongs: { id: "battlebelongs", title: "Battle Belongs", artist: "Phil Wickham", originalKey: "G", bpm: 84, time: "4/4", duration: 268, sections: [], lyrics: [] },
  reckless: { id: "reckless", title: "Reckless Love", artist: "Cory Asbury", originalKey: "C", bpm: 88, time: "4/4", duration: 334, sections: [], lyrics: [] },
};

/* ── Mock Setlists ── */
const SETLISTS = [
  {
    id: "sl1",
    title: "Easter Weekend · Set A",
    date: "2026-04-05",
    dateLabel: "Sunday, April 5",
    serviceTime: "9:00 AM & 11:00 AM",
    worshipLeader: "Brandon",
    upcoming: true,
    songs: [
      { songId: "tgif", serviceKey: "D", leadVocal: "Brandon", order: 1, stemsAvailable: true },
      { songId: "goodness", serviceKey: "Bb", leadVocal: "Sarah", order: 2, stemsAvailable: false },
      { songId: "buildmylife", serviceKey: "A", leadVocal: "Brandon", order: 3, stemsAvailable: false },
      { songId: "greatareyou", serviceKey: "E", leadVocal: "Sarah", order: 4, stemsAvailable: false },
    ],
  },
  {
    id: "sl2",
    title: "Breakthrough Sunday",
    date: "2026-03-29",
    dateLabel: "Sunday, March 29",
    serviceTime: "9:00 AM & 11:00 AM",
    worshipLeader: "Brandon",
    upcoming: false,
    songs: [
      { songId: "battlebelongs", serviceKey: "A", leadVocal: "Brandon", order: 1, stemsAvailable: false },
      { songId: "tgif", serviceKey: "D", leadVocal: "Brandon", order: 2, stemsAvailable: true },
      { songId: "reckless", serviceKey: "D", leadVocal: "Sarah", order: 3, stemsAvailable: false },
    ],
  },
  {
    id: "sl3",
    title: "Palm Sunday",
    date: "2026-03-22",
    dateLabel: "Sunday, March 22",
    serviceTime: "9:00 AM & 11:00 AM",
    worshipLeader: "Sarah",
    upcoming: false,
    songs: [
      { songId: "goodness", serviceKey: "A", leadVocal: "Sarah", order: 1, stemsAvailable: false },
      { songId: "greatareyou", serviceKey: "D", leadVocal: "Sarah", order: 2, stemsAvailable: false },
      { songId: "buildmylife", serviceKey: "G", leadVocal: "Brandon", order: 3, stemsAvailable: false },
    ],
  },
];

/* ═══════════════════════════════════════════════ */
/* ── Audio Engine Hook ── */
/* ═══════════════════════════════════════════════ */
function useAudioEngine(songDuration) {
  const ctxRef = useRef(null);
  const buffersRef = useRef({});
  const sourcesRef = useRef({});
  const gainsRef = useRef({});
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedTracks, setLoadedTracks] = useState({});
  const [loading, setLoading] = useState(false);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    return ctxRef.current;
  }, []);

  // `source` is either a File (picked from disk) or { url, label } (a
  // signed Storage URL for a stem published by Pipeline). Returns the
  // decoded AudioBuffer so callers can read its `duration`.
  const loadStem = useCallback(async (trackId, source) => {
    const ctx = getCtx();
    setLoading(true);
    try {
      const isFile = source instanceof File;
      const ab = isFile
        ? await source.arrayBuffer()
        : await (await fetch(source.url)).arrayBuffer();
      const label = isFile ? source.name : source.label;
      const buf = await ctx.decodeAudioData(ab);
      buffersRef.current[trackId] = buf;
      if (!gainsRef.current[trackId]) {
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gainsRef.current[trackId] = gain;
      }
      setLoadedTracks((prev) => ({ ...prev, [trackId]: label }));
      setLoading(false);
      return buf;
    } catch (err) {
      console.error(`Failed to load ${trackId}:`, err);
      setLoading(false);
      return null;
    }
  }, [getCtx]);

  const stopAll = useCallback(() => {
    Object.values(sourcesRef.current).forEach((src) => { try { src.stop(); } catch (e) {} });
    sourcesRef.current = {};
  }, []);

  const updateProgress = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const elapsed = ctx.currentTime - startTimeRef.current;
    const time = offsetRef.current + elapsed;
    if (time >= songDuration) {
      stopAll(); setCurrentTime(0); offsetRef.current = 0; setIsPlaying(false); return;
    }
    setCurrentTime(time);
    rafRef.current = requestAnimationFrame(updateProgress);
  }, [songDuration, stopAll]);

  useEffect(() => {
    if (isPlaying) rafRef.current = requestAnimationFrame(updateProgress);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, updateProgress]);

  const startFrom = useCallback((offset) => {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    stopAll();
    Object.keys(buffersRef.current).forEach((trackId) => {
      const source = ctx.createBufferSource();
      source.buffer = buffersRef.current[trackId];
      source.connect(gainsRef.current[trackId]);
      source.start(0, offset);
      sourcesRef.current[trackId] = source;
    });
    startTimeRef.current = ctx.currentTime;
    offsetRef.current = offset;
    setCurrentTime(offset);
    setIsPlaying(true);
  }, [getCtx, stopAll]);

  const play = useCallback(() => { startFrom(offsetRef.current); }, [startFrom]);
  const pause = useCallback(() => {
    if (!ctxRef.current) return;
    const elapsed = ctxRef.current.currentTime - startTimeRef.current;
    offsetRef.current = offsetRef.current + elapsed;
    stopAll(); setIsPlaying(false); setCurrentTime(offsetRef.current);
  }, [stopAll]);
  const seek = useCallback((timeSec) => {
    offsetRef.current = Math.max(0, Math.min(songDuration, timeSec));
    setCurrentTime(offsetRef.current);
    if (isPlaying) startFrom(offsetRef.current);
  }, [isPlaying, songDuration, startFrom]);
  const setVolume = useCallback((trackId, value) => {
    if (gainsRef.current[trackId]) gainsRef.current[trackId].gain.value = value / 100;
  }, []);

  return { isPlaying, currentTime, loadedTracks, loading, loadStem, play, pause, seek, startFrom, setVolume };
}

/* ═══════════════════════════════════════════════ */
/* ── Shared UI Components ── */
/* ═══════════════════════════════════════════════ */
function Fader({ value, onChange, color, muted }) {
  const ref = useRef(null);
  const dragging = useRef(false);
  const getVal = useCallback((cx) => {
    if (!ref.current) return value;
    const r = ref.current.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (cx - r.left) / r.width)) * 100);
  }, [value]);
  const start = useCallback((e) => { dragging.current = true; onChange(getVal(e.touches ? e.touches[0].clientX : e.clientX)); }, [getVal, onChange]);
  const move = useCallback((e) => { if (!dragging.current) return; e.preventDefault(); onChange(getVal(e.touches ? e.touches[0].clientX : e.clientX)); }, [getVal, onChange]);
  const end = useCallback(() => { dragging.current = false; }, []);
  useEffect(() => {
    const m = (e) => move(e);
    const u = () => end();
    window.addEventListener("mousemove", m);
    window.addEventListener("mouseup", u);
    window.addEventListener("touchmove", m, { passive: false });
    window.addEventListener("touchend", u);
    return () => {
      window.removeEventListener("mousemove", m);
      window.removeEventListener("mouseup", u);
      window.removeEventListener("touchmove", m);
      window.removeEventListener("touchend", u);
    };
  }, [move, end]);
  return (
    <div ref={ref} onMouseDown={start} onTouchStart={start} style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", cursor: "pointer", touchAction: "none", flex: 1, opacity: muted ? 0.3 : 1, transition: "opacity 0.2s" }}>
      <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${value}%`, borderRadius: 3, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      <div style={{ position: "absolute", left: `${value}%`, top: "50%", transform: "translate(-50%, -50%)", width: 22, height: 22, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}66, 0 2px 4px rgba(0,0,0,0.4)`, border: "2px solid rgba(255,255,255,0.25)" }} />
    </div>
  );
}

function TrackChannel({ track, volume, muted, soloed, anySoloed, onVolumeChange, onMute, onSolo, loaded }) {
  const isAudible = !muted && (!anySoloed || soloed);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: isAudible ? (loaded ? 1 : 0.35) : 0.5, ...(track.id === "click" ? { borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 2, paddingBottom: 12 } : {}) }}>
      <div style={{ width: 68, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${track.color}22`, border: `1.5px solid ${track.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: track.color, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{track.icon}</div>
        <span style={{ fontSize: 12, fontWeight: 600, color: loaded ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)", fontFamily: "'DM Sans', sans-serif" }}>{track.label}</span>
      </div>
      <Fader value={volume} onChange={onVolumeChange} color={track.color} muted={!isAudible || !loaded} />
      <span style={{ width: 28, textAlign: "right", fontSize: 10, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>{volume}</span>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {[{ k: "M", active: muted, c: "#D94545", fn: onMute }, { k: "S", active: soloed, c: "#E8C840", fn: onSolo }].map((b) => (
          <button key={b.k} onClick={b.fn} style={{ width: 28, height: 28, borderRadius: 6, border: b.active ? `1.5px solid ${b.c}` : "1.5px solid rgba(255,255,255,0.1)", background: b.active ? `${b.c}22` : "rgba(255,255,255,0.03)", color: b.active ? b.c : "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", display: "flex", alignItems: "center", justifyContent: "center" }}>{b.k}</button>
        ))}
      </div>
    </div>
  );
}

function WaveBar({ height, played, partStatus, loadedTracks }) {
  // Check if any part in this section is active (not all inactive)
  const anyActive = HARMONY_PARTS.some((p) => (partStatus[p] || "inactive") !== "inactive");

  const getColor = (part, status, pl) => {
    // Fallback: if part has no stem loaded, is inactive, but other parts are singing → show as unison
    if (status === "inactive" && anyActive && loadedTracks && !loadedTracks[part]) {
      return pl ? UNISON_COLOR : `${UNISON_COLOR}55`;
    }
    if (status === "inactive") return pl ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)";
    if (status === "unison") return pl ? UNISON_COLOR : `${UNISON_COLOR}55`;
    return pl ? PART_COLORS[part] : `${PART_COLORS[part]}55`;
  };
  return (
    <div style={{ width: "100%", height: `${height * 100}%`, borderRadius: 2, overflow: "hidden", position: "relative", boxShadow: played ? "inset 0 0 0 0.8px rgba(255,255,255,0.2)" : "inset 0 0 0 0.5px rgba(255,255,255,0.04)" }}>
      {HARMONY_PARTS.map((part, idx) => (
        <div key={part} style={{ position: "absolute", top: `${idx * 25}%`, left: 0, right: 0, height: "25%", background: getColor(part, partStatus[part] || "inactive", played), transition: "background 0.15s" }} />
      ))}
      {played && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 40%, transparent 70%, rgba(255,255,255,0.05) 100%)" }} />}
    </div>
  );
}

function SectionalWaveform({ sections, progress, duration, onSectionTap, activeSection, loopSection, onLoopToggle, queuedSection, loadedTracks }) {
  const barsRef = useRef([]);
  const scrollRef = useRef(null);
  const waveRef = useRef(null);
  const N = 400;
  const ZOOM = 6.5;
  useEffect(() => {
    if (barsRef.current.length === 0) {
      const b = [];
      for (let i = 0; i < N; i++) { b.push(Math.min(0.95, Math.max(0.6, 0.78 + Math.sin(i * 0.08) * 0.08 + (Math.random() - 0.5) * 0.12))); }
      barsRef.current = b;
    }
  }, []);
  useEffect(() => {
    if (!scrollRef.current || !activeSection) return;
    const c = scrollRef.current;
    const totalW = c.scrollWidth;
    const viewW = c.clientWidth;
    // Center on the midpoint of the active section
    const sectionMid = (activeSection.start + activeSection.end) / 2;
    const target = sectionMid * totalW - viewW / 2;
    c.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeSection?.id]);
  const handleBarClick = (e) => {
    if (!waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / waveRef.current.offsetWidth));
    const clickedSec = sections.find((s) => pct >= s.start && pct < s.end);
    if (clickedSec) onSectionTap(clickedSec);
  };
  const getSec = (i) => { const p = i / N; return sections.find((s) => p >= s.start && p < s.end); };
  const getSecType = (sec) => {
    if (!sec) return "inactive";
    const st = HARMONY_PARTS.map((p) => sec.partStatus[p]);
    if (st.every((s) => s === "inactive")) return "inactive";
    if (st.some((s) => s === "harmony")) return "harmony";
    return "unison";
  };
  const bars = barsRef.current.length ? barsRef.current : Array(N).fill(0.8);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", borderRadius: "8px 8px 0 0" }}>
        <div style={{ width: `${ZOOM * 100}%`, minWidth: `${ZOOM * 100}%` }}>
          <div style={{ display: "flex", height: 30, marginBottom: 2 }}>
            {sections.map((sec) => {
              const isActive = activeSection?.id === sec.id;
              const isLooping = loopSection?.id === sec.id;
              const isQueued = queuedSection?.id === sec.id;
              const type = getSecType(sec);
              const hasH = HARMONY_PARTS.some((p) => sec.partStatus[p] === "harmony");
              let bg = "transparent", borderBtm = "2px solid rgba(255,255,255,0.04)", labelColor = "rgba(255,255,255,0.2)";
              if (isQueued) { bg = "rgba(255,255,255,0.08)"; borderBtm = "2.5px solid rgba(255,255,255,0.5)"; labelColor = "#fff"; }
              else if (type === "harmony") { bg = isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)"; borderBtm = isActive ? "2.5px solid #E8C840" : "2px solid rgba(232,200,64,0.3)"; labelColor = isActive ? "#fff" : "rgba(255,255,255,0.55)"; }
              else if (type === "unison") { bg = isActive ? `${UNISON_COLOR}14` : "transparent"; borderBtm = isActive ? `2.5px solid ${UNISON_COLOR}` : `2px solid ${UNISON_COLOR}44`; labelColor = isActive ? UNISON_COLOR : `${UNISON_COLOR}99`; }
              else { bg = isActive ? "rgba(255,255,255,0.03)" : "transparent"; borderBtm = isActive ? "2.5px solid rgba(255,255,255,0.3)" : "2px solid rgba(255,255,255,0.04)"; }
              return (
                <div key={sec.id} style={{ flex: sec.end - sec.start, position: "relative", minWidth: 0 }}>
                  <button onClick={(e) => { e.stopPropagation(); onSectionTap(sec); }} style={{ width: "100%", height: "100%", background: bg, border: "none", borderBottom: borderBtm, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderRadius: "5px 5px 0 0", transition: "all 0.2s", position: "relative" }}>
                    {hasH && <div style={{ position: "absolute", top: 3, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
                      {HARMONY_PARTS.map((p) => { const st = sec.partStatus[p]; if (st === "inactive") return null; return <div key={p} style={{ width: 4, height: 4, borderRadius: "50%", background: st === "harmony" ? PART_COLORS[p] : UNISON_COLOR, opacity: isActive ? 1 : 0.5 }} />; })}
                    </div>}
                    <span style={{ fontSize: 10, fontWeight: 700, color: labelColor, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", whiteSpace: "nowrap", marginTop: hasH ? 5 : 0 }}>{sec.label}</span>
                  </button>
                  {isLooping && <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, border: `2px solid ${UNISON_COLOR}88`, borderRadius: "5px 5px 0 0", pointerEvents: "none" }}><div style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: UNISON_COLOR, fontWeight: 700, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>⟳</div></div>}
                  {isQueued && <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, border: "2px dashed rgba(255,255,255,0.5)", borderRadius: "5px 5px 0 0", pointerEvents: "none" }}><div style={{ position: "absolute", top: 2, right: 4, fontSize: 8, color: "rgba(255,255,255,0.7)", fontWeight: 700, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>NEXT</div></div>}
                </div>
              );
            })}
          </div>
          <div ref={waveRef} onClick={handleBarClick} style={{ display: "flex", alignItems: "center", gap: 1.2, height: 60, position: "relative", padding: "0 1px", cursor: "pointer" }}>
            {bars.map((h, i) => {
              const pct = i / N; const played = pct < progress; const sec = getSec(i); const prevSec = getSec(i - 1); const isBoundary = sec && prevSec && sec.id !== prevSec.id;
              const ps = sec?.partStatus || { soprano: "inactive", alto: "inactive", tenor: "inactive", baritone: "inactive" };
              return <div key={i} style={{ flex: 1, minWidth: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: isBoundary ? 3 : 0 }}><WaveBar height={h} played={played} partStatus={ps} loadedTracks={loadedTracks} /></div>;
            })}
            <div style={{ position: "absolute", left: `${progress * 100}%`, top: -3, bottom: -3, width: 2.5, borderRadius: 2, background: "#fff", boxShadow: "0 0 8px rgba(255,255,255,0.5), 0 0 2px rgba(255,255,255,0.8)", pointerEvents: "none", zIndex: 2 }} />
            {loopSection && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${loopSection.start * 100}%`, width: `${(loopSection.end - loopSection.start) * 100}%`, background: `${UNISON_COLOR}08`, borderLeft: `2px solid ${UNISON_COLOR}44`, borderRight: `2px solid ${UNISON_COLOR}44`, pointerEvents: "none", zIndex: 1 }} />}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ bg: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", label: "Rest" }, { bg: `${UNISON_COLOR}66`, border: `1px solid ${UNISON_COLOR}44`, label: "Unison" }, { bg: "multi", border: "1px solid rgba(255,255,255,0.12)", label: "Harmony" }].map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 14, height: 10, borderRadius: 2, border: item.border, overflow: "hidden", display: "flex", flexDirection: "column", ...(item.bg === "multi" ? {} : { background: item.bg }) }}>
                {item.bg === "multi" && HARMONY_PARTS.map((p) => <div key={p} style={{ flex: 1, background: `${PART_COLORS[p]}88` }} />)}
              </div>
              <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{item.label}</span>
            </div>
          ))}
        </div>
        <button onClick={() => onLoopToggle(activeSection)} style={{ display: "flex", alignItems: "center", gap: 4, background: loopSection ? `${UNISON_COLOR}18` : "rgba(255,255,255,0.03)", border: loopSection ? `1px solid ${UNISON_COLOR}44` : "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
          <span style={{ fontSize: 12, color: loopSection ? UNISON_COLOR : "rgba(255,255,255,0.4)" }}>⟳</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: loopSection ? UNISON_COLOR : "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{loopSection ? `LOOP ${loopSection.shortLabel}` : "LOOP"}</span>
        </button>
      </div>
    </div>
  );
}

function LyricsView({ lyrics, currentTime, mode, onToggleMode, onClose }) {
  const containerRef = useRef(null);
  const activeIdx = lyrics.findIndex((l) => currentTime >= l.start && currentTime < l.end);
  useEffect(() => { if (containerRef.current && activeIdx >= 0) { const el = containerRef.current.children[activeIdx]; if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); } }, [activeIdx]);
  return (
    <div style={{ height: mode === "half" ? "38vh" : "calc(100vh - 190px)", display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.3)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>LYRICS</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onToggleMode} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 600, padding: "4px 8px", cursor: "pointer", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{mode === "half" ? "FULL" : "HALF"}</button>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, padding: "4px 8px", cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "none" }}>
        {lyrics.map((line, i) => {
          const isActive = i === activeIdx; const isPast = i < activeIdx; const isNext = i === activeIdx + 1;
          let fillPct = 0;
          if (isActive && line.end > line.start) fillPct = Math.min(1, Math.max(0, (currentTime - line.start) / (line.end - line.start)));
          return (
            <div key={i} style={{ position: "relative", padding: "8px 0", transition: "all 0.3s ease", transform: isActive ? "scale(1.02)" : "scale(1)", transformOrigin: "left center" }}>
              <div style={{ fontSize: isActive ? 18 : isNext ? 16 : 15, fontWeight: isActive ? 700 : 500, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, color: isPast ? "rgba(255,255,255,0.2)" : isActive ? "rgba(255,255,255,0.35)" : isNext ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)" }}>
                {isActive ? (
                  <><span style={{ color: "#fff" }}>{line.text.slice(0, Math.ceil(line.text.length * fillPct))}</span>{line.text.slice(Math.ceil(line.text.length * fillPct))}</>
                ) : line.text}
              </div>
              {isActive && <div style={{ position: "absolute", left: -10, top: 0, bottom: 0, width: 3, borderRadius: 2, background: UNISON_COLOR, boxShadow: `0 0 8px ${UNISON_COLOR}44` }} />}
            </div>
          );
        })}
        <div style={{ height: 60 }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ── Setlist Home Screen ── */
/* ═══════════════════════════════════════════════ */
function SetlistHome({ setlists, onSelectSetlist, onOpenLibrary }) {
  const upcoming = setlists.filter((s) => s.upcoming);
  const past = setlists.filter((s) => !s.upcoming);

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Top action row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={onOpenLibrary} style={{
          flex: 1, padding: "12px 14px", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "all 0.15s",
        }}>
          <span style={{ fontSize: 16 }}>♫</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", fontFamily: "'DM Sans', sans-serif" }}>Song Library</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{Object.keys(SONG_LIBRARY).length}</span>
        </button>
      </div>
      {/* Upcoming setlist — hero card */}
      {upcoming.map((sl) => (
        <button key={sl.id} onClick={() => onSelectSetlist(sl)} style={{
          width: "100%", padding: "20px 18px", borderRadius: 16,
          border: "1.5px solid rgba(232,200,64,0.2)",
          background: "linear-gradient(135deg, rgba(232,200,64,0.06) 0%, rgba(155,106,216,0.04) 100%)",
          cursor: "pointer", textAlign: "left", marginBottom: 20, transition: "all 0.2s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#E8C840", letterSpacing: "0.1em", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>THIS WEEK</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{sl.songs.length} songs</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{sl.title}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", fontFamily: "'DM Sans', sans-serif", marginBottom: 12 }}>{sl.dateLabel} · {sl.serviceTime}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sl.songs.map((song, idx) => {
              const lib = SONG_LIBRARY[song.songId];
              return (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 8,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{song.order}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{lib?.title || "Unknown"}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{song.serviceKey}</span>
                  {song.stemsAvailable && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#5B8C3E" }} />}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10, fontFamily: "'DM Sans', sans-serif" }}>Led by {sl.worshipLeader}</div>
        </button>
      ))}

      {/* Past setlists */}
      {past.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", marginBottom: 10 }}>RECENT SETLISTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map((sl) => (
              <button key={sl.id} onClick={() => onSelectSetlist(sl)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)",
                cursor: "pointer", textAlign: "left", transition: "all 0.15s",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Sans', sans-serif" }}>{sl.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{sl.dateLabel} · {sl.worshipLeader}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{sl.songs.length} songs</span>
                  <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 18 }}>›</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ── Song Library View ── */
/* ═══════════════════════════════════════════════ */
function SongLibrary({ onSelectSong, onBack }) {
  const songs = Object.values(SONG_LIBRARY);
  const withStems = songs.filter((s) => s.sections.length > 0);
  const withoutStems = songs.filter((s) => s.sections.length === 0);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0, fontFamily: "'DM Sans', sans-serif" }}>Song Library</h2>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "4px 0 0", fontFamily: "'DM Sans', sans-serif" }}>{songs.length} songs · {withStems.length} with stems</p>
      </div>

      {withStems.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#5B8C3E", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", marginBottom: 10 }}>STEMS READY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {withStems.map((song) => {
              const harmonyCount = song.sections.filter((s) => HARMONY_PARTS.some((p) => s.partStatus[p] === "harmony")).length;
              return (
                <button key={song.id} onClick={() => onSelectSong(song)} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 14px", borderRadius: 12,
                  border: "1.5px solid rgba(91,140,62,0.2)",
                  background: "rgba(91,140,62,0.04)",
                  cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#5B8C3E", boxShadow: "0 0 6px rgba(91,140,62,0.4)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{song.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{song.artist}</div>
                    {/* Mini arrangement strip */}
                    <div style={{ display: "flex", gap: 1.5, marginTop: 6, height: 5 }}>
                      {song.sections.map((sec) => {
                        const hasH = HARMONY_PARTS.some((p) => sec.partStatus[p] === "harmony");
                        const allOff = HARMONY_PARTS.every((p) => sec.partStatus[p] === "inactive");
                        return (
                          <div key={sec.id} style={{
                            flex: sec.endTime - sec.startTime, borderRadius: 2, height: "100%",
                            overflow: "hidden", display: "flex", flexDirection: "column",
                            background: allOff ? "rgba(255,255,255,0.08)" : !hasH ? `${UNISON_COLOR}44` : undefined,
                          }}>
                            {hasH && HARMONY_PARTS.map((p) => {
                              const st = sec.partStatus[p];
                              const c = st === "harmony" ? PART_COLORS[p] : st === "unison" ? UNISON_COLOR : "rgba(255,255,255,0.04)";
                              return <div key={p} style={{ flex: 1, background: c, opacity: 0.6 }} />;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{song.originalKey}</span>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{song.bpm} BPM</div>
                    <div style={{ fontSize: 9, color: "rgba(232,200,64,0.5)", marginTop: 2, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{harmonyCount} harmony</div>
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 18 }}>›</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {withoutStems.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", marginBottom: 10 }}>IN LIBRARY — NO STEMS YET</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {withoutStems.map((song) => (
              <div key={song.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(255,255,255,0.01)", opacity: 0.5,
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{song.title}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{song.artist}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{song.originalKey} · {song.bpm}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ── Setlist Detail View ── */
/* ═══════════════════════════════════════════════ */
function SetlistDetail({ setlist, onBack, onSelectSong }) {
  return (
    <div style={{ padding: "16px 20px" }}>
      {/* Setlist header */}
      <div style={{ paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {setlist.upcoming && <span style={{ fontSize: 9, fontWeight: 700, color: "#E8C840", background: "rgba(232,200,64,0.1)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>THIS WEEK</span>}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>{setlist.title}</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "4px 0 0", fontFamily: "'DM Sans', sans-serif" }}>{setlist.dateLabel} · {setlist.serviceTime}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "4px 0 0", fontFamily: "'DM Sans', sans-serif" }}>Worship Leader: {setlist.worshipLeader}</p>
      </div>

      {/* Song list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {setlist.songs.map((songEntry) => {
          const lib = SONG_LIBRARY[songEntry.songId];
          if (!lib) return null;
          const hasStems = songEntry.stemsAvailable;
          const keyChanged = songEntry.serviceKey !== lib.originalKey;
          const hasSections = lib.sections.length > 0;
          const harmonyCount = hasSections ? lib.sections.filter((s) => HARMONY_PARTS.some((p) => s.partStatus[p] === "harmony")).length : 0;

          return (
            <button key={songEntry.order} onClick={() => onSelectSong(songEntry, lib)} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "16px 14px", borderRadius: 14,
              border: hasStems ? "1.5px solid rgba(91,140,62,0.25)" : "1px solid rgba(255,255,255,0.06)",
              background: hasStems ? "rgba(91,140,62,0.04)" : "rgba(255,255,255,0.02)",
              cursor: hasStems ? "pointer" : "default",
              textAlign: "left", transition: "all 0.15s",
              opacity: hasStems ? 1 : 0.6,
            }}>
              {/* Order number */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)",
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              }}>{songEntry.order}</div>

              {/* Song info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>{lib.title}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>{lib.artist}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Service key */}
                  <div style={{
                    padding: "2px 8px", borderRadius: 4,
                    background: keyChanged ? "rgba(232,200,64,0.1)" : "rgba(255,255,255,0.04)",
                    border: keyChanged ? "1px solid rgba(232,200,64,0.2)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: keyChanged ? "#E8C840" : "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
                      {songEntry.serviceKey}{keyChanged ? ` (orig ${lib.originalKey})` : ""}
                    </span>
                  </div>
                  {/* Lead vocal */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>Lead:</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>{songEntry.leadVocal}</span>
                  </div>
                  {/* BPM */}
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{lib.bpm} BPM</span>
                </div>
                {/* Mini arrangement strip */}
                {hasSections && (
                  <div style={{ display: "flex", gap: 1.5, marginTop: 8, height: 5 }}>
                    {lib.sections.map((sec) => {
                      const hasH = HARMONY_PARTS.some((p) => sec.partStatus[p] === "harmony");
                      const hasU = HARMONY_PARTS.some((p) => sec.partStatus[p] === "unison");
                      const allOff = HARMONY_PARTS.every((p) => sec.partStatus[p] === "inactive");
                      return (
                        <div key={sec.id} style={{
                          flex: (sec.endTime - sec.startTime), borderRadius: 2, height: "100%",
                          overflow: "hidden", display: "flex", flexDirection: "column",
                          background: allOff ? "rgba(255,255,255,0.08)" : !hasH ? `${UNISON_COLOR}44` : undefined,
                        }}>
                          {hasH && HARMONY_PARTS.map((p) => {
                            const st = sec.partStatus[p];
                            const c = st === "harmony" ? PART_COLORS[p] : st === "unison" ? UNISON_COLOR : "rgba(255,255,255,0.04)";
                            return <div key={p} style={{ flex: 1, background: c, opacity: 0.6 }} />;
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status indicator */}
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                {hasStems ? (
                  <>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#5B8C3E", boxShadow: "0 0 6px rgba(91,140,62,0.4)" }} />
                    <span style={{ fontSize: 8, color: "#5B8C3E", fontWeight: 600, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>READY</span>
                  </>
                ) : (
                  <>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.1)" }} />
                    <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", fontWeight: 600, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>NO STEMS</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ── Stem Loader ── */
/* ═══════════════════════════════════════════════ */
function StemLoader({ song, onLoadStem, loadedTracks, loading, onReady }) {
  const slots = [
    { id: "band", label: "Band", color: "#4A9EE5", icon: "♪" },
    { id: "lead", label: "Lead Vocal", color: "#5BB8D4", icon: "◆" },
    { id: "soprano", label: "Soprano", color: "#E8C840", icon: "S" },
    { id: "alto", label: "Alto", color: "#D94545", icon: "A" },
    { id: "tenor", label: "Tenor", color: "#4FBCD0", icon: "T" },
  ];
  const hasMin = loadedTracks["band"] && loadedTracks["lead"];
  const count = Object.keys(loadedTracks).length;
  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 4px", fontFamily: "'DM Sans', sans-serif" }}>{song.title}</h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 20px", fontFamily: "'DM Sans', sans-serif" }}>{song.artist} · {song.originalKey} · {song.bpm} BPM</p>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", marginBottom: 12 }}>LOAD STEMS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slots.map((slot) => {
          const loaded = !!loadedTracks[slot.id];
          return (
            <label key={slot.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: loaded ? `1.5px solid ${slot.color}44` : "1.5px solid rgba(255,255,255,0.06)", background: loaded ? `${slot.color}0a` : "rgba(255,255,255,0.02)", cursor: "pointer" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${slot.color}22`, border: `1.5px solid ${slot.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: slot.color, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{slot.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: loaded ? "#fff" : "rgba(255,255,255,0.6)", fontFamily: "'DM Sans', sans-serif" }}>{slot.label}</div>
                <div style={{ fontSize: 10, color: loaded ? slot.color : "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", marginTop: 2 }}>{loaded ? `✓ ${loadedTracks[slot.id]}` : "Tap to select MP3"}</div>
              </div>
              {loaded ? <div style={{ width: 24, height: 24, borderRadius: "50%", background: `${slot.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: slot.color }}>✓</div>
                : <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "rgba(255,255,255,0.2)" }}>+</div>}
              <input type="file" accept=".mp3,.m4a,.wav,.aac,.ogg,.flac" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) onLoadStem(slot.id, e.target.files[0]); }} />
            </label>
          );
        })}
      </div>
      {loading && <div style={{ textAlign: "center", padding: "16px 0", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Decoding audio...</div>}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <button onClick={onReady} disabled={!hasMin} style={{ padding: "12px 32px", borderRadius: 10, border: "none", background: hasMin ? "linear-gradient(135deg, #E8C840, #D94545)" : "rgba(255,255,255,0.06)", color: hasMin ? "#fff" : "rgba(255,255,255,0.2)", fontSize: 14, fontWeight: 700, cursor: hasMin ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", boxShadow: hasMin ? "0 4px 20px rgba(232,200,64,0.25)" : "none" }}>
          {count === 0 ? "Load at least Band + Lead" : hasMin ? `Open Mixer (${count} stems)` : "Need Band + Lead"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ── Main App ── */
/* ═══════════════════════════════════════════════ */
/**
 * @param {{
 *   initialSong?: import('./lib/songs').Song | null,
 *   onExit?: (() => void) | null,
 * }} props
 */
export default function WorshipMixer({ initialSong = null, onExit = null }) {
  // Phases: "home" | "library" | "setlist" | "load" | "mixer" | "loading-remote"
  // When `initialSong` is set we skip the prototype's home/library demo
  // screens entirely and jump straight to "loading-remote", which
  // signs URLs for the song's stems and decodes them before showing
  // the mixer surface.
  const [phase, setPhase] = useState(initialSong ? "loading-remote" : "home");
  const [selectedSetlist, setSelectedSetlist] = useState(null);
  const [selectedSongEntry, setSelectedSongEntry] = useState(null);
  const [selectedSong, setSelectedSong] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [myPart, setMyPart] = useState("alto");
  const [activePreset, setActivePreset] = useState("all");
  const [keyOffset, setKeyOffset] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsMode, setLyricsMode] = useState("half");
  const [loopSection, setLoopSection] = useState(null);
  const [queuedSection, setQueuedSection] = useState(null);

  const activeSong = selectedSong ? {
    ...selectedSong,
    sections: selectedSong.sections.map((s) => ({
      ...s,
      start: s.startTime / selectedSong.duration,
      end: s.endTime / selectedSong.duration,
    })),
  } : null;

  const engine = useAudioEngine(activeSong?.duration || 300);
  const progress = activeSong ? engine.currentTime / activeSong.duration : 0;
  const sections = activeSong?.sections || [];
  const activeSection = sections.find((s) => progress >= s.start && progress < s.end);

  const [volumes, setVolumes] = useState(Object.fromEntries(TRACKS.map((t) => [t.id, t.id === "click" ? 60 : 80])));
  const [muted, setMuted] = useState(Object.fromEntries(TRACKS.map((t) => [t.id, t.id === "click"])));
  const [soloed, setSoloed] = useState(Object.fromEntries(TRACKS.map((t) => [t.id, false])));
  const anySoloed = Object.values(soloed).some(Boolean);

  useEffect(() => {
    TRACKS.forEach((t) => {
      const isAudible = !muted[t.id] && (!anySoloed || soloed[t.id]);
      engine.setVolume(t.id, isAudible ? volumes[t.id] : 0);
    });
  }, [volumes, muted, soloed, anySoloed]);

  useEffect(() => {
    if (loopSection && engine.isPlaying && activeSong) {
      const loopEnd = loopSection.end * activeSong.duration;
      if (engine.currentTime >= loopEnd) engine.seek(loopSection.start * activeSong.duration);
    }
  }, [engine.currentTime, loopSection, engine.isPlaying, activeSong]);

  const handleSectionTap = (section) => {
    if (engine.isPlaying) {
      if (activeSection?.id === section.id) setQueuedSection(null);
      else setQueuedSection(section);
    } else {
      engine.seek(section.startTime);
    }
  };

  useEffect(() => {
    if (queuedSection && engine.isPlaying && activeSection) {
      const prev = sections.find((s) => {
        const pt = (engine.currentTime - 0.5) / activeSong.duration;
        return pt >= s.start && pt < s.end;
      });
      if (prev && prev.id !== activeSection.id) {
        engine.seek(queuedSection.startTime);
        setQueuedSection(null);
      }
    }
  }, [activeSection, queuedSection, engine.isPlaying]);

  // When opened with a published song row, sign URLs for the stem
  // manifest, decode each stem, then build the mixer-shape song and
  // advance to the mixer. Duration comes from the first decoded
  // buffer because no `duration` column exists on `songs` yet.
  useEffect(() => {
    if (!initialSong || selectedSong) return;
    let cancelled = false;
    (async () => {
      const stems = initialSong.record?.stems ?? {};
      const entries = Object.entries(stems);
      if (entries.length === 0) {
        setRemoteError("No stems uploaded for this song yet.");
        return;
      }
      const paths = entries.map(([, key]) => key.replace(/^stems\//, ""));
      const { data, error } = await supabase.storage
        .from("stems")
        .createSignedUrls(paths, 3600);
      if (cancelled) return;
      if (error || !data) {
        setRemoteError(error?.message || "Failed to sign stem URLs.");
        return;
      }
      const buffers = await Promise.all(
        entries.map(([trackId, key], i) => {
          const signed = data[i]?.signedUrl;
          if (!signed) return Promise.resolve(null);
          return engine.loadStem(trackId, {
            url: signed,
            label: key.split("/").pop() || trackId,
          });
        })
      );
      if (cancelled) return;
      const firstBuf = buffers.find((b) => b != null);
      if (!firstBuf) {
        setRemoteError("Could not decode any stems.");
        return;
      }
      setSelectedSong(songToMixerSong(initialSong, firstBuf.duration));
      setPhase("mixer");
    })();
    return () => { cancelled = true; };
  }, [initialSong, selectedSong, engine.loadStem]);

  const handleSelectSetlist = (sl) => { setSelectedSetlist(sl); setPhase("setlist"); };
  const handleSelectSong = (entry, lib) => {
    if (!entry.stemsAvailable) return;
    setSelectedSongEntry(entry);
    setSelectedSong(lib);
    setKeyOffset(0);
    setLoopSection(null);
    setQueuedSection(null);
    setPhase("load");
  };
  const handlePreset = (preset) => {
    setActivePreset(preset);
    const newM = {}, newS = {};
    TRACKS.forEach((t) => { newM[t.id] = false; newS[t.id] = false; });
    newM["click"] = muted["click"];
    switch (preset) {
      case "mypart": TRACKS.forEach((t) => { if (t.group === "harmony" || t.group === "vocal") newS[t.id] = t.id === myPart; }); newS["band"] = true; break;
      case "vocals": newM["band"] = true; break;
      case "bandlead": TRACKS.forEach((t) => { if (t.group === "harmony") newM[t.id] = true; }); break;
      default: break;
    }
    setMuted(newM); setSoloed(newS);
  };

  const navBack = () => {
    // When opened from a song row there's no prototype stem-picker to
    // fall back to — bounce all the way out to the parent (SongDetail).
    if (initialSong && onExit) { engine.pause(); onExit(); return; }
    if (phase === "mixer") { engine.pause(); setPhase("load"); }
    else if (phase === "load" && selectedSetlist) { setPhase("setlist"); }
    else if (phase === "load" && !selectedSetlist) { setPhase("library"); }
    else if (phase === "setlist") { setPhase("home"); setSelectedSetlist(null); }
    else if (phase === "library") { setPhase("home"); }
  };

  const backLabel = initialSong
    ? "‹ Song"
    : phase === "mixer" ? "‹ Stems"
    : phase === "load" ? (selectedSetlist ? "‹ Setlist" : "‹ Library")
    : phase === "setlist" ? "‹ Home"
    : phase === "library" ? "‹ Home"
    : null;
  const keyOptions = useMemo(() => activeSong ? getKeyOptions(activeSong.originalKey) : [], [activeSong]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(170deg, #0F1117 0%, #15171F 50%, #12141B 100%)", color: "#fff", fontFamily: "'DM Sans', sans-serif", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${UNISON_COLOR}08, transparent 70%)`, pointerEvents: "none" }} />

      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {backLabel ? <button onClick={navBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, padding: 0 }}>{backLabel}</button> : <div style={{ width: 50 }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>VOCAL BOOTH</span>
        {phase === "mixer" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>I sing</span>
            <select value={myPart} onChange={(e) => setMyPart(e.target.value)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: TRACKS.find((t) => t.id === myPart)?.color || "#fff", fontSize: 11, fontWeight: 700, padding: "4px 6px", cursor: "pointer", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
              {TRACKS.filter((t) => t.group !== "music" && t.group !== "util").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        ) : <div style={{ width: 50 }} />}
      </div>

      {/* Screens */}
      {phase === "loading-remote" && (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 8px", fontFamily: "'DM Sans', sans-serif" }}>{initialSong?.title}</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 24px", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{initialSong?.key} · {initialSong?.bpm} BPM</p>
          {remoteError ? (
            <div style={{ padding: 16, borderRadius: 8, background: "rgba(217,69,69,0.08)", border: "1px solid rgba(217,69,69,0.3)", color: "#D94545", fontSize: 12, fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>
              {remoteError}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace", letterSpacing: "0.08em", marginBottom: 12 }}>DECODING STEMS…</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "'DM Sans', sans-serif" }}>
                {Object.keys(engine.loadedTracks).length} of {Object.keys(initialSong?.record?.stems ?? {}).length} ready
              </div>
            </>
          )}
        </div>
      )}

      {phase === "home" && <SetlistHome setlists={SETLISTS} onSelectSetlist={handleSelectSetlist} onOpenLibrary={() => setPhase("library")} />}

      {phase === "library" && <SongLibrary onBack={navBack} onSelectSong={(song) => {
        setSelectedSetlist(null);
        setSelectedSongEntry({ songId: song.id, serviceKey: song.originalKey, leadVocal: "", order: 1, stemsAvailable: true });
        setSelectedSong(song);
        setKeyOffset(0); setLoopSection(null); setQueuedSection(null);
        setPhase("load");
      }} />}

      {phase === "setlist" && selectedSetlist && <SetlistDetail setlist={selectedSetlist} onBack={navBack} onSelectSong={handleSelectSong} />}

      {phase === "load" && selectedSong && <StemLoader song={selectedSong} onLoadStem={engine.loadStem} loadedTracks={engine.loadedTracks} loading={engine.loading} onReady={() => setPhase("mixer")} />}

      {phase === "mixer" && activeSong && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0, fontFamily: "'DM Sans', sans-serif" }}>{activeSong.title}</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "4px 0 0", fontFamily: "'DM Sans', sans-serif" }}>{activeSong.artist}{selectedSongEntry ? ` · Led by ${selectedSongEntry.leadVocal}` : ""}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <div style={{ padding: "4px 4px 4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>KEY</span>
                <select value={keyOffset} onChange={(e) => setKeyOffset(Number(e.target.value))} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: keyOffset === 0 ? "rgba(255,255,255,0.8)" : "#E8C840", fontSize: 12, fontWeight: 700, padding: "2px 4px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  {keyOptions.map((o) => <option key={o.offset} value={o.offset}>{o.label}</option>)}
                </select>
              </div>
              {[{ l: "BPM", v: activeSong.bpm }, { l: "TIME", v: activeSong.time }].map((item) => (
                <div key={item.l} style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>{item.l}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)", marginLeft: 6, fontFamily: "'DM Sans', sans-serif" }}>{item.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: "10px 0 4px", display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionalWaveform sections={sections} progress={progress} duration={activeSong.duration} onSectionTap={handleSectionTap} activeSection={activeSection} loopSection={loopSection} onLoopToggle={(sec) => { if (!sec) return; setLoopSection(loopSection?.id === sec.id ? null : sec); }} queuedSection={queuedSection} loadedTracks={engine.loadedTracks} />
            <PianoRoll
              notes={activeSong.parts?.[0]?.notes ?? []}
              currentTime={engine.currentTime}
              activeSection={activeSection}
              myPart={myPart}
            />
            <div style={{ textAlign: "center", minHeight: 22, paddingTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {activeSection && (() => {
                const st = HARMONY_PARTS.map((p) => activeSection.partStatus[p]);
                const type = st.some((s) => s === "harmony") ? "harmony" : st.every((s) => s === "inactive") ? "inactive" : "unison";
                return (<>
                  <span style={{ fontSize: 12, fontWeight: 600, color: type === "harmony" ? "#fff" : type === "unison" ? UNISON_COLOR : "rgba(255,255,255,0.4)", fontFamily: "'DM Sans', sans-serif" }}>{activeSection.label}</span>
                  {type === "harmony" && <div style={{ display: "flex", gap: 3 }}>
                    {HARMONY_PARTS.map((p) => { const s = activeSection.partStatus[p]; if (s === "inactive") return null; const c = s === "harmony" ? PART_COLORS[p] : UNISON_COLOR; return <div key={p} style={{ fontSize: 9, fontWeight: 700, color: c, background: `${c}18`, padding: "1px 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", border: `1px solid ${c}33` }}>{p[0].toUpperCase()}</div>; })}
                  </div>}
                  {type === "unison" && <span style={{ fontSize: 9, fontWeight: 600, color: UNISON_COLOR, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", background: `${UNISON_COLOR}12`, padding: "2px 6px", borderRadius: 4 }}>UNISON</span>}
                  {loopSection?.id === activeSection.id && <span style={{ fontSize: 9, fontWeight: 700, color: UNISON_COLOR }}>⟳</span>}
                </>);
              })()}
            </div>
            {queuedSection && <div style={{ textAlign: "center", paddingTop: 2 }}><span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>NEXT ▸ {queuedSection.label}</span></div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", color: "rgba(255,255,255,0.4)", width: 40 }}>{formatTime(engine.currentTime)}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <button onClick={() => engine.seek(Math.max(0, engine.currentTime - 10))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 }}>⏪</button>
                <button onClick={() => engine.isPlaying ? engine.pause() : engine.play()} style={{ width: 50, height: 50, borderRadius: "50%", border: "none", background: "linear-gradient(135deg, #E8C840, #D94545)", color: "#fff", fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(232,200,64,0.25)" }}>{engine.isPlaying ? "⏸" : "▶"}</button>
                <button onClick={() => engine.seek(Math.min(activeSong.duration, engine.currentTime + 10))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 }}>⏩</button>
              </div>
              <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", color: "rgba(255,255,255,0.4)", width: 40, textAlign: "right" }}>{formatTime(activeSong.duration)}</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", paddingTop: 4, paddingBottom: 4 }}>
            <button onClick={() => setShowLyrics(!showLyrics)} style={{ background: showLyrics ? `${UNISON_COLOR}15` : "rgba(255,255,255,0.03)", border: showLyrics ? `1px solid ${UNISON_COLOR}33` : "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: showLyrics ? UNISON_COLOR : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, padding: "6px 16px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14 }}>♫</span> Lyrics
            </button>
          </div>

          {showLyrics && activeSong.lyrics.length > 0 && <div style={{ paddingBottom: 8 }}><LyricsView lyrics={activeSong.lyrics} currentTime={engine.currentTime} mode={lyricsMode} onToggleMode={() => setLyricsMode(lyricsMode === "half" ? "full" : "half")} onClose={() => setShowLyrics(false)} /></div>}

          {!(showLyrics && lyricsMode === "full") && (<>
            <div style={{ paddingTop: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>QUICK MIX</span>
              <div style={{ height: 8 }} />
              <div style={{ display: "flex", gap: 6, paddingBottom: 8 }}>
                {[{ label: "All", id: "all" }, { label: "My Part", id: "mypart" }, { label: "Vocals", id: "vocals" }, { label: "Band+Lead", id: "bandlead" }].map((p) => {
                  const active = activePreset === p.id;
                  return <button key={p.id} onClick={() => handlePreset(p.id)} style={{ flex: 1, padding: "8px 4px", borderRadius: 8, border: active ? "1px solid rgba(232,200,64,0.3)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(232,200,64,0.08)" : "rgba(255,255,255,0.03)", color: active ? "#E8C840" : "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{p.label}</button>;
                })}
              </div>
            </div>
            <div style={{ paddingTop: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', 'SF Mono', monospace" }}>CHANNELS</span>
              <div style={{ paddingTop: 4 }}>
                {TRACKS.map((track) => (
                  <TrackChannel key={track.id} track={track} volume={volumes[track.id]} muted={muted[track.id]} soloed={soloed[track.id]} anySoloed={anySoloed} loaded={!!engine.loadedTracks[track.id]}
                    onVolumeChange={(v) => { setVolumes((p) => ({ ...p, [track.id]: v })); setActivePreset(null); }}
                    onMute={() => { setMuted((p) => ({ ...p, [track.id]: !p[track.id] })); setActivePreset(null); }}
                    onSolo={() => { setSoloed((p) => ({ ...p, [track.id]: !p[track.id] })); setActivePreset(null); }}
                  />
                ))}
              </div>
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}
