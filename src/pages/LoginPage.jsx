// src/pages/LoginPage.jsx
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import LoadingScreen from "./LoadingScreen"
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth"
import { collection, query, where, getDocs } from "firebase/firestore"
import { auth, db } from "../services/firebase"

const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN

const THEMES = {
  dark: {
    "--bg": "#0e1117",
    "--bg2": "#161b27",
    "--bg3": "#1e2535",
    "--text": "#d7deea",
    "--text2": "#a7b2c8",
    "--text3": "#74809a",
    "--border": "rgba(255,255,255,0.07)",
    "--border2": "rgba(255,255,255,0.12)",
  },
  light: {
    "--bg": "#f5f6fa",
    "--bg2": "#ffffff",
    "--bg3": "#eef0f5",
    "--text": "#1a1d27",
    "--text2": "#4a5168",
    "--text3": "#8b92a8",
    "--border": "rgba(0,0,0,0.08)",
    "--border2": "rgba(0,0,0,0.14)",
  },
}

function applySystemTheme() {
  if (typeof window === "undefined") return
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const vars = prefersDark ? THEMES.dark : THEMES.light
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  document.body.style.background = vars["--bg"]
  document.body.style.color = vars["--text"]
}

function TermsModal({ type, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:500 }}
      onClick={onClose}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:28, width:460, maxWidth:"90vw", maxHeight:"75vh", overflowY:"auto", fontFamily:"system-ui" }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin:"0 0 16px", fontSize:16, color:"var(--text)" }}>
          {type === "terms" ? "📋 Käyttöehdot" : "🔐 Tietosuojakäytäntö"}
        </h3>
        {type === "terms" ? (
          <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.8 }}>
            <p><strong style={{ color:"var(--text)" }}>1. Sovelluksen käyttö</strong><br/>Partio-portaali on tarkoitettu Maahiset-lippukunnan johtajien sisäiseen käyttöön.</p>
            <p><strong style={{ color:"var(--text)" }}>2. Käyttäytyminen</strong><br/>Käyttäjät sitoutuvat asialliseen käytökseen. Häirintä tai asiattomat viestit voivat johtaa käyttöoikeuden poistoon.</p>
            <p><strong style={{ color:"var(--text)" }}>3. Sisältö</strong><br/>Käyttäjä vastaa lähettämästään sisällöstä. Laitonta sisältöä ei sallita.</p>
          </div>
        ) : (
          <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.8 }}>
            <p><strong style={{ color:"var(--text)" }}>Kerättävät tiedot</strong><br/>Tallennamme Google-tilisi nimen, sähköpostin ja profiilikuvan. Lisäksi laitteen yleisiä tietoja.</p>
            <p><strong style={{ color:"var(--text)" }}>Tietojen käyttö</strong><br/>Tietoja käytetään vain sovelluksen toimintaan. Tietoja ei myydä ulkopuolisille.</p>
            <p><strong style={{ color:"var(--text)" }}>Oikeutesi</strong><br/>Voit poistaa tilisi ja tietosi koska tahansa profiiliasetuksista.</p>
          </div>
        )}
        <button onClick={onClose}
          style={{ marginTop:16, width:"100%", padding:"9px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"system-ui" }}>
          Sulje
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { user, loading, error: authError, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]               = useState("google")
  const [mode, setMode]             = useState("login")
  const [email, setEmail]           = useState("")
  const [password, setPassword]     = useState("")
  const [error, setError]           = useState("")
  const [info, setInfo]             = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(null)

  useEffect(() => {
    applySystemTheme()
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onMediaChange = () => applySystemTheme()
    if (media.addEventListener) media.addEventListener("change", onMediaChange)
    else media.addListener(onMediaChange)

    return () => {
      if (media.removeEventListener) media.removeEventListener("change", onMediaChange)
      else media.removeListener(onMediaChange)
    }
  }, [])

  if (user) { navigate("/"); return null }

  // Aseta selaimen otsikko kirjautumissivulle
  if (typeof document !== "undefined") {
    document.title = "Kirjaudu - Maahiset-portaali"
  }

  if (loading) return <LoadingScreen message={tab === "google" ? "Kirjaudutaan Google-tilillä..." : "Kirjaudutaan sähköpostilla..."} />

  function validateEmail(e) {
    return e.toLowerCase().endsWith("@" + ALLOWED_DOMAIN)
  }

  async function handleEmailAuth(ev) {
    ev.preventDefault()
    setError(""); setInfo("")
    if (mode === "login" && !validateEmail(email)) {
      setError(`Vain @${ALLOWED_DOMAIN}-osoitteet sallittu.`)
      return
    }
    if (mode === "register" && !termsAccepted) {
      setError("Hyväksy käyttöehdot ja tietosuojakäytäntö jatkaaksesi.")
      return
    }
    setSubmitting(true)
    try {
      if (mode === "register") {
        if (password.length < 8) { setError("Salasanan tulee olla vähintään 8 merkkiä."); setSubmitting(false); return }
        // Tarkista debug-kutsu
        const invSnap = await getDocs(query(collection(db, "invites"), where("email", "==", email.toLowerCase()), where("used", "==", false), where("isDebug", "==", true)));
        if (invSnap.empty) {
          setError("Rekisteröinti sallittu vain maahiset.net osoitteilla ja kutsutuille.");
          setSubmitting(false);
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      const msgs = {
        "auth/user-not-found":       "Käyttäjää ei löydy.",
        "auth/wrong-password":       "Väärä salasana.",
        "auth/email-already-in-use": "Sähköposti on jo käytössä.",
        "auth/invalid-credential":   "Väärä sähköposti tai salasana.",
        "auth/too-many-requests":    "Liian monta yritystä. Kokeile hetken kuluttua.",
      }
      setError(msgs[err.code] || err.message)
    }
    setSubmitting(false)
  }

  async function handleReset(ev) {
    ev.preventDefault()
    setError(""); setInfo("")
    if (!validateEmail(email)) { setError(`Vain @${ALLOWED_DOMAIN}-osoitteet sallittu.`); return }
    setSubmitting(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setInfo("Salasanan palautuslinkki lähetetty sähköpostiin!")
    } catch (err) {
      setError("Virhe: " + err.message)
    }
    setSubmitting(false)
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}>
          <div style={{ width:64, height:64, background:"var(--bg3)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", border:"1px solid var(--border)" }}>
            <img src="/favicon.png" alt="logo" style={{ width:48, height:48, objectFit:"contain" }}
              onError={e => { e.target.style.display="none"; e.target.parentNode.innerHTML="🏕️" }} />
          </div>
        </div>
        <h1 style={{ fontSize:22, color:"var(--text)", fontWeight:600, textAlign:"center", margin:"0 0 4px" }}>Partio-portaali</h1>
        <p style={{ fontSize:13, color:"var(--text2)", textAlign:"center", margin:"0 0 24px" }}>Maahiset RY | Johtajien sovellus</p>

        {/* Välilehdet */}
        <div style={{ display:"flex", gap:0, marginBottom:20, background:"var(--bg3)", borderRadius:10, padding:4 }}>
          <button onClick={() => { setTab("google"); setError(""); setInfo("") }}
            style={{ flex:1, padding:"8px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"system-ui", fontSize:13, fontWeight:500, transition:"all 0.15s",
              background: tab==="google" ? "var(--bg2)" : "transparent",
              color:      tab==="google" ? "var(--text)"  : "var(--text2)" }}>
            Google
            {tab === "google" && (
              <span style={{ marginLeft:6, fontSize:10, background:"rgba(79,126,247,0.2)", color:"#4f7ef7", padding:"1px 6px", borderRadius:4 }}>
                Suositellaan
              </span>
            )}
          </button>
          <button onClick={() => { setTab("email"); setError(""); setInfo("") }}
            style={{ flex:1, padding:"8px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"system-ui", fontSize:13, fontWeight:500, transition:"all 0.15s",
              background: tab==="email" ? "var(--bg2)" : "transparent",
              color:      tab==="email" ? "var(--text)"  : "var(--text2)" }}>
            Sähköposti
          </button>
        </div>

        {/* Google */}
        {tab === "google" && (
          <div>
            <button onClick={loginWithGoogle} style={s.googleBtn}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
              </svg>
              Jatka Google-tilillä
            </button>
            <p style={{ fontSize:11, color:"var(--text3)", textAlign:"center", marginTop:14, lineHeight:1.5 }}>
              Kirjaudu <strong style={{ color:"var(--text2)" }}>@{ALLOWED_DOMAIN}</strong> Google-tilillä tai millä tahansa kutsutulla tilillä
            </p>
            {(authError || error) && <div style={s.errBox}>{authError || error}</div>}
          </div>
        )}

        {/* Sähköposti */}
        {tab === "email" && (
          <div>
            {mode === "login" && (
              <div style={{ fontSize:12, color:"var(--text3)", background:"rgba(79,126,247,0.08)", border:"1px solid rgba(79,126,247,0.2)", borderRadius:8, padding:"8px 12px", marginBottom:16, lineHeight:1.5 }}>
                🔒 Vain <strong style={{ color:"#4f7ef7" }}>@{ALLOWED_DOMAIN}</strong> -osoitteet hyväksytään
              </div>
            )}

            {mode !== "reset" && (
              <div style={{ display:"flex", gap:0, marginBottom:16, background:"var(--bg3)", borderRadius:8, padding:3 }}>
                <button onClick={() => { setMode("login"); setError(""); setInfo("") }}
                  style={{ flex:1, padding:"6px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"system-ui", fontSize:12,
                    background: mode==="login" ? "var(--bg2)" : "transparent",
                    color:      mode==="login" ? "var(--text)"  : "var(--text2)" }}>
                  Kirjaudu sisään
                </button>
                <button onClick={() => { setMode("register"); setError(""); setInfo("") }}
                  style={{ flex:1, padding:"6px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"system-ui", fontSize:12,
                    background: mode==="register" ? "var(--bg2)" : "transparent",
                    color:      mode==="register" ? "var(--text)"  : "var(--text2)" }}>
                  Luo tili
                </button>
              </div>
            )}

            <form onSubmit={mode === "reset" ? handleReset : handleEmailAuth}>
              <label style={s.lbl}>Sähköposti{mode === "login" && ` (@${ALLOWED_DOMAIN})`}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder={mode === "register" ? "etunimi.sukunimi@example.com" : `nimi@${ALLOWED_DOMAIN}`} style={s.inp} />

              {mode !== "reset" && (
                <>
                  <label style={s.lbl}>Salasana {mode==="register" && "(min. 8 merkkiä)"}</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="••••••••" style={s.inp} />
                </>
              )}

              {mode === "register" && (
                <div style={{ marginTop:12, display:"flex", alignItems:"flex-start", gap:8 }}>
                  <input type="checkbox" id="terms" checked={termsAccepted}
                    onChange={e => setTermsAccepted(e.target.checked)}
                    style={{ marginTop:3, cursor:"pointer", accentColor:"#4f7ef7" }} />
                  <label htmlFor="terms" style={{ fontSize:12, color:"var(--text2)", lineHeight:1.6, cursor:"pointer" }}>
                    Hyväksyn{" "}
                    <span onClick={e => { e.preventDefault(); setShowTermsModal("terms") }}
                      style={{ color:"#4f7ef7", textDecoration:"underline", cursor:"pointer" }}>
                      käyttöehdot
                    </span>
                    {" "}ja{" "}
                    <span onClick={e => { e.preventDefault(); setShowTermsModal("privacy") }}
                      style={{ color:"#4f7ef7", textDecoration:"underline", cursor:"pointer" }}>
                      tietosuojakäytännön
                    </span>
                  </label>
                </div>
              )}

              {error && <div style={s.errBox}>{error}</div>}
              {info  && <div style={s.infoBox}>{info}</div>}

              <button type="submit" disabled={submitting}
                style={{ width:"100%", padding:"11px", background:"#4f7ef7", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"system-ui", marginTop:12, opacity:submitting?0.7:1 }}>
                {submitting ? "..." : mode==="login" ? "Kirjaudu sisään" : mode==="register" ? "Luo tili" : "Lähetä palautuslinkki"}
              </button>
            </form>

            <div style={{ display:"flex", justifyContent:"center", marginTop:12 }}>
              {mode !== "reset" && (
                <button onClick={() => { setMode("reset"); setError(""); setInfo("") }}
                  style={{ background:"none", border:"none", color:"var(--text3)", fontSize:12, cursor:"pointer", fontFamily:"system-ui" }}>
                  Unohdin salasanan
                </button>
              )}
              {mode === "reset" && (
                <button onClick={() => { setMode("login"); setError(""); setInfo("") }}
                  style={{ background:"none", border:"none", color:"var(--text3)", fontSize:12, cursor:"pointer", fontFamily:"system-ui" }}>
                  ← Takaisin
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showTermsModal && (
        <TermsModal type={showTermsModal} onClose={() => setShowTermsModal(null)} />
      )}
    </div>
  )
}

const s = {
  wrap:      { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)", fontFamily:"system-ui,sans-serif" },
  card:      { background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:16, padding:"32px 28px", width:380, maxWidth:"90vw" },
  googleBtn: { width:"100%", padding:"12px", background:"#fff", color:"#333", border:"none", borderRadius:10, fontSize:14, fontWeight:500, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontFamily:"system-ui" },
  lbl:       { display:"block", fontSize:12, fontWeight:500, color:"var(--text2)", marginBottom:6, marginTop:12 },
  inp:       { width:"100%", background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:14, boxSizing:"border-box", fontFamily:"system-ui", outline:"none" },
  errBox:    { background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:8, padding:"8px 12px", color:"#f87171", fontSize:12, marginTop:10 },
  infoBox:   { background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:8, padding:"8px 12px", color:"#22c55e", fontSize:12, marginTop:10 },
}