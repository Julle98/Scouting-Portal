// src/pages/EquipmentPage.jsx
import { useState, useEffect, useCallback, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp, getDoc, where, setDoc
} from "firebase/firestore"

// ── Kategoriat ja emojit ──────────────────────────────────────────────────────
const CATS = [
  { id: "Teltat",        emoji: "⛺", label: "Teltat" },
  { id: "Ruoanlaitto",   emoji: "🍳", label: "Ruoanlaitto" },
  { id: "Ensiapu",       emoji: "🏥", label: "Ensiapu" },
  { id: "Navigointi",    emoji: "🧭", label: "Navigointi" },
  { id: "Vaatetus",      emoji: "🥾", label: "Vaatetus" },
  { id: "Työkalut",      emoji: "🪛",  label: "Työkalut" },
  { id: "Viestintä",     emoji: "📻", label: "Viestintä" },
  { id: "Pelit & Urheilu", emoji: "⚽", label: "Pelit & Urheilu" },
  { id: "Kuljetukset",   emoji: "🚌", label: "Kuljetukset" },
  { id: "Muu",           emoji: "📦", label: "Muu" },
]

const CAT_IDS = CATS.map(c => c.id)

const EQUIPMENT_EMOJIS = [
  "⛺","🏕️","🪵","🛖","🧱",
  "🍳","🫕","🥘","🍲","☕","🫖","🥄","🍽️","🔪","🪣",
  "🏥","💊","🩹","🩺","🧴","🧼",
  "🧭","🗺️","📍","🔭","🌐",
  "🥾","🧤","🧢","🧣","🥋","👟","🪖",
  "🪛","🔧","🪚","🔨","⚙️","🔩","🪝","🧰",
  "🚣","⛵","🛶","🤿","🎣","🏊",
  "🔦","🕯️","💡","🔆","🪔",
  "📻","📡","🔋","📲","🖥️",
  "⚽","🏐","🏓","🥊","🎿","🏹","🎯","🪁",
  "🚌","🚐","🚲","🛺",
  "🎒","🪣","🧲","📦","🗃️","🏷️","🔑","🪪",
]

// ── Apufunktiot ───────────────────────────────────────────────────────────────
function isOverdue(res) {
  if (!res.endDate || res.status === "returned" || res.status === "denied") return false
  return new Date(res.endDate) < new Date()
}

function statusLabel(res) {
  if (res.status === "returned") return { text: "Palautettu ✓", color: "#22c55e", bg: "rgba(34,197,94,0.12)" }
  if (res.status === "denied")   return { text: "Hylätty",      color: "#ef4444", bg: "rgba(239,68,68,0.12)" }
  if (isOverdue(res))            return { text: "⚠️ Myöhässä",  color: "#f59e0b", bg: "rgba(245,158,11,0.15)" }
  if (res.status === "approved") return { text: "Hyväksytty",   color: "#4f7ef7", bg: "rgba(79,126,247,0.12)" }
  return { text: "Odottaa", color: "var(--text2)", bg: "rgba(255,255,255,0.06)" }
}

