// src/pages/MembersPage.jsx
import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import {
  collection, onSnapshot, doc, setDoc, getDoc,
  serverTimestamp, addDoc, updateDoc
} from "firebase/firestore"
import { useNavigate } from "react-router-dom"
import { Avatar } from "../components/ui/Avatar"

const ROLE_COLORS = {
  lippukunnanjohtaja:"#f59e0b", admin:"#f59e0b",
  johtaja:"#4f7ef7", apulaisjohtaja:"#a78bfa",
  kalustovastaava:"#22c55e", perhepartio:"#ec4899",
}

export default function MembersPage() {
  const { user, profile, isAdmin } = useAuth()
  const [members, setMembers]       = useState([])
  const [roles, setRoles]           = useState(["lippukunnanjohtaja","johtaja","apulaisjohtaja","kalustovastaava","perhepartio","admin"])
  const [selected, setSelected]     = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportSent, setReportSent] = useState(false)
  // Roolin anto
  const [roleTarget, setRoleTarget]   = useState(null)  // { member }
  const [pendingRole, setPendingRole] = useState("")
  const [roleConfirm, setRoleConfirm] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap =>
      setMembers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => !u.isInvisible))
    )
  }, [])

  useEffect(() => {
    return onSnapshot(doc(db, "config", "roles"), snap => {
      if (snap.exists() && snap.data().list?.length) setRoles(snap.data().list)
    })
  }, [])

  async function openDM(target) {
    if (target.id === user.uid) {
      const dmId = user.uid + "_" + user.uid
      const ref = doc(db, "directMessages", dmId)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(ref, { participants:[user.uid,user.uid], lastMessageAt:serverTimestamp(), lastMessage:"", isSelfNote:true })
      }
    } else {
      const dmId = [user.uid, target.id].sort().join("_")
      const ref = doc(db, "directMessages", dmId)
      const snap = await getDoc(ref)
      if (!snap.exists()) {
        await setDoc(ref, { participants:[user.uid,target.id], lastMessageAt:serverTimestamp(), lastMessage:"" })
      }
    }
    navigate("/")
  }

  async function confirmRoleChange() {
    if (!roleTarget || !pendingRole) return
    await updateDoc(doc(db, "users", roleTarget.id), { role: pendingRole, updatedAt: serverTimestamp() })
    setRoleTarget(null); setPendingRole(""); setRoleConfirm(false)
  }

  async function sendReport() {
    if (!selected || !reportReason.trim()) return
    await addDoc(collection(db, "memberReports"), {
      targetId: selected.id, targetName: selected.displayName,
      reporterId: user.uid, reporterName: profile?.displayName,
      reason: reportReason.trim(), status:"pending", createdAt: serverTimestamp(),
    })
    setReportSent(true); setReportReason("")
    setTimeout(() => { setShowReport(false); setReportSent(false) }, 2000)
  }

  function statusColor(m) {
    return m.status==="away"?"#f59e0b":m.status==="busy"?"#ef4444":m.status==="offline"?"#545d75":m.online?"#22c55e":"#545d75"
  }
  function statusLabel(m) {
    return m.status==="away"?"🟡 Poissa":m.status==="busy"?"🔴 Älä häiritse":m.status==="offline"?"⚫ Offline":m.online?"🟢 Paikalla":("Viimeksi: "+formatLastSeen(m.lastSeen))
  }
  function formatLastSeen(ts) {
    if (!ts) return "Ei tietoa"
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    const diff = (Date.now()-d.getTime())/1000/60
    if (diff<2) return "Juuri nyt"
    if (diff<60) return `${Math.round(diff)} min sitten`
    if (diff<1440) return `${Math.round(diff/60)} t sitten`
    return d.toLocaleDateString("fi-FI")
  }

  const online  = members.filter(m => m.online && m.status!=="offline" && m.status!=="away" && m.status!=="busy")
  const away    = members.filter(m => m.online && (m.status==="away"||m.status==="busy"))
  const offline = members.filter(m => !m.online || m.status==="offline")

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, fontFamily:"system-ui" }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        <h2 style={{ margin:"0 0 20px", fontSize:18, fontWeight:600 }}>👥 Johtajat</h2>

        {[
          { label:"🟢 Paikalla", list: online },
          { label:"🟡 Poissa / Älä häiritse", list: away },
          { label:"⚫ Offline", list: offline },
        ].map(({ label, list }) => list.length > 0 && (
          <div key={label} style={{ marginBottom:24 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#545d75", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>
              {label} — {list.length}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {list.map(m => (
                <div key={m.id} onClick={() => setSelected(m)}
                  style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:16, display:"flex", gap:14, alignItems:"flex-start", cursor:"pointer", transition:"border-color 0.15s", position:"relative" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor="rgba(255,255,255,0.15)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}>
                  <div style={{ position:"relative", flexShrink:0 }}>
                    <Avatar src={m.photoURL} name={m.displayName} size={46} />
                    <div style={{ position:"absolute", bottom:0, right:0, width:11, height:11, borderRadius:"50%", background:statusColor(m), border:"2px solid #161b27" }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>
                      {m.displayName}
                      {m.id===user.uid && <span style={{ fontSize:10, color:"#545d75", marginLeft:5 }}>(sinä)</span>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
                      <span style={{ fontSize:11, fontWeight:500, color: ROLE_COLORS[m.role]||"#8b92a8" }}>{m.role}</span>
                      {/* Roolin vaihtopainike — kaikille näkyvä */}
                      <button
                        onClick={e => { e.stopPropagation(); setRoleTarget(m); setPendingRole(m.role||"johtaja") }}
                        title="Vaihda rooli"
                        style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:4, color:"#545d75", cursor:"pointer", fontSize:11, padding:"0px 5px", lineHeight:"16px", fontFamily:"system-ui" }}>
                        ＋
                      </button>
                    </div>
                    {m.title && <div style={{ fontSize:11, color:"#545d75", marginBottom:2 }}>{m.title}</div>}
                    <div style={{ fontSize:11, color:"#545d75" }}>{statusLabel(m)}</div>
                  </div>

                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Profiili-modal */}
      {selected && !showReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}
          onClick={() => setSelected(null)}>
          <div style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:28, width:380, maxWidth:"90vw", textAlign:"center" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position:"relative", display:"inline-block", marginBottom:14 }}>
              <Avatar src={selected.photoURL} name={selected.displayName} size={72} />
              <div style={{ position:"absolute", bottom:2, right:2, width:14, height:14, borderRadius:"50%", background:statusColor(selected), border:"3px solid #161b27" }} />
            </div>
            <div style={{ fontWeight:600, fontSize:18, marginBottom:3 }}>{selected.displayName}</div>
            <div style={{ fontSize:12, color: ROLE_COLORS[selected.role]||"#8b92a8", fontWeight:500, marginBottom:3 }}>{selected.role}</div>
            {selected.title && <div style={{ fontSize:12, color:"#545d75", marginBottom:8 }}>{selected.title}</div>}
            <div style={{ fontSize:12, color:"#545d75", marginBottom:14 }}>{statusLabel(selected)}</div>
            {selected.bio && (
              <p style={{ fontSize:13, color:"#8b92a8", lineHeight:1.6, background:"#1e2535", padding:"10px 14px", borderRadius:8, margin:"0 0 16px", textAlign:"left" }}>{selected.bio}</p>
            )}
            {selected.phone && <div style={{ fontSize:13, color:"#545d75", marginBottom:16 }}>📞 {selected.phone}</div>}
            <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
              <button onClick={() => setSelected(null)} style={btnGhost}>Sulje</button>
              <button onClick={() => { openDM(selected); setSelected(null) }} style={btnPrimary}>
                {selected.id===user.uid ? "📝 Muistiinpanot" : "💬 Yksityisviesti"}
              </button>
              {selected.id!==user.uid && (
                <button onClick={() => setShowReport(true)}
                  style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, color:"#f87171", padding:"8px 14px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
                  🚩 Raportoi
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Raportoi-modal */}
      {selected && showReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:110 }}
          onClick={() => setShowReport(false)}>
          <div style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:24, width:400, maxWidth:"90vw" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin:"0 0 6px", fontSize:16 }}>🚩 Raportoi: {selected.displayName}</h3>
            <p style={{ fontSize:12, color:"#545d75", margin:"0 0 16px", lineHeight:1.5 }}>Raportti menee hallintapaneeliin admineille.</p>
            {reportSent
              ? <div style={{ textAlign:"center", padding:20, color:"#22c55e", fontSize:14 }}>✓ Raportti lähetetty!</div>
              : <>
                  <textarea value={reportReason} onChange={e => setReportReason(e.target.value)}
                    placeholder="Kuvaile ongelma lyhyesti..." rows={4}
                    style={{ width:"100%", background:"#1e2535", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"9px 12px", color:"#e8eaf0", fontSize:14, fontFamily:"system-ui", resize:"none", outline:"none", boxSizing:"border-box" }} />
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
                    <button onClick={() => setShowReport(false)} style={btnGhost}>Peruuta</button>
                    <button onClick={sendReport}
                      style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, color:"#f87171", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
                      Lähetä raportti
                    </button>
                  </div>
                </>
            }
          </div>
        </div>
      )}

      {/* Roolin anto -modal */}
      {roleTarget && !roleConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={() => setRoleTarget(null)}>
          <div style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:24, width:360, maxWidth:"90vw" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin:"0 0 6px", fontSize:16 }}>Vaihda rooli</h3>
            <p style={{ fontSize:13, color:"#8b92a8", margin:"0 0 16px" }}>
              Henkilö: <strong style={{ color:"#e8eaf0" }}>{roleTarget.displayName}</strong>
            </p>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
              {roles.map(r => (
                <button key={r} onClick={() => setPendingRole(r)}
                  style={{ padding:"10px 14px", borderRadius:8, cursor:"pointer", fontFamily:"system-ui", fontSize:13, textAlign:"left",
                    border: pendingRole===r ? `1px solid ${ROLE_COLORS[r]||"#4f7ef7"}` : "1px solid rgba(255,255,255,0.08)",
                    background: pendingRole===r ? `${ROLE_COLORS[r]||"#4f7ef7"}18` : "#1e2535",
                    color: pendingRole===r ? (ROLE_COLORS[r]||"#4f7ef7") : "#8b92a8",
                    display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  {r}
                  {pendingRole===r && <span style={{ fontSize:14 }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setRoleTarget(null)} style={btnGhost}>Peruuta</button>
              <button onClick={() => setRoleConfirm(true)} disabled={!pendingRole || pendingRole===roleTarget.role}
                style={{ ...btnPrimary, opacity: (!pendingRole||pendingRole===roleTarget.role) ? 0.5 : 1 }}>
                Jatka →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vahvistus-modal */}
      {roleTarget && roleConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:130 }}
          onClick={() => setRoleConfirm(false)}>
          <div style={{ background:"#161b27", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:24, width:360, maxWidth:"90vw", textAlign:"center" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:36, marginBottom:12 }}>🔄</div>
            <h3 style={{ margin:"0 0 12px", fontSize:16 }}>Vahvista roolimuutos</h3>
            <p style={{ fontSize:13, color:"#8b92a8", lineHeight:1.6, margin:"0 0 20px" }}>
              Vaihdetaan <strong style={{ color:"#e8eaf0" }}>{roleTarget.displayName}</strong> rooliksi:<br/>
              <span style={{ color:"#545d75", textDecoration:"line-through" }}>{roleTarget.role}</span>
              {" → "}
              <strong style={{ color: ROLE_COLORS[pendingRole]||"#4f7ef7" }}>{pendingRole}</strong>
            </p>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button onClick={() => setRoleConfirm(false)} style={btnGhost}>Peruuta</button>
              <button onClick={confirmRoleChange} style={btnPrimary}>✓ Vahvista</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btnPrimary = { background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }
const btnGhost   = { background:"transparent", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, color:"#8b92a8", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }