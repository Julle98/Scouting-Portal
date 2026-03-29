// src/pages/ProfilePage.jsx
import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db, auth } from "../services/firebase"
import { doc, updateDoc, serverTimestamp, getDoc, addDoc, collection, deleteField } from "firebase/firestore"
import { deleteUser, GoogleAuthProvider, linkWithPopup, EmailAuthProvider, linkWithCredential, updatePassword, reauthenticateWithCredential, reauthenticateWithPopup } from "firebase/auth"
import { Avatar } from "../components/ui/Avatar"
import { linkGoogleDrive, unlinkGoogleDrive, isDriveLinked, getDriveInfo, listDriveFiles } from "../services/googleDriveService"

const STATUS_OPTIONS = [
  { value:"online",  label:"🟢 Paikalla",     color:"#22c55e" },
  { value:"away",    label:"🟡 Poissa",        color:"#f59e0b" },
  { value:"busy",    label:"🔴 Älä häiritse",  color:"#ef4444" },
  { value:"offline", label:"⚫ Offline",       color:"var(--text3)" },
]

export default function ProfilePage({ onSaved }) {
  const { user, profile, logout } = useAuth()
  const [form, setForm]       = useState({ displayName:"", title:"", bio:"", phone:"", status:"online" })
  const [nameError, setNameError] = useState("")
  const [saved, setSaved]     = useState(false)
  const [saving, setSaving]     = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(null)
  const [section, setSection] = useState("profile")
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [curPw, setCurPw]     = useState("")
  const [newPw, setNewPw]     = useState("")
  const [pwMsg, setPwMsg]     = useState("")
  const [pwErr, setPwErr]     = useState("")
  const [linkMsg, setLinkMsg] = useState("")
  const [linkErr, setLinkErr] = useState("")
  const [linkEmailMsg, setLinkEmailMsg] = useState("")
  const [linkEmailErr, setLinkEmailErr] = useState("")
  const [passwordCreate, setPasswordCreate] = useState("")
  const [accountMsg, setAccountMsg] = useState("")
  const [accountErr, setAccountErr] = useState("")
  const [delConfirm, setDelConfirm] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [driveLinked, setDriveLinked] = useState(false)
  const [driveInfo, setDriveInfo] = useState(null)
  const [driveFiles, setDriveFiles] = useState([])
  const [loadingDrive, setLoadingDrive] = useState(false)
  const [showDriveModal, setShowDriveModal] = useState(false)

  useEffect(() => {
    if (!profile) return
    setForm({
      displayName: profile.displayName || "",
      title:       profile.title       || "",
      bio:         profile.bio         || "",
      phone:       profile.phone       || "",
      status:      profile.status      || "online",
    })
  }, [profile])

  const roleValues = Array.from(new Set([
    ...(Array.isArray(profile?.roles) ? profile.roles : []),
    profile?.role,
  ].filter(Boolean)))
  const rolesText = roleValues.join(", ") || "Ei määritelty"
  const hasLeaderRole = roleValues.includes("lippukunnanjohtaja")

  const baselineForm = {
    displayName: profile?.displayName || "",
    title: profile?.title || "",
    bio: profile?.bio || "",
    phone: profile?.phone || "",
    status: profile?.status || "online",
  }
  const isProfileDirty =
    form.displayName !== baselineForm.displayName ||
    form.title !== baselineForm.title ||
    form.bio !== baselineForm.bio ||
    form.phone !== baselineForm.phone ||
    form.status !== baselineForm.status

  function validateDisplayName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
    if (parts.length < 2) return "Nimi muodossa: Etunimi S"
    if (parts[0].length < 2) return "Etunimen pitää olla vähintään 2 merkkiä"
    if (parts[1].length < 1) return "Lisää sukunimen ensimmäinen kirjain"
    return ""
  }

  useEffect(() => {
    if (saved && isProfileDirty) setSaved(false)
  }, [isProfileDirty, saved])

  // Tarkista Drive-linkitys
  useEffect(() => {
    setDriveLinked(isDriveLinked())
    const info = getDriveInfo()
    if (info) setDriveInfo(info)
  }, [])

  async function save() {
    const trimmedName = form.displayName.trim()
    const nameValidation = validateDisplayName(trimmedName)
    if (nameValidation) {
      setNameError(nameValidation)
      return
    }
    setNameError("")
    setSaving(true)
    await updateDoc(doc(db, "users", user.uid), {
      ...form,
      displayName: trimmedName,
      online: form.status !== "offline",
      updatedAt: serverTimestamp(),
    })
    setSaving(false); setSaved(true)
    onSaved?.()
    setTimeout(() => setSaved(false), 2500)
  }

  async function linkGoogle() {
    setLinkErr(""); setLinkMsg("")
    try {
      const provider = new GoogleAuthProvider()
      await linkWithPopup(user, provider)
      setLinkMsg("Google-tili linkitetty!")
    } catch (err) {
      setLinkErr(err.code==="auth/credential-already-in-use" ? "Tämä Google-tili on jo käytössä." : err.message)
    }
  }

  async function linkEmailPassword() {
    setLinkEmailMsg(""); setLinkEmailErr("")
    if (passwordCreate.length < 8) { setLinkEmailErr("Salasanan täytyy olla vähintään 8 merkkiä."); return }
    try {
      const credential = EmailAuthProvider.credential(user.email, passwordCreate)
      await linkWithCredential(user, credential)
      setLinkEmailMsg("Sähköposti/salasana-linkki lisätty! Voit kirjautua myös sähköpostilla.")
      setPasswordCreate("")
    } catch (err) {
      if (err.code === "auth/provider-already-linked") setLinkEmailErr("Sähköposti on jo linkitetty.")
      else if (err.code === "auth/credential-already-in-use") setLinkEmailErr("Tämä sähköposti on jo käytössä toisessa tilissä.")
      else setLinkEmailErr(err.message)
    }
  }

  async function changePassword() {
    setPwErr(""); setPwMsg("")
    if (newPw.length < 8) { setPwErr("Vähintään 8 merkkiä."); return }
    try {
      const credential = EmailAuthProvider.credential(user.email, curPw)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPw)
      setPwMsg("Salasana vaihdettu!")
      setCurPw(""); setNewPw("")
    } catch (err) {
      setPwErr(err.code==="auth/wrong-password" ? "Nykyinen salasana on väärä." : err.message)
    }
  }

  // Päivitä Google-profiilin tiedot (kuva, nimi)
  async function refreshGoogleData() {
    setAccountMsg(""); setAccountErr("")
    try {
      await user.reload()
      const googleProvider = user.providerData.find(p => p.providerId === "google.com")
      if (!googleProvider) { setAccountErr("Google-tiliä ei ole linkitetty."); return }
      await updateDoc(doc(db, "users", user.uid), {
        displayName: user.displayName || googleProvider.displayName,
        photoURL:    user.photoURL    || googleProvider.photoURL,
        email:       user.email,
        updatedAt:   serverTimestamp(),
      })
      setAccountMsg("Tiedot päivitetty Google-tililtä!")
    } catch (err) { setAccountErr(err.message) }
  }

  // Lataa omat tiedot JSON-tiedostona
  async function downloadData() {
    setDownloading(true)
    try {
      const snap = await getDoc(doc(db, "users", user.uid))
      const data = {
        profile: snap.data(),
        email:   user.email,
        uid:     user.uid,
        exportedAt: new Date().toISOString(),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `partio-profiili-${user.uid.slice(0,8)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (err) { setAccountErr(err.message) }
    setDownloading(false)
  }

  // Linkitä Google Drive
  async function handleDriveLink() {
    try {
      const result = await linkGoogleDrive(user)
      if (result.success) {
        setDriveLinked(true)
        setDriveInfo(result.info)
        window.__pushToast?.(result.message, "success")
      } else {
        setAccountErr(result.message)
      }
    } catch (err) {
      setAccountErr("Drive-linkitys epäonnistui: " + err.message)
    }
  }

  // Irroita Google Drive
  function handleDriveUnlink() {
    const result = unlinkGoogleDrive()
    setDriveLinked(false)
    setDriveInfo(null)
    setDriveFiles([])
    window.__pushToast?.(result.message, "success")
  }

  // Lataa Drive-tiedostot
  async function loadDriveFiles() {
    setLoadingDrive(true)
    try {
      const token = localStorage.getItem("google_drive_token")
      if (!token) {
        setAccountErr("Drive-token puuttuu. Linkitä Drive uudelleen.")
        return
      }
      const files = await listDriveFiles(token, 15)
      setDriveFiles(files)
    } catch (err) {
      setAccountErr("Tiedostojen lataus epäonnistui: " + err.message)
    } finally {
      setLoadingDrive(false)
    }
  }

  // Poista käyttäjätili
  async function removeSession(sessionKey) {
    try {
      await updateDoc(doc(db, "users", user.uid), { [`sessions.${sessionKey}`]: deleteField() })
      if (typeof window !== "undefined" && localStorage.getItem("sessionId") === sessionKey) {
        await logout()
      }
    } catch (err) {
      setAccountErr(err.message)
    }
  }

  async function deleteAccount() {
    if (delConfirm !== user.email) { setAccountErr("Sähköposti ei täsmää."); return }
    setAccountErr("")
    try {
      // Uudelleentodenna ennen poistoa
      const providers = user.providerData.map(p => p.providerId)
      if (providers.includes("google.com")) {
        await reauthenticateWithPopup(user, new GoogleAuthProvider())
      } else if (providers.includes("password")) {
        const pw = prompt("Vahvista nykyinen salasana:")
        if (!pw) return
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw))
      }
      // Poista Firestore-dokumentti ja Auth-tili
      await updateDoc(doc(db, "users", user.uid), { deleted: true, deletedAt: serverTimestamp() }).catch(() => {})
      await deleteUser(user)
      logout()
    } catch (err) {
      if (err.code === "auth/requires-recent-login") setAccountErr("Kirjaudu ensin ulos ja uudelleen sisään, sitten yritä uudelleen.")
      else setAccountErr(err.message)
    }
  }

  async function logoutAllSessions() {
    setAccountErr("")
    setAccountMsg("")
    try {
      await updateDoc(doc(db, "users", user.uid), { sessions: {} })
      setAccountMsg("Kaikki muut istunnot kirjattu ulos.")
      await logout()
    } catch (err) {
      setAccountErr(err.message)
    }
  }

  const providers = user?.providerData?.map(p => p.providerId) || []
  const hasGoogle = providers.includes("google.com")
  const hasEmail  = providers.includes("password")
  const statusColor = STATUS_OPTIONS.find(s => s.value === form.status)?.color || "#22c55e"

  const googleIcon = (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  )

  const lbl = { fontSize:12, color:"var(--text2)", marginBottom:6, display:"block", fontWeight:500 }
  const inp = { width:"100%", borderRadius:8, border:"1px solid var(--border2)", background:"var(--bg3)", color:"var(--text)", padding:"9px 11px", fontSize:13, fontFamily:"system-ui", outline:"none", boxSizing:"border-box" }
  const btnPrimary = { border:"1px solid rgba(96,165,250,0.8)", borderRadius:8, background:"#2563eb", color:"#fff", cursor:"pointer", padding:"8px 12px", fontSize:13, fontFamily:"system-ui", fontWeight:500 }
  const btnSecondary = { border:"1px solid rgba(148,163,184,0.5)", borderRadius:8, background:"rgba(255,255,255,0.06)", color:"#cbd5e1", cursor:"pointer", padding:"8px 12px", fontSize:13, fontFamily:"system-ui", fontWeight:500 }
  const btnGhost = { border:"1px solid rgba(148,163,184,0.35)", borderRadius:8, background:"transparent", color:"#94a3b8", cursor:"pointer", padding:"7px 10px", fontSize:12, fontFamily:"system-ui" }

  const TAB = (v, l) => (
    <button onClick={() => setSection(v)}
      style={{ flex:1, padding:"8px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"system-ui", fontSize:13, fontWeight:500,
        background: section===v ? "var(--bg3)" : "transparent", color: section===v ? "var(--text)" : "var(--text2)" }}>
      {l}
    </button>
  )

  return (
    <div style={{ flex:1, overflowY:"auto", padding:32, fontFamily:"system-ui,sans-serif" }}>
      <div style={{ maxWidth:520, margin:"0 auto" }}>
        <h2 style={{ margin:"0 0 20px", fontSize:18, fontWeight:600 }}>🙍 Profiili</h2>

        <div style={{ display:"flex", gap:0, marginBottom:24, background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:4 }}>
          {TAB("profile", "Perustiedot")}
          {TAB("account", "Tili & turvallisuus")}
          {TAB("manage",  "Tilin hallinta")}
        </div>

        {/* ── Perustiedot ── */}
        {section === "profile" && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24, padding:20, background:"var(--bg2)", borderRadius:14, border:"1px solid var(--border)" }}>
              <div style={{ position:"relative" }}>
                <Avatar src={profile?.photoURL} name={form.displayName} size={64} />
                <div style={{ position:"absolute", bottom:2, right:2, width:14, height:14, borderRadius:"50%", background:statusColor, border:"3px solid var(--bg2)" }} />
              </div>
              <div>
                <div style={{ fontWeight:600, fontSize:16 }}>{form.displayName||"Johtaja"}</div>
                <div style={{ fontSize:13, color:"var(--text2)" }}>{rolesText}</div>
                {form.title && <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>{form.title}</div>}
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={lbl}>Tila</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => setForm(f=>({...f,status:s.value}))}
                    style={{ padding:"6px 14px", borderRadius:20, fontSize:13, cursor:"pointer", fontFamily:"system-ui",
                      border:   form.status===s.value ? `1px solid ${s.color}` : "1px solid var(--border2)",
                      background: form.status===s.value ? `${s.color}22` : "transparent",
                      color:      form.status===s.value ? s.color : "var(--text2)" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20, display:"flex", flexDirection:"column", gap:14 }}>
              {[
                ["Nimi", "displayName", "Etunimi S", "text"],
                ["Titteli / tehtävä", "title", "esim. Laumajohtaja", "text"],
                ["Puhelinnumero", "phone", "+358 40 123 4567", "tel"],
              ].map(([label, key, ph, type]) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={e => {
                      setForm(f=>({...f,[key]:e.target.value}))
                      if (key === "displayName") {
                        setNameError(validateDisplayName(e.target.value))
                      }
                    }}
                    style={{
                      ...inp,
                      border: key === "displayName" && nameError
                        ? "1px solid rgba(239,68,68,0.55)"
                        : inp.border,
                    }}
                    placeholder={ph}
                  />
                  {key === "displayName" && (
                    <div style={{ fontSize:11, color:nameError?"#f87171":"var(--text3)", marginTop:4 }}>
                      {nameError || "Käytä muotoa: Etunimi S (esim. Maija K)"}
                    </div>
                  )}
                </div>
              ))}
              <div>
                <label style={lbl}>Esittely</label>
                <textarea value={form.bio} onChange={e => setForm(f=>({...f,bio:e.target.value}))} rows={3} style={{ ...inp, resize:"vertical" }} placeholder="Kerro itsestäsi..." />
              </div>
              <div style={{ paddingTop:8, borderTop:"1px solid var(--border)" }}>
                <div style={{ fontSize:11, color:"var(--text3)", marginBottom:3 }}>Rooli (admin muuttaa)</div>
                <div style={{ fontSize:13, color:"var(--text2)" }}>{rolesText} {hasLeaderRole&&"👑"}</div>
              </div>

              {/* Käyttöehdot ja tietosuoja */}
              <div style={{ paddingTop:10, borderTop:"1px solid var(--border)", display:"flex", gap:6 }}>
                <button onClick={() => setShowTermsModal("terms")} title="Käyttöehdot"
                  style={inlineBtn}>
                  <span>📋</span><span>Käyttöehdot</span>
                </button>
                <button onClick={() => setShowTermsModal("privacy")} title="Tietosuojakäytäntö"
                  style={inlineBtn}>
                  <span>🔐</span><span>Tietosuoja</span>
                </button>
              </div>
            </div>

            <button onClick={save} disabled={saving}
              style={{ marginTop:16, width:"100%", padding:"11px", background:"#4f7ef7", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:500, cursor:"pointer", fontFamily:"system-ui", opacity:saving?0.7:1 }}>
              {saved ? "✓ Tallennettu!" : saving ? "Tallennetaan..." : "Tallenna muutokset"}
            </button>
          </>
        )}

        {/* ── Tili & turvallisuus ── */}
        {section === "account" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>Kirjautumistavat</div>
              {[
                { id:"google.com", icon: googleIcon, label:"Google", detail: hasGoogle ? user.email : "Ei linkitetty", linked: hasGoogle },
                { id:"password",   icon:"✉️", label:"Sähköposti", detail: user?.email, linked: hasEmail },
              ].map(p => (
                <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"var(--bg3)", borderRadius:10, marginBottom:8 }}>
                  <span style={{ fontSize:18, width:24, textAlign:"center" }}>{p.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>{p.label}</div>
                    <div style={{ fontSize:11, color:"var(--text3)" }}>{p.detail}</div>
                  </div>
                  {p.linked
                    ? <span style={{ fontSize:11, color:"#22c55e", background:"rgba(34,197,94,0.12)", padding:"2px 8px", borderRadius:5 }}>✓ Aktiivinen</span>
                    : <span style={{ fontSize:11, color:"#f59e0b", background:"rgba(245,158,11,0.12)", padding:"2px 8px", borderRadius:5 }}>✗ Ei linkitetty</span>
                  }
                </div>
              ))}

              {!hasGoogle && (
                <button onClick={linkGoogle} style={{ ...btnPrimary, width:"100%", padding:"9px", marginTop:4 }}>🔗 Linkitä Google-tili</button>
              )}

              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"var(--bg3)", borderRadius:10, marginTop:10 }}>
                <span style={{ fontSize:18, width:24, textAlign:"center" }}>🔒</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>Salasana</div>
                  <div style={{ fontSize:11, color:"var(--text3)" }}>{hasEmail ? "••••••••" : "Ei asetettu"}</div>
                </div>
                <span style={{ fontSize:11, color: hasEmail ? "#22c55e" : "#f59e0b", background: hasEmail ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)", padding:"2px 8px", borderRadius:5 }}>
                  {hasEmail ? "✓ Aktiivinen" : "✗ Ei käytössä"}
                </span>
              </div>

              <button onClick={() => setShowChangePassword(true)} style={{ ...btnPrimary, width:"100%", padding:"9px", marginTop:8 }}>🔑 Vaihda salasana</button>
              {(linkMsg||linkErr) && <div style={{ marginTop:8, fontSize:12, color: linkMsg?"#22c55e":"#f87171" }}>{linkMsg||linkErr}</div>}
            </div>

            {showChangePassword && hasEmail && (
              <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
                <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>Vaihda salasana</div>
                <label style={lbl}>Nykyinen salasana</label>
                <input type="password" value={curPw} onChange={e=>setCurPw(e.target.value)} style={inp} placeholder="••••••••" />
                <label style={lbl}>Uusi salasana (min. 8 merkkiä)</label>
                <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} style={inp} placeholder="••••••••" />
                {(pwErr||pwMsg) && <div style={{ marginTop:8, fontSize:12, color:pwMsg?"#22c55e":"#f87171" }}>{pwErr||pwMsg}</div>}
                <button onClick={changePassword} style={{ ...btnPrimary, marginTop:12, width:"100%", padding:"9px" }}>Vaihda</button>
                <button onClick={() => setShowChangePassword(false)} style={{ ...btnSecondary, marginTop:8, width:"100%", padding:"9px" }}>Peruuta</button>
              </div>
            )}


            {/* Ulkoiset sovellukset */}
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>Ulkoiset sovellukset</div>
              
              {/* Google Drive */}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"var(--bg3)", borderRadius:10, marginBottom:8 }}>
                <span style={{ fontSize:20 }}>🔗</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>Google Drive</div>
                  <div style={{ fontSize:11, color:"var(--text3)" }}>{driveInfo?.email || "Yhdistä Google-tilillesi"}</div>
                </div>
                {driveLinked
                  ? <span style={{ fontSize:11, color:"#22c55e", background:"rgba(34,197,94,0.12)", padding:"2px 8px", borderRadius:5 }}>✓ Yhdistetty</span>
                  : <span style={{ fontSize:11, color:"#f59e0b", background:"rgba(245,158,11,0.12)", padding:"2px 8px", borderRadius:5 }}>✗ Ei yhdistetty</span>
                }
              </div>
              {driveLinked ? (
                <>
                  <button onClick={handleDriveUnlink} style={{ ...btnSecondary, width:"100%", padding:"9px" }}>
                    🔓 Irrota Drive
                  </button>
                </>
              ) : (
                <button onClick={handleDriveLink} style={{ ...btnPrimary, width:"100%", padding:"9px" }}>
                  ✚ Yhdistä Google Drive
                </button>
              )}
            </div>

            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:8 }}>Aktiiviset sessiot</div>
              {profile?.sessions && Object.keys(profile.sessions).length > 0 ? (
                Object.entries(profile.sessions).map(([sid, session]) => (
                  <div key={sid} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, background:"var(--bg3)", border:"1px solid var(--border)", padding:"8px 10px", borderRadius:8, marginBottom:6 }}>
                    <div style={{ fontSize:12, color:"var(--text)" }}>
                      <div>{sid === (typeof window !== "undefined" ? localStorage.getItem("sessionId") : null) ? "📍 Tämä laite" : "📌 Muu laite"}</div>
                      <div style={{ fontSize:10, color:"var(--text2)" }}>{session.platform} · {session.userAgent?.slice(0,35)}...</div>
                      <div style={{ fontSize:10, color:"var(--text2)" }}>Viimeksi paikalla: {session.lastSeen?.toDate ? session.lastSeen.toDate().toLocaleString("fi-FI") : "Ei tietoa"}</div>
                    </div>
                    <button onClick={() => removeSession(sid)} style={{ ...btnGhost, fontSize:11, padding:"5px 8px" }}>Poista</button>
                  </div>
                ))
              ) : (
                <div style={{ fontSize:12, color:"var(--text2)" }}>Ei aktiivisia sessioita</div>
              )}

              <button onClick={logoutAllSessions} style={{ marginTop:10, width:"100%", padding:"9px", borderRadius:8, border:"1px solid rgba(239,68,68,0.3)", background:"rgba(239,68,68,0.08)", color:"#f87171", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
                Kirjaudu ulos kaikista laitteista
              </button>
            </div>
          </div>
        )}

        {/* Google Drive -selain modal */}
        {showDriveModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:250 }}
            onClick={() => setShowDriveModal(false)}>
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:520, maxWidth:"90vw", maxHeight:"80vh", overflowY:"auto" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <h3 style={{ margin:0, fontSize:16 }}>📂 Google Drive - Tiedostot</h3>
                <button onClick={() => setShowDriveModal(false)}
                  style={{ background:"transparent", border:"none", color:"var(--text2)", cursor:"pointer", fontSize:20 }}>✕</button>
              </div>

              {driveInfo && (
                <div style={{ fontSize:12, color:"var(--text3)", marginBottom:12, paddingBottom:12, borderBottom:"1px solid var(--border)" }}>
                  👤 {driveInfo.name}
                </div>
              )}

              {driveFiles.length === 0 ? (
                <button onClick={loadDriveFiles} disabled={loadingDrive}
                  style={{ width:"100%", padding:"10px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, opacity:loadingDrive?0.7:1 }}>
                  {loadingDrive ? "Ladataan..." : "📥 Lataa tiedostot"}
                </button>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {driveFiles.map(file => (
                    <div key={file.id} style={{ padding:10, background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, display:"flex", alignItems:"start", gap:10 }}>
                      <span style={{ fontSize:16, marginTop:2 }}>
                        {file.mimeType.includes("folder") ? "📁" : file.mimeType.includes("image") ? "🖼️" : file.mimeType.includes("sheet") ? "📊" : file.mimeType.includes("document") ? "📄" : "📎"}
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize:13, color:"#4f7ef7", textDecoration:"none", wordBreak:"break-word" }}>
                          {file.name}
                        </a>
                        <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>
                          {new Date(file.modifiedTime).toLocaleDateString("fi-FI")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setShowDriveModal(false)}
                style={{ width:"100%", marginTop:16, padding:"9px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, cursor:"pointer" }}>
                Sulje
              </button>
            </div>
          </div>
        )}


        {/* ── Tilin hallinta ── */}
        {section === "manage" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* Päivitä Google-tiedot */}
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>Päivitä tiedot Google-tililtä</div>
              <p style={{ fontSize:12, color:"var(--text3)", margin:"0 0 14px", lineHeight:1.5 }}>
                Päivittää nimen ja profiilikuvan Google-tililtäsi, jos olet muuttanut niitä Googlessa.
              </p>
              <button onClick={refreshGoogleData}
                style={{ ...btnPrimary, width:"100%", padding:"10px" }}>
                🔄 Hae tiedot Google-tililtä
              </button>
            </div>

            {/* Lataa omat tiedot */}
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:500, marginBottom:6 }}>Lataa omat tiedot</div>
              <p style={{ fontSize:12, color:"var(--text3)", margin:"0 0 14px", lineHeight:1.5 }}>
                Lataa profiilitietosi JSON-tiedostona omalle koneellesi.
              </p>
              <button onClick={downloadData} disabled={downloading}
                style={{ ...btnSecondary, width:"100%", padding:"10px", opacity:downloading?0.7:1 }}>
                {downloading ? "Ladataan..." : "⬇️ Lataa tiedot"}
              </button>
            </div>

            {accountMsg && <div style={{ padding:"10px 14px", background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:10, fontSize:13, color:"#22c55e" }}>{accountMsg}</div>}
            {accountErr && <div style={{ padding:"10px 14px", background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, fontSize:13, color:"#f87171" }}>{accountErr}</div>}

            {/* Poista käyttäjä */}
            <div style={{ background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:14, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:500, color:"#f87171", marginBottom:6 }}>⚠️ Poista tili</div>
              <p style={{ fontSize:12, color:"var(--text2)", margin:"0 0 14px", lineHeight:1.5 }}>
                Tämä poistaa tilisi pysyvästi. Kirjoita sähköpostiosoitteesi vahvistukseksi.
              </p>
              <label style={lbl}>Kirjoita: <strong style={{ color:"var(--text)" }}>{user?.email}</strong></label>
              <input value={delConfirm} onChange={e => setDelConfirm(e.target.value)}
                placeholder={user?.email} style={{ ...inp, borderColor:"rgba(239,68,68,0.3)" }} />
              <button onClick={deleteAccount} disabled={delConfirm !== user?.email}
                style={{ marginTop:12, width:"100%", padding:"10px", background: delConfirm===user?.email ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.03)",
                  border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, color: delConfirm===user?.email ? "#f87171" : "var(--text3)",
                  cursor: delConfirm===user?.email ? "pointer" : "default", fontSize:13, fontFamily:"system-ui" }}>
                Poista tilini pysyvästi
              </button>
            </div>
          </div>
        )}
      </div>
    {isProfileDirty && (
      <div style={{
        position:"fixed",
        left:"50%",
        bottom:18,
        transform:"translateX(-50%)",
        background:"rgba(245,158,11,0.14)",
        border:"1px solid rgba(245,158,11,0.35)",
        color:"#f59e0b",
        borderRadius:10,
        padding:"10px 14px",
        fontSize:13,
        zIndex:320,
        boxShadow:"0 8px 24px rgba(0,0,0,0.35)"
      }}>
        Tallentamattomia muutoksia
      </div>
    )}
    {/* Käyttöehdot / Tietosuoja */}
    {showTermsModal && (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}
        onClick={() => setShowTermsModal(null)}>
        <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:28, width:460, maxWidth:"90vw", maxHeight:"78vh", overflowY:"auto" }}
          onClick={e => e.stopPropagation()}>
          <h3 style={{ margin:"0 0 16px", fontSize:16 }}>{showTermsModal==="terms" ? "📋 Käyttöehdot" : "🔐 Tietosuojakäytäntö"}</h3>
          {showTermsModal === "terms" ? (
            <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.8 }}>
              <p><strong style={{ color:"var(--text)" }}>1. Sovelluksen käyttö</strong><br/>Maahiset-portaali on tarkoitettu Maahiset-lippukunnan johtajien sisäiseen käyttöön.</p>
              <p><strong style={{ color:"var(--text)" }}>2. Käyttäytyminen</strong><br/>Käyttäjät sitoutuvat asialliseen käytökseen. Häirintä tai asiattomat viestit voivat johtaa käyttöoikeuden poistoon.</p>
              <p><strong style={{ color:"var(--text)" }}>3. Sisältö</strong><br/>Käyttäjä vastaa lähettämästään sisällöstä. Laitonta sisältöä ei sallita.</p>
            </div>
          ) : (
            <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.8 }}>
              <p><strong style={{ color:"var(--text)" }}>Kerättävät tiedot</strong><br/>Tallennamme Google-tilisi nimen, sähköpostin ja profiilikuvan. Lisäksi laitteen yleisiä tietoja ja mahdollisesti liitetyt ulkoiset palvelut.</p>
              <p><strong style={{ color:"var(--text)" }}>Tietojen käyttö</strong><br/>Tietoja käytetään vain sovelluksen toimintaan. Tietoja ei myydä ulkopuolisille.</p>
              <p><strong style={{ color: "var(--text)"}}>Tietojen säilytys</strong><br />Tietoja säilytetään vain niin kauan kuin on tarpeen sovelluksen toiminnan kannalta.</p>
              <p><strong style={{ color:"var(--text)" }}>Oikeutesi</strong><br/>Voit poistaa tilisi ja tietosi koska tahansa profiiliasetuksista.</p>
            </div>
          )}
          <button onClick={() => setShowTermsModal(null)}
            style={{ marginTop:16, width:"100%", padding:"9px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"system-ui" }}>
            Sulje
          </button>
        </div>
      </div>
    )}
  </div>
  )
}

const inlineBtn = { display:"flex", alignItems:"center", gap:6, padding:"7px 10px", borderRadius:7, border:"none", background:"rgba(255,255,255,0.04)", color:"var(--text2)", cursor:"pointer", fontSize:12, fontFamily:"system-ui", flex:1, justifyContent:"center" }
const lbl = { display:"block", fontSize:12, fontWeight:500, color:"var(--text2)", marginBottom:6 }
const inp = { width:"100%", background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:14, boxSizing:"border-box", fontFamily:"system-ui", outline:"none" }
const btnPrimary   = { background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }
const btnSecondary = { background:"rgba(79,126,247,0.1)", border:"1px solid rgba(79,126,247,0.25)", borderRadius:8, color:"#4f7ef7", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }