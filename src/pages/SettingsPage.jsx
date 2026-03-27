// src/pages/SettingsPage.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";

const VERSION = import.meta.env.VITE_VERSION;
const authorName = import.meta.env.VITE_AUTHOR_NAME;
const authorLink = import.meta.env.VITE_AUTHOR_LINK;
const LAST_PROMPTED_UPDATE_KEY = import.meta.env.VITE_LAST_PROMPTED_UPDATE_KEY;

// Teema-asetukset CSS-muuttujilla
const THEMES = {
  dark: {
    "--bg":       "#0e1117",
    "--bg2":      "#161b27",
    "--bg3":      "#1e2535",
    "--text":     "#e8eaf0",
    "--text2":    "#8b92a8",
    "--text3":    "#545d75",
    "--border":   "rgba(255,255,255,0.07)",
    "--border2":  "rgba(255,255,255,0.12)",
  },
  light: {
    "--bg":       "#f5f6fa",
    "--bg2":      "#ffffff",
    "--bg3":      "#eef0f5",
    "--text":     "#1a1d27",
    "--text2":    "#4a5168",
    "--text3":    "#8b92a8",
    "--border":   "rgba(0,0,0,0.08)",
    "--border2":  "rgba(0,0,0,0.14)",
  }
}

function applyTheme(t) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const resolved = t === "auto" ? (prefersDark ? "dark" : "light") : t
  const vars = THEMES[resolved] || THEMES.dark
  const root = document.documentElement
  Object.entries(vars).forEach(([k,v]) => root.style.setProperty(k, v))
  document.body.style.background = vars["--bg"]
  document.body.style.color      = vars["--text"]
  localStorage.setItem("theme", t)
}

function parseVersion(v) {
  if (!v) return [0, 0, 0]
  return String(v)
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 3)
    .map(n => Number(n) || 0)
}

function compareVersions(a, b) {
  const aa = parseVersion(a)
  const bb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (aa[i] > bb[i]) return 1
    if (aa[i] < bb[i]) return -1
  }
  return 0
}

async function fetchRemoteChangelog() {
  const candidates = ["/changelog.json"]
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) continue
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) return data
    } catch {}
  }
  return null
}

export default function SettingsPage() {
  const { profile } = useAuth()
  const currentVersion = VERSION || "0.0.0"
  const [theme, setTheme]               = useState(localStorage.getItem("theme") || "dark")
  const [condensedChat, setCondensedChat] = useState(localStorage.getItem("condensedChat") === "true")
  const [chatOrder, setChatOrder]       = useState(localStorage.getItem("chatOrder") || "default")
  const [showChangelog, setShowChangelog] = useState(false)
  const [checking, setChecking]         = useState(false)
  const [changelogData, setChangelogData] = useState([])
  const [latestRemoteVersion, setLatestRemoteVersion] = useState(null)

  useEffect(() => {
    fetchRemoteChangelog().then(remote => {
      if (remote) setChangelogData(remote)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    applyTheme(theme)
    const onThemeChange = (e) => {
      const next = e?.detail?.theme || localStorage.getItem("theme") || "dark"
      setTheme(next)
      applyTheme(next)
    }
    window.addEventListener("themeChanged", onThemeChange)
    return () => window.removeEventListener("themeChanged", onThemeChange)
  }, [theme])

  function handleTheme(t) {
    setTheme(t)
    applyTheme(t)
    window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme: t } }))
  }

  function saveChatSettings() {
    localStorage.setItem("condensedChat", String(condensedChat))
    localStorage.setItem("chatOrder", String(chatOrder))
    // Lähetä globaali event muille komponenteille
    window.dispatchEvent(new CustomEvent("chatSettingsChanged", { detail: { condensedChat, chatOrder } }))
    window.__pushToast?.("Asetukset tallennettu ✓", "success")
  }

  async function checkForUpdates() {
    setChecking(true)
    try {
      const remote = await fetchRemoteChangelog()
      const source = remote || changelogData
      if (remote) setChangelogData(remote)

      const latest = source?.[0]?.version || currentVersion
      setLatestRemoteVersion(latest)
      const alreadyPrompted = localStorage.getItem(LAST_PROMPTED_UPDATE_KEY) === String(latest)

      if (compareVersions(latest, currentVersion) > 0) {
        if (!alreadyPrompted) {
          localStorage.setItem(LAST_PROMPTED_UPDATE_KEY, String(latest))
          window.__pushToast?.(`Uusi versio ${latest} saatavilla - päivitä sivu`, "info")
          const shouldReload = window.confirm(`Uusi versio (${latest}) on saatavilla. Päivitetäänkö sivu nyt?`)
          if (shouldReload) {
            const url = new URL(window.location.href)
            url.searchParams.set("_refresh", String(Date.now()))
            window.location.href = url.toString()
            return
          }
        } else {
          window.__pushToast?.(`Uusi versio ${latest} on edelleen saatavilla`, "info")
        }
      } else {
        localStorage.removeItem(LAST_PROMPTED_UPDATE_KEY)
        window.__pushToast?.(`Versio ${currentVersion} - ajantasainen ✓`, "success")
      }
      setShowChangelog(true)
    } catch {
      window.__pushToast?.("Päivitystarkistus epäonnistui", "error")
    } finally {
      setChecking(false)
    }
  }

  const themeBtn = (val, label) => (
    <button onClick={() => handleTheme(val)}
      style={{ padding:"8px 16px", borderRadius:8, cursor:"pointer", fontFamily:"system-ui", fontSize:13,
        border:      theme===val ? "1px solid #4f7ef7" : "1px solid rgba(255,255,255,0.1)",
        background:  theme===val ? "rgba(79,126,247,0.15)" : "transparent",
        color:       theme===val ? "#4f7ef7" : "#8b92a8" }}>
      {label}
    </button>
  )

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, fontFamily:"system-ui", color:"var(--text, #e8eaf0)" }}>
      <div style={{ maxWidth:600, margin:"0 auto" }}>
        <h2 style={{ margin:"0 0 24px", fontSize:18, fontWeight:600 }}>⚙️ Asetukset</h2>

        {/* Ulkoasu */}
        <Section title="🎨 Ulkoasu">
          <label style={lbl}>Sivuston teema</label>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {themeBtn("dark",  "🌙 Tumma")}
            {themeBtn("light", "☀️ Vaalea")}
            {themeBtn("auto",  "💻 Automaattinen")}
          </div>
          <p style={{ fontSize:12, color:"#545d75", margin:"8px 0 0", lineHeight:1.5 }}>
            Automaattinen seuraa tietokoneen asetuksia.
          </p>
        </Section>

        {/* Chat-asetukset */}
        <Section title="💬 Keskusteluasetukset">
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
              <input type="checkbox" id="condensed" checked={condensedChat}
                onChange={e => setCondensedChat(e.target.checked)}
                style={{ marginTop:3, cursor:"pointer", accentColor:"#4f7ef7" }} />
              <label htmlFor="condensed" style={{ fontSize:13, color:"#8b92a8", cursor:"pointer", lineHeight:1.5 }}>
                <strong style={{ color:"var(--text, #e8eaf0)" }}>Tiivistetty näkymä</strong><br/>
                Piilottaa profiilikuvat viesteistä ja tiivistää rivivälin
              </label>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <label style={{ fontSize:13, color:"#8b92a8", flexShrink:0 }}>Kanavien järjestys:</label>
              <select value={chatOrder} onChange={e => setChatOrder(e.target.value)}
                style={{ background:"#1e2535", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, padding:"6px 10px", color:"var(--text, #e8eaf0)", fontSize:13, fontFamily:"system-ui", outline:"none", cursor:"pointer" }}>
                <option value="default">Oletus (aakkosjärjestys)</option>
                <option value="activity">Aktiivisuuden mukaan</option>
                <option value="unread">Lukemattomat ensin</option>
              </select>
            </div>
          </div>
          <button onClick={saveChatSettings}
            style={{ marginTop:14, padding:"8px 18px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }}>
            Tallenna asetukset
          </button>
        </Section>

        {/* Sovellustiedot */}
        <Section title="ℹ️ Sovellus">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
            <div>
              <div style={{ fontSize:13, color:"#8b92a8" }}>
                Versio <strong style={{ color:"var(--text, #e8eaf0)" }}>{currentVersion}</strong>
              </div>
                <div style={{ fontSize:12, color:"#545d75", marginTop:3 }}>
                Sivuston tekijä:{" "}
                <a href={authorLink} target="_blank" rel="noopener noreferrer">
                  {authorName}
                </a>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowChangelog(true)}
                style={{ padding:"7px 14px", background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#8b92a8", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }}>
                📋 Päivityshistoria
              </button>
              <button onClick={checkForUpdates} disabled={checking}
                style={{ padding:"7px 14px", background:"rgba(79,126,247,0.1)", border:"1px solid rgba(79,126,247,0.2)", borderRadius:8, color:"#4f7ef7", cursor:"pointer", fontSize:12, fontFamily:"system-ui", opacity:checking?0.7:1 }}>
                {checking ? "Tarkistetaan..." : "🔄 Tarkista päivitykset"}
              </button>
            </div>
          </div>
          {latestRemoteVersion && compareVersions(latestRemoteVersion, currentVersion) > 0 && (
            <div style={{ marginTop:12, padding:"10px 12px", background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
              <span style={{ fontSize:12, color:"#f59e0b" }}>Uusi versio {latestRemoteVersion} on saatavilla.</span>
              <button
                onClick={() => {
                  localStorage.setItem(LAST_PROMPTED_UPDATE_KEY, String(latestRemoteVersion))
                  const url = new URL(window.location.href)
                  url.searchParams.set("_refresh", String(Date.now()))
                  window.location.href = url.toString()
                }}
                style={{ padding:"6px 10px", borderRadius:6, border:"1px solid rgba(245,158,11,0.35)", background:"rgba(245,158,11,0.16)", color:"#f59e0b", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }}
              >
                Päivitä sivu
              </button>
            </div>
          )}
        </Section>
      </div>

      {/* Päivityshistoria-modal */}
      {showChangelog && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
          onClick={() => setShowChangelog(false)}>
          <div style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:28, width:500, maxWidth:"90vw", maxHeight:"80vh", overflowY:"auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h3 style={{ margin:0, fontSize:16 }}>📋 Päivityshistoria</h3>
              <button onClick={() => setShowChangelog(false)}
                style={{ background:"transparent", border:"none", color:"#8b92a8", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            {changelogData.map(entry => (
              <div key={entry.version} style={{ marginBottom:24 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                  <span style={{ fontWeight:600, fontSize:14, color:"#e8eaf0" }}>v{entry.version}</span>
                  {compareVersions(entry.version, currentVersion) === 0 && (
                    <span style={{ fontSize:10, background:"rgba(34,197,94,0.15)", color:"#22c55e", border:"1px solid rgba(34,197,94,0.3)", padding:"1px 7px", borderRadius:10 }}>Nykyinen</span>
                  )}
                  <span style={{ fontSize:12, color:"#545d75" }}>{entry.date}</span>
                </div>
                <ul style={{ margin:0, paddingLeft:18, display:"flex", flexDirection:"column", gap:5 }}>
                  {entry.items.map((item, i) => (
                    <li key={i} style={{ fontSize:13, color:"#8b92a8", lineHeight:1.5 }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            <button onClick={() => setShowChangelog(false)}
              style={{ width:"100%", padding:"9px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"system-ui" }}>
              Sulje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:20, marginBottom:16 }}>
      <div style={{ fontSize:14, fontWeight:600, marginBottom:16, color:"var(--text, #e8eaf0)" }}>{title}</div>
      {children}
    </div>
  )
}

const lbl = { display:"block", fontSize:12, fontWeight:500, color:"#8b92a8", marginBottom:8 }