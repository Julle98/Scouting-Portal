// src/pages/AdminPage.jsx
import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, addDoc, setDoc
} from "firebase/firestore"
import { Avatar } from "../components/ui/Avatar"

// Roolit — lisää tähän uusia rooleja tarvittaessa
const DEFAULT_ROLES = [
  "lippukunnanjohtaja",
  "johtaja",
  "apulaisjohtaja",
  "kalustovastaava",
  "perhepartio",
  "admin",
]

export default function AdminPage() {
  const { user, profile, isAdmin } = useAuth()
  const [users, setUsers]         = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [usedInvites, setUsedInvites] = useState([])
  const [modQueue, setModQueue]   = useState([])
  const [reports, setReports]     = useState([])
  const [roles, setRoles]         = useState(DEFAULT_ROLES)
  const [inviteEmail, setInviteEmail] = useState("")
  const [isDebugInvite, setIsDebugInvite] = useState(false)
  const [tab, setTab]             = useState("users")
  const [errorLog, setErrorLog]   = useState([])
  const [newRole, setNewRole]     = useState("")
  const [roleMsg, setRoleMsg]     = useState("")
  const [renamingRole, setRenamingRole] = useState(null)
  const [resolvedErrors, setResolvedErrors] = useState({})

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "roles"), snap => {
      if (snap.exists() && snap.data().list?.length > 0) {
        setRoles(snap.data().list)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const u = onSnapshot(query(collection(db, "users"), orderBy("displayName")),
      snap => setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
    const i = onSnapshot(query(collection(db, "invites"), orderBy("createdAt","desc")),
      snap => {
        const allInvites = snap.docs.map(d => ({ id:d.id, ...d.data() }))
        const now = new Date()
        setPendingInvites(allInvites.filter(inv => !inv.used && (!inv.expiresAt || inv.expiresAt.toDate() > now)))
        setUsedInvites(allInvites.filter(inv => inv.used).sort((a, b) => {
          const at = a.usedAt?.toDate?.()?.getTime?.() || 0
          const bt = b.usedAt?.toDate?.()?.getTime?.() || 0
          return bt - at
        }))
      })
    const m = onSnapshot(query(collection(db, "moderation"), where("status","==","pending"), orderBy("createdAt","desc")),
      snap => setModQueue(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
    const r = onSnapshot(query(collection(db, "memberReports"), orderBy("createdAt","desc")),
      snap => setReports(snap.docs.map(d => ({ id:d.id, ...d.data() }))))
    const e = onSnapshot(query(collection(db, "errorLog"), orderBy("createdAt","desc"), where("createdAt","!=",null)), snap => setErrorLog(snap.docs.map(d=>({id:d.id,...d.data()}))))
    return () => { u(); i(); m(); r(); e() }
  }, [])

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    await addDoc(collection(db, "invites"), {
      email: inviteEmail.trim().toLowerCase(),
      role: "johtaja",
      invitedBy: user.uid, invitedByName: profile?.displayName,
      used: false, createdAt: serverTimestamp(),
      isDebug: isDebugInvite,
    })
    setInviteEmail("")
    setIsDebugInvite(false)
    alert("Kutsu lähetetty!")
  }

  function getUserRoles(u) {
    const list = Array.isArray(u?.roles) ? u.roles : []
    const merged = Array.from(new Set([...list, u?.role].filter(Boolean)))
    return merged.length ? merged : ["johtaja"]
  }

  function getRoleRank(roleName) {
    const idx = roles.indexOf(roleName)
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
  }

  function getPrimaryRoleFromList(roleList, preferred = null) {
    if (preferred && roleList.includes(preferred)) return preferred
    return [...roleList].sort((a, b) => getRoleRank(a) - getRoleRank(b))[0] || "johtaja"
  }

  function getUserRank(u) {
    return Math.min(...getUserRoles(u).map(getRoleRank))
  }

  async function setUserRoles(uid, nextRoles, preferredPrimary = null) {
    const normalized = Array.from(new Set(nextRoles.filter(r => roles.includes(r))))
    const finalRoles = normalized.length ? normalized : ["johtaja"]
    const primaryRole = getPrimaryRoleFromList(finalRoles, preferredPrimary)
    await updateDoc(doc(db, "users", uid), {
      role: primaryRole,
      roles: finalRoles,
      updatedAt: serverTimestamp(),
    })
  }

  async function changeRole(userRow, role) {
    const current = getUserRoles(userRow)
    const withPrimary = Array.from(new Set([role, ...current]))
    await setUserRoles(userRow.id, withPrimary, role)
  }

  async function toggleUserRole(userRow, roleName) {
    const current = getUserRoles(userRow)
    const next = current.includes(roleName)
      ? current.filter(r => r !== roleName)
      : [...current, roleName]
    await setUserRoles(userRow.id, next)
  }

  async function removeUser(uid) {
    if (!confirm("Poistetaanko käyttäjä? He eivät enää pääse kirjautumaan.")) return
    await deleteDoc(doc(db, "users", uid))
  }

  async function revokeInvite(id) {
    await deleteDoc(doc(db, "invites", id))
  }

  async function resolveReport(id, action) {
    await updateDoc(doc(db, "moderation", id), { status: action, resolvedAt: serverTimestamp() })
  }

  async function resolveMemberReport(id, action) {
    await updateDoc(doc(db, "memberReports", id), { status: action, resolvedAt: serverTimestamp() })
  }

  async function saveRoles() {
    await setDoc(doc(db, "config", "roles"), { list: roles })
    setRoleMsg("Roolit tallennettu!")
    setTimeout(() => setRoleMsg(""), 2500)
  }

  async function addRole() {
    const r = newRole.trim().toLowerCase().replace(/\s+/g, "_")
    if (!r || roles.includes(r)) return
    setRoles(prev => [...prev, r])
    setNewRole("")
  }

  function removeRole(r) {
    if (DEFAULT_ROLES.slice(0,3).includes(r)) { alert("Oletusjärjestelmärooleja ei voi poistaa."); return }
    setRoles(prev => prev.filter(x => x !== r))
  }

  function moveRole(r, dir) {
    setRoles(prev => {
      const idx = prev.indexOf(r)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  function startRename(r) { setRenamingRole({ original: r, value: r }) }

  function applyRename() {
    if (!renamingRole) return
    const val = renamingRole.value.trim().toLowerCase().replace(/\s+/g, "_")
    if (!val || (val !== renamingRole.original && roles.includes(val))) { setRenamingRole(null); return }
    setRoles(prev => prev.map(r => r === renamingRole.original ? val : r))
    // Update users that had the old role in primary role or roles list
    users
      .filter(u => getUserRoles(u).includes(renamingRole.original))
      .forEach(u => {
        const nextRoles = getUserRoles(u).map(r => (r === renamingRole.original ? val : r))
        setUserRoles(u.id, nextRoles)
      })
    setRenamingRole(null)
  }

  async function resolveError(id) {
    await updateDoc(doc(db, "errorLog", id), { status: "resolved", resolvedAt: serverTimestamp() })
    setResolvedErrors(prev => ({ ...prev, [id]: true }))
  }

  // Role hierarchy: index 0 = highest rank
  function canKick(actorRole, targetRole) {
    const ai = roles.indexOf(actorRole)
    const ti = roles.indexOf(targetRole)
    return ai !== -1 && ti !== -1 && ai < ti
  }

  if (!isAdmin) return <div style={{ padding:32, color:"var(--text3)", fontFamily:"system-ui" }}>Ei käyttöoikeutta.</div>

  const TAB = (t, label, badge) => (
    <button style={{ padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui",
      borderBottom: tab===t ? "2px solid #4f7ef7" : "2px solid transparent",
      color: tab===t ? "#4f7ef7" : "var(--text2)", background:"transparent", border:"none", borderBottom: tab===t ? "2px solid #4f7ef7" : "2px solid transparent" }}
      onClick={() => setTab(t)}>
      {label}{badge > 0 && <span style={{ marginLeft:5, background:"#ef4444", color:"#fff", borderRadius:10, padding:"0 5px", fontSize:10 }}>{badge}</span>}
    </button>
  )

  return (
    <div style={{ display:"flex", flex:1, flexDirection:"column", overflow:"hidden", fontFamily:"system-ui" }}>
      <div style={{ padding:"0 24px", height:52, borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:0, background:"var(--bg2)", flexShrink:0 }}>
        <span style={{ fontWeight:600, fontSize:14, marginRight:20 }}>👮 Hallinta</span>
        {TAB("users",    "Käyttäjät",    0)}
        {TAB("debug",    "Debug",        users.filter(u => u.isDebug).length)}
        {TAB("roles",    "Roolit",        0)}
        {TAB("invites",  "Kutsut",        pendingInvites.length)}
        {TAB("moderation","Moderointi",   modQueue.length + reports.filter(r=>r.status==="pending").length)}
        {TAB("errors",     "Virheloki",     errorLog.filter(e=>e.status!=="resolved").length)}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:24 }}>

        {/* Käyttäjät */}
        {tab === "users" && (
          <div>
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)" }}>
                    {["Käyttäjä","Sähköposti","Rooli","Tila","Toiminnot"].map(h => (
                      <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:11, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.06em", background:"var(--bg3)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const myRoleIdx = getRoleRank(profile?.role)
                    const theirRoleIdx = getUserRank(u)
                    const canManage = myRoleIdx < theirRoleIdx || isAdmin
                    const canRemove = u.id !== user.uid && canManage
                    const selectedRoles = getUserRoles(u)
                    return (
                    <tr key={u.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding:"10px 16px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <Avatar src={u.photoURL} name={u.displayName} size={28} />
                          <span style={{ fontSize:13, fontWeight:500 }}>{u.displayName}</span>
                          {u.id===user.uid && <span style={{ fontSize:10, color:"var(--text3)" }}>(sinä)</span>}
                          {u.isDebug && <span style={{ fontSize:10, color:"#f59e0b", background:"#f59e0b20", padding:"2px 6px", borderRadius:4 }}>DEBUG</span>}
                        </div>
                      </td>
                      <td style={{ padding:"10px 16px", fontSize:12, color:"var(--text2)" }}>{u.email}</td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ fontSize:12, color:"var(--text3)" }}>{selectedRoles.join(", ")}</span>
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        <span style={{ fontSize:12, display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", display:"inline-block",
                            background: u.status==="away"?"#f59e0b":u.status==="busy"?"#ef4444":u.status==="offline"?"var(--text3)":u.online?"#22c55e":"var(--text3)" }} />
                          {u.status==="away"?"Poissa":u.status==="busy"?"Älä häiritse":u.status==="offline"?"Offline":u.online?"Paikalla":"Poissa"}
                        </span>
                      </td>
                      <td style={{ padding:"10px 16px" }}>
                        {canRemove && (
                          <button onClick={() => removeUser(u.id)}
                            style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:6, color:"#f87171", padding:"4px 10px", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }}>
                            Poista
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Debug-käyttäjät */}
        {tab === "debug" && (
          <div>
            <h3 style={{ margin:"0 0 12px", fontSize:15 }}>Debug-käyttäjät ({users.filter(u => u.isDebug).length})</h3>
            {users.filter(u => u.isDebug).length === 0 && <p style={{ color:"var(--text3)", fontSize:13 }}>Ei debug-käyttäjiä.</p>}
            {users.filter(u => u.isDebug).map(u => (
              <div key={u.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{u.email}</div>
                  <div style={{ fontSize:11, color:"var(--text3)" }}>
                    Luotu: {u.joinedAt?.toDate ? u.joinedAt.toDate().toLocaleString('fi-FI') : 'Ei tietoa'} · 
                    Viimeksi käytetty: {u.lastUsed?.toDate ? u.lastUsed.toDate().toLocaleString('fi-FI') : 'Ei käytetty'}
                  </div>
                </div>
                <button onClick={() => removeUser(u.id)}
                  style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, color:"#f87171", padding:"4px 10px", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }}>
                  Poista
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Roolit */}
        {tab === "roles" && (
          <div style={{ maxWidth:820 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              {/* Vasen: roolien hallinta */}
              <div>
                <h3 style={{ fontSize:15, margin:"0 0 6px" }}>Roolilista</h3>
                <p style={{ fontSize:12, color:"var(--text3)", marginBottom:14, lineHeight:1.5 }}>
                  Järjestys = hierarkia (ylin = korkein arvo). Ylemmät roolit voivat potkia vain alempia.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:16 }}>
                  {roles.map((r, idx) => (
                    <div key={r} style={{ display:"flex", alignItems:"center", gap:6, background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:8, padding:"7px 10px" }}>
                      {/* Järjestysnapit */}
                      <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
                        <button onClick={() => moveRole(r, -1)} disabled={idx===0}
                          style={{ background:"transparent", border:"none", color: idx===0 ? "#2a3147" : "var(--text3)", cursor: idx===0 ? "default" : "pointer", fontSize:10, padding:"0 3px", lineHeight:1, fontFamily:"system-ui" }}>▲</button>
                        <button onClick={() => moveRole(r, 1)} disabled={idx===roles.length-1}
                          style={{ background:"transparent", border:"none", color: idx===roles.length-1 ? "#2a3147" : "var(--text3)", cursor: idx===roles.length-1 ? "default" : "pointer", fontSize:10, padding:"0 3px", lineHeight:1, fontFamily:"system-ui" }}>▼</button>
                      </div>
                      {/* Roolin nimi tai muokkauskenttä */}
                      {renamingRole?.original === r
                        ? <input autoFocus value={renamingRole.value}
                            onChange={e => setRenamingRole(prev => ({ ...prev, value: e.target.value }))}
                            onKeyDown={e => { if (e.key==="Enter") applyRename(); if (e.key==="Escape") setRenamingRole(null) }}
                            style={{ flex:1, background:"var(--bg)", border:"1px solid #4f7ef7", borderRadius:5, padding:"3px 7px", color:"var(--text)", fontSize:12, fontFamily:"system-ui", outline:"none" }} />
                        : <span style={{ fontSize:12, color:"var(--text)", flex:1 }}>
                            <span style={{ fontSize:10, color:"#2a3147", marginRight:5 }}>#{idx+1}</span>{r}
                          </span>
                      }
                      <span style={{ fontSize:10, color:"var(--text3)", whiteSpace:"nowrap" }}>
                        {users.filter(u => getUserRoles(u).includes(r)).length} hlö
                      </span>
                      {/* Nimeä uudelleen */}
                      {renamingRole?.original === r
                        ? <>
                            <button onClick={applyRename} style={{ background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:5, color:"#22c55e", cursor:"pointer", fontSize:10, padding:"2px 6px", fontFamily:"system-ui" }}>✓</button>
                            <button onClick={() => setRenamingRole(null)} style={{ background:"transparent", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:11, padding:"2px 4px" }}>✕</button>
                          </>
                        : <button onClick={() => startRename(r)}
                            style={{ background:"rgba(79,126,247,0.1)", border:"1px solid rgba(79,126,247,0.2)", borderRadius:5, color:"#4f7ef7", cursor:"pointer", fontSize:10, padding:"2px 6px", fontFamily:"system-ui" }}>
                            ✏️
                          </button>
                      }
                      {!DEFAULT_ROLES.slice(0,3).includes(r) && renamingRole?.original !== r && (
                        <button onClick={() => removeRole(r)}
                          style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:5, color:"#f87171", cursor:"pointer", fontSize:10, padding:"2px 6px", fontFamily:"system-ui" }}>
                          🗑
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <input value={newRole} onChange={e => setNewRole(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && addRole()}
                    placeholder="Uusi rooli..."
                    style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"8px 12px", color:"var(--text)", fontSize:13, fontFamily:"system-ui", outline:"none" }} />
                  <button onClick={addRole}
                    style={{ background:"rgba(79,126,247,0.15)", border:"1px solid rgba(79,126,247,0.3)", borderRadius:8, color:"#4f7ef7", padding:"8px 14px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
                    + Lisää
                  </button>
                </div>
                <button onClick={saveRoles}
                  style={{ background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }}>
                  Tallenna roolit
                </button>
                {roleMsg && <span style={{ marginLeft:10, fontSize:13, color:"#22c55e" }}>{roleMsg}</span>}
              </div>

              {/* Oikea: roolien hallinnan ohjaus Johtajat-sivulle */}
              <div>
                <h3 style={{ fontSize:15, margin:"0 0 6px" }}>Roolien jako</h3>
                <p style={{ fontSize:12, color:"var(--text3)", marginBottom:14, lineHeight:1.6 }}>
                  Roolien lisäys ja poisto on siirretty Johtajat-sivun + -painikkeeseen.
                  Avaa Johtajat-sivu ja klikkaa käyttäjän kohdalla + muokataksesi useita rooleja.
                </p>
                <div style={{ background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px", fontSize:12, color:"var(--text2)" }}>
                  Vinkki: rooli poistuu klikkaamalla valitun roolin nappia uudelleen.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Kutsut */}
        {tab === "invites" && (
          <div>
            <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14, padding:20, marginBottom:20 }}>
              <h3 style={{ margin:"0 0 6px", fontSize:15 }}>Lähetä kutsu</h3>
              <p style={{ fontSize:12, color:"var(--text3)", margin:"0 0 14px", lineHeight:1.5 }}>
                Kutsu on vapaaehtoinen — <strong style={{ color:"var(--text2)" }}>@maahiset.net</strong>-osoitteet pääsevät sisään automaattisesti.
              </p>
              <div style={{ display:"flex", gap:10 }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="johtaja@gmail.com" type="email"
                  style={{ flex:1, background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:14, fontFamily:"system-ui", outline:"none" }} />
                <button onClick={sendInvite}
                  style={{ background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"9px 18px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }}>
                  Lähetä kutsu
                </button>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10 }}>
                <input type="checkbox" id="debugInvite" checked={isDebugInvite} onChange={e => setIsDebugInvite(e.target.checked)}
                  style={{ width:16, height:16 }} />
                <label htmlFor="debugInvite" style={{ fontSize:12, color:"var(--text2)", cursor:"pointer" }}>
                  Debug-käyttäjä (väliaikainen pääsy ilman profiilia)
                </label>
              </div>
            </div>

            <h3 style={{ margin:"0 0 12px", fontSize:15 }}>Odottavat kutsut ({pendingInvites.length})</h3>
            {pendingInvites.length === 0 && <p style={{ color:"var(--text3)", fontSize:13 }}>Ei odottavia kutsuja.</p>}
            {pendingInvites.map(inv => (
              <div key={inv.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{inv.email} {inv.isDebug && <span style={{ fontSize:10, color:"#f59e0b", background:"#f59e0b20", padding:"2px 6px", borderRadius:4 }}>DEBUG</span>}</div>
                  <div style={{ fontSize:11, color:"var(--text3)" }}>Lähettäjä: {inv.invitedByName}</div>
                </div>
                <button onClick={() => revokeInvite(inv.id)}
                  style={{ background:"transparent", border:"1px solid var(--border2)", borderRadius:6, color:"var(--text3)", padding:"4px 10px", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }}>
                  Peruuta
                </button>
              </div>
            ))}

            <h3 style={{ margin:"18px 0 12px", fontSize:15 }}>Käytetyt kutsut ({usedInvites.length})</h3>
            {usedInvites.length === 0 && <p style={{ color:"var(--text3)", fontSize:13 }}>Ei käytettyjä kutsuja.</p>}
            {usedInvites.map(inv => {
              const usedByUser = users.find(u => u.id === inv.usedBy)
              return (
                <div key={inv.id} style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>
                      {inv.email} {inv.isDebug && <span style={{ fontSize:10, color:"#f59e0b", background:"#f59e0b20", padding:"2px 6px", borderRadius:4 }}>DEBUG</span>}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text3)" }}>
                      Käytetty: {inv.usedAt?.toDate ? inv.usedAt.toDate().toLocaleString("fi-FI") : "Ei tietoa"}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text3)" }}>
                      Käyttäjä: {usedByUser?.displayName || inv.usedBy || "Ei tietoa"}{usedByUser?.email ? ` (${usedByUser.email})` : ""}
                    </div>
                    <div style={{ fontSize:11, color:"var(--text3)" }}>
                      Lähettäjä: {inv.invitedByName || "Ei tietoa"}
                    </div>
                  </div>
                  <span style={{ fontSize:11, color:"#22c55e", background:"rgba(34,197,94,0.12)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:6, padding:"3px 8px", whiteSpace:"nowrap" }}>
                    Käytetty
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Moderointi */}
        {tab === "moderation" && (
          <div>
            {/* Viestiraportit */}
            <h3 style={{ margin:"0 0 14px", fontSize:15 }}>🚨 Viestiraportit ({modQueue.length})</h3>
            {modQueue.length === 0 && <p style={{ color:"var(--text3)", fontSize:13, marginBottom:20 }}>Ei raportteja. 🎉</p>}
            {modQueue.map(r => (
              <div key={r.id} style={{ background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:10, padding:"14px 16px", marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>Raportoitu viesti</div>
                <div style={{ fontSize:13, color:"var(--text2)", background:"var(--bg3)", padding:"8px 12px", borderRadius:8, margin:"8px 0", fontStyle:"italic" }}>"{r.messageText?.slice(0,200)}"</div>
                <div style={{ fontSize:12, color:"var(--text3)" }}>Raportoija: {r.reporterName} · Kanava: {r.channelId}</div>
                <div style={{ display:"flex", gap:8, marginTop:10 }}>
                  <button onClick={() => resolveReport(r.id,"resolved")} style={btnDanger}>🗑️ Poista viesti</button>
                  <button onClick={() => resolveReport(r.id,"dismissed")} style={btnSuccess}>✓ Merkitse suoritetuksi</button>
                </div>
              </div>
            ))}

            {/* Jäsenraportit */}
            <h3 style={{ margin:"20px 0 14px", fontSize:15 }}>
              👤 Jäsenraportit
              <span style={{ marginLeft:8, fontSize:12, fontWeight:400, color:"var(--text3)" }}>
                {reports.filter(r=>r.status==="pending").length} odottaa / {reports.length} yhteensä
              </span>
            </h3>
            {reports.length === 0 && <p style={{ color:"var(--text3)", fontSize:13 }}>Ei jäsenraportteja.</p>}
            {reports.map(r => (
              <div key={r.id} style={{
                background: r.status==="pending" ? "rgba(245,158,11,0.07)" : "rgba(34,197,94,0.04)",
                border: r.status==="pending" ? "1px solid rgba(245,158,11,0.2)" : "1px solid rgba(34,197,94,0.15)",
                borderRadius:10, padding:"14px 16px", marginBottom:10
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }}>Raportoitu: <span style={{ color: r.status==="pending" ? "#f59e0b" : "#22c55e" }}>{r.targetName}</span></div>
                    <div style={{ fontSize:12, color:"var(--text3)" }}>Raportoija: {r.reporterName}</div>
                  </div>
                  <span style={{ fontSize:11, padding:"2px 8px", borderRadius:5,
                    background: r.status==="pending" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)",
                    color: r.status==="pending" ? "#f59e0b" : "#22c55e" }}>
                    {r.status==="pending" ? "Odottaa" : "Suoritettu"}
                  </span>
                </div>
                {r.reason && <div style={{ fontSize:13, color:"var(--text2)", fontStyle:"italic", marginBottom:10 }}>"{r.reason}"</div>}
                {r.status==="pending" && (
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => resolveMemberReport(r.id,"resolved")} style={btnSuccess}>✓ Merkitse suoritetuksi</button>
                    <button onClick={() => resolveMemberReport(r.id,"dismissed")} style={btnGhost}>Ohita</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Virheloki */}
        {tab === "errors" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <h3 style={{ fontSize:15, margin:0 }}>⚠️ Virheloki</h3>
              <span style={{ fontSize:12, color:"var(--text3)" }}>
                {errorLog.filter(e=>e.status!=="resolved").length} avointa / {errorLog.length} yhteensä
              </span>
            </div>
            {errorLog.length === 0 && <p style={{ color:"var(--text3)", fontSize:13 }}>Ei virheitä. 🎉</p>}
            {errorLog.map(e => {
              const isResolved = e.status === "resolved" || resolvedErrors[e.id]
              return (
                <div key={e.id} style={{
                  background: isResolved ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.06)",
                  border: isResolved ? "1px solid rgba(34,197,94,0.15)" : "1px solid rgba(239,68,68,0.15)",
                  borderRadius:10, padding:"12px 16px", marginBottom:10
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:500, color: isResolved ? "#22c55e" : "#f87171", marginBottom:4 }}>{e.message}</div>
                      <div style={{ fontSize:11, color:"var(--text3)", marginBottom:6 }}>
                        {e.url} · {e.createdAt?.toDate?.().toLocaleString("fi-FI")||""}
                        {isResolved && <span style={{ marginLeft:8, color:"#22c55e" }}>✓ Suoritettu</span>}
                      </div>
                      <div style={{ fontSize:11, color:"var(--text2)", marginBottom:6 }}>
                        Käyttäjä: {e.user?.displayName || "Tuntematon"} {e.user?.email ? `(${e.user.email})` : ""}
                        {e.user?.uid ? ` · uid: ${e.user.uid}` : ""}
                      </div>
                      {!!e.breadcrumbs?.length && (
                        <div style={{ fontSize:10, color:"var(--text2)", background:"var(--bg3)", padding:"6px 10px", borderRadius:6, marginBottom:6 }}>
                          <div style={{ marginBottom:4, color:"var(--text3)" }}>Viimeiset toiminnot:</div>
                          {e.breadcrumbs.slice(-6).map((b, idx) => (
                            <div key={idx} style={{ marginBottom:2 }}>
                              {b.at || ""} · {b.type || "event"} · {b.path || ""} {b.target ? `· ${b.target}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                      {e.stack && !isResolved && (
                        <div style={{ fontSize:10, color:"var(--text3)", background:"var(--bg3)", padding:"6px 10px", borderRadius:6, fontFamily:"monospace", overflow:"auto", maxHeight:80 }}>
                          {e.stack}
                        </div>
                      )}
                    </div>
                    {!isResolved && (
                      <button onClick={() => resolveError(e.id)} style={btnSuccess}>✓ Suoritettu</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const btnDanger  = { background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:6, color:"#f87171", padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }
const btnGhost   = { background:"transparent", border:"1px solid var(--border2)", borderRadius:6, color:"var(--text3)", padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }
const btnSuccess = { background:"rgba(34,197,94,0.12)", border:"1px solid rgba(34,197,94,0.3)", borderRadius:6, color:"#22c55e", padding:"5px 12px", cursor:"pointer", fontSize:12, fontFamily:"system-ui" }