// src/pages/ChatPage.jsx
import { useState, useEffect, useRef } from "react"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  setDoc, getDoc, where
} from "firebase/firestore"
import { approveReservation, denyReservation, markReturned } from "../services/equipmentService"
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { getApp } from "firebase/app"
import { Avatar } from "../components/ui/Avatar"
import { useLinkWarning, LinkWarningModal, TextWithLinks } from "../components/ui/LinkWarning"

const EMOJIS = ["😀","😂","🥰","😎","🤔","😅","🙏","👍","👎","❤️","🔥","✅","⚠️","🎉","🏕️","⛺","🧭","🎒","🍳","💪","🤝","👏","😴","🤣","😤","🫡","🌟","💯","🆗","🆒"]
const GIPHY_KEY = "REPLACE_WITH_YOUR_OWN"
const QUICK_REACTIONS = ["👍","❤️","😂","🔥","🎉","😎"]
const MAX_MSG_LENGTH = 1000

export default function ChatPage() {
  const { user, profile, isAdmin } = useAuth()
  const isEquipmentManager = isAdmin || profile?.role === "kalustovastaava" || profile?.roles?.includes("kalustovastaava")
  const [channels, setChannels]       = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [equipmentRequestDetails, setEquipmentRequestDetails] = useState(null)
  const [activeDm, setActiveDm]       = useState(null)
  const [messages, setMessages]       = useState([])
  const [channelBadges, setChannelBadges] = useState({})
  const [dmBadges, setDmBadges] = useState({})
  const [text, setText]               = useState("")
  const [replyTo, setReplyTo]         = useState(null)
  const [editingMsg, setEditingMsg]   = useState(null)
  const [editText, setEditText]       = useState("")
  const [pendingGif, setPendingGif]   = useState(null)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading]     = useState(false)
  const [showAttach, setShowAttach]   = useState(false)
  const [showEmoji, setShowEmoji]     = useState(false)
  const [showGif, setShowGif]         = useState(false)
  const [gifSearch, setGifSearch]     = useState("")
  const [gifResults, setGifResults]   = useState([])
  const [gifLoading, setGifLoading]   = useState(false)
  const [gifOffset, setGifOffset]     = useState(0)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [showNewDM, setShowNewDM]     = useState(false)
  const [showInvite, setShowInvite]   = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showChannelInfo, setShowChannelInfo] = useState(false)
  const [newCh, setNewCh]             = useState({ name:"", type:"public", description:"" })
  const [editCh, setEditCh]           = useState({ name:"", description:"", slowMode:0 })
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole]   = useState("johtaja")
  const [allUsers, setAllUsers]       = useState([])
  const [showMembers, setShowMembers] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [modQueue, setModQueue]       = useState([])
  const [contextMenu, setContextMenu] = useState(null)
  const [profileModal, setProfileModal] = useState(null)
  const [hoverMsg, setHoverMsg]       = useState(null)
  const [mutedChannels, setMutedChannels] = useState({})
  const [notifications, setNotifications] = useState([])
  // DM settings
  const [dmSettings, setDmSettings]   = useState(false)
  const [dmNotes, setDmNotes]         = useState({})
  const [editingDmNote, setEditingDmNote] = useState(false)
  const [dmNoteText, setDmNoteText]   = useState("")
  const [dmReportReason, setDmReportReason] = useState("")
  const [dmReportSent, setDmReportSent] = useState(false)
  const [readDetails, setReadDetails]   = useState(null) // { msg, sent, read }
  // Slow mode
  const [lastSentAt, setLastSentAt]   = useState(0)
  const [slowModeLeft, setSlowModeLeft] = useState(0)
  // @ mentions
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionIndex, setMentionIndex] = useState(0)

  const messagesEndRef = useRef(null)
  const gifSearchTimer = useRef(null)
  const fileInputRef   = useRef(null)
  const slowModeTimer  = useRef(null)
  const textAreaRef    = useRef(null)
  const { pending: linkPending, open: openLink, close: closeLink } = useLinkWarning()

  let storage = null
  try { storage = getStorage(getApp()) } catch {}

  // Kanavat
  useEffect(() => {
    const q = query(collection(db, "channels"), orderBy("name"))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      setChannels(all.filter(ch => ch.type==="public" || ch.members?.includes(user.uid)))
      setActiveChannel(prev => prev ? (all.find(ch=>ch.id===prev.id)||null) : null)
    })
  }, [user.uid])

  // Käyttäjät
  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap =>
      setAllUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => !u.isInvisible))
    )
  }, [])

  // Kanava- ja DM-ilmaisinlukemat / @maininnat
  useEffect(() => {
    if (!profile) return

    const myTag = profile.displayName?.split(" ")[0]?.toLowerCase()
    const channelUnsubs = channels.map(ch => {
      const q = query(collection(db, "channels", ch.id, "messages"), orderBy("createdAt", "desc"), limit(200))
      return onSnapshot(q, snap => {
        let mentions = 0
        let unread = 0
        snap.docs.forEach(d => {
          const m = d.data()
          if (m.senderId === user.uid || m.deleted) return
          const isUnread = !(m.readBy||[]).includes(user.uid)
          if (isUnread) unread++
          const txt = (m.text || "").toLowerCase()
          if (myTag && txt.includes("@" + myTag) && isUnread) mentions++
        })
        setChannelBadges(prev => ({ ...prev, [ch.id]: { unread, mentions } }))
      })
    })

    const dmUnsubs = allUsers.filter(u=>u.id!==user.uid).map(other => {
      const dmId = [user.uid, other.id].sort().join("_")
      const q = query(collection(db, "directMessages", dmId, "messages"), orderBy("createdAt", "desc"), limit(200))
      return onSnapshot(q, snap => {
        let unread = 0
        snap.docs.forEach(d => {
          const m = d.data()
          if (m.senderId === user.uid || m.deleted) return
          if (!(m.readBy||[]).includes(user.uid)) unread++
        })
        setDmBadges(prev => ({ ...prev, [dmId]: { unread } }))
      })
    })

    return () => {
      channelUnsubs.forEach(unsub => unsub())
      dmUnsubs.forEach(unsub => unsub())
    }
  }, [channels, allUsers, user.uid, profile])

  // Auto-luo muistiinpano-DM
  useEffect(() => {
    if (!user) return
    const selfId = user.uid+"_"+user.uid
    getDoc(doc(db,"directMessages",selfId)).then(snap => {
      if (!snap.exists()) setDoc(doc(db,"directMessages",selfId),{ participants:[user.uid,user.uid], lastMessageAt:serverTimestamp(), lastMessage:"", isSelfNote:true })
    })
  }, [user])

  // Viestit
  useEffect(() => {
    if (!activeChannel && !activeDm) { setMessages([]); return }
    const path = activeChannel
      ? collection(db,"channels",activeChannel.id,"messages")
      : collection(db,"directMessages",activeDm.id,"messages")
    const q = query(path, orderBy("createdAt","asc"), limit(100))
    return onSnapshot(q, snap => {
      const newMsgs = snap.docs.map(d=>({id:d.id,...d.data()}))
      setMessages(prev => {
        if (prev.length>0 && newMsgs.length>prev.length) {
          const newest = newMsgs[newMsgs.length-1]
          if (newest.senderId!==user.uid && !isChannelMuted(activeChannel?.id||activeDm?.id))
            pushNotif("chat",`${newest.senderName}: ${newest.text?.slice(0,60)||"GIF"}`,activeChannel?`#${activeChannel.name}`:activeDm?.otherUser?.displayName,newest)
        }
        return newMsgs
      })
      setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:"smooth"}),50)
    })
  }, [activeChannel?.id, activeDm?.id])

  // Luetuksi merkintä
  useEffect(() => {
    if (!activeChannel && !activeDm) return
    messages.forEach(msg => {
      if (msg.senderId!==user.uid && !msg.readBy?.includes(user.uid) && !msg.deleted) {
        const path = activeChannel
          ? doc(db,"channels",activeChannel.id,"messages",msg.id)
          : doc(db,"directMessages",activeDm.id,"messages",msg.id)
        updateDoc(path,{readBy:arrayUnion(user.uid)}).catch(()=>{})
      }
    })
  }, [messages, activeChannel?.id, activeDm?.id])

  // Moderointi
  useEffect(() => {
    if (!isAdmin) return
    const q = query(collection(db,"moderation"),where("status","==","pending"),orderBy("createdAt","desc"))
    return onSnapshot(q, snap=>setModQueue(snap.docs.map(d=>({id:d.id,...d.data()}))))
  }, [isAdmin])

  // Online-päivitys
  useEffect(() => {
    if (!user) return
    const update = async () => {
      const snap = await getDoc(doc(db,"users",user.uid))
      if (snap.data()?.status!=="offline")
        updateDoc(doc(db,"users",user.uid),{online:true,lastSeen:serverTimestamp()})
    }
    update()
    const iv = setInterval(update,30000)
    return ()=>clearInterval(iv)
  }, [user])

  // GIF
  useEffect(() => {
    if (!showGif) return
    clearTimeout(gifSearchTimer.current)
    gifSearchTimer.current = setTimeout(()=>fetchGifs(gifSearch),400)
    return ()=>clearTimeout(gifSearchTimer.current)
  }, [gifSearch, showGif])

  // Slow mode countdown
  useEffect(() => {
    if (slowModeLeft<=0) return
    slowModeTimer.current = setTimeout(()=>setSlowModeLeft(s=>Math.max(0,s-1)),1000)
    return ()=>clearTimeout(slowModeTimer.current)
  }, [slowModeLeft])

  // Auto-resize textarea
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto'
      textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px'
    }
  }, [text])

  function isChannelMuted(id) {
    const until = mutedChannels[id]
    if (!until) return false
    if (Date.now()>until) { setMutedChannels(prev=>{const n={...prev};delete n[id];return n}); return false }
    return true
  }

  function pushNotif(type,body,title,data) {
    if (profile?.status === 'busy') return
    const id = Date.now()
    setNotifications(prev=>[...prev,{id,type,body,title,data}])
    setTimeout(()=>setNotifications(prev=>prev.filter(n=>n.id!==id)),5000)
  }

  async function fetchGifs(q, append = false) {
    setGifLoading(true)
    try {
      const offset = append ? gifOffset : 0
      const url = q.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=9&offset=${offset}&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=9&offset=${offset}&rating=g`
      const res = await fetch(url)
      const data = await res.json()
      if (append) {
        setGifResults(prev => [...prev, ...data.data])
        setGifOffset(prev => prev + 9)
      } else {
        setGifResults(data.data || [])
        setGifOffset(9)
      }
    } catch { 
      if (!append) setGifResults([])
    }
    setGifLoading(false)
  }

  async function uploadFiles(files) {
    if (!storage) { alert("Firebase Storage ei ole käytössä."); return [] }
    setUploading(true)
    const urls = []
    for (const file of files) {
      const sRef = storageRef(storage,`messages/${user.uid}/${Date.now()}_${file.name}`)
      await new Promise((res,rej) => {
        const task = uploadBytesResumable(sRef,file)
        task.on("state_changed",null,rej,async()=>{ urls.push({url:await getDownloadURL(task.snapshot.ref),name:file.name,type:file.type,size:file.size}); res() })
      })
    }
    setUploading(false)
    return urls
  }

  async function sendMessage(gifUrl=null, gifPreview=null) {
    const t = text.trim()
    if (!t && !gifUrl && pendingFiles.length===0) return
    if (!activeChannel && !activeDm) return

    // Viestiraja
    if (t.length > MAX_MSG_LENGTH) return

    // Slow mode
    const slowSec = activeChannel?.slowMode || 0
    if (slowSec > 0 && !isAdmin) {
      const elapsed = (Date.now()-lastSentAt)/1000
      if (elapsed < slowSec) {
        setSlowModeLeft(Math.ceil(slowSec-elapsed))
        return
      }
    }

    let attachments = []
    if (pendingFiles.length>0) attachments = await uploadFiles(pendingFiles)

    const payload = {
      text:t, gifUrl, gifPreview, attachments,
      senderId:user.uid, senderName:profile?.displayName||"Johtaja", senderPhoto:profile?.photoURL||null,
      replyTo: replyTo?{id:replyTo.id,text:replyTo.text?.slice(0,80),senderName:replyTo.senderName}:null,
      createdAt:serverTimestamp(), reactions:{}, deleted:false, readBy:[user.uid],
    }
    if (activeChannel) await addDoc(collection(db,"channels",activeChannel.id,"messages"),payload)
    else {
      await addDoc(collection(db,"directMessages",activeDm.id,"messages"),payload)
      await updateDoc(doc(db,"directMessages",activeDm.id),{lastMessage:t||(gifUrl?"GIF":"Liite"),lastMessageAt:serverTimestamp()})
    }
    setText(""); setPendingGif(null); setPendingFiles([]); setReplyTo(null)
    setShowEmoji(false); setShowGif(false)
    setLastSentAt(Date.now())
    if (slowSec>0) setSlowModeLeft(slowSec)
  }

  async function saveEdit() {
    if (!editingMsg||!editText.trim()) return
    const path = activeChannel
      ? doc(db,"channels",activeChannel.id,"messages",editingMsg.id)
      : doc(db,"directMessages",activeDm.id,"messages",editingMsg.id)
    await updateDoc(path,{text:editText.trim(),edited:true,editedAt:serverTimestamp()})
    setEditingMsg(null); setEditText("")
  }

  async function toggleReaction(msg,emoji) {
    const path = activeChannel
      ? doc(db,"channels",activeChannel.id,"messages",msg.id)
      : doc(db,"directMessages",activeDm.id,"messages",msg.id)
    const current = msg.reactions?.[emoji]||[]
    await updateDoc(path,{[`reactions.${emoji}`]:current.includes(user.uid)?arrayRemove(user.uid):arrayUnion(user.uid)})
  }

  async function deleteMessage(msg) {
    const path = activeChannel
      ? doc(db,"channels",activeChannel.id,"messages",msg.id)
      : doc(db,"directMessages",activeDm.id,"messages",msg.id)
    await updateDoc(path,{deleted:true,text:""})
    setContextMenu(null)
  }

  async function reportMessage(msg) {
    await addDoc(collection(db,"moderation"),{
      channelId:activeChannel?.id||activeDm?.id, messageId:msg.id, messageText:msg.text,
      reporterId:user.uid, reporterName:profile?.displayName, status:"pending", createdAt:serverTimestamp(),
    })
    setContextMenu(null)
    pushNotif("info","Viesti raportoitu","Moderointi")
  }

  async function createChannel() {
    if (!newCh.name.trim()) return
    const slug = newCh.name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-äöå]/g,"")
    await addDoc(collection(db,"channels"),{
      name:slug,type:newCh.type,description:newCh.description,
      createdBy:user.uid,createdByName:profile?.displayName,
      members:[user.uid],moderators:[user.uid],
      writeRestricted:false,slowMode:0,createdAt:serverTimestamp(),
    })
    setShowNewChannel(false); setNewCh({name:"",type:"public",description:""})
  }

  async function saveChannelSettings() {
    if (!activeChannel||!editCh.name.trim()) return
    await updateDoc(doc(db,"channels",activeChannel.id),{
      name:editCh.name.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-äöå]/g,""),
      description:editCh.description,
      slowMode:Number(editCh.slowMode)||0,
    })
    pushNotif("success","Kanavan asetukset tallennettu")
  }

  async function deleteChannel() {
    if (!activeChannel) return
    if (!confirm(`Poistetaanko kanava #${activeChannel.name}?`)) return
    await deleteDoc(doc(db,"channels",activeChannel.id))
    setActiveChannel(null); setShowChannelSettings(false)
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    await addDoc(collection(db,"invites"),{email:inviteEmail.trim().toLowerCase(),role:inviteRole,invitedBy:user.uid,invitedByName:profile?.displayName,used:false,createdAt:serverTimestamp()})
    setInviteEmail(""); setShowInvite(false)
    pushNotif("success","Kutsu lähetetty!")
  }

  async function openDM(targetUser) {
    const isSelf = targetUser.id===user.uid
    const dmId = isSelf ? user.uid+"_"+user.uid : [user.uid,targetUser.id].sort().join("_")
    const ref2 = doc(db,"directMessages",dmId)
    const snap = await getDoc(ref2)
    if (!snap.exists()) await setDoc(ref2,{participants:isSelf?[user.uid,user.uid]:[user.uid,targetUser.id],lastMessageAt:serverTimestamp(),lastMessage:"",isSelfNote:isSelf})
    const label = isSelf?{...targetUser,displayName:"📝 Muistiinpanot"}:targetUser
    setActiveDm({id:dmId,otherUser:label,isSelfNote:isSelf})
    setActiveChannel(null); setDmSettings(false)
  }

  async function resolveReport(id,action) { await updateDoc(doc(db,"moderation",id),{status:action,resolvedAt:serverTimestamp()}) }
  async function addMemberToChannel(uid) { if (!activeChannel || !isChannelAdmin) return; await updateDoc(doc(db,"channels",activeChannel.id),{members:arrayUnion(uid)}) }
  async function toggleModerator(uid) {
    if (!activeChannel || !isChannelAdmin) return
    const m = activeChannel.moderators || []
    await updateDoc(doc(db,"channels",activeChannel.id),{
      moderators: m.includes(uid) ? arrayRemove(uid) : arrayUnion(uid)
    })
  }

  async function removeMemberFromChannel(uid) {
    if (!activeChannel || !isChannelAdmin) return
    await updateDoc(doc(db,"channels",activeChannel.id),{members:arrayRemove(uid),moderators:arrayRemove(uid)})
  }

  async function toggleWriteRestricted() {
    if (!activeChannel || !isChannelAdmin) return
    await updateDoc(doc(db,"channels",activeChannel.id),{writeRestricted:!activeChannel.writeRestricted})
  }

  async function sendEquipmentStatusUpdate(actionLabel) {
    if (!activeDm) return
    await addDoc(collection(db,"directMessages",activeDm.id,"messages"), {
      text: actionLabel,
      senderId: user.uid,
      senderName: profile?.displayName,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      type: "equipment_action",
    })
  }

  async function handleApproveRequest() {
    if (!equipmentRequestDetails) return
    await approveReservation(equipmentRequestDetails.itemId, equipmentRequestDetails.id)
    await sendEquipmentStatusUpdate(`✅ Varaus hyväksytty: ${equipmentRequestDetails.itemName}`)
  }

  async function handleDenyRequest() {
    if (!equipmentRequestDetails) return
    await denyReservation(equipmentRequestDetails.itemId, equipmentRequestDetails.id, equipmentRequestDetails.quantity)
    await sendEquipmentStatusUpdate(`✗ Varaus hylätty: ${equipmentRequestDetails.itemName}`)
  }

  async function handleMarkReturned() {
    if (!equipmentRequestDetails) return
    await markReturned(equipmentRequestDetails.itemId, equipmentRequestDetails.id, equipmentRequestDetails.quantity)
    await sendEquipmentStatusUpdate(`📥 Palautettu: ${equipmentRequestDetails.itemName}`)
  }

  function muteChannel(channelId,minutes) {
    setMutedChannels(prev=>({...prev,[channelId]:Date.now()+minutes*60000}))
    pushNotif("info",`Kanava mykistetty ${minutes} minuutiksi`)
    setContextMenu(null)
  }

  function openChannelSettings() {
    if (!isChannelAdmin) return
    setEditCh({name:activeChannel.name,description:activeChannel.description||"",slowMode:activeChannel.slowMode||0})
    setShowChannelSettings(true)
  }

  function openChannelInfo() {
    if (!activeChannel) return
    setShowChannelInfo(true)
  }

  function formatTime(ts) { if (!ts) return ""; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"}) }
  function formatDate(ts) { if (!ts) return ""; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleDateString("fi-FI") }
  function formatLastSeen(ts) {
    if (!ts) return "Ei tietoa"
    const d=ts.toDate?ts.toDate():new Date(ts); const diff=(Date.now()-d.getTime())/1000/60
    if (diff<2) return "Juuri nyt"; if (diff<60) return `${Math.round(diff)} min sitten`
    if (diff<1440) return `${Math.round(diff/60)} t sitten`; return d.toLocaleDateString("fi-FI")
  }
  function formatFileSize(b) { if (b<1024) return b+" B"; if (b<1048576) return (b/1024).toFixed(1)+" KB"; return (b/1048576).toFixed(1)+" MB" }
  function statusColor(m) { return m?.status==="away"?"#f59e0b":m?.status==="busy"?"#ef4444":m?.status==="offline"?"#545d75":m?.online?"#22c55e":"#545d75" }

  const channelMembers = activeChannel ? allUsers.filter(u=>activeChannel.type==="public"||activeChannel.members?.includes(u.id)) : []
  const isChannelAdmin = isAdmin||activeChannel?.createdBy===user.uid||activeChannel?.moderators?.includes(user.uid)
  const creatorUser = activeChannel ? allUsers.find(u=>u.id===activeChannel.createdBy) : null
  const charsLeft = MAX_MSG_LENGTH - text.length
  const slowMode = activeChannel?.slowMode||0
  const canSend = text.trim().length>0||pendingGif||pendingFiles.length>0

  const latestEquipmentRequest = [...messages].reverse().find(m => m.type === "equipment_request" && m.itemId && m.reservationId)

  useEffect(() => {
    if (!latestEquipmentRequest) {
      setEquipmentRequestDetails(null)
      return
    }
    const resDoc = doc(db, "equipment", latestEquipmentRequest.itemId, "reservations", latestEquipmentRequest.reservationId)
    const unsub = onSnapshot(resDoc, snap => {
      if (snap.exists()) {
        setEquipmentRequestDetails({ id: snap.id, ...snap.data(), itemId: latestEquipmentRequest.itemId, itemName: latestEquipmentRequest.itemName, requesterId: latestEquipmentRequest.requesterId })
      } else {
        setEquipmentRequestDetails(null)
      }
    }, () => {
      setEquipmentRequestDetails(null)
    })
    return () => unsub()
  }, [latestEquipmentRequest?.itemId, latestEquipmentRequest?.reservationId])
  const isOverLimit = text.length > MAX_MSG_LENGTH

  return (
    <div style={{display:"flex",flex:1,overflow:"hidden"}} onClick={()=>{setContextMenu(null);setShowEmoji(false);setShowGif(false);setHoverMsg(null);setShowAttach(false)}}>

      {/* Sidebar */}
      {showSidebar && (
        <div style={{width:200,background:"#161b27",borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"12px 10px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:10,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.08em"}}>Kanavat</span>
            <button onClick={e=>{e.stopPropagation();setShowNewChannel(true)}} style={iconBtn}>＋</button>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {channels.map(ch=>(
              <div key={ch.id} onClick={()=>{setActiveChannel(ch);setActiveDm(null);setDmSettings(false)}}
                style={{padding:"6px 12px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:6,
                  background:activeChannel?.id===ch.id?"rgba(79,126,247,0.15)":"transparent",
                  color:activeChannel?.id===ch.id?"#4f7ef7":"#8b92a8"}}>
                <span style={{flex:1}}>{ch.type==="private"?"🔒":"#"} {ch.name}</span>
                {channelBadges[ch.id]?.mentions > 0 && (
                  <span style={{minWidth:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700}}>
                    {channelBadges[ch.id].mentions}
                  </span>
                )}
                {isChannelMuted(ch.id)&&<span style={{fontSize:10}}>🔕</span>}
                {ch.slowMode>0&&<span style={{fontSize:10}}>🐌</span>}
              </div>
            ))}

            {/* DM-osio */}
            <div style={{padding:"12px 10px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:10,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.08em"}}>Yksityisviestit</span>
              <button onClick={e=>{e.stopPropagation();setShowNewDM(true)}} style={iconBtn} title="Uusi yksityisviesti">＋</button>
            </div>

            {/* Muistiinpanot */}
            <div onClick={()=>{const me=allUsers.find(u=>u.id===user.uid)||{id:user.uid,displayName:"Muistiinpanot"};openDM(me)}}
              style={{padding:"5px 12px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:7,
                background:activeDm?.isSelfNote?"rgba(79,126,247,0.15)":"transparent",
                color:activeDm?.isSelfNote?"#4f7ef7":"#8b92a8"}}>
              <span style={{fontSize:16,lineHeight:"22px",flexShrink:0}}>📝</span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Muistiinpanot</span>
            </div>

            {/* DM-lista */}
            {allUsers.filter(u2=>u2.id!==user.uid).map(u2=>(
              <div key={u2.id} onClick={()=>openDM(u2)}
                style={{padding:"5px 10px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:7,
                  background:activeDm?.otherUser?.id===u2.id&&!activeDm?.isSelfNote?"rgba(79,126,247,0.15)":"transparent",
                  color:activeDm?.otherUser?.id===u2.id&&!activeDm?.isSelfNote?"#4f7ef7":"#8b92a8"}}>
                <div style={{position:"relative",flexShrink:0,width:22,height:22}}>
                  <Avatar src={u2.photoURL} name={u2.displayName} size={22} />
                  <div style={{position:"absolute",bottom:0,right:0,width:7,height:7,borderRadius:"50%",border:"1.5px solid #161b27",
                    background:statusColor(u2)}} />
                </div>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"22px"}}>{u2.displayName?.split(" ")[0]}</span>
                {dmBadges[[user.uid,u2.id].sort().join("_")]?.unread > 0 && (
                  <span style={{minWidth:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700}}>
                    {dmBadges[[user.uid,u2.id].sort().join("_")].unread}
                  </span>
                )}
              </div>
            ))}
          </div>
          {isAdmin&&(
            <div style={{padding:"8px",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
              <button onClick={e=>{e.stopPropagation();setShowInvite(true)}}
                style={{width:"100%",padding:"7px",background:"rgba(79,126,247,0.15)",border:"none",borderRadius:8,color:"#4f7ef7",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>
                + Kutsu johtaja
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat-alue */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{padding:"0 16px",height:52,borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",gap:10,background:"#161b27",flexShrink:0}}>
          <button onClick={()=>setShowSidebar(s=>!s)} style={iconBtn}>{showSidebar?"◀":"▶"}</button>
          {(activeChannel || activeDm) ? (
            activeChannel ? (
              <div style={{display:"flex",alignItems:"baseline",gap:10,flex:1,minWidth:0}}>
                <span
                  style={{
                    fontWeight:600,fontSize:14,whiteSpace:"nowrap",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  title="Avaa kanavan tiedot"
                  onClick={e => {
                    e.stopPropagation();
                    openChannelInfo();
                  }}
                >
                  {`#${activeChannel.name}`}
                </span>
                {activeChannel?.description&&<span style={{fontSize:12,color:"#545d75",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeChannel.description}</span>}
                {slowMode>0&&<span style={{fontSize:11,color:"#8b92a8",background:"rgba(255,255,255,0.06)",padding:"1px 7px",borderRadius:10}}>🐌 {slowMode}s</span>}
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"baseline",gap:10,flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Avatar src={activeDm.otherUser?.photoURL} name={activeDm.otherUser?.displayName} size={24} />
                  <span style={{fontWeight:600,fontSize:14}}>{activeDm.otherUser?.displayName}</span>
                  <div style={{width:8,height:8,borderRadius:"50%",background:statusColor(activeDm.otherUser)}}></div>
                </div>
              </div>
            )
          ) : <span style={{fontSize:14,color:"#545d75",flex:1}}>Valitse kanava tai henkilö</span>
          }
          {activeChannel&&isChannelMuted(activeChannel.id)&&(
            <button onClick={()=>setMutedChannels(prev=>{const n={...prev};delete n[activeChannel.id];return n})} style={{...iconBtn,color:"#f59e0b",fontSize:12}}>🔕</button>
          )}
          {activeChannel&&(isChannelAdmin || isEquipmentManager)&&(
            <button onClick={e=>{e.stopPropagation();openChannelSettings()}} style={iconBtn} title="Avaa kanavan säädöt">⚙️</button>
          )}
          {activeDm&&!activeDm.isSelfNote&&(
            <button onClick={()=>{setDmSettings(s=>!s);setShowMembers(false)}} style={iconBtn}>⚙️</button>
          )}
          {activeChannel&&(
            <button onClick={()=>{setShowMembers(s=>!s);setDmSettings(false)}} style={iconBtn}>👥</button>
          )}
        </div>

        {/* Moderointi */}
        {isAdmin&&modQueue.length>0&&(
          <div style={{background:"rgba(239,68,68,0.1)",borderBottom:"1px solid rgba(239,68,68,0.2)",padding:"8px 20px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:"#f87171"}}>🚨 {modQueue.length} raporttia</span>
            {modQueue.slice(0,1).map(r=>(
              <span key={r.id} style={{fontSize:12,color:"#8b92a8"}}>"{r.messageText?.slice(0,30)}..."
                <button onClick={()=>resolveReport(r.id,"resolved")} style={{marginLeft:6,background:"rgba(239,68,68,0.2)",border:"none",color:"#f87171",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:11}}>Poista</button>
                <button onClick={()=>resolveReport(r.id,"dismissed")} style={{marginLeft:4,background:"transparent",border:"none",color:"#545d75",cursor:"pointer",fontSize:11}}>Ohita</button>
              </span>
            ))}
          </div>
        )}

        {!activeChannel&&!activeDm&&(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"#545d75"}}>
            <span style={{fontSize:40}}>💬</span>
            <span style={{fontSize:14}}>Valitse kanava tai henkilö vasemmalta</span>
          </div>
        )}

        {(activeChannel||activeDm)&&(
          <>
            <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:2}}>
              {messages.map((msg,i)=>{
                const isMine=msg.senderId===user.uid
                const showAvatar=i===0||messages[i-1]?.senderId!==msg.senderId
                const isHovered=hoverMsg===msg.id
                const readCount=msg.readBy?msg.readBy.filter(id=>id!==msg.senderId).length:0
                return (
                  <div key={msg.id}
                    onMouseEnter={()=>setHoverMsg(msg.id)} onMouseLeave={()=>setHoverMsg(null)}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,msg})}}
                    style={{display:"flex",gap:10,alignItems:"flex-start",padding:"3px 6px",borderRadius:8,marginTop:showAvatar?10:0,position:"relative",
                      background:isHovered?"rgba(255,255,255,0.03)":"transparent"}}>
                    {isHovered&&!msg.deleted&&(
                      <div style={{position:"absolute",right:10,top:-4,background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"3px 6px",display:"flex",gap:2,zIndex:5,boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}
                        onClick={e=>e.stopPropagation()}>
                        {QUICK_REACTIONS.map(e=>(
                          <button key={e} onClick={()=>toggleReaction(msg,e)} style={{fontSize:16,padding:"2px 4px",cursor:"pointer",border:"none",background:"transparent",borderRadius:5}}>{e}</button>
                        ))}
                        <div style={{width:"1px",background:"rgba(255,255,255,0.1)",margin:"2px 4px"}}/>
                        <button onClick={()=>setReplyTo(msg)} style={{...iconBtn,fontSize:14,padding:"2px 6px"}} title="Vastaa">↩</button>
                        {isMine&&(<>
                          <button onClick={()=>{setEditingMsg(msg);setEditText(msg.text);setHoverMsg(null)}} style={{...iconBtn,fontSize:14,padding:"2px 6px"}} title="Muokkaa">✏️</button>
                          <button onClick={()=>deleteMessage(msg)} style={{...iconBtn,fontSize:14,padding:"2px 6px",color:"#f87171"}} title="Poista">🗑️</button>
                        </>)}
                      </div>
                    )}
                    <div style={{width:36,flexShrink:0,cursor:"pointer"}} onClick={()=>{const u2=allUsers.find(u=>u.id===msg.senderId);if(u2)setProfileModal(u2)}}>
                      {showAvatar&&<Avatar src={msg.senderPhoto} name={msg.senderName} size={36} />}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      {showAvatar&&(
                        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}>
                          <span style={{fontWeight:600,fontSize:13,cursor:"pointer"}} onClick={()=>{const u2=allUsers.find(u=>u.id===msg.senderId);if(u2)setProfileModal(u2)}}>{msg.senderName}</span>
                          <span style={{fontSize:11,color:"#545d75"}}>{formatTime(msg.createdAt)}</span>
                          {msg.edited&&<span style={{fontSize:10,color:"#545d75"}}>(muokattu)</span>}
                        </div>
                      )}
                      {msg.replyTo&&(
                        <div style={{fontSize:12,color:"#545d75",borderLeft:"3px solid #4f7ef7",paddingLeft:8,marginBottom:5,background:"rgba(79,126,247,0.06)",borderRadius:"0 4px 4px 0",padding:"3px 8px"}}>
                          ↩ <strong style={{color:"#8b92a8"}}>{msg.replyTo.senderName}</strong>: {msg.replyTo.text}
                        </div>
                      )}
                      {msg.deleted
                        ? <span style={{fontStyle:"italic",color:"#545d75",fontSize:13}}>[viesti poistettu]</span>
                        : editingMsg?.id===msg.id
                          ? <div onClick={e=>e.stopPropagation()}>
                              <textarea value={editText} onChange={e=>setEditText(e.target.value)}
                                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveEdit()}if(e.key==="Escape")setEditingMsg(null)}}
                                style={{width:"100%",background:"#1e2535",border:"1px solid #4f7ef7",borderRadius:8,padding:"8px 10px",color:"#e8eaf0",fontSize:14,resize:"none",fontFamily:"system-ui",outline:"none",boxSizing:"border-box"}} rows={2} autoFocus />
                              <div style={{display:"flex",gap:6,marginTop:4}}>
                                <button onClick={saveEdit} style={{...btnPrimary,fontSize:11,padding:"3px 10px"}}>Tallenna</button>
                                <button onClick={()=>setEditingMsg(null)} style={{...btnGhost,fontSize:11,padding:"3px 10px"}}>Peruuta</button>
                              </div>
                            </div>
                          : <>
                              {msg.text&&<p style={{margin:0,fontSize:14,lineHeight:1.55,wordBreak:"break-word",color:"#e8eaf0"}}><TextWithLinks text={msg.text} onLinkClick={openLink}/></p>}
                              {msg.gifUrl&&<img src={msg.gifUrl} alt="GIF" style={{maxWidth:280,borderRadius:8,marginTop:4,display:"block"}}/>}
                              {msg.attachments?.map((a,idx)=>(
                                a.type?.startsWith("image/")
                                  ? <img key={idx} src={a.url} alt={a.name} style={{maxWidth:300,borderRadius:8,marginTop:4,display:"block",cursor:"pointer"}} onClick={()=>window.open(a.url,"_blank")}/>
                                  : <a key={idx} href={a.url} target="_blank" rel="noreferrer"
                                      style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:4,background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:8,padding:"6px 10px",color:"#4f7ef7",fontSize:12,textDecoration:"none"}}>
                                      📎 {a.name} <span style={{color:"#545d75"}}>({formatFileSize(a.size)})</span>
                                    </a>
                              ))}
                            </>
                      }
                      {msg.reactions&&Object.entries(msg.reactions).filter(([,v])=>v.length>0).length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
                          {Object.entries(msg.reactions).filter(([,v])=>v.length>0).map(([emoji,uids])=>(
                            <button key={emoji} onClick={()=>toggleReaction(msg,emoji)}
                              style={{background:uids.includes(user.uid)?"rgba(79,126,247,0.25)":"rgba(255,255,255,0.06)",border:uids.includes(user.uid)?"1px solid rgba(79,126,247,0.5)":"1px solid rgba(255,255,255,0.1)",borderRadius:12,padding:"2px 8px",cursor:"pointer",fontSize:13,color:"#e8eaf0",fontFamily:"system-ui"}}>
                              {emoji} <span style={{fontSize:11,color:"#8b92a8"}}>{uids.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {isMine&&!msg.deleted&&<div style={{fontSize:10,color:"#545d75",marginTop:2}}>{readCount>0?`✓✓ Luettu (${readCount})`:"✓ Lähetetty"}</div>}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef}/>
            </div>

            {/* Vastaa */}
            {replyTo&&(
              <div style={{margin:"0 20px",background:"rgba(79,126,247,0.08)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:"8px 8px 0 0",padding:"6px 12px",display:"flex",alignItems:"center",gap:8}} onClick={e=>e.stopPropagation()}>
                <span style={{fontSize:12,color:"#8b92a8",flex:1}}>↩ <strong>{replyTo.senderName}</strong> — {replyTo.text?.slice(0,60)}</span>
                <button onClick={()=>setReplyTo(null)} style={{...iconBtn,fontSize:14}}>✕</button>
              </div>
            )}

            {/* GIF esikatselu */}
            {pendingGif&&(
              <div style={{margin:"0 20px",background:"#1e2535",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px 8px 0 0",padding:"8px 12px",display:"flex",alignItems:"center",gap:10}} onClick={e=>e.stopPropagation()}>
                <img src={pendingGif.preview} alt="" style={{height:50,borderRadius:6}}/>
                <span style={{fontSize:12,color:"#8b92a8",flex:1}}>GIF valittu</span>
                <button onClick={()=>setPendingGif(null)} style={{...iconBtn,fontSize:14}}>✕</button>
              </div>
            )}

            {/* Tiedostot */}
            {pendingFiles.length>0&&(
              <div style={{margin:"0 20px",background:"#1e2535",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px 8px 0 0",padding:"8px 12px",display:"flex",gap:8,flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
                {pendingFiles.map((f,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:6,padding:"3px 8px"}}>
                    <span style={{fontSize:12,color:"#4f7ef7"}}>{f.type?.startsWith("image/")?"🖼️":"📎"} {f.name}</span>
                    <button onClick={()=>setPendingFiles(prev=>prev.filter((_,j)=>j!==i))} style={{...iconBtn,fontSize:12,padding:"0 2px"}}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Syöttökenttä */}
            <div style={{padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.07)",background:"#161b27",position:"relative"}} onClick={e=>e.stopPropagation()}>

              {/* Equipment request action pane */}
              {equipmentRequestDetails && activeDm && (
                <div style={{marginBottom:8,padding:"10px 12px",background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:8,color:"#d1fae5",display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,fontSize:12,fontWeight:600}}>
                    <span>🛠️ Varaus: {equipmentRequestDetails.itemName} ×{equipmentRequestDetails.quantity} ({equipmentRequestDetails.status})</span>
                    <span style={{color:"#a7f3d0",fontSize:11}}>{equipmentRequestDetails.requesterId===user.uid?"Pyytäjä":"Vastaava"}</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {equipmentRequestDetails.status === "pending" && isEquipmentManager && (
                      <>
                        <button onClick={handleApproveRequest} style={{...btnPrimary,fontSize:11,padding:"4px 10px"}}>✓ Hyväksy</button>
                        <button onClick={handleDenyRequest} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>✗ Hylkää</button>
                      </>
                    )}
                    {equipmentRequestDetails.status === "approved" && isEquipmentManager && (
                      <>
                        <button onClick={handleMarkReturned} style={{...btnPrimary,fontSize:11,padding:"4px 10px"}}>📥 Palautettu</button>
                        <button onClick={handleDenyRequest} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>✗ Peru</button>
                      </>
                    )}
                    {equipmentRequestDetails.requesterId === user.uid && equipmentRequestDetails.status !== "returned" && (
                      <>
                        <button onClick={handleDenyRequest} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>✗ Peru</button>
                        {equipmentRequestDetails.status === "approved" && (
                          <button onClick={handleMarkReturned} style={{...btnPrimary,fontSize:11,padding:"4px 10px"}}>📥 Palautettu</button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Slow mode varoitus */}
              {slowModeLeft>0&&(
                <div style={{marginBottom:8,padding:"6px 12px",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,fontSize:12,color:"#f59e0b",display:"flex",alignItems:"center",gap:6}}>
                  🐌 Etanatila — voit lähettää seuraavan viestin {slowModeLeft}s kuluttua
                </div>
              )}

              {/* Emoji */}
              {showEmoji&&(
                <div style={{position:"absolute",bottom:70,left:20,background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:12,display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4,zIndex:10,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                  {EMOJIS.map(e=><button key={e} onClick={()=>{setText(t=>t+e);setShowEmoji(false)}} style={{fontSize:20,padding:4,cursor:"pointer",border:"none",background:"transparent",borderRadius:6}}>{e}</button>)}
                </div>
              )}

              {/* GIF */}
              {showGif&&(
                <div style={{position:"absolute",bottom:70,left:20,background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:12,width:320,zIndex:10,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                  <input value={gifSearch} onChange={e=>setGifSearch(e.target.value)} placeholder="Hae gifejä..." autoFocus
                    style={{width:"100%",background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"7px 10px",color:"#e8eaf0",fontSize:13,marginBottom:10,boxSizing:"border-box",fontFamily:"system-ui",outline:"none"}}/>
                  {gifLoading&&<div style={{textAlign:"center",color:"#545d75",fontSize:12,padding:"16px 0"}}>Haetaan...</div>}
                  {!gifLoading&&gifResults.length===0&&<div style={{textAlign:"center",color:"#545d75",fontSize:12,padding:"16px 0"}}>{GIPHY_KEY==="KORVAA_GIPHY_API_KEY"?"Lisää Giphy API-avain":"Ei tuloksia"}</div>}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,maxHeight:200,overflowY:"auto"}}>
                    {gifResults.map(g=><img key={g.id} src={g.images?.fixed_height_small?.url} alt={g.title}
                      onClick={()=>{setPendingGif({url:g.images?.original?.url,preview:g.images?.fixed_height_small?.url});setShowGif(false);setGifSearch("")}}
                      style={{width:"100%",height:72,objectFit:"cover",borderRadius:7,cursor:"pointer",border:"1px solid rgba(255,255,255,0.08)"}}/>)}
                  </div>
                  {gifResults.length > 0 && !gifLoading && (
                    <button onClick={() => fetchGifs(gifSearch, true)} style={{width:"100%",marginTop:10,padding:"6px",background:"#4f7ef7",border:"none",borderRadius:6,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>
                      Näytä lisää
                    </button>
                  )}
                </div>
              )}

              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.zip" onChange={e=>{const f=Array.from(e.target.files||[]);if(f.length>0)setPendingFiles(prev=>[...prev,...f]);e.target.value=""}} style={{display:"none"}}/>

              {/* @ mention dropdown */}
              {showMention&&(
                <div style={{position:"absolute",bottom:80,left:20,background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:6,maxHeight:200,overflowY:"auto",zIndex:10,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",minWidth:200}}>
                  {allUsers.filter(u => u.displayName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0,5).map((u, i) => (
                    <div key={u.id} onClick={() => {
                      const before = text.slice(0, mentionIndex)
                      const after = text.slice(mentionIndex + mentionQuery.length + 1)
                      setText(before + u.displayName.split(' ')[0] + ' ' + after)
                      setShowMention(false)
                    }}
                      style={{padding:"6px 10px",cursor:"pointer",fontSize:13,color:"#e8eaf0",borderRadius:6,background:i===mentionIndex?"rgba(79,126,247,0.15)":"transparent",display:"flex",alignItems:"center",gap:8}}>
                      <Avatar src={u.photoURL} name={u.displayName} size={24} />
                      {u.displayName}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:"flex",gap:8,alignItems:"center",background:"#1e2535",border:`1px solid ${isOverLimit?"rgba(239,68,68,0.6)":"rgba(255,255,255,0.1)"}`,borderRadius:12,padding:"10px 12px"}}>
                <button onClick={()=>{setShowEmoji(s=>!s);setShowGif(false)}} style={iconBtn}>😊</button>
                <button onClick={()=>{setShowGif(s=>!s);setShowEmoji(false);if(!showGif)fetchGifs("")}} style={{...iconBtn,fontSize:11,fontWeight:600}}>GIF</button>
                <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>setShowAttach(s=>!s)} style={iconBtn} title="Liitä">📎</button>
                  {showAttach&&(
                    <div style={{position:"absolute",bottom:36,left:0,background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:6,minWidth:170,zIndex:10,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                      <div onClick={()=>{fileInputRef.current?.click();setShowAttach(false)}} style={{padding:"7px 12px",cursor:"pointer",fontSize:13,color:"#e8eaf0",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>💻 Tietokoneelta</div>
                      <div onClick={()=>{openLink("https://drive.google.com");setShowAttach(false)}} style={{padding:"7px 12px",cursor:"pointer",fontSize:13,color:"#e8eaf0",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>▲ Google Drive</div>
                    </div>
                  )}
                </div>
                <div style={{flex:1,position:"relative"}}>
                  <textarea ref={textAreaRef} value={text} 
                    onChange={e=>{
                      const val = e.target.value
                      setText(val)
                      const cursor = e.target.selectionStart
                      const beforeCursor = val.slice(0, cursor)
                      const atIndex = beforeCursor.lastIndexOf('@')
                      if (atIndex !== -1 && (atIndex === 0 || beforeCursor[atIndex-1] === ' ' || beforeCursor[atIndex-1] === '\n')) {
                        const query = beforeCursor.slice(atIndex+1)
                        if (query.includes(' ')) {
                          setShowMention(false)
                        } else {
                          setMentionQuery(query)
                          setShowMention(true)
                          setMentionIndex(0)
                        }
                      } else {
                        setShowMention(false)
                      }
                    }}
                    onKeyDown={e=>{
                      if (showMention) {
                        const filteredUsers = allUsers.filter(u => u.displayName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0,5)
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setMentionIndex(prev => Math.min(prev + 1, filteredUsers.length - 1))
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setMentionIndex(prev => Math.max(prev - 1, 0))
                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault()
                          if (filteredUsers[mentionIndex]) {
                            const before = text.slice(0, mentionIndex)
                            const after = text.slice(mentionIndex + mentionQuery.length + 1)
                            setText(before + filteredUsers[mentionIndex].displayName.split(' ')[0] + ' ' + after)
                            setShowMention(false)
                          }
                        } else if (e.key === 'Escape') {
                          setShowMention(false)
                        }
                      } else {
                        if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}
                      }
                    }}
                    placeholder={activeChannel?`Kirjoita #${activeChannel.name}...`:"Kirjoita viesti..."}
                    rows={1} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"#e8eaf0",fontSize:14,resize:"none",fontFamily:"system-ui",lineHeight:1.5,maxHeight:120,boxSizing:"border-box"}}/>
                  {/* Merkkimäärälaskuri */}
                  {text.length>MAX_MSG_LENGTH*0.8&&(
                    <div style={{position:"absolute",right:4,bottom:-16,fontSize:10,color:isOverLimit?"#ef4444":"#545d75",fontFamily:"system-ui"}}>
                      {charsLeft<0?charsLeft:charsLeft}
                    </div>
                  )}
                </div>
                {isOverLimit
                  ? <div style={{fontSize:11,color:"#ef4444",padding:"6px 10px",whiteSpace:"nowrap"}}>⚠ Liian pitkä</div>
                  : slowModeLeft>0
                    ? <div style={{fontSize:11,color:"#f59e0b",padding:"6px 10px",whiteSpace:"nowrap"}}>🐌 {slowModeLeft}s</div>
                    : uploading
                      ? <span style={{fontSize:12,color:"#545d75",padding:"6px 14px"}}>Ladataan...</span>
                      : <button onClick={()=>sendMessage()} disabled={!canSend}
                          style={{...btnPrimary,opacity:canSend?1:0.5}}>Lähetä</button>
                }
              </div>
              {isOverLimit&&(
                <div style={{marginTop:6,fontSize:12,color:"#ef4444",display:"flex",alignItems:"center",gap:5}}>
                  ⚠️ Viesti on {Math.abs(charsLeft)} merkkiä liian pitkä (max {MAX_MSG_LENGTH})
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* DM-asetukset */}
      {dmSettings&&activeDm&&!activeDm.isSelfNote&&(
        <div style={{width:220,background:"#161b27",borderLeft:"1px solid rgba(255,255,255,0.07)",overflowY:"auto",padding:"0 0 16px"}}>
          <div style={{padding:"12px 14px 10px",fontSize:13,fontWeight:600,borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            ⚙️ DM-asetukset
            <button onClick={()=>setDmSettings(false)} style={{...iconBtn,fontSize:14}}>✕</button>
          </div>
          <div style={{padding:"16px 14px 12px",textAlign:"center",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{margin:"0 auto 8px",display:"flex",justifyContent:"center"}}>
              <Avatar src={activeDm.otherUser?.photoURL} name={activeDm.otherUser?.displayName} size={52}/>
            </div>
            <div style={{fontSize:13,fontWeight:600}}>{activeDm.otherUser?.displayName}</div>
            <div style={{fontSize:11,color:"#545d75"}}>{activeDm.otherUser?.role}</div>
          </div>
          <div style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Muistiinpanot</div>
            <div style={{fontSize:11,color:"#545d75",marginBottom:12}}>Tallenna muistiinpanoja tästä käyttäjästä. Muistiinpanot ovat yksityisiä ja näkyvät vain sinulle.</div>
            {editingDmNote
              ? <div>
                  <textarea value={dmNoteText} onChange={e=>setDmNoteText(e.target.value)} placeholder="Kirjoita muistiinpano..." rows={5}
                    style={{width:"100%",background:"#1e2535",border:"1px solid rgba(79,126,247,0.4)",borderRadius:8,padding:"8px 10px",color:"#e8eaf0",fontSize:12,fontFamily:"system-ui",resize:"none",outline:"none",boxSizing:"border-box"}}/>
                  <div style={{display:"flex",gap:6,marginTop:6}}>
                    <button onClick={()=>{setDmNotes(prev=>({...prev,[activeDm.id]:dmNoteText}));setEditingDmNote(false)}}
                      style={{flex:1,padding:"6px",background:"#4f7ef7",border:"none",borderRadius:6,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>Tallenna</button>
                    <button onClick={()=>setEditingDmNote(false)}
                      style={{padding:"6px 10px",background:"transparent",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,color:"#8b92a8",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>Peruuta</button>
                  </div>
                </div>
              : <div>
                  {dmNotes[activeDm.id]
                    ? <div style={{fontSize:12,color:"#8b92a8",lineHeight:1.6,background:"#1e2535",borderRadius:8,padding:"8px 10px",marginBottom:8,whiteSpace:"pre-wrap"}}>{dmNotes[activeDm.id]}</div>
                    : <div style={{fontSize:12,color:"#545d75",fontStyle:"italic",marginBottom:8}}>Ei muistiinpanoja.</div>
                  }
                  <button onClick={()=>{setDmNoteText(dmNotes[activeDm.id]||"");setEditingDmNote(true)}}
                    style={{width:"100%",padding:"7px",background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:7,color:"#4f7ef7",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>
                    ✏️ {dmNotes[activeDm.id]?"Muokkaa":"Lisää muistiinpano"}
                  </button>
                </div>
            }
          </div>
          <div style={{padding:"0 14px"}}>
            <div style={{height:"1px",background:"rgba(255,255,255,0.06)",margin:"4px 0 12px"}}/>
            {dmReportSent
              ? <div style={{fontSize:12,color:"#22c55e",textAlign:"center",padding:"8px 0"}}>✓ Raportti lähetetty!</div>
              : <>
                  <textarea value={dmReportReason} onChange={e=>setDmReportReason(e.target.value)} placeholder="Raportoi käyttäjä — kuvaile syy..." rows={3}
                    style={{width:"100%",background:"#1e2535",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,padding:"7px 10px",color:"#e8eaf0",fontSize:12,fontFamily:"system-ui",resize:"none",outline:"none",boxSizing:"border-box",marginBottom:6}}/>
                  <button onClick={async()=>{
                    if (!dmReportReason.trim()) return
                    await addDoc(collection(db,"memberReports"),{
                      targetId:activeDm.otherUser?.id,targetName:activeDm.otherUser?.displayName,
                      reporterId:user.uid,reporterName:profile?.displayName,
                      reason:dmReportReason.trim(),status:"pending",createdAt:serverTimestamp(),
                    })
                    setDmReportSent(true); setDmReportReason("")
                    setTimeout(()=>setDmReportSent(false),3000)
                  }}
                    style={{width:"100%",padding:"7px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,color:"#f87171",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>
                    🚩 Lähetä raportti
                  </button>
                </>
            }
          </div>
        </div>
      )}

      {/* Jäsenpaneeli — vain kanavilla */}
      {showMembers&&activeChannel&&(
        <div style={{width:200,background:"#161b27",borderLeft:"1px solid rgba(255,255,255,0.07)",overflowY:"auto"}}>
          <div style={{padding:"12px 12px 8px",fontSize:10,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.08em"}}>
            Jäsenet — {channelMembers.length}
          </div>
          {channelMembers.filter(m=>m.online&&(m.status==="online"||!m.status)).length>0&&(
            <div style={{padding:"6px 12px 4px",fontSize:10,fontWeight:600,color:"#22c55e",textTransform:"uppercase",letterSpacing:"0.07em"}}>🟢 Paikalla</div>
          )}
          {channelMembers.filter(m=>m.online&&(m.status==="online"||!m.status)).map(m=><MemberRow key={m.id} m={m} isMod={activeChannel?.moderators?.includes(m.id)} onProfile={()=>setProfileModal(m)}/>)}
          {channelMembers.filter(m=>m.status==="away").length>0&&(
            <div style={{padding:"6px 12px 4px",fontSize:10,fontWeight:600,color:"#f59e0b",textTransform:"uppercase",letterSpacing:"0.07em"}}>🟡 Poissa</div>
          )}
          {channelMembers.filter(m=>m.status==="away").map(m=><MemberRow key={m.id} m={m} isMod={activeChannel?.moderators?.includes(m.id)} onProfile={()=>setProfileModal(m)}/>)}
          {channelMembers.filter(m=>m.status==="busy").length>0&&(
            <div style={{padding:"6px 12px 4px",fontSize:10,fontWeight:600,color:"#ef4444",textTransform:"uppercase",letterSpacing:"0.07em"}}>🔴 Älä häiritse</div>
          )}
          {channelMembers.filter(m=>m.status==="busy").map(m=><MemberRow key={m.id} m={m} isMod={activeChannel?.moderators?.includes(m.id)} onProfile={()=>setProfileModal(m)}/>)}
          {channelMembers.filter(m=>!m.online||m.status==="offline").length>0&&(
            <div style={{padding:"6px 12px 4px",fontSize:10,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.07em"}}>⚫ Offline</div>
          )}
          {channelMembers.filter(m=>!m.online||m.status==="offline").map(m=><MemberRow key={m.id} m={m} isMod={activeChannel?.moderators?.includes(m.id)} onProfile={()=>setProfileModal(m)}/>)}
        </div>
      )}

      {/* Kontekstivalikko */}
      {contextMenu&&(
        <div style={{position:"fixed",left:contextMenu.x,top:contextMenu.y,background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:6,zIndex:100,minWidth:170,boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}
          onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:4}}>
            {EMOJIS.slice(0,8).map(e=><button key={e} onClick={()=>{toggleReaction(contextMenu.msg,e);setContextMenu(null)}} style={{fontSize:18,padding:"3px 5px",cursor:"pointer",border:"none",background:"transparent",borderRadius:6}}>{e}</button>)}
          </div>
          <div style={{height:"1px",background:"rgba(255,255,255,0.08)",margin:"4px 0"}}/>
          <div onClick={()=>{setReplyTo(contextMenu.msg);setContextMenu(null)}} style={ctxItem}>↩ Vastaa</div>
          {contextMenu.msg.senderId===user.uid&&!contextMenu.msg.deleted&&(
            <div onClick={()=>{setEditingMsg(contextMenu.msg);setEditText(contextMenu.msg.text);setContextMenu(null)}} style={ctxItem}>✏️ Muokkaa</div>
          )}
          {(contextMenu.msg.senderId===user.uid||isAdmin)&&(
            <div onClick={()=>deleteMessage(contextMenu.msg)} style={{...ctxItem,color:"#f87171"}}>🗑️ Poista</div>
          )}
          <div onClick={()=>{const u2=allUsers.find(u=>u.id===contextMenu.msg.senderId);if(u2){setProfileModal(u2);setContextMenu(null)}}} style={ctxItem}>👤 Profiili</div>
          {activeChannel&&(<>
            <div style={{height:"1px",background:"rgba(255,255,255,0.08)",margin:"4px 0"}}/>
            <div style={{padding:"4px 10px 2px",fontSize:10,color:"#545d75"}}>Mykistä kanava</div>
            {[15,60,480,1440].map(m=><div key={m} onClick={()=>muteChannel(activeChannel.id,m)} style={ctxItem}>🔕 {m<60?m+" min":m<1440?m/60+" t":"24 t"}</div>)}
          </>)}
          <div onClick={()=>reportMessage(contextMenu.msg)} style={{...ctxItem,color:"#8b92a8"}}>🚩 Raportoi</div>
        </div>
      )}

      {/* Profiili-modal */}
      {profileModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setProfileModal(null)}>
          <div style={{background:"#161b27",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:28,width:340,maxWidth:"90vw",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{position:"relative",display:"inline-block",marginBottom:14}}>
              <Avatar src={profileModal.photoURL} name={profileModal.displayName} size={68}/>
              <div style={{position:"absolute",bottom:2,right:2,width:14,height:14,borderRadius:"50%",background:statusColor(profileModal),border:"3px solid #161b27"}}/>
            </div>
            <div style={{fontWeight:600,fontSize:17,marginBottom:3}}>{profileModal.displayName}</div>
            <div style={{fontSize:12,color:"#8b92a8",marginBottom:2}}>{profileModal.role}</div>
            {profileModal.title&&<div style={{fontSize:12,color:"#545d75",marginBottom:8}}>{profileModal.title}</div>}
            <div style={{fontSize:12,color:"#545d75",marginBottom:12}}>{profileModal.online?"🟢 Paikalla":`Viimeksi: ${formatLastSeen(profileModal.lastSeen)}`}</div>
            {profileModal.bio&&<p style={{fontSize:13,color:"#8b92a8",lineHeight:1.6,background:"#1e2535",padding:"10px 14px",borderRadius:8,margin:"0 0 14px",textAlign:"left"}}>{profileModal.bio}</p>}
            {profileModal.phone&&<div style={{fontSize:13,color:"#545d75",marginBottom:14}}>📞 {profileModal.phone}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button onClick={()=>setProfileModal(null)} style={btnGhost}>Sulje</button>
              {profileModal.id!==user.uid&&<button onClick={()=>{openDM(profileModal);setProfileModal(null)}} style={btnPrimary}>💬 Lähetä viesti</button>}
            </div>
          </div>
        </div>
      )}

      {/* Kanavan tiedot (lue vain) */}
      {showChannelInfo&&activeChannel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowChannelInfo(false)}>
          <div style={{background:"#161b27",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:24,width:420,maxWidth:"90vw",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontWeight:700,fontSize:16}}>ℹ️ #{activeChannel.name}</span>
              <button onClick={()=>setShowChannelInfo(false)} style={iconBtn}>✕</button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#8b92a8",marginBottom:4}}>Kuvaus</div>
              <div style={{fontSize:13,color:"#e8eaf0"}}>{activeChannel.description||"Ei kuvausta"}</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#8b92a8",marginBottom:4}}>Tyyppi</div>
              <div style={{fontSize:13,color:"#e8eaf0"}}>{activeChannel.type==="private"?"🔒 Yksityinen":"🌐 Julkinen"}</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#8b92a8",marginBottom:4}}>Viestiraja</div>
              <div style={{fontSize:13,color:"#e8eaf0"}}>{activeChannel.slowMode?`${activeChannel.slowMode}s`:"Ei"}</div>
            </div>
            <div style={{marginBottom:10,fontSize:12,color:"#8b92a8"}}>Jäsenet ({channelMembers.length})</div>
            {channelMembers.map(m=> (
              <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"#1e2535",marginBottom:4}}>
                <span style={{fontSize:13}}>{m.displayName}</span>
                <span style={{fontSize:11,color:"#8b92a8"}}>{m.id===activeChannel.createdBy?"Luoja":activeChannel.moderators?.includes(m.id)?"Moderaattori":m.role||"Jäsen"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanavan asetukset */}
      {showChannelSettings&&activeChannel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowChannelSettings(false)}>
          <div style={{background:"#161b27",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:24,width:480,maxWidth:"90vw",maxHeight:"88vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <span style={{fontWeight:600,fontSize:16}}>⚙️ #{activeChannel.name}</span>
              <button onClick={()=>setShowChannelSettings(false)} style={iconBtn}>✕</button>
            </div>
            <div style={{background:"#1e2535",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
              <label style={lbl}>Nimi</label>
              <input value={editCh.name} onChange={e=>setEditCh(s=>({...s,name:e.target.value}))} style={inp} disabled={!isChannelAdmin}/>
              <label style={lbl}>Kuvaus</label>
              <input value={editCh.description} onChange={e=>setEditCh(s=>({...s,description:e.target.value}))} style={inp} disabled={!isChannelAdmin}/>
              <label style={lbl}>🐌 Etanatila — viestien väli (sekunteina, 0 = ei rajoitusta)</label>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="number" min={0} max={3600} value={editCh.slowMode} onChange={e=>setEditCh(s=>({...s,slowMode:e.target.value}))} style={{...inp,width:100}} disabled={!isChannelAdmin}/>
                <span style={{fontSize:12,color:"#545d75"}}>sekuntia</span>
                <div style={{display:"flex",gap:5}}>
                  {[0,5,10,30,60].map(s=><button key={s} onClick={()=>isChannelAdmin&&setEditCh(c=>({...c,slowMode:s}))}
                    style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:`1px solid ${Number(editCh.slowMode)===s?"rgba(79,126,247,0.5)":"rgba(255,255,255,0.1)"}`,background:Number(editCh.slowMode)===s?"rgba(79,126,247,0.15)":"transparent",color:Number(editCh.slowMode)===s?"#4f7ef7":"#8b92a8",cursor:isChannelAdmin?"pointer":"not-allowed",fontFamily:"system-ui"}}>
                    {s===0?"Ei":s+"s"}
                  </button>)}
                </div>
              </div>
              {isChannelAdmin ? (
                <button onClick={saveChannelSettings} style={{...btnPrimary,marginTop:12,fontSize:12,padding:"6px 14px"}}>Tallenna</button>
              ) : (
                <div style={{fontSize:12,color:"#8b92a8",marginTop:10}}>Vain moderaattorit voivat muokata kanavan asetuksia.</div>
              )}
            </div>
            <div style={{background:"#1e2535",borderRadius:10,padding:"12px 16px",marginBottom:14,fontSize:12,color:"#8b92a8",display:"flex",flexDirection:"column",gap:6}}>
              <div>👤 Luoja: <span style={{color:"#e8eaf0"}}>{creatorUser?.displayName||activeChannel.createdByName||"—"}</span></div>
              <div>📅 Luotu: <span style={{color:"#e8eaf0"}}>{formatDate(activeChannel.createdAt)}</span></div>
              <div>🔒 Tyyppi: <span style={{color:"#e8eaf0"}}>{activeChannel.type==="private"?"Yksityinen":"Julkinen"}</span></div>
            </div>
            <div style={{background:"#1e2535",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Rajoitettu kirjoitusoikeus</div><div style={{fontSize:11,color:"#545d75"}}>Vain moderaattorit voivat kirjoittaa</div></div>
                <button onClick={toggleWriteRestricted} style={{width:42,height:24,borderRadius:12,border:"none",cursor:"pointer",position:"relative",transition:"background 0.2s",background:activeChannel.writeRestricted?"#4f7ef7":"rgba(255,255,255,0.15)"}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,transition:"left 0.2s",left:activeChannel.writeRestricted?21:3}}/>
                </button>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Jäsenet</div>
            {channelMembers.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#1e2535",borderRadius:8,marginBottom:6}}>
                <Avatar src={m.photoURL} name={m.displayName} size={28}/>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{m.displayName}</div><div style={{fontSize:11,color:"#545d75"}}>{m.id===activeChannel.createdBy?"Luoja":m.role}</div></div>
                {activeChannel.moderators?.includes(m.id)&&<span style={{fontSize:10,color:"#4f7ef7",background:"rgba(79,126,247,0.15)",padding:"2px 7px",borderRadius:4}}>MOD</span>}
                {isChannelAdmin && m.id!==user.uid && (
                  <div style={{display:"flex",gap:5}}>
                    <button onClick={()=>toggleModerator(m.id)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid rgba(79,126,247,0.3)",background:"transparent",color:"#4f7ef7",cursor:"pointer",fontFamily:"system-ui"}}>{activeChannel.moderators?.includes(m.id)?"− MOD":"+ MOD"}</button>
                    <button onClick={()=>removeMemberFromChannel(m.id)} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid rgba(239,68,68,0.3)",background:"transparent",color:"#f87171",cursor:"pointer",fontFamily:"system-ui"}}>Poista</button>
                  </div>
                )}
              </div>
            ))}
            {allUsers.filter(u2=>!channelMembers.find(m=>m.id===u2.id)).length>0&&(<>
              <div style={{fontSize:11,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.08em",margin:"14px 0 8px"}}>Lisää jäsen</div>
              {allUsers.filter(u2=>!channelMembers.find(m=>m.id===u2.id)).map(u2=>(
                <div key={u2.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 12px",borderRadius:8,marginBottom:4}}>
                  <div style={{fontSize:13,flex:1,color:"#8b92a8"}}>{u2.displayName}</div>
                  <button onClick={()=>addMemberToChannel(u2.id)} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(34,197,94,0.3)",background:"transparent",color:"#22c55e",cursor:"pointer",fontFamily:"system-ui"}}>+ Lisää</button>
                </div>
              ))}
            </>)}
            {(isAdmin||activeChannel.createdBy===user.uid)&&(
              <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid rgba(255,255,255,0.07)"}}>
                <button onClick={deleteChannel} style={{width:"100%",padding:"9px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:8,color:"#f87171",cursor:"pointer",fontSize:13,fontFamily:"system-ui"}}>🗑️ Poista kanava</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Uusi kanava */}
      {showNewChannel&&(
        <Modal title="Luo uusi kanava" onClose={()=>setShowNewChannel(false)}>
          <label style={lbl}>Nimi</label><input value={newCh.name} onChange={e=>setNewCh(s=>({...s,name:e.target.value}))} placeholder="esim. kesaleiri-2025" style={inp}/>
          <label style={lbl}>Tyyppi</label>
          <select value={newCh.type} onChange={e=>setNewCh(s=>({...s,type:e.target.value}))} style={inp}>
            <option value="public">🌐 Julkinen</option><option value="private">🔒 Yksityinen</option>
          </select>
          <label style={lbl}>Kuvaus</label><input value={newCh.description} onChange={e=>setNewCh(s=>({...s,description:e.target.value}))} style={inp}/>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
            <button onClick={()=>setShowNewChannel(false)} style={btnGhost}>Peruuta</button>
            <button onClick={createChannel} style={btnPrimary}>Luo</button>
          </div>
        </Modal>
      )}

      {/* Uusi DM */}
      {showNewDM&&(
        <Modal title="Uusi yksityisviesti" onClose={()=>setShowNewDM(false)}>
          <p style={{fontSize:12,color:"#545d75",margin:"0 0 14px"}}>Valitse henkilö jolle haluat lähettää viestiä:</p>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:300,overflowY:"auto"}}>
            {allUsers.filter(u2=>u2.id!==user.uid).map(u2=>(
              <div key={u2.id} onClick={()=>{openDM(u2);setShowNewDM(false)}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"#1e2535",borderRadius:9,cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{position:"relative"}}>
                  <Avatar src={u2.photoURL} name={u2.displayName} size={36}/>
                  <div style={{position:"absolute",bottom:0,right:0,width:9,height:9,borderRadius:"50%",background:statusColor(u2),border:"2px solid #1e2535"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{u2.displayName}</div>
                  <div style={{fontSize:11,color:"#545d75"}}>{u2.role}</div>
                </div>
                <span style={{fontSize:12,color:"#4f7ef7"}}>💬</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Kutsu */}
      {showInvite&&(
        <Modal title="Kutsu johtaja" onClose={()=>setShowInvite(false)}>
          <label style={lbl}>Sähköposti</label><input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="johtaja@gmail.com" style={inp} type="email"/>
          <label style={lbl}>Rooli</label>
          <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)} style={inp}>
            <option value="lippukunnanjohtaja">Lippukunnanjohtaja</option><option value="johtaja">Johtaja</option><option value="apulaisjohtaja">Apulaisjohtaja</option>
          </select>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
            <button onClick={()=>setShowInvite(false)} style={btnGhost}>Peruuta</button>
            <button onClick={sendInvite} style={btnPrimary}>Lähetä</button>
          </div>
        </Modal>
      )}

      {/* Luku-tiedot modal */}
      {readDetails&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}}
          onClick={()=>setReadDetails(null)}>
          <div style={{background:"#161b27",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:24,width:380,maxWidth:"90vw",maxHeight:"70vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <span style={{fontWeight:600,fontSize:15}}>📬 Viestin tila</span>
              <button onClick={()=>setReadDetails(null)} style={{background:"transparent",border:"none",color:"#8b92a8",cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            {/* Viestin esikatselu */}
            <div style={{background:"#1e2535",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:13,color:"#8b92a8",fontStyle:"italic",borderLeft:"3px solid #4f7ef7"}}>
              {readDetails.msg.text?.slice(0,80)||"GIF/Liite"}{readDetails.msg.text?.length>80&&"..."}
            </div>
            {/* Lähetetty */}
            <div style={{fontSize:12,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              ✓ Lähetetty
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#1e2535",borderRadius:8,marginBottom:14}}>
              <Avatar src={profile?.photoURL} name={profile?.displayName} size={32}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{profile?.displayName} (sinä)</div>
              </div>
              <div style={{fontSize:11,color:"#545d75"}}>{readDetails.msg.createdAt?.toDate?.().toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"})||""}</div>
            </div>
            {/* Lukeneet */}
            <div style={{fontSize:12,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              ✓✓ Lukeneet ({(readDetails.readers||[]).filter(id=>id!==user.uid).length})
            </div>
            {(readDetails.readers||[]).filter(id=>id!==user.uid).length===0&&(
              <div style={{fontSize:13,color:"#545d75",fontStyle:"italic",padding:"8px 0"}}>Ei vielä luettu</div>
            )}
            {(readDetails.readers||[]).filter(id=>id!==user.uid).map(rid=>{
              const ru=allUsers.find(u=>u.id===rid)
              if (!ru) return null
              const sc=statusColor(ru)
              return (
                <div key={rid} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#1e2535",borderRadius:8,marginBottom:6}}>
                  <div style={{position:"relative"}}>
                    <Avatar src={ru.photoURL} name={ru.displayName} size={32}/>
                    <div style={{position:"absolute",bottom:0,right:0,width:8,height:8,borderRadius:"50%",background:sc,border:"2px solid #1e2535"}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{ru.displayName}</div>
                    <div style={{fontSize:10,color:sc}}>{ru.status==="away"?"Poissa":ru.status==="busy"?"Älä häiritse":ru.status==="offline"?"Offline":ru.online?"Paikalla":"Poissa"}</div>
                  </div>
                  <div style={{fontSize:11,color:"#4f7ef7"}}>✓✓ Luettu</div>
                </div>
              )
            })}
            {/* Ei lukeneet — vain kanavilla joilla on rajoitettu jäsenlista */}
            {activeChannel&&channelMembers.filter(m=>m.id!==user.uid&&!(readDetails.readers||[]).includes(m.id)).length>0&&(
              <>
                <div style={{fontSize:12,fontWeight:600,color:"#545d75",textTransform:"uppercase",letterSpacing:"0.07em",margin:"14px 0 10px"}}>Ei luettu</div>
                {channelMembers.filter(m=>m.id!==user.uid&&!(readDetails.readers||[]).includes(m.id)).map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:8,marginBottom:6,opacity:0.6}}>
                    <Avatar src={m.photoURL} name={m.displayName} size={32}/>
                    <div style={{flex:1,fontSize:13,color:"#8b92a8"}}>{m.displayName}</div>
                    <div style={{fontSize:11,color:"#545d75"}}>✓ Toimitettu</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <LinkWarningModal pending={linkPending} onClose={closeLink}/>

      {/* Chat-ilmoitukset */}
      <div style={{position:"fixed",bottom:24,right:24,display:"flex",flexDirection:"column",gap:8,zIndex:300,pointerEvents:"none"}}>
        {notifications.map(n=>(
          <div key={n.id} onClick={()=>setNotifications(prev=>prev.filter(x=>x.id!==n.id))}
            style={{background:"#1e2535",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:"10px 14px",maxWidth:300,pointerEvents:"all",cursor:"pointer",boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
              borderLeft:n.type==="chat"?"3px solid #4f7ef7":n.type==="success"?"3px solid #22c55e":"3px solid #f59e0b",animation:"slideIn 0.2s ease"}}>
            {n.title&&<div style={{fontSize:11,color:"#545d75",marginBottom:2}}>{n.title}</div>}
            <div style={{fontSize:13,color:"#e8eaf0"}}>{n.body}</div>
          </div>
        ))}
      </div>

      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

function MemberRow({ m, isMod, onProfile }) {
  const sc = m?.status==="away"?"#f59e0b":m?.status==="busy"?"#ef4444":m?.status==="offline"?"#545d75":m?.online?"#22c55e":"#545d75"
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",cursor:"pointer",borderRadius:6,margin:"1px 4px"}} onClick={onProfile}>
      <div style={{position:"relative",flexShrink:0}}>
        <Avatar src={m.photoURL} name={m.displayName} size={26}/>
        <div style={{position:"absolute",bottom:0,right:0,width:7,height:7,borderRadius:"50%",border:"1.5px solid #161b27",background:sc}}/>
      </div>
      <span style={{fontSize:12,color:"#8b92a8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {m.displayName?.split(" ")[0]}{isMod&&<span style={{fontSize:9,color:"#4f7ef7",marginLeft:4}}>MOD</span>}
      </span>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div style={{background:"#161b27",border:"1px solid rgba(255,255,255,0.12)",borderRadius:16,padding:24,width:420,maxWidth:"90vw",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontWeight:600,fontSize:16}}>{title}</span>
          <button onClick={onClose} style={{...iconBtn,fontSize:18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const iconBtn   = {background:"transparent",border:"none",color:"#8b92a8",cursor:"pointer",fontSize:16,padding:"4px 6px",borderRadius:6,fontFamily:"system-ui"}
const lbl       = {display:"block",fontSize:12,fontWeight:500,color:"#8b92a8",marginBottom:6,marginTop:10}
const inp       = {width:"100%",background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"9px 12px",color:"#e8eaf0",fontSize:14,boxSizing:"border-box",fontFamily:"system-ui",outline:"none"}
const btnPrimary= {background:"#4f7ef7",border:"none",borderRadius:8,color:"#fff",padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"system-ui"}
const btnGhost  = {background:"transparent",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,color:"#8b92a8",padding:"8px 18px",cursor:"pointer",fontSize:13,fontFamily:"system-ui"}
const ctxItem   = {padding:"6px 10px",cursor:"pointer",fontSize:13,color:"#e8eaf0",borderRadius:6}