import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Fuel, Plus, Trash2, X, ChevronDown, ChevronUp, Camera, Loader2, MapPin, Globe, ChevronLeft, ChevronRight, Lock, Navigation } from "lucide-react";

// ─── Config ───────────────────────────────────────────────
const API_BASE = "https://fuel-tracker-api.fuel-tracker.workers.dev";
const PIN_KEY = "fuel-tracker-pin";
const LANG_KEY = "fuel-tracker-lang";
const ENTRIES_CACHE_KEY = "fuel-tracker-entries-cache";

// ─── API helpers ──────────────────────────────────────────
async function api(path, options = {}, secret = "") {
  const { method = "GET", body } = options;
  const headers = { "Content-Type": "application/json", "X-App-Secret": secret };
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// ─── Translations ─────────────────────────────────────────
const t = {
  fr: {
    title: "Suivi d'essence", entries: (n) => `${n} plein${n !== 1 ? "s" : ""} enregistré${n !== 1 ? "s" : ""}`,
    spent: "Dépensé", litres: "Litres", avgPrice: "Moy. $/L", fillups: "Pleins",
    cost: "Coût ($)", pricePl: "Prix ($/L)",
    scan: "Scanner", manual: "Manuel", scanning: "Lecture de l'afficheur...",
    scanResult: "Résultat du scan", manualEntry: "Entrée manuelle", newEntry: "Nouveau plein",
    scanError: "Impossible de lire la photo. Remplissez manuellement.",
    date: "Date", station: "Station", save: "Enregistrer", history: "Historique",
    savedNote: "Données synchronisées dans le cloud.",
    week: "Semaine", month: "Mois", year: "Année", all: "Total",
    noData: "Aucun plein pour cette période.",
    fillup: "plein", fillupPlural: "pleins",
    months: ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],
    pinTitle: "Entrez votre NIP", pinPlaceholder: "NIP", pinButton: "Entrer", pinError: "NIP invalide",
    nearby: "Stations proches", locating: "Localisation...",
    saving: "Enregistrement...",
  },
  en: {
    title: "Fuel Tracker", entries: (n) => `${n} fill-up${n !== 1 ? "s" : ""} recorded`,
    spent: "Spent", litres: "Litres", avgPrice: "Avg. $/L", fillups: "Fill-ups",
    cost: "Cost ($)", pricePl: "Price ($/L)",
    scan: "Scan", manual: "Manual", scanning: "Reading pump display...",
    scanResult: "Scan result", manualEntry: "Manual entry", newEntry: "New fill-up",
    scanError: "Could not read photo. Fill in manually.",
    date: "Date", station: "Station", save: "Save", history: "History",
    savedNote: "Data synced to cloud.",
    week: "Week", month: "Month", year: "Year", all: "All time",
    noData: "No fill-ups for this period.",
    fillup: "fill-up", fillupPlural: "fill-ups",
    months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
    pinTitle: "Enter your PIN", pinPlaceholder: "PIN", pinButton: "Enter", pinError: "Invalid PIN",
    nearby: "Nearby stations", locating: "Locating...",
    saving: "Saving...",
  }
};

// ─── Date/period helpers ──────────────────────────────────
const formatDate = (iso, lang = "fr") => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short", year: "numeric" }); };
const formatDateShort = (iso, lang = "fr") => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" }); };

function getWeekRange(offset) { const d = new Date(); const day = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { start: mon.toISOString().split("T")[0], end: sun.toISOString().split("T")[0] }; }
function getMonthRange(offset) { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + offset, 1); const end = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0); return { start: m.toISOString().split("T")[0], end: end.toISOString().split("T")[0] }; }
function getYearRange(offset) { const y = new Date().getFullYear() + offset; return { start: `${y}-01-01`, end: `${y}-12-31` }; }
function periodLabel(period, offset, L) {
  if (period === "all") return L.all;
  if (period === "week") { const { start, end } = getWeekRange(offset); const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "short" }); return `${fmt(start)} — ${fmt(end)}`; }
  if (period === "month") { const d = new Date(); const m = new Date(d.getFullYear(), d.getMonth() + offset, 1); return `${L.months[m.getMonth()]} ${m.getFullYear()}`; }
  if (period === "year") return `${new Date().getFullYear() + offset}`;
  return "";
}

const STATION_COLORS = ["#4fc3f7", "#81c784", "#ffb74d", "#ce93d8", "#ef5350", "#4db6ac", "#ff8a65", "#90a4ae"];

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#e0e0e0", fontSize: 13, lineHeight: 1.6, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
      <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}>{formatDate(d.date, d._lang)}</div>
      {d.station && <div style={{ color: "#8888aa" }}>{d.station}</div>}
      <div style={{ marginTop: 6 }}>
        <span style={{ color: "#4fc3f7" }}>${d.cost.toFixed(2)}</span>
        <span style={{ color: "#666", margin: "0 6px" }}>·</span>
        <span style={{ color: "#81c784" }}>{d.litres.toFixed(2)} L</span>
        <span style={{ color: "#666", margin: "0 6px" }}>·</span>
        <span style={{ color: "#ffb74d" }}>${(d.ppl / 100).toFixed(3)}/L</span>
      </div>
    </div>
  );
};

// ─── PIN Screen ───────────────────────────────────────────
function PinScreen({ onUnlock, lang }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const L = t[lang];

  const handleSubmit = async () => {
    if (!pin) return;
    setError(false);
    setChecking(true);
    try {
      await api("/api/entries", { method: "GET" }, pin);
      localStorage.setItem(PIN_KEY, pin);
      onUnlock(pin);
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #0a0a1a 0%, #0f0f2a 50%, #0a0a1a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ textAlign: "center", width: 280 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #1a3a5c, #2a5a8c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Lock size={24} color="#4fc3f7" />
        </div>
        <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>{L.pinTitle}</h2>
        <input
          type="password"
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={L.pinPlaceholder}
          style={{ width: "100%", padding: "12px 16px", background: "#12122a", border: error ? "1px solid #ef5350" : "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 16, textAlign: "center", outline: "none", boxSizing: "border-box", letterSpacing: "0.1em" }}
          autoFocus
        />
        {error && <div style={{ color: "#ef5350", fontSize: 12, marginTop: 8 }}>{L.pinError}</div>}
        <button
          onClick={handleSubmit}
          disabled={!pin || checking}
          style={{ width: "100%", padding: "12px", marginTop: 14, background: pin ? "linear-gradient(135deg, #1a3a5c, #2a5a8c)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: pin ? "pointer" : "default", opacity: pin ? 1 : 0.4 }}
        >
          {checking ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : L.pinButton}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────
export default function FuelTracker() {
  const [secret, setSecret] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ date: "", cost: "", litres: "", ppl: "", station: "" });
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [preview, setPreview] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [lang, setLang] = useState("fr");
  const [period, setPeriod] = useState("month");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [nearbyStations, setNearbyStations] = useState([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const L = t[lang];

  useEffect(() => {
    const savedPin = localStorage.getItem(PIN_KEY);
    const savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang === "en" || savedLang === "fr") setLang(savedLang);
    if (savedPin) {
      api("/api/entries", { method: "GET" }, savedPin)
        .then((data) => { setSecret(savedPin); setEntries(data); localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify(data)); setLoaded(true); })
        .catch(() => { localStorage.removeItem(PIN_KEY); setLoaded(true); });
    } else {
      setLoaded(true);
    }
  }, []);

  const handleUnlock = useCallback(async (pin) => {
    setSecret(pin);
    try {
      const data = await api("/api/entries", { method: "GET" }, pin);
      setEntries(data);
      localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify(data));
    } catch {
      try { const cached = localStorage.getItem(ENTRIES_CACHE_KEY); if (cached) setEntries(JSON.parse(cached)); } catch {}
    }
    setLoaded(true);
  }, []);

  const toggleLang = () => { const n = lang === "fr" ? "en" : "fr"; setLang(n); localStorage.setItem(LANG_KEY, n); };

  const getRange = () => {
    if (period === "all") return null;
    if (period === "week") return getWeekRange(periodOffset);
    if (period === "month") return getMonthRange(periodOffset);
    if (period === "year") return getYearRange(periodOffset);
  };
  const range = getRange();
  const periodEntries = range ? entries.filter(e => e.date >= range.start && e.date <= range.end) : entries;
  const pTotal = periodEntries.reduce((s, e) => s + e.cost, 0);
  const pLitres = periodEntries.reduce((s, e) => s + e.litres, 0);
  const pAvgPPL = periodEntries.length ? periodEntries.reduce((s, e) => s + e.ppl, 0) / periodEntries.length : 0;
  const pCount = periodEntries.length;

  const stationMap = {};
  periodEntries.forEach(e => { const key = e.station || (lang === "fr" ? "Inconnu" : "Unknown"); if (!stationMap[key]) stationMap[key] = { cost: 0, litres: 0, count: 0 }; stationMap[key].cost += e.cost; stationMap[key].litres += e.litres; stationMap[key].count += 1; });
  const stationData = Object.entries(stationMap).map(([name, d], i) => ({ name, ...d, color: STATION_COLORS[i % STATION_COLORS.length] })).sort((a, b) => b.cost - a.cost);
  const usedStations = [...new Set(entries.map(e => e.station).filter(Boolean))].sort();
  const rcpt = (n) => n === 1 ? L.fillup : L.fillupPlural;

  const resetForm = () => { setForm({ date: "", cost: "", litres: "", ppl: "", station: "" }); setPreview(null); setScanError(""); setScanned(false); setShowForm(false); setNearbyStations([]); };

  const handleAdd = async () => {
    const cost = parseFloat(form.cost); const litres = parseFloat(form.litres); let ppl = parseFloat(form.ppl);
    if (!form.date || isNaN(cost) || isNaN(litres)) return;
    if (isNaN(ppl) && cost > 0 && litres > 0) ppl = (cost / litres) * 100;
    else if (!isNaN(ppl)) ppl = ppl * 100;
    ppl = Math.round(ppl * 10) / 10;
    const entry = { id: crypto.randomUUID(), date: form.date, cost, litres, ppl, station: form.station || "" };
    setSaving(true);
    try {
      await api("/api/entries", { method: "POST", body: entry }, secret);
      setEntries(prev => { const updated = [...prev, entry]; localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify(updated)); return updated; });
    } catch (err) {
      console.error("Save failed:", err);
      setEntries(prev => [...prev, entry]);
    }
    setSaving(false);
    resetForm();
  };

  const handleDelete = async (id) => {
    setEntries(prev => { const updated = prev.filter(e => e.id !== id); localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify(updated)); return updated; });
    try { await api(`/api/entries?id=${id}`, { method: "DELETE" }, secret); } catch (err) { console.error("Delete failed:", err); }
  };

  const handleCostChange = (val) => { const nf = { ...form, cost: val }; const c = parseFloat(val), l = parseFloat(form.litres); if (!isNaN(c) && !isNaN(l) && l > 0) nf.ppl = (c / l).toFixed(3); setForm(nf); };
  const handleLitresChange = (val) => { const nf = { ...form, litres: val }; const c = parseFloat(form.cost), l = parseFloat(val); if (!isNaN(c) && !isNaN(l) && l > 0) nf.ppl = (c / l).toFixed(3); setForm(nf); };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setScanError(""); setScanning(true); setScanned(false); setShowForm(true);
    try {
      const mediaType = "image/jpeg";
      const base64 = await new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => {
    const MAX = 1280;
    let w = img.width, h = img.height;
    if (w > MAX || h > MAX) {
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
    }
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    res(c.toDataURL("image/jpeg", 0.7).split(",")[1]);
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => rej(new Error("Read error"));
  img.src = URL.createObjectURL(file);
});
      setPreview(`data:${mediaType};base64,${base64}`);
      const result = await api("/api/scan", { method: "POST", body: { image: base64, mediaType } }, secret);
      const today = new Date().toISOString().split("T")[0];
      const nf = { date: form.date || today, cost: "", litres: "", ppl: "", station: "" };
      if (result.cost != null) nf.cost = String(result.cost);
      if (result.litres != null) nf.litres = String(result.litres);
      if (result.station) nf.station = result.station;
      const c = parseFloat(nf.cost), l = parseFloat(nf.litres);
      if (!isNaN(c) && !isNaN(l) && l > 0) nf.ppl = (c / l).toFixed(3);
      setForm(nf); setScanned(true);
    } catch (err) { setScanError(err.message || "scan_failed"); setForm(f => ({ ...f, date: f.date || new Date().toISOString().split("T")[0] })); }
    finally { setScanning(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const findNearbyStations = async () => {
    setLoadingStations(true); setNearbyStations([]);
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
      const stations = await api(`/api/stations?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`, { method: "GET" }, secret);
      setNearbyStations(stations);
    } catch (err) { console.error("Station search failed:", err); }
    setLoadingStations(false);
  };

  const inputStyle = { width: "100%", padding: "10px 12px", background: "#12122a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", transition: "border-color 0.2s", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: "#6a6a8a", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" };
  const formVisible = showForm && !scanning;

  if (!secret && loaded) return <PinScreen onUnlock={handleUnlock} lang={lang} />;
  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #0a0a1a 0%, #0f0f2a 50%, #0a0a1a 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={24} color="#4fc3f7" style={{ animation: "spin 1s linear infinite" }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #0a0a1a 0%, #0f0f2a 50%, #0a0a1a 100%)", color: "#e0e0e0", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", padding: "24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <input ref={fileRef} type="file" accept="image/*"  onChange={handlePhotoSelect} style={{ display: "none" }} />

      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #1a3a5c, #2a5a8c)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Fuel size={20} color="#4fc3f7" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>{L.title}</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#5a5a7a" }}>{L.entries(entries.length)}</p>
          </div>
          <button onClick={toggleLang} style={{ marginLeft: "auto", padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#8888aa", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Globe size={12} /> {lang === "fr" ? "EN" : "FR"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 16, marginBottom: 12 }}>
          {["week", "month", "year", "all"].map(p => (
            <button key={p} onClick={() => { setPeriod(p); setPeriodOffset(0); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", background: period === p ? "rgba(79,195,247,0.12)" : "transparent", border: period === p ? "1px solid rgba(79,195,247,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: period === p ? "#4fc3f7" : "#5a5a7a" }}>{L[p]}</button>
          ))}
        </div>

        {period !== "all" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14 }}>
            <button onClick={() => setPeriodOffset(o => o - 1)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6a6a8a", cursor: "pointer", padding: "4px 8px", display: "flex" }}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", minWidth: 180, textAlign: "center" }}>{periodLabel(period, periodOffset, L)}</span>
            <button onClick={() => setPeriodOffset(o => o + 1)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#6a6a8a", cursor: "pointer", padding: "4px 8px", display: "flex" }}><ChevronRight size={16} /></button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[{ label: L.spent, value: `$${pTotal.toFixed(2)}`, color: "#4fc3f7" }, { label: L.litres, value: `${pLitres.toFixed(1)} L`, color: "#81c784" }, { label: L.avgPrice, value: `$${(pAvgPPL / 100).toFixed(3)}`, color: "#ffb74d" }, { label: L.fillups, value: `${pCount}`, color: "#ce93d8" }].map((s, i) => (
            <div key={i} style={{ background: `${s.color}0d`, borderRadius: 10, padding: "12px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
              <div style={{ fontSize: 8, color: "#5a5a7a", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 14px", marginBottom: 16 }}>
          {stationData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#5a5a7a", fontSize: 13 }}>{L.noData}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stationData.map((d) => {
                const pct = pTotal > 0 ? (d.cost / pTotal * 100) : 0;
                return (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: `${d.color}18`, flexShrink: 0 }}><Fuel size={13} color={d.color} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{d.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>${d.cost.toFixed(2)}</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: d.color, borderRadius: 2, transition: "width 0.3s ease" }} /></div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: "#5a5a7a" }}>{d.count} {rcpt(d.count)} · {d.litres.toFixed(1)} L</span>
                        <span style={{ fontSize: 10, color: "#5a5a7a" }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {periodEntries.length >= 2 && (
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px 8px 8px 0", marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={[...periodEntries].sort((a,b) => a.date.localeCompare(b.date)).map(e => ({ ...e, label: formatDateShort(e.date, lang), _lang: lang }))} margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                <defs><linearGradient id="gradF" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4fc3f7" stopOpacity={0.25} /><stop offset="95%" stopColor="#4fc3f7" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: "#5a5a7a", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#5a5a7a", fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cost" stroke="#4fc3f7" strokeWidth={2} fill="url(#gradF)" dot={{ r: 3, fill: "#4fc3f7", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {!showForm && !scanning && (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button onClick={() => { setForm({ date: new Date().toISOString().split("T")[0], cost: "", litres: "", ppl: "", station: "" }); setPreview(null); setScanError(""); setScanned(false); fileRef.current?.click(); }} style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg, #2a4a2a, #3a6a3a)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Camera size={18} /> {L.scan}
            </button>
            <button onClick={() => { setForm({ date: new Date().toISOString().split("T")[0], cost: "", litres: "", ppl: "", station: "" }); setPreview(null); setScanError(""); setScanned(false); setShowForm(true); }} style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg, #1a3a5c, #2a5a8c)", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Plus size={18} /> {L.manual}
            </button>
          </div>
        )}

        {scanning && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "32px 20px", marginBottom: 16, textAlign: "center", animation: "fadeIn 0.2s ease" }}>
            {preview && <img src={preview} alt="Pump" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10, marginBottom: 16, opacity: 0.7 }} />}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#4fc3f7" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /><span style={{ fontSize: 14, fontWeight: 500 }}>{L.scanning}</span>
            </div>
          </div>
        )}

        {formVisible && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, marginBottom: 16, animation: "fadeIn 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{scanned ? L.scanResult : scanError ? L.manualEntry : L.newEntry}</span>
              <button onClick={resetForm} style={{ background: "none", border: "none", color: "#5a5a7a", cursor: "pointer", padding: 4 }}><X size={18} /></button>
            </div>
            {scanError && (
              <div style={{ background: "rgba(239,83,80,0.1)", border: "1px solid rgba(239,83,80,0.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#ef5350" }}>
                <span style={{ display: "block" }}>{L.scanError}</span>
                <span style={{ display: "block", marginTop: 4, fontSize: 11, opacity: 0.7, wordBreak: "break-word" }}>{scanError}</span>
              </div>
            )}
            {scanned && preview && <img src={preview} alt="Pump" style={{ width: "100%", maxHeight: 140, objectFit: "contain", borderRadius: 10, marginBottom: 12, opacity: 0.5 }} />}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>{L.date}</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>{L.cost}</label><input type="number" step="0.01" placeholder="97.32" value={form.cost} onChange={e => handleCostChange(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>{L.litres}</label><input type="number" step="0.001" placeholder="57.278" value={form.litres} onChange={e => handleLitresChange(e.target.value)} style={inputStyle} /></div>
              <div><label style={labelStyle}>{L.pricePl}</label><input type="number" step="0.001" placeholder="auto" value={form.ppl} onChange={e => setForm(f => ({ ...f, ppl: e.target.value }))} style={{ ...inputStyle, color: "#ffb74d" }} /></div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>{L.station}</label>
                <input type="text" placeholder="Esso — 144 Saint-Gérard" value={form.station} onChange={e => setForm(f => ({ ...f, station: e.target.value }))} style={inputStyle} />
                <button onClick={findNearbyStations} disabled={loadingStations} style={{ marginTop: 8, padding: "6px 12px", background: "rgba(79,195,247,0.08)", border: "1px solid rgba(79,195,247,0.2)", borderRadius: 6, color: "#4fc3f7", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  {loadingStations ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Navigation size={12} />}
                  {loadingStations ? L.locating : L.nearby}
                </button>
                {nearbyStations.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                    {nearbyStations.map((s, i) => (
                      <button key={i} onClick={() => { setForm(f => ({ ...f, station: `${s.name} — ${s.address}` })); setNearbyStations([]); }} style={{ padding: "8px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#ccc", fontSize: 12, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
                        <MapPin size={12} color="#4fc3f7" style={{ flexShrink: 0 }} />
                        <div><div style={{ fontWeight: 600, color: "#fff", fontSize: 12 }}>{s.name}</div><div style={{ fontSize: 10, color: "#5a5a7a", marginTop: 1 }}>{s.address}</div></div>
                      </button>
                    ))}
                  </div>
                )}
                {usedStations.length > 0 && nearbyStations.length === 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {usedStations.map((s, i) => (
                      <button key={i} onClick={() => setForm(f => ({ ...f, station: s }))} style={{ padding: "5px 10px", background: form.station === s ? "rgba(79,195,247,0.15)" : "rgba(255,255,255,0.04)", border: form.station === s ? "1px solid rgba(79,195,247,0.3)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: form.station === s ? "#4fc3f7" : "#8888aa", fontSize: 11, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}><MapPin size={10} /> {s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button onClick={handleAdd} disabled={saving} style={{ width: "100%", padding: "12px", marginTop: 16, background: "linear-gradient(135deg, #1a3a5c, #2a5a8c)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {saving ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {L.saving}</> : L.save}
            </button>
          </div>
        )}

        <button onClick={() => setShowHistory(!showHistory)} style={{ width: "100%", padding: "12px", background: "transparent", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, color: "#6a6a8a", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
          {L.history} {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showHistory && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>${e.cost.toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: "#5a5a7a" }}>{formatDate(e.date, lang)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#5a5a7a" }}>{e.litres.toFixed(2)} L · ${(e.ppl / 100).toFixed(3)}/L{e.station ? ` · ${e.station}` : ""}</div>
                </div>
                <button onClick={() => handleDelete(e.id)} style={{ background: "none", border: "none", color: "#3a3a5a", cursor: "pointer", padding: 6, borderRadius: 6, transition: "color 0.2s" }} onMouseEnter={ev => ev.currentTarget.style.color = "#ef5350"} onMouseLeave={ev => ev.currentTarget.style.color = "#3a3a5a"}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "#3a3a5a", marginTop: 20 }}>{L.savedNote}</p>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input:focus { border-color: rgba(79, 195, 247, 0.3) !important; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>
    </div>
  );
}
