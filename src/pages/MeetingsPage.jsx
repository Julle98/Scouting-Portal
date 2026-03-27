// src/pages/MeetingsPage.jsx
import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import { collection, onSnapshot, doc, setDoc, getDoc, serverTimestamp, addDoc } from "firebase/firestore"
import { useNavigate } from "react-router-dom"
import { Avatar } from "../components/ui/Avatar"
import MEETING_DATA from "../data/meeting_data.json";

const DAY_NAMES = ["sunnuntai","maanantai","tiistai","keskiviikko","torstai","perjantai","lauantai"]

function isOngoing(group) {
  if (!group.dayIndex || !group.time) return false
  const now = new Date()
  const todayIndex = now.getDay()
  if (todayIndex !== group.dayIndex) return false
  const [startH, startM] = group.time.split("–")[0].split(":").map(Number)
  const [endH, endM]     = group.time.split("–")[1].split(":").map(Number)
  const nowMins   = now.getHours() * 60 + now.getMinutes()
  const startMins = startH * 60 + startM
  const endMins   = endH * 60 + endM
  return nowMins >= startMins && nowMins <= endMins
}

function isToday(group) {
  if (!group.dayIndex) return false
  return new Date().getDay() === group.dayIndex
}

export default function MeetingsPage() {
  const { user, profile } = useAuth()
  const [allUsers, setAllUsers]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportSent, setReportSent] = useState(false)
  const [now, setNow]               = useState(new Date())
  const [selectedGroup, setSelectedGroup] = useState(null)
  const navigate = useNavigate()

  // Päivitä kello minuutin välein
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap =>
      setAllUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => !u.isInvisible))
    )
  }, [])

  // Etsi käyttäjä nimen perusteella (etu- tai sukunimi riittää)
  function findUser(leaderName) {
    const parts = leaderName.toLowerCase().split(" ")
    return allUsers.find(u => {
      const dn = (u.displayName || "").toLowerCase()
      return parts.every(p => dn.includes(p))
    })
  }

  async function openDM(target) {
    const dmId = [user.uid, target.id].sort().join("_")
    const ref = doc(db, "directMessages", dmId)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, { participants:[user.uid,target.id], lastMessageAt:serverTimestamp(), lastMessage:"" })
    }
    navigate("/")
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
    return m?.status==="away"?"#f59e0b":m?.status==="busy"?"#ef4444":m?.status==="offline"?"var(--text3)":m?.online?"#22c55e":"var(--text3)"
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

  return (
    <div style={{ flex:1, overflowY:"auto", padding:24, fontFamily:"system-ui" }}>
      <div style={{ maxWidth:860, margin:"0 auto" }}>
        <h2 style={{ margin:"0 0 6px", fontSize:18, fontWeight:600 }}>📅 Kokousvuorot</h2>
        <p style={{ fontSize:13, color:"var(--text3)", margin:"0 0 24px" }}>
          {DAY_NAMES[now.getDay()].charAt(0).toUpperCase() + DAY_NAMES[now.getDay()].slice(1)} {now.toLocaleDateString("fi-FI")} klo {now.toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"})}
        </p>

        {MEETING_DATA.map(cat => (
          <div key={cat.category} style={{ marginBottom:28 }}>
            {/* Kategorian otsikko */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <div style={{ width:4, height:20, borderRadius:2, background:cat.color, flexShrink:0 }} />
              <span style={{ fontSize:15, fontWeight:600, color:cat.color }}>{cat.category}</span>
              {cat.note && <span style={{ fontSize:11, color:"var(--text3)", fontStyle:"italic" }}>— {cat.note}</span>}
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {cat.groups.map(group => {
                const ongoing = isOngoing(group)
                const today   = isToday(group)
                return (
                  <div key={group.name}
                    style={{ background:"var(--bg2)", border:`1px solid ${ongoing ? cat.color+"66" : today ? cat.color+"33" : "var(--border)"}`, borderRadius:12, padding:"14px 16px",
                      boxShadow: ongoing ? `0 0 0 1px ${cat.color}44` : "none" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>

                      {/* Nimi + vuosi */}
                      <div style={{ flex:1, minWidth:160 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontWeight:600, fontSize:14, cursor:"pointer" }} onClick={() => setSelectedGroup({ ...group, category: cat.category, color: cat.color })}>{group.name}</span>
                          <span style={{ fontSize:11, color:"var(--text3)", background:"var(--bg3)", padding:"1px 7px", borderRadius:10 }}>s. {group.year}</span>
                          {ongoing && (
                            <span style={{ fontSize:11, fontWeight:600, color:cat.color, background:`${cat.color}20`, padding:"2px 8px", borderRadius:10, display:"flex", alignItems:"center", gap:4 }}>
                              <span style={{ width:6, height:6, borderRadius:"50%", background:cat.color, display:"inline-block", animation:"pulse 1.5s infinite" }} />
                              Käynnissä
                            </span>
                          )}
                          {today && !ongoing && (
                            <span style={{ fontSize:11, color:"#f59e0b", background:"rgba(245,158,11,0.12)", padding:"2px 8px", borderRadius:10 }}>Tänään</span>
                          )}
                        </div>

                        {/* Ajat + paikka */}
                        {group.day && (
                          <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                            <span style={{ fontSize:12, color:"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                              🗓 {group.day.charAt(0).toUpperCase()+group.day.slice(1)} {group.time}
                            </span>
                            <span style={{ fontSize:12, color:"var(--text2)", display:"flex", alignItems:"center", gap:4 }}>
                              📍 {group.location}
                            </span>
                          </div>
                        )}
                        {!group.day && group.location && (
                          <span style={{ fontSize:12, color:"var(--text3)" }}>📍 {group.location}</span>
                        )}
                      </div>

                      {/* Johtajat */}
                      {group.leaders.length > 0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                          <span style={{ fontSize:11, color:"var(--text3)", marginRight:2 }}>Johtajat:</span>
                          {group.leaders.map(name => {
                            const u = findUser(name)
                            return u ? (
                              <button key={name} onClick={() => setSelected(u)}
                                style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(79,126,247,0.1)", border:"1px solid rgba(79,126,247,0.25)", borderRadius:20, padding:"3px 10px 3px 4px", cursor:"pointer", fontFamily:"system-ui" }}>
                                <div style={{ position:"relative" }}>
                                  <Avatar src={u.photoURL} name={u.displayName} size={20} />
                                  <div style={{ position:"absolute", bottom:-1, right:-1, width:6, height:6, borderRadius:"50%", background:statusColor(u), border:"1.5px solid var(--bg2)" }} />
                                </div>
                                <span style={{ fontSize:12, color:"#4f7ef7", fontWeight:500 }}>{name}</span>
                              </button>
                            ) : (
                              <span key={name}
                                style={{ fontSize:12, color:"var(--text2)", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:20, padding:"3px 10px" }}>
                                {name}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Profiili-modal */}
      {selected && !showReport && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}
          onClick={() => setSelected(null)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:28, width:380, maxWidth:"90vw", textAlign:"center" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position:"relative", display:"inline-block", marginBottom:14 }}>
              <Avatar src={selected.photoURL} name={selected.displayName} size={72} />
              <div style={{ position:"absolute", bottom:2, right:2, width:14, height:14, borderRadius:"50%", background:statusColor(selected), border:"3px solid var(--bg2)" }} />
            </div>
            <div style={{ fontWeight:600, fontSize:18, marginBottom:3 }}>{selected.displayName}</div>
            <div style={{ fontSize:12, color:"var(--text2)", marginBottom:2 }}>{selected.role}</div>
            {selected.title && <div style={{ fontSize:12, color:"var(--text3)", marginBottom:8 }}>{selected.title}</div>}
            <div style={{ fontSize:12, color:"var(--text3)", marginBottom:14 }}>
              {selected.online ? "🟢 Paikalla" : `Viimeksi: ${formatLastSeen(selected.lastSeen)}`}
            </div>
            {selected.bio && (
              <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.6, background:"var(--bg3)", padding:"10px 14px", borderRadius:8, margin:"0 0 16px", textAlign:"left" }}>
                {selected.bio}
              </p>
            )}
            {selected.phone && <div style={{ fontSize:13, color:"var(--text3)", marginBottom:16 }}>📞 {selected.phone}</div>}
            <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
              <button onClick={() => setSelected(null)} style={btnGhost}>Sulje</button>
              <button onClick={() => { openDM(selected); setSelected(null) }} style={btnPrimary}>💬 Lähetä viesti</button>
              {selected.id !== user.uid && (
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
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:400, maxWidth:"90vw" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin:"0 0 6px", fontSize:16 }}>🚩 Raportoi: {selected.displayName}</h3>
            <p style={{ fontSize:12, color:"var(--text3)", margin:"0 0 16px" }}>Raportti menee hallintapaneeliin admineille.</p>
            {reportSent
              ? <div style={{ textAlign:"center", padding:20, color:"#22c55e" }}>✓ Lähetetty!</div>
              : <>
                  <textarea value={reportReason} onChange={e => setReportReason(e.target.value)}
                    placeholder="Kuvaile ongelma..." rows={4}
                    style={{ width:"100%", background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:14, fontFamily:"system-ui", resize:"none", outline:"none", boxSizing:"border-box" }} />
                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:12 }}>
                    <button onClick={() => setShowReport(false)} style={btnGhost}>Peruuta</button>
                    <button onClick={sendReport}
                      style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, color:"#f87171", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
                      Lähetä
                    </button>
                  </div>
                </>
            }
          </div>
        </div>
      )}

      {/* Ryhmän tiedot modal */}
      {selectedGroup && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={() => setSelectedGroup(null)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:500, maxWidth:"90vw", maxHeight:"80vh", overflowY:"auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, color:selectedGroup.color }}>{selectedGroup.name}</h3>
              <button onClick={() => setSelectedGroup(null)} style={{ background:"transparent", border:"none", color:"var(--text2)", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <div style={{ fontSize:13, color:"var(--text2)", lineHeight:1.6, marginBottom:20 }}>
              <p><strong>Kategoria:</strong> {selectedGroup.category}</p>
              <p><strong>Vuosi:</strong> {selectedGroup.year}</p>
              {selectedGroup.day && <p><strong>Aika:</strong> {selectedGroup.day.charAt(0).toUpperCase()+selectedGroup.day.slice(1)} {selectedGroup.time}</p>}
              <p><strong>Paikka:</strong> {selectedGroup.location}</p>
              {selectedGroup.description && <p><strong>Kuvaus:</strong> {selectedGroup.description}</p>}
            </div>
            {selectedGroup.leaders.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <h4 style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>Johtajat</h4>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {selectedGroup.leaders.map(name => {
                    const u = findUser(name)
                    return u ? (
                      <button key={name} onClick={() => { setSelected(u); setSelectedGroup(null) }}
                        style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(79,126,247,0.1)", border:"1px solid rgba(79,126,247,0.25)", borderRadius:20, padding:"3px 10px 3px 4px", cursor:"pointer", fontFamily:"system-ui" }}>
                        <div style={{ position:"relative" }}>
                          <Avatar src={u.photoURL} name={u.displayName} size={20} />
                          <div style={{ position:"absolute", bottom:-1, right:-1, width:6, height:6, borderRadius:"50%", background:statusColor(u), border:"1.5px solid var(--bg2)" }} />
                        </div>
                        <span style={{ fontSize:12, color:"#4f7ef7", fontWeight:500 }}>{name}</span>
                      </button>
                    ) : (
                      <span key={name} style={{ fontSize:12, color:"var(--text2)", background:"var(--bg3)", border:"1px solid var(--border)", borderRadius:20, padding:"3px 10px" }}>
                        {name}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

const btnPrimary = { background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }
const btnGhost   = { background:"transparent", border:"1px solid var(--border2)", borderRadius:8, color:"var(--text2)", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }