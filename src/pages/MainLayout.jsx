// src/pages/MainLayout.jsx
import { useEffect, useRef, useState } from "react"
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import { doc, updateDoc, serverTimestamp, collection, onSnapshot, getDoc } from "firebase/firestore"
import ChatPage from "./ChatPage"
import EquipmentPage from "./EquipmentPage"
import MembersPage from "./MembersPage"
import ProfilePage from "./ProfilePage"
import AdminPage from "./AdminPage"
import MeetingsPage from "./MeetingsPage"
import SettingsPage from "./SettingsPage"

const VERSION = import.meta.env.VITE_VERSION 
const TOAST_VISIBLE_MS = 7000
const TOAST_FADE_MS = 450

const NAV = [
  { path:"/chat",     icon:"💬", label:"Chat" },
  { path:"/kalusto",  icon:"🎒", label:"Kalusto" },
  { path:"/johtajat",   icon:"👥", label:"Johtajat" },
  { path:"/kokousvuorot", icon:"📅", label:"Kokousvuorot" },
  { path:"/asetukset",    icon:"⚙️", label:"Asetukset" },
]

const PAGE_LABELS = {
  "/chat":      "Chat",
  "/kalusto":  "Kalusto",
  "/johtajat": "Johtajat",
  "/profiili": "Profiili",
  "/hallinta":     "Hallinta",
  "/kokousvuorot": "Kokousvuorot",
  "/asetukset":    "Asetukset",
}

const THEMES = {
  dark: {
    "--bg":       "#0e1117",
    "--bg2":      "#161b27",
    "--bg3":      "#1e2535",
    "--text":     "#d7deea",
    "--text2":    "#a7b2c8",
    "--text3":    "#74809a",
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
}

// Aseta otsikko myös kirjautumissivulle
if (typeof document !== "undefined") {
  document.title = "Maahiset-portaali"
}

export default function MainLayout() {
  const { user, profile, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [allUsers, setAllUsers] = useState([])
  const [toasts, setToasts]         = useState([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showTerms, setShowTerms]   = useState(null) // "terms" | "privacy"
  const [inviteEmail, setInviteEmail] = useState("")
  const [chatHasBadge, setChatHasBadge] = useState(localStorage.getItem("chatAlert") === "1")
  const [hasShownUnreadToast, setHasShownUnreadToast] = useState(false)
  const toastTimersRef = useRef({})

  useEffect(() => {
    if (!user) return
    const ref = doc(db, "users", user.uid)
    updateDoc(ref, { online:true, lastSeen:serverTimestamp() })
    const handleUnload = () => updateDoc(ref, { online:false, lastSeen:serverTimestamp() })
    window.addEventListener("beforeunload", handleUnload)

  return () => window.removeEventListener("beforeunload", handleUnload)
  }, [user])

  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap =>
      setAllUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => isAdmin || !u.isDebug))
    )
  }, [isAdmin])

  useEffect(() => {
    const pageLabel = location.pathname.startsWith("/chat")
      ? "Chat"
      : (PAGE_LABELS[location.pathname] || "Portaali")
    document.title = `${pageLabel} - Maahiset-portaali`
  }, [location.pathname])

  useEffect(() => {
    const applyFromStorage = () => {
      const saved = localStorage.getItem("theme") || "dark"
      applyTheme(saved)
    }

    applyFromStorage()

    const onThemeChanged = () => applyFromStorage()
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onMediaChange = () => {
      const saved = localStorage.getItem("theme") || "dark"
      if (saved === "auto") applyTheme("auto")
    }

    window.addEventListener("themeChanged", onThemeChanged)
    if (media.addEventListener) media.addEventListener("change", onMediaChange)
    else media.addListener(onMediaChange)

    return () => {
      window.removeEventListener("themeChanged", onThemeChanged)
      if (media.removeEventListener) media.removeEventListener("change", onMediaChange)
      else media.removeListener(onMediaChange)
    }
  }, [])

  useEffect(() => {
    if (user && profile?.displayName) {
      pushToast(`Tervetuloa, ${profile.displayName.split(" ")[0]}! 👋`, "success")

      const unread = Number(localStorage.getItem("chatUnreadTotal") || "0") || 0
      if (unread > 0 && !hasShownUnreadToast) {
        const label = unread === 1 ? "lukematon viesti" : "lukematonta viestiä"
        pushToast(`Sinulla on ${unread} ${label}`, "info")
        setHasShownUnreadToast(true)
      }
    }
  }, [user?.uid, profile?.displayName])

  useEffect(() => {
    setHasShownUnreadToast(false)
  }, [user?.uid])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has("_refresh")) return

    pushToast(`Sivusto päivitetty versiolle ${VERSION} ✓`, "success")
    url.searchParams.delete("_refresh")
    window.history.replaceState({}, "", url.toString())
  }, [])

  useEffect(() => {
    const syncBadge = () => {
      setChatHasBadge(localStorage.getItem("chatAlert") === "1")
    }

    const onBadgeChange = (e) => {
      const unread = Number(e?.detail?.totalUnread || 0)
      if (user && unread > 0 && !hasShownUnreadToast) {
        const label = unread === 1 ? "lukematon viesti" : "lukematonta viestiä"
        pushToast(`Sinulla on ${unread} ${label} 💬`, "info")
        setHasShownUnreadToast(true)
      }

      if (typeof e?.detail?.hasChatAlert === "boolean") {
        setChatHasBadge(e.detail.hasChatAlert)
      } else {
        syncBadge()
      }
    }

    window.addEventListener("chatBadgesChanged", onBadgeChange)
    window.addEventListener("storage", syncBadge)
    syncBadge()

    return () => {
      window.removeEventListener("chatBadgesChanged", onBadgeChange)
      window.removeEventListener("storage", syncBadge)
    }
  }, [user, hasShownUnreadToast])

  function scheduleToastRemoval(id) {
    const current = toastTimersRef.current[id]
    if (current?.closeTimer) clearTimeout(current.closeTimer)
    if (current?.removeTimer) clearTimeout(current.removeTimer)

    const closeTimer = setTimeout(() => {
      setToasts(prev => prev.map(t => (t.id === id ? { ...t, closing: true } : t)))
    }, TOAST_VISIBLE_MS)

    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      delete toastTimersRef.current[id]
    }, TOAST_VISIBLE_MS + TOAST_FADE_MS)

    toastTimersRef.current[id] = { closeTimer, removeTimer }
  }

  function pushToast(msg, type="success") {
    setToasts(prev => {
      const existing = prev.find(t => t.msg === msg && t.type === type && !t.closing)
      if (existing) {
        const next = prev.map(t => (t.id === existing.id ? { ...t, count: (t.count || 1) + 1 } : t))
        queueMicrotask(() => scheduleToastRemoval(existing.id))
        return next
      }

      const id = Date.now() + Math.random()
      const next = [...prev, { id, msg, type, count: 1, closing: false }]
      queueMicrotask(() => scheduleToastRemoval(id))
      return next
    })
  }

  useEffect(() => {
    window.__pushToast = pushToast
    return () => {
      delete window.__pushToast
      Object.values(toastTimersRef.current).forEach(t => {
        clearTimeout(t.closeTimer)
        clearTimeout(t.removeTimer)
      })
      toastTimersRef.current = {}
    }
  }, [])

  async function sendQuickInvite() {
    if (!inviteEmail.trim()) return
    const { addDoc, collection, serverTimestamp: st } = await import("firebase/firestore")
    await addDoc(collection(db, "invites"), {
      email: inviteEmail.trim().toLowerCase(), role:"johtaja",
      invitedBy: user.uid, invitedByName: profile?.displayName,
      used: false, createdAt: st(),
    })
    setInviteEmail("")
    setShowInviteModal(false)
    pushToast("Kutsu lähetetty! ✓", "success")
  }

  async function handleLogout() {
    pushToast("Kirjauduttu ulos — nähdään pian! 🙌", "info")
    setTimeout(() => logout(), 1200)
  }

  const onlineCount = allUsers.filter(u => u.online).length
  const totalCount  = allUsers.length

  function isActive(path) {
    if (path === "/chat") return location.pathname.startsWith("/chat")
    return location.pathname.startsWith(path)
  }

  const statusColor = profile?.status==="away"?"#f59e0b"
    : profile?.status==="busy"?"#ef4444"
    : profile?.status==="offline"?"var(--text3)"
    : "#22c55e"

  const bottomBtn = { display:"flex", alignItems:"center", gap:9, padding:"7px 10px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:500, fontFamily:"system-ui", border:"none", background:"var(--bg3)", color:"var(--text2)", width:"100%", textAlign:"left" }

  return (
    <div style={{ display:"flex", height:"100vh", background:"var(--bg)", color:"var(--text)", fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>

      {/* Sidebar */}
      <div style={{ width:220, background:"var(--bg2)", borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", flexShrink:0 }}>

        {/* Logo */}
        <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid var(--border)" }}>
          <div
            onClick={() => navigate("/chat")}
            title="Siirry chattiin"
            style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}
          >
            <div style={{ width:36, height:36, background:"var(--bg3)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden", border:"1px solid var(--border)" }}>
              <img src="/favicon.png" alt="logo" style={{ width:28, height:28, objectFit:"contain" }}
                onError={e => { e.target.style.display="none"; e.target.parentNode.innerHTML="🏕️" }} />
            </div>
            <div>
              <div style={{ fontWeight:600, fontSize:14 }}>Maahiset</div>
              <div style={{ fontSize:10, color:"var(--text3)" }}>Partio-portaali</div>
            </div>
          </div>
        </div>

        {/* Navigaatio */}
        <nav style={{ flex:1, padding:"10px 8px", overflowY:"auto" }}>
          {NAV.map(n => (
            <div key={n.path} onClick={() => navigate(n.path)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, cursor:"pointer", marginBottom:2, fontSize:13, fontWeight:500,
                background: isActive(n.path) ? "rgba(79,126,247,0.15)" : "transparent",
                color:      isActive(n.path) ? "#4f7ef7" : "var(--text2)" }}>
              <span style={{ fontSize:16 }}>{n.icon}</span>
              <span style={{ flex:1 }}>{n.label}</span>
              {n.path === "/chat" && chatHasBadge && (
                <span style={{ width:9, height:9, borderRadius:"50%", background:"#ef4444", boxShadow:"0 0 0 2px rgba(239,68,68,0.2)" }} />
              )}
            </div>
          ))}
          {isAdmin && (
            <div onClick={() => navigate("/hallinta")}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, cursor:"pointer", marginBottom:2, fontSize:13, fontWeight:500,
                background: isActive("/hallinta") ? "rgba(79,126,247,0.15)" : "transparent",
                color:      isActive("/hallinta") ? "#4f7ef7" : "var(--text2)" }}>
              <span style={{ fontSize:16 }}>👮</span>Hallinta
            </div>
          )}
        </nav>

        {/* Alareuna: profiili + laskuri + kirjaudu ulos */}
        <div style={{ borderTop:"1px solid var(--border)", padding:"8px 8px 8px" }}>

          {/* Profiilikortti */}
          <div onClick={() => navigate("/profiili")}
            style={{ display:"flex", alignItems:"center", gap:9, padding:"10px 10px", borderRadius:9, cursor:"pointer", marginBottom:6,
              background: isActive("/profiili") ? "rgba(79,126,247,0.15)" : "var(--bg3)",
              border: isActive("/profiili") ? "1px solid rgba(79,126,247,0.3)" : "1px solid transparent" }}>
            <div style={{ position:"relative", flexShrink:0 }}>
              {profile?.photoURL
                ? <img src={profile.photoURL} style={{ width:32, height:32, borderRadius:"50%", objectFit:"cover" }} alt="" />
                : <div style={{ width:32, height:32, borderRadius:"50%", background:"#4f7ef7", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:600 }}>
                    {(profile?.displayName||"?")[0]}
                  </div>
              }
              <div style={{ position:"absolute", bottom:0, right:0, width:9, height:9, borderRadius:"50%", border:"2px solid var(--bg3)", background:statusColor }} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                color: isActive("/profiili") ? "#4f7ef7" : "var(--text)" }}>
                {profile?.displayName||"Johtaja"}
              </div>
              <div style={{ fontSize:10, color:"var(--text3)" }}>{profile?.role||"johtaja"}</div>
            </div>
            <span style={{ fontSize:10, color: isActive("/profiili") ? "#4f7ef7" : "var(--text3)" }}>✏️</span>
          </div>

          {/* Paikalla-laskuri */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", background:"var(--bg3)", borderRadius:8, marginBottom:6 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", flexShrink:0 }} />
            <span style={{ fontSize:12, color:"#22c55e", fontWeight:600 }}>{onlineCount}</span>
            <span style={{ fontSize:11, color:"var(--text3)" }}>paikalla / {totalCount} johtajaa</span>
          </div>

            {/* Kirjaudu ulos */}
          <button onClick={handleLogout} style={{ ...bottomBtn, color:"#f87171" }}>
            <span>🚪</span><span>Kirjaudu ulos</span>
          </button>
        </div>
      </div>

      {/* Sisältöalue */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
              <Routes>
                <Route path="/"         element={<Navigate to="/chat" replace />} />
                <Route path="/chat"     element={<ChatPage />} />
                <Route path="/chat/:chatType" element={<ChatPage />} />
                <Route path="/chat/:chatType/:chatTarget" element={<ChatPage />} />
                <Route path="/kalusto"  element={<EquipmentPage />} />
                <Route path="/johtajat" element={<MembersPage />} />
                <Route path="/profiili" element={<ProfilePage onSaved={() => window.__pushToast?.("Profiili tallennettu! ✓", "success")} />} />
                <Route path="/kokousvuorot" element={<MeetingsPage />} />
                <Route path="/asetukset" element={<SettingsPage />} />
                <Route path="/hallinta" element={<AdminPage />} />
              </Routes>
            </div>

      {/* Toast-ilmoitukset — keskelle alhaalle */}
      <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", display:"flex", flexDirection:"column", alignItems:"center", gap:8, zIndex:400, pointerEvents:"none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:10,
            padding:"10px 20px", fontSize:13, color:"var(--text)", whiteSpace:"nowrap",
            boxShadow:"0 8px 24px rgba(0,0,0,0.5)", pointerEvents:"all",
            borderBottom: t.type==="success"?"3px solid #22c55e":t.type==="error"?"3px solid #ef4444":"3px solid #4f7ef7",
            animation: t.closing ? `toastOut ${TOAST_FADE_MS}ms ease forwards` : "toastIn 0.25s ease",
            display:"flex", alignItems:"center", gap:8,
          }}>
            <span>{t.msg}</span>
            {t.count > 1 && (
              <span style={{fontSize:11,color:"var(--text2)",background:"rgba(255,255,255,0.08)",padding:"1px 6px",borderRadius:10}}>
                x{t.count}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Kutsu-modal */}
      {showInviteModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:400 }}
          onClick={() => setShowInviteModal(false)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:380, maxWidth:"90vw" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin:"0 0 6px", fontSize:16 }}>👤＋ Kutsu johtaja</h3>
            <p style={{ fontSize:12, color:"var(--text3)", margin:"0 0 14px", lineHeight:1.5 }}>@maahiset.net-osoitteet pääsevät sisään automaattisesti — kutsu on muille.</p>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} type="email"
              placeholder="johtaja@gmail.com" onKeyDown={e => e.key==="Enter" && sendQuickInvite()}
              style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:14, fontFamily:"system-ui", outline:"none", boxSizing:"border-box", marginBottom:12 }} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setShowInviteModal(false)}
                style={{ background:"transparent", border:"1px solid var(--border2)", borderRadius:8, color:"var(--text2)", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
                Peruuta
              </button>
              <button onClick={sendQuickInvite}
                style={{ background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }}>
                Lähetä kutsu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Käyttöehdot / Tietosuoja -modal */}
      {showTerms && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:400 }}
          onClick={() => setShowTerms(null)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:28, width:480, maxWidth:"90vw", maxHeight:"80vh", overflowY:"auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h3 style={{ margin:0, fontSize:16 }}>{showTerms==="terms" ? "📋 Käyttöehdot" : "🔐 Tietosuojakäytäntö"}</h3>
              <button onClick={() => setShowTerms(null)}
                style={{ background:"transparent", border:"none", color:"var(--text2)", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            {showTerms === "terms" ? (
              <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.8 }}>
                <p><strong style={{ color:"var(--text)" }}>1. Sovelluksen käyttö</strong><br/>Partio-portaali on tarkoitettu ainoastaan Maahiset-lippukunnan johtajien sisäiseen käyttöön. Pääsy vaatii hyväksynnän.</p>
                <p><strong style={{ color:"var(--text)" }}>2. Käyttäytyminen</strong><br/>Käyttäjät sitoutuvat asialliseen käytökseen. Häirintä, loukkaukset tai asiattomat viestit voivat johtaa käyttöoikeuden poistoon.</p>
                <p><strong style={{ color:"var(--text)" }}>3. Sisältö</strong><br/>Käyttäjä on vastuussa lähettämästään sisällöstä. Laitonta tai haitallista sisältöä ei sallita.</p>
                <p><strong style={{ color:"var(--text)" }}>4. Muutokset</strong><br/>Lippukunnanjohtaja voi päivittää ehtoja tarpeen mukaan. Käytön jatkaminen tarkoittaa ehtojen hyväksymistä.</p>
                <p style={{ color:"var(--text3)", fontSize:11 }}>Viimeksi päivitetty: {new Date().toLocaleDateString("fi-FI")}</p>
              </div>
            ) : (
              <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.8 }}>
                <p><strong style={{ color:"var(--text)" }}>Kerättävät tiedot</strong><br/>Tallennamme Google-tilisi nimen, sähköpostin ja profiilikuvan sekä sovellukseen lisäämäsi tiedot (titteli, bio, puhelinnumero). Lisäksi laitteen yleisiä tietoja.</p>
                <p><strong style={{ color:"var(--text)" }}>Tietojen käyttö</strong><br/>Tietoja käytetään vain sovelluksen toimintaan. Tietoja ei myydä tai luovuteta ulkopuolisille.</p>
                <p><strong style={{ color:"var(--text)" }}>Säilytys</strong><br/>Tiedot tallennetaan Google Firebase -palveluun EU:n alueella. Voit poistaa tilisi ja tietosi koska tahansa profiiliasetuksista.</p>
                <p><strong style={{ color:"var(--text)" }}>Evästeet</strong><br/>Sovellus käyttää vain kirjautumiseen tarvittavia teknisiä evästeitä.</p>
                <p style={{ color:"var(--text3)", fontSize:11 }}>Viimeksi päivitetty: {new Date().toLocaleDateString("fi-FI")}</p>
              </div>
            )}
            <button onClick={() => setShowTerms(null)}
              style={{ marginTop:16, width:"100%", padding:"9px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"system-ui" }}>
              Sulje
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes toastIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } } @keyframes toastOut { from { opacity:1; transform:translateY(0) } to { opacity:0; transform:translateY(8px) } }`}</style>
    </div>
  )
}