// ── Pääkomponentti ─────────────────────────────────────────────────────────────
export default function EquipmentPage() {
  const { user, profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isManager = isAdmin || profile?.role === "kalustovastaava" || profile?.roles?.includes("kalustovastaava")

  const [items, setItems]           = useState([])
  const [filter, setFilter]         = useState("kaikki")
  const [search, setSearch]         = useState("")
  const [showAdd, setShowAdd]       = useState(false)
  const [selected, setSelected]     = useState(null)
  const [showRequest, setShowRequest] = useState(false)
  const [allReservations, setAllReservations] = useState([])
  const [myReservations, setMyReservations]   = useState([])
  const [showAdminPanel, setShowAdminPanel]   = useState(false)
  const [adminTab, setAdminTab]     = useState("pending") // pending | active | history
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [debugUsersById, setDebugUsersById] = useState({})
  const [notification, setNotification] = useState(null)
  const [loadingItems, setLoadingItems] = useState(true)
  const reservationsRef = useRef(null)

  const [form, setForm] = useState({
    name:"", category:"Teltat", quantity:1, location:"", description:"", condition:"Hyvä", emoji:"⛺"
  })
  const [reqForm, setReqForm] = useState({ quantity:1, startDate:"", endDate:"", purpose:"" })

  // ── Kalusto-kuuntelu ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "equipment"), orderBy("name"))
    return onSnapshot(
      q,
      snap => {
        setItems(snap.docs.map(d => ({ id:d.id, ...d.data() })))
        setLoadingItems(false)
      },
      () => {
        setLoadingItems(false)
      }
    )
  }, [])

  // ── Kaikkien varausten kuuntelu (näytetään kaikille, hallinta erikseen) ─────
  useEffect(() => {
    const unsubs = []
    items.forEach(item => {
      const q = query(collection(db, "equipment", item.id, "reservations"), orderBy("createdAt","desc"))
      unsubs.push(onSnapshot(q, snap => {
        const resvs = snap.docs.map(d => ({ id:d.id, itemId:item.id, itemName:item.name, itemEmoji:item.emoji, ...d.data() }))
        setAllReservations(prev => [...prev.filter(r => r.itemId !== item.id), ...resvs])
      }))
    })
    return () => unsubs.forEach(u => u())
  }, [items])


  // ── Omien varausten kuuntelu ────────────────────────────────────────────────
  useEffect(() => {
    if (!items.length) return
    const unsubs = []
    items.forEach(item => {
      const q = query(
        collection(db, "equipment", item.id, "reservations"),
        where("requesterId", "==", user.uid),
        orderBy("createdAt","desc")
      )
      unsubs.push(onSnapshot(q, snap => {
        const resvs = snap.docs.map(d => ({ id:d.id, itemId:item.id, itemName:item.name, itemEmoji:item.emoji, ...d.data() }))
        setMyReservations(prev => [...prev.filter(r => r.itemId !== item.id), ...resvs])
      }))
    })
    return () => unsubs.forEach(u => u())
  }, [items, user.uid])

  useEffect(() => {
    if (!isManager) {
      setDebugUsersById({})
      return
    }

    return onSnapshot(collection(db, "users"), snap => {
      const next = {}
      snap.docs.forEach(d => {
        const data = d.data()
        next[d.id] = Boolean(data?.isDebug)
      })
      setDebugUsersById(next)
    })
  }, [isManager])

  // ── Suodatus ────────────────────────────────────────────────────────────────
  const filtered = items.filter(i => {
    const matchCat    = filter === "kaikki" || i.category === filter
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) ||
                        i.location?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // ── Ilmoitus ────────────────────────────────────────────────────────────────
  function showNotif(text, type = "success") {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 3500)
  }

  // ── Kalustokeskustelun luonti ──────────────────────────────────────────────
  async function createEquipmentChat(itemId, itemName, itemEmoji, purpose, reservationId, quantity, startDate, endDate) {
    try {
      const { getDocs } = await import("firebase/firestore")
      const usersSnap = await getDocs(collection(db, "users"))
      const users = usersSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      const hasRole = (u, roleName) => u.role === roleName || u.roles?.includes(roleName)
      const managers = users.filter(u =>
        u.id !== user.uid && (
          hasRole(u, "kalustovastaava") ||
          hasRole(u, "admin") ||
          hasRole(u, "lippukunnanjohtaja")
        )
      )
      const chatId = `equipment_${reservationId}`
      const participantIds = Array.from(new Set([user.uid, ...managers.map(manager => manager.id)]))

      await setDoc(doc(db, "directMessages", chatId), {
        participants: participantIds,
        managerIds: managers.map(manager => manager.id),
        requesterId: user.uid,
        requesterName: profile?.displayName,
        reservationId,
        itemId,
        itemName,
        itemEmoji: itemEmoji || "🎒",
        purpose: purpose || "",
        quantity,
        startDate,
        endDate,
        isEquipmentChat: true,
        status: "open",
        createdAt: serverTimestamp(),
        lastMessage: `Uusi varauspyyntö: ${itemName}`,
        lastMessageAt: serverTimestamp(),
      })

      await addDoc(collection(db, "directMessages", chatId, "messages"), {
        text: `📬 Varauspyyntö: ${itemName}\nKäyttötarkoitus: ${purpose || "–"}\nPäivät: ${startDate} – ${endDate}\nMäärä: ${quantity}`,
        itemId,
        itemName,
        reservationId,
        requesterId: user.uid,
        requesterName: profile?.displayName,
        senderId: user.uid,
        senderName: profile?.displayName,
        senderPhoto: profile?.photoURL || null,
        createdAt: serverTimestamp(),
        readBy: [user.uid],
        type: "equipment_request",
        reactions: {},
        deleted: false,
      })
      return chatId
    } catch (e) {
      console.error("DM-virhe:", e)
      return null
    }
  }

  // ── Lisää kalusto ───────────────────────────────────────────────────────────
  async function addItem() {
    if (!form.name.trim()) return
    await addDoc(collection(db, "equipment"), {
      ...form, quantity: Number(form.quantity), available: Number(form.quantity),
      ownerId: user.uid, ownerName: profile?.displayName,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    setForm({ name:"", category:"Teltat", quantity:1, location:"", description:"", condition:"Hyvä", emoji:"⛺" })
    setShowAdd(false)
    showNotif("Kalusto lisätty!")
  }

  async function deleteItem(id) {
    if (!confirm("Poistetaanko kalusto?")) return
    await deleteDoc(doc(db, "equipment", id))
    setSelected(null)
    showNotif("Kalusto poistettu.", "warn")
  }

  // ── Varauspyyntö ────────────────────────────────────────────────────────────
  async function requestReservation() {
    if (!selected || !reqForm.startDate || !reqForm.endDate) return
    const qty = Number(reqForm.quantity)
    if (qty > selected.available) { showNotif("Ei riittävästi saatavilla.", "error"); return }

    const resRef = await addDoc(collection(db, "equipment", selected.id, "reservations"), {
      itemId: selected.id, itemName: selected.name, itemEmoji: selected.emoji,
      quantity: qty,
      requesterId: user.uid, requesterName: profile?.displayName,
      startDate: reqForm.startDate, endDate: reqForm.endDate, purpose: reqForm.purpose,
      status: "pending", createdAt: serverTimestamp(),
    })
    await updateDoc(doc(db, "equipment", selected.id), { available: selected.available - qty })

    const chatId = await createEquipmentChat(
      selected.id,
      selected.name,
      selected.emoji,
      reqForm.purpose,
      resRef.id,
      qty,
      reqForm.startDate,
      reqForm.endDate,
    )

    setShowRequest(false)
    setReqForm({ quantity:1, startDate:"", endDate:"", purpose:"" })
    showNotif("Varauspyyntö lähetetty! Kalustokeskustelu avattu.")
    if (chatId) navigate(`/chat/equipment/${chatId}`)
  }

  // ── Hallintapaneelin toiminnot ───────────────────────────────────────────────
  async function approveReservation(res) {
    await updateDoc(doc(db, "equipment", res.itemId, "reservations", res.id), {
      status: "approved", approvedAt: serverTimestamp(), approvedBy: profile?.displayName
    })
    showNotif(`✓ Hyväksytty: ${res.itemName}`)
  }

  async function denyReservation(res) {
    await updateDoc(doc(db, "equipment", res.itemId, "reservations", res.id), {
      status: "denied", deniedAt: serverTimestamp()
    })
    const snap = await getDoc(doc(db, "equipment", res.itemId))
    await updateDoc(doc(db, "equipment", res.itemId), { available: (snap.data()?.available||0) + res.quantity })
    showNotif(`✗ Hylätty: ${res.itemName}`, "warn")
  }

  async function markReturned(res) {
    await updateDoc(doc(db, "equipment", res.itemId, "reservations", res.id), {
      status: "returned", returnedAt: serverTimestamp()
    })
    const snap = await getDoc(doc(db, "equipment", res.itemId))
    await updateDoc(doc(db, "equipment", res.itemId), { available: (snap.data()?.available||0) + res.quantity })
    showNotif(`✓ Merkitty palautetuksi: ${res.itemName}`)
  }

  // ── Lasketut taulukot ────────────────────────────────────────────────────────
  const pending  = allReservations.filter(r => r.status === "pending")
  const active   = allReservations.filter(r => r.status === "approved")
  const overdue  = allReservations.filter(r => r.status === "approved" && isOverdue(r))
  const history  = allReservations.filter(r => r.status === "returned" || r.status === "denied")
  const visibleHistory = history.filter(r => {
    if (isManager) return !debugUsersById[r.requesterId]
    return r.requesterId === user.uid
  })

  // Varaukset jotka näytetään kalusto-sivun alareunassa (kaikille näkyvät)
  const publicActive = allReservations.filter(r =>
    (r.status === "approved" || r.status === "pending") && !isOverdue(r)
  )

  // Näytetään kaikille varatut kalusteet
  const visibleReservations = isManager ? allReservations : publicActive

  const adminTabItems = adminTab === "pending" ? pending : adminTab === "active" ? active : visibleHistory

  // ── Hakuvirhe ───────────────────────────────────────────────────────────────
  const noResults = search.trim() !== "" && filtered.length === 0

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const action = params.get("action")
    if (!action) return

    if (action === "new-equipment") {
      if (isManager) setShowAdd(true)
      else setShowHistoryModal(true)
    } else if (action === "history") {
      if (isManager) {
        setShowAdminPanel(true)
        setAdminTab("history")
      } else {
        setShowHistoryModal(true)
      }
    } else if (action === "active-reservations") {
      setTimeout(() => {
        reservationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 0)
    }

    navigate(location.pathname, { replace: true })
  }, [location.search, location.pathname, isManager])

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flex:1, flexDirection:"column", overflow:"hidden", fontFamily:"system-ui" }}>

      {/* Yläpalkki */}
      <div style={{ padding:"0 24px", height:52, borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:12, background:"var(--bg2)", flexShrink:0 }}>
        <span style={{ fontWeight:700, fontSize:15, flex:1 }}>🎒 Kalusto</span>

        {isManager && overdue.length > 0 && (
          <button onClick={() => { setShowAdminPanel(true); setAdminTab("active") }}
            style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, color:"#ef4444", padding:"5px 12px", cursor:"pointer", fontSize:12 }}>
            ⚠️ {overdue.length} myöhässä
          </button>
        )}
        {isManager && pending.length > 0 && (
          <button onClick={() => { setShowAdminPanel(true); setAdminTab("pending") }}
            style={{ background:"rgba(245,158,11,0.15)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:8, color:"#f59e0b", padding:"5px 12px", cursor:"pointer", fontSize:12 }}>
            📬 {pending.length} pyyntöä
          </button>
        )}
        {isManager ? (
          <>
            <button onClick={() => setShowAdd(true)} style={btnPrimary}>➕ Lisää kalustoa</button>
            <button onClick={() => { setShowAdminPanel(true); setAdminTab("history") }} style={btnGhost}>📁 Kalustohistoria</button>
          </>
        ) : (
          <button onClick={() => setShowHistoryModal(true)} style={btnGhost}>📁 Kalustohistoria</button>
        )}
      </div>

      {/* Sisältö */}
      <div style={{ flex:1, overflowY:"auto", padding:24 }}>

        {/* Suodattimet */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20, alignItems:"center" }}>
          <button onClick={() => setFilter("kaikki")}
            style={filterBtn(filter === "kaikki")}>
            🗂️ Kaikki
          </button>
          {CATS.map(c => (
            <button key={c.id} onClick={() => setFilter(c.id)}
              style={filterBtn(filter === c.id)}>
              {c.emoji} {c.label}
            </button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Hae kalustetta..."
            style={{ marginLeft:"auto", ...inp, width:200 }}
          />
        </div>

        {loadingItems && (
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            padding:"56px 20px", gap:12, textAlign:"center"
          }}>
            <div style={{
              width:30,
              height:30,
              borderRadius:"50%",
              border:"3px solid var(--border2)",
              borderTopColor:"#4f7ef7",
              animation:"spin 0.8s linear infinite"
            }} />
            <div style={{ fontSize:14, color:"var(--text2)" }}>Haetaan varusteita...</div>
          </div>
        )}

        {/* ── Hakuvirhe ──────────────────────────────────────────────────────── */}
        {!loadingItems && noResults && (
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            padding:"60px 20px", gap:12, textAlign:"center"
          }}>
            <div style={{ fontSize:64 }}>🔍</div>
            <div style={{ fontSize:18, fontWeight:600, color:"var(--text)" }}>
              Kalustetta ei löydy
            </div>
            <div style={{ fontSize:14, color:"var(--text2)", maxWidth:320 }}>
              Haulla <strong style={{ color:"#f59e0b" }}>"{search}"</strong> ei löytynyt tuloksia.
              Tarkista hakusana tai selaa kategorioita.
            </div>
            <button onClick={() => { setSearch(""); setFilter("kaikki") }} style={{ ...btnPrimary, marginTop:8 }}>
              Tyhjennä haku
            </button>
          </div>
        )}

        {/* ── Kalustoruudukko ─────────────────────────────────────────────────── */}
        {!loadingItems && !noResults && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16, marginBottom:40 }}>
            {filtered.map(item => {
              const catObj = CATS.find(c => c.id === item.category)
              return (
                <div key={item.id} onClick={() => setSelected(item)}
                  style={{
                    background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:14,
                    overflow:"hidden", cursor:"pointer", transition:"all 0.15s",
                    boxShadow:"0 2px 8px rgba(0,0,0,0.2)"
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor="rgba(79,126,247,0.4)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor="var(--border)"}>
                  <div style={{ background:"var(--bg3)", padding:"20px 16px", textAlign:"center" }}>
                    <div style={{ fontSize:42 }}>{item.emoji || catObj?.emoji || "📦"}</div>
                    <div style={{ fontSize:11, color:"var(--text3)", marginTop:4 }}>
                      {catObj?.emoji} {item.category}
                    </div>
                  </div>
                  <div style={{ padding:"12px 16px" }}>
                    <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>{item.name}</div>
                    <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8 }}>📍 {item.location || "–"}</div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{
                        fontSize:11, padding:"2px 8px", borderRadius:5, fontWeight:500,
                        background: item.available > 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: item.available > 0 ? "#22c55e" : "#ef4444"
                      }}>
                        {item.available > 0 ? `${item.available}/${item.quantity} saatavilla` : "Ei saatavilla"}
                      </span>
                      <span style={{ fontSize:11, color:"var(--text3)" }}>{`Kunto: ${item.condition}`}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Varatut kalusteet -osio ──────────────────────────────────────────── */}
        {visibleReservations.filter(r => r.status !== "returned" && r.status !== "denied").length > 0 && (
          <div ref={reservationsRef} style={{ marginTop:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--text3)", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
              <span>📋 {isManager ? "Kaikki varaukset" : "Varatut kalusteet"}</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {visibleReservations
                .filter(r => r.status !== "returned" && r.status !== "denied")
                .sort((a,b) => {
                  // Myöhässä ensin
                  if (isOverdue(a) && !isOverdue(b)) return -1
                  if (!isOverdue(a) && isOverdue(b)) return 1
                  return 0
                })
                .map(res => {
                  const sl = statusLabel(res)
                  const od = isOverdue(res)
                  return (
                    <div key={res.id} style={{
                      background: od ? "rgba(245,158,11,0.06)" : "var(--bg2)",
                      border: od ? "1px solid rgba(245,158,11,0.25)" : "1px solid var(--border)",
                      borderRadius:12, padding:"12px 16px",
                      display:"flex", alignItems:"center", gap:14
                    }}>
                      <div style={{ fontSize:28, flexShrink:0 }}>{res.itemEmoji || "📦"}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                          <span style={{ fontWeight:600, fontSize:14 }}>{res.itemName}</span>
                          <span style={{ fontSize:11, padding:"2px 8px", borderRadius:5, background:sl.bg, color:sl.color, fontWeight:500 }}>{sl.text}</span>
                          {od && <span style={{ fontSize:11, color:"#ef4444" }}>🚨 Palautus myöhässä!</span>}
                        </div>
                        <div style={{ fontSize:12, color:"var(--text2)" }}>
                          👤 <strong style={{ color:"var(--text)" }}>{res.requesterName}</strong>
                          {res.purpose && <> · 🎯 <em>{res.purpose}</em></>}
                        </div>
                        <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>
                          📅 {res.startDate} – {res.endDate} · ×{res.quantity}
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Myöhässä / Kadonneet -yhteenveto */}
            {isManager && overdue.length > 0 && (
              <div style={{ marginTop:16, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ fontWeight:600, fontSize:13, color:"#ef4444", marginBottom:10 }}>
                  🚨 Myöhässä tai mahdollisesti kadonneet ({overdue.length})
                </div>
                {overdue.map(res => (
                  <div key={res.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize:20 }}>{res.itemEmoji || "📦"}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontWeight:500, fontSize:13 }}>{res.itemName} ×{res.quantity}</span>
                      <span style={{ fontSize:12, color:"var(--text2)", marginLeft:8 }}>
                        — {res.requesterName} · piti palauttaa {res.endDate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Kaluston tiedot -modal ───────────────────────────────────────────── */}
      {selected && !showRequest && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}
          onClick={() => setSelected(null)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:460, maxWidth:"90vw", maxHeight:"85vh", overflowY:"auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:56, textAlign:"center", marginBottom:10 }}>{selected.emoji}</div>
            <h2 style={{ margin:"0 0 2px", fontSize:20, textAlign:"center" }}>{selected.name}</h2>
            <p style={{ color:"var(--text3)", fontSize:13, margin:"0 0 18px", textAlign:"center" }}>
              {CATS.find(c => c.id === selected.category)?.emoji} {selected.category}
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                ["Sijainti", "📍 " + (selected.location || "–")],
                ["Kunto", selected.condition],
                ["Saatavilla", `${selected.available} / ${selected.quantity}`],
                ["Vastuuhenkilö", selected.ownerName || "–"],
              ].map(([k,v]) => (
                <div key={k} style={{ background:"var(--bg3)", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:10, color:"var(--text3)", marginBottom:4, textTransform:"uppercase" }}>{k}</div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{v}</div>
                </div>
              ))}
            </div>
            {selected.description && (
              <p style={{ fontSize:13, color:"var(--text2)", lineHeight:1.6, background:"var(--bg3)", padding:"10px 12px", borderRadius:8, margin:"0 0 16px" }}>
                {selected.description}
              </p>
            )}
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap" }}>
              {(selected.ownerId === user.uid || isAdmin) && (
                <button onClick={() => deleteItem(selected.id)} style={{ ...btnGhost, color:"#f87171", borderColor:"rgba(239,68,68,0.3)" }}>
                  🗑️ Poista
                </button>
              )}
              <button onClick={() => setSelected(null)} style={btnGhost}>Sulje</button>
              {selected.available > 0 && (
                <button onClick={() => setShowRequest(true)} style={btnPrimary}>📬 Pyydä varausta</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Varauspyyntö-modal ──────────────────────────────────────────────── */}
      {showRequest && selected && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:110 }}
          onClick={() => setShowRequest(false)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:420, maxWidth:"90vw" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <span style={{ fontSize:32 }}>{selected.emoji}</span>
              <div>
                <h3 style={{ margin:0, fontSize:16 }}>Varauspyyntö</h3>
                <p style={{ margin:"2px 0 0", fontSize:13, color:"var(--text2)" }}>{selected.name}</p>
              </div>
            </div>
            <div style={{ background:"rgba(79,126,247,0.08)", border:"1px solid rgba(79,126,247,0.2)", borderRadius:8, padding:"10px 12px", marginBottom:16, fontSize:12, color:"var(--text2)" }}>
              💬 Pyyntö avaa automaattisesti keskustelun kalustovastaavan kanssa.
            </div>
            <label style={lbl}>Määrä (max {selected.available})</label>
            <input type="number" min={1} max={selected.available} value={reqForm.quantity}
              onChange={e => setReqForm(s => ({...s, quantity:e.target.value}))} style={inp} />
            <label style={lbl}>Alkupäivä</label>
            <input type="date" value={reqForm.startDate}
              onChange={e => setReqForm(s => ({...s, startDate:e.target.value}))} style={inp} />
            <label style={lbl}>Loppupäivä</label>
            <input type="date" value={reqForm.endDate}
              onChange={e => setReqForm(s => ({...s, endDate:e.target.value}))} style={inp} />
            <label style={lbl}>Käyttötarkoitus</label>
            <input value={reqForm.purpose}
              onChange={e => setReqForm(s => ({...s, purpose:e.target.value}))}
              placeholder="esim. Kesäleiri 2025" style={inp} />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button onClick={() => setShowRequest(false)} style={btnGhost}>Peruuta</button>
              <button onClick={requestReservation} style={btnPrimary}>📬 Lähetä pyyntö</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Kalustovastaavan hallintapaneeli ─────────────────────────────────── */}
      {showAdminPanel && isManager && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }}
          onClick={() => setShowAdminPanel(false)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:560, maxWidth:"94vw", maxHeight:"85vh", overflowY:"auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>🛠️ Kaluston hallinta</span>
              <button onClick={() => setShowAdminPanel(false)} style={{ background:"transparent", border:"none", color:"var(--text2)", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>

            {/* Välilehdet */}
            <div style={{ display:"flex", gap:4, marginBottom:20, background:"var(--bg)", borderRadius:10, padding:4 }}>
              {[
                { id:"pending", label:`📬 Odottavat`, count:pending.length },
                { id:"active",  label:`✅ Aktiiviset`, count:active.length },
                { id:"history", label:`📁 Historia`,  count:visibleHistory.length },
              ].map(t => (
                <button key={t.id} onClick={() => setAdminTab(t.id)}
                  style={{
                    flex:1, padding:"7px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:500,
                    background: adminTab===t.id ? "#4f7ef7" : "transparent",
                    color: adminTab===t.id ? "#fff" : "var(--text2)"
                  }}>
                  {t.label} {t.count > 0 && <span style={{ background:"rgba(255,255,255,0.2)", borderRadius:10, padding:"0 5px", marginLeft:4 }}>{t.count}</span>}
                </button>
              ))}
            </div>

            {adminTabItems.length === 0 && (
              <p style={{ color:"var(--text3)", textAlign:"center", padding:"24px 0" }}>Ei merkintöjä.</p>
            )}

            {adminTabItems.map(r => {
              const sl = statusLabel(r)
              const od = isOverdue(r)
              return (
                <div key={r.id} style={{
                  background: od ? "rgba(245,158,11,0.06)" : "var(--bg3)",
                  border: od ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.06)",
                  borderRadius:10, padding:"12px 14px", marginBottom:10
                }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                    <span style={{ fontSize:24, flexShrink:0 }}>{r.itemEmoji || "📦"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                        <span style={{ fontWeight:600, fontSize:14 }}>{r.itemName}</span>
                        <span style={{ fontSize:11 }}>×{r.quantity}</span>
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:5, background:sl.bg, color:sl.color, fontWeight:500 }}>{sl.text}</span>
                      </div>
                      <div style={{ fontSize:12, color:"var(--text2)", marginBottom:2 }}>
                        👤 <strong style={{ color:"var(--text)" }}>{r.requesterName}</strong>
                        {r.purpose && <> · 🎯 <em style={{ color:"var(--text3)" }}>{r.purpose}</em></>}
                      </div>
                      <div style={{ fontSize:11, color:"var(--text3)" }}>📅 {r.startDate} – {r.endDate}</div>
                      {od && <div style={{ fontSize:11, color:"#ef4444", marginTop:4, fontWeight:500 }}>🚨 Palautus myöhässä!</div>}
                    </div>
                  </div>

                </div>
              )
            })}

            <button onClick={() => setShowAdminPanel(false)} style={{ ...btnGhost, marginTop:8, width:"100%" }}>Sulje</button>
          </div>
        </div>
      )}

      {/* ── Kalustohistoria (kaikille) ─────────────────────────────────────── */}
      {showHistoryModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:120 }} onClick={() => setShowHistoryModal(false)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:560, maxWidth:"94vw", maxHeight:"85vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>📁 Kalustohistoria</span>
              <button onClick={() => setShowHistoryModal(false)} style={{ background:"transparent", border:"none", color:"var(--text2)", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>

            {visibleHistory.length === 0 && (
              <p style={{ color:"var(--text3)", textAlign:"center", padding:"24px 0" }}>Ei historiatietoja.</p>
            )}

            {visibleHistory.map(r => {
              const sl = statusLabel(r)
              return (
                <div key={r.id} style={{ background:"var(--bg3)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, padding:"12px 14px", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                    <span style={{ fontSize:24, flexShrink:0 }}>{r.itemEmoji || "📦"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                        <span style={{ fontWeight:600, fontSize:14 }}>{r.itemName}</span>
                        <span style={{ fontSize:11 }}>×{r.quantity}</span>
                        <span style={{ fontSize:11, padding:"2px 8px", borderRadius:5, background:sl.bg, color:sl.color, fontWeight:500 }}>{sl.text}</span>
                      </div>
                      <div style={{ fontSize:12, color:"var(--text2)", marginBottom:2 }}>👤 {r.requesterName}</div>
                      <div style={{ fontSize:11, color:"var(--text3)" }}>📅 {r.startDate} – {r.endDate}</div>
                    </div>
                  </div>
                </div>
              )
            })}

            <button onClick={() => setShowHistoryModal(false)} style={{ ...btnGhost, marginTop:8, width:"100%" }}>Sulje</button>
          </div>
        </div>
      )}

      {/* ── Lisää kalusto -modal ─────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}
          onClick={() => setShowAdd(false)}>
          <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:24, width:460, maxWidth:"92vw", maxHeight:"90vh", overflowY:"auto" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin:"0 0 18px" }}>➕ Lisää kalusto</h3>

            <label style={lbl}>Valitse emoji</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8, background:"var(--bg3)", borderRadius:10, padding:8 }}>
              {EQUIPMENT_EMOJIS.map(e => (
                <button key={e} onClick={() => setForm(s => ({...s, emoji:e}))}
                  style={{ fontSize:20, padding:"4px 6px", cursor:"pointer", border: form.emoji===e ? "2px solid #4f7ef7" : "2px solid transparent", background: form.emoji===e ? "rgba(79,126,247,0.15)" : "transparent", borderRadius:8 }}>
                  {e}
                </button>
              ))}
            </div>

            <label style={lbl}>Nimi *</label>
            <input value={form.name} onChange={e => setForm(s => ({...s, name:e.target.value}))} placeholder="esim. 3-hengen teltta" style={inp} />

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <label style={lbl}>Kategoria</label>
                <select value={form.category} onChange={e => setForm(s => ({...s, category:e.target.value}))} style={inp}>
                  {CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Määrä</label>
                <input type="number" min={1} value={form.quantity} onChange={e => setForm(s => ({...s, quantity:e.target.value}))} style={inp} />
              </div>
            </div>

            <label style={lbl}>Sijainti</label>
            <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
              {["Jousiksen kolo","Tähtiksen kolo","Kämppä"].map(loc=>(
                <button key={loc} type="button"
                  onClick={()=>setForm(s=>({...s,location:loc}))}
                  style={{padding:"4px 10px",fontSize:12,borderRadius:20,cursor:"pointer",fontFamily:"system-ui",
                    background:form.location===loc?"rgba(79,126,247,0.2)":"var(--bg3)",
                    border:form.location===loc?"1px solid #4f7ef7":"1px solid var(--border2)",
                    color:form.location===loc?"#4f7ef7":"var(--text2)"}}>
                  {loc}
                </button>
              ))}
            </div>
            <input value={form.location} onChange={e => setForm(s => ({...s, location:e.target.value}))} placeholder="tai kirjoita oma sijainti..." style={inp} />

            <label style={lbl}>Kunto</label>
            <select value={form.condition} onChange={e => setForm(s => ({...s, condition:e.target.value}))} style={inp}>
              {["Erinomainen","Hyvä","Tyydyttävä","Huono"].map(c => <option key={c}>{c}</option>)}
            </select>

            <label style={lbl}>Kuvaus</label>
            <textarea value={form.description} onChange={e => setForm(s => ({...s, description:e.target.value}))} placeholder="Lisätietoja..." rows={3} style={{ ...inp, resize:"vertical" }} />

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
              <button onClick={() => setShowAdd(false)} style={btnGhost}>Peruuta</button>
              <button onClick={addItem} style={btnPrimary}>✓ Tallenna</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast-ilmoitus ──────────────────────────────────────────────────── */}
      {notification && (
        <div style={{
          position:"fixed", bottom:24, right:24, zIndex:400,
          background: notification.type === "error" ? "#2d1b1b" : notification.type === "warn" ? "#2a2011" : "#1a2a1a",
          border: `1px solid ${notification.type === "error" ? "rgba(239,68,68,0.4)" : notification.type === "warn" ? "rgba(245,158,11,0.4)" : "rgba(34,197,94,0.4)"}`,
          borderRadius:12, padding:"12px 18px", color:"var(--text)", fontSize:13,
          maxWidth:320, boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
          animation:"slideIn 0.2s ease"
        }}>
          {notification.text}
        </div>
      )}

      <style>{`@keyframes slideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)};}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Tyylit ─────────────────────────────────────────────────────────────────────
const filterBtn = active => ({
  padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:500, cursor:"pointer",
  border: active ? "1px solid #4f7ef7" : "1px solid var(--border2)",
  background: active ? "rgba(79,126,247,0.15)" : "transparent",
  color: active ? "#4f7ef7" : "var(--text2)", fontFamily:"system-ui", whiteSpace:"nowrap"
})

const inp = {
  width:"100%", background:"var(--bg3)", border:"1px solid var(--border2)",
  borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:14,
  boxSizing:"border-box", fontFamily:"system-ui", outline:"none"
}
const lbl = { display:"block", fontSize:12, fontWeight:500, color:"var(--text2)", marginBottom:6, marginTop:12 }
const btnPrimary = { background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:500, fontFamily:"system-ui" }
const btnGhost = { background:"transparent", border:"1px solid var(--border2)", borderRadius:8, color:"var(--text2)", padding:"8px 16px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }