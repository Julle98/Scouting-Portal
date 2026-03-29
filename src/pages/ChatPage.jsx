// src/pages/ChatPage.jsx
import { useState, useEffect, useRef } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { db } from "../services/firebase"
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, arrayUnion, arrayRemove,
  setDoc, getDoc, getDocs, where
} from "firebase/firestore"
import { approveReservation, denyReservation, markReturned } from "../services/equipmentService"
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage"
import { getApp } from "firebase/app"
import EmojiPicker from "emoji-picker-react"
import { Avatar } from "../components/ui/Avatar"
import { useLinkWarning, LinkWarningModal, TextWithLinks } from "../components/ui/LinkWarning"
import { isDriveLinked, getDriveInfo, listDriveFiles } from "../services/googleDriveService"

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY;
const QUICK_REACTIONS = ["👍","❤️","😂","🔥","🎉","😎"]
const FREQUENT_EMOJIS_STORAGE_KEY = "chatFrequentEmojis"
const QUICK_REACTION_COUNT = 6
const REACTION_PICKER_WIDTH = 360
const REACTION_PICKER_HEIGHT = 420
const MAX_MSG_LENGTH = 1000
const TYPING_TIMEOUT_MS = 5000
const TYPING_WRITE_INTERVAL_MS = 1500

function loadFrequentEmojis() {
  try {
    const raw = localStorage.getItem(FREQUENT_EMOJIS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function toChatSlug(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-äöå]/g, "")
}

function formatChannelLabel(channel) {
  if (!channel) return ""
  return channel.type === "private" ? `#🔒 ${channel.name}` : `#🌐 ${channel.name}`
}

export default function ChatPage() {
  const { user, profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { chatType, chatTarget } = useParams()
  const isEquipmentManager = isAdmin || profile?.role === "kalustovastaava" || profile?.roles?.includes("kalustovastaava")
  const dmNotesStorageKey = user?.uid ? `dmNotes_${user.uid}` : "dmNotes"
  const [channels, setChannels]       = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [equipmentRequestDetails, setEquipmentRequestDetails] = useState(null)
  const [activeDm, setActiveDm]       = useState(null)
  const [messages, setMessages]       = useState([])
  const [channelBadges, setChannelBadges] = useState({})
  const [dmBadges, setDmBadges] = useState({})
  const [equipmentChats, setEquipmentChats] = useState([])
  const [equipmentBadges, setEquipmentBadges] = useState({})
  const [text, setText]               = useState("")
  const [replyTo, setReplyTo]         = useState(null)
  const [editingMsg, setEditingMsg]   = useState(null)
  const [editText, setEditText]       = useState("")
  const [pendingGif, setPendingGif]   = useState(null)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading]     = useState(false)
  const [showAttach, setShowAttach]   = useState(false)
  const [showEmoji, setShowEmoji]     = useState(false)
  const [showReactionEmojiPicker, setShowReactionEmojiPicker] = useState(false)
  const [reactionPickerMsg, setReactionPickerMsg] = useState(null)
  const [reactionPickerPos, setReactionPickerPos] = useState({ x: 0, y: 0 })
  const [showGif, setShowGif]         = useState(false)
  const [gifSearch, setGifSearch]     = useState("")
  const [gifResults, setGifResults]   = useState([])
  const [gifLoading, setGifLoading]   = useState(false)
  const [gifOffset, setGifOffset]     = useState(0)
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [showNewDM, setShowNewDM]     = useState(false)
  const [showEquipmentChatPicker, setShowEquipmentChatPicker] = useState(false)
  const [showInvite, setShowInvite]   = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [showChannelInfo, setShowChannelInfo] = useState(false)
  const [newCh, setNewCh]             = useState({ name:"", type:"public", description:"" })
  const [editCh, setEditCh]           = useState({ name:"", description:"", slowMode:0 })
  const [inviteTargetUserId, setInviteTargetUserId] = useState("")
  const [messageSearch, setMessageSearch] = useState("")
  const [allUsers, setAllUsers]       = useState([])
  const [showMembers, setShowMembers] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [modQueue, setModQueue]       = useState([])
  const [contextMenu, setContextMenu] = useState(null)
  const [showPinnedMessages, setShowPinnedMessages] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [forwardTargetType, setForwardTargetType] = useState("channel")
  const [forwardTargetId, setForwardTargetId] = useState("")
  const [profileModal, setProfileModal] = useState(null)
  const [hoverMsg, setHoverMsg]       = useState(null)
  const [mutedChannels, setMutedChannels] = useState({})
  const [notifications, setNotifications] = useState([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingDmUsers, setLoadingDmUsers] = useState(true)
  const [loadingEquipmentChats, setLoadingEquipmentChats] = useState(true)
  const [loadingInviteStatuses, setLoadingInviteStatuses] = useState(false)
  // Google Drive modal
  const [driveLinked, setDriveLinked] = useState(false)
  const [driveInfo, setDriveInfo] = useState(null)
  const [driveFiles, setDriveFiles] = useState([])
  const [loadingDrive, setLoadingDrive] = useState(false)
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [pendingDriveFiles, setPendingDriveFiles] = useState([])
  // DM settings
  const [dmSettings, setDmSettings]   = useState(false)
  const [dmNotes, setDmNotes]         = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(dmNotesStorageKey) || "{}")
    } catch {
      return {}
    }
  })
  const [editingDmNote, setEditingDmNote] = useState(false)
  const [dmNoteText, setDmNoteText]   = useState("")
  const [dmReportReason, setDmReportReason] = useState("")
  const [dmReportSent, setDmReportSent] = useState(false)
  const [readDetails, setReadDetails]   = useState(null) // { msg, sent, read }
  const [typingUsers, setTypingUsers]   = useState([])
  // Slow mode
  const [lastSentAt, setLastSentAt]   = useState(0)
  const [slowModeLeft, setSlowModeLeft] = useState(0)
  // @ mentions
  const [showMention, setShowMention] = useState(false)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState(-1)
  const [channelInviteSentMap, setChannelInviteSentMap] = useState({})
  const [condensedChat, setCondensedChat] = useState(localStorage.getItem("condensedChat") === "true")
  const [chatOrder, setChatOrder] = useState(localStorage.getItem("chatOrder") || "default")
  const [sidebarCtxMenu, setSidebarCtxMenu] = useState(null)
  const [pinnedItems, setPinnedItems] = useState(() => { try { return JSON.parse(localStorage.getItem("pinnedItems") || "{}") } catch { return {} } })
  const [hiddenDmUsers, setHiddenDmUsers] = useState(() => { try { return JSON.parse(localStorage.getItem("hiddenDmUsers") || "{}") } catch { return {} } })
  const [sidebarWidth, setSidebarWidth] = useState(() => { const s = parseInt(localStorage.getItem("sidebarWidth")); return isNaN(s) ? 220 : Math.max(160, Math.min(480, s)) })
  const [hiddenNotes, setHiddenNotes] = useState(() => localStorage.getItem("hiddenNotes") === "true")
  const [frequentEmojiUsage, setFrequentEmojiUsage] = useState(() => loadFrequentEmojis())
  const [emojiPickerTheme, setEmojiPickerTheme] = useState("dark")
  const sidebarDragRef = useRef(false)
  const sidebarDragStartXRef = useRef(0)
  const sidebarDragStartWRef = useRef(0)
  const messagesEndRef = useRef(null)
  const gifSearchTimer = useRef(null)
  const fileInputRef   = useRef(null)
  const slowModeTimer  = useRef(null)
  const textAreaRef    = useRef(null)
  const typingTimerRef = useRef(null)
  const lastTypingWriteRef = useRef(0)
  const { pending: linkPending, open: openLink, close: closeLink } = useLinkWarning()

  function openFirstUnreadConversation() {
    const unreadChannel = channels.find(ch => (channelBadges[ch.id]?.unread || 0) > 0)
    if (unreadChannel) {
      selectChannel(unreadChannel)
      return true
    }

    const unreadDmUser = allUsers.find(u2 => {
      if (u2.id === user.uid || hiddenDmUsers[u2.id]) return false
      const dmId = [user.uid, u2.id].sort().join("_")
      return (dmBadges[dmId]?.unread || 0) > 0
    })
    if (unreadDmUser) {
      openDM(unreadDmUser)
      return true
    }

    const unreadEquipment = equipmentChats.find(chat => (equipmentBadges[chat.id]?.unread || 0) > 0)
    if (unreadEquipment) {
      openEquipmentChat(unreadEquipment)
      return true
    }

    return false
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const action = params.get("action")
    if (!action) return

    if (action === "new-channel") {
      setShowNewChannel(true)
    } else if (action === "new-dm") {
      setShowNewDM(true)
    } else if (action === "equipment-reservations") {
      setShowEquipmentChatPicker(true)
    } else if (action === "unread") {
      const found = openFirstUnreadConversation()
      if (!found) pushNotif("info", "Ei lukemattomia viestejä")
    }

    navigate(location.pathname, { replace: true })
  }, [location.search, location.pathname, channels, allUsers, equipmentChats, channelBadges, dmBadges, equipmentBadges, hiddenDmUsers])

  let storage = null
  try { storage = getStorage(getApp()) } catch {}

  // Kanavat
  useEffect(() => {
    setLoadingChannels(true)
    const q = query(collection(db, "channels"), orderBy("name"))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id:d.id, ...d.data() }))
      setChannels(all.filter(ch => ch.type==="public" || ch.members?.includes(user.uid)))
      setActiveChannel(prev => prev ? (all.find(ch=>ch.id===prev.id)||null) : null)
      setLoadingChannels(false)
    })
  }, [user.uid])

  // Käyttäjät
  useEffect(() => {
    setLoadingDmUsers(true)
    return onSnapshot(collection(db, "users"), snap => {
      setAllUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(u => isAdmin || !u.isInvisible))
      setLoadingDmUsers(false)
    })
  }, [isAdmin])

  useEffect(() => {
    setLoadingEquipmentChats(true)
    return onSnapshot(collection(db, "directMessages"), snap => {
      const chats = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(chat => chat.isEquipmentChat && (isAdmin || chat.participants?.includes(user.uid)))
        .sort((a, b) => {
          const closedDiff = Number(Boolean(a.closedAt)) - Number(Boolean(b.closedAt))
          if (closedDiff !== 0) return closedDiff
          const aTime = a.lastMessageAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0
          const bTime = b.lastMessageAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })
      setEquipmentChats(chats)
      setActiveDm(prev => {
        if (!prev?.isEquipmentChat) return prev
        return chats.find(chat => chat.id === prev.id)
          ? { ...prev, ...chats.find(chat => chat.id === prev.id), isEquipmentChat: true }
          : null
      })
      setLoadingEquipmentChats(false)
    })
  }, [user.uid, isAdmin])

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

    const equipmentUnsubs = equipmentChats.map(chat => {
      const q = query(collection(db, "directMessages", chat.id, "messages"), orderBy("createdAt", "desc"), limit(200))
      return onSnapshot(q, snap => {
        let unread = 0
        snap.docs.forEach(d => {
          const m = d.data()
          if (m.senderId === user.uid || m.deleted) return
          if (!(m.readBy||[]).includes(user.uid)) unread++
        })
        setEquipmentBadges(prev => ({ ...prev, [chat.id]: { unread } }))
      })
    })

    return () => {
      channelUnsubs.forEach(unsub => unsub())
      dmUnsubs.forEach(unsub => unsub())
      equipmentUnsubs.forEach(unsub => unsub())
    }
  }, [channels, allUsers, user.uid, profile, equipmentChats])

  useEffect(() => {
    const totalChannelUnread = Object.values(channelBadges).reduce((sum, b) => sum + (b?.unread || 0), 0)
    const totalMentions = Object.values(channelBadges).reduce((sum, b) => sum + (b?.mentions || 0), 0)
    const totalDmUnread = Object.values(dmBadges).reduce((sum, b) => sum + (b?.unread || 0), 0)
    const totalEquipmentUnread = Object.values(equipmentBadges).reduce((sum, b) => sum + (b?.unread || 0), 0)
    const totalUnread = totalChannelUnread + totalDmUnread + totalEquipmentUnread
    const hasChatAlert = totalMentions > 0 || totalDmUnread > 0 || totalEquipmentUnread > 0
    localStorage.setItem("chatAlert", hasChatAlert ? "1" : "0")
    localStorage.setItem("chatUnreadTotal", String(totalUnread))
    window.dispatchEvent(
      new CustomEvent("chatBadgesChanged", {
        detail: { hasChatAlert, totalMentions, totalDmUnread, totalEquipmentUnread, totalChannelUnread, totalUnread }
      })
    )
  }, [channelBadges, dmBadges, equipmentBadges])

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
          const shouldNotify = document.visibilityState === "hidden"
          if (shouldNotify && newest.senderId!==user.uid && !isChannelMuted(activeChannel?.id||activeDm?.id)) {
            const title = activeChannel
              ? `${newest.senderName} · #${activeChannel.name}`
              : newest.senderName
            const body = newest.text?.trim()
              ? newest.text.slice(0, 100)
              : (newest.gifUrl ? "GIF" : "Liite")
            pushNotif("chat", body, title, newest)
          }
        }
        return newMsgs
      })
      setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:"smooth"}),50)
    })
  }, [activeChannel?.id, activeDm?.id])

  useEffect(() => {
    if (!activeChannel && !activeDm) { setPinnedMessages([]); return }
    const path = activeChannel
      ? collection(db, "channels", activeChannel.id, "messages")
      : collection(db, "directMessages", activeDm.id, "messages")
    const q = query(path, orderBy("createdAt", "desc"), limit(500))
    return onSnapshot(q, snap => {
      const pinned = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(m => m.pinned)
        .sort((a, b) => {
          const aMs = a.pinnedAt?.toMillis?.() || 0
          const bMs = b.pinnedAt?.toMillis?.() || 0
          return bMs - aMs
        })
      setPinnedMessages(pinned)
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

  useEffect(() => {
    const onSettingsChange = (e) => {
      const nextCondensed = Boolean(e?.detail?.condensedChat)
      const nextOrder = e?.detail?.chatOrder || "default"
      setCondensedChat(nextCondensed)
      setChatOrder(nextOrder)
    }
    const onStorage = () => {
      setCondensedChat(localStorage.getItem("condensedChat") === "true")
      setChatOrder(localStorage.getItem("chatOrder") || "default")
    }
    window.addEventListener("chatSettingsChanged", onSettingsChange)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("chatSettingsChanged", onSettingsChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    const resolveTheme = () => {
      const saved = localStorage.getItem("theme") || "dark"
      const resolved = saved === "auto" ? (media.matches ? "dark" : "light") : saved
      setEmojiPickerTheme(resolved === "light" ? "light" : "dark")
    }

    resolveTheme()

    const onThemeChanged = () => resolveTheme()
    const onMediaChange = () => {
      const saved = localStorage.getItem("theme") || "dark"
      if (saved === "auto") resolveTheme()
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

  const activeTypingKey = activeChannel
    ? `channel_${activeChannel.id}`
    : (activeDm && !activeDm.isSelfNote ? `dm_${activeDm.id}` : null)

  async function clearTypingIndicator(keyOverride = null) {
    const key = keyOverride || activeTypingKey
    if (!key || !user?.uid) return
    await deleteDoc(doc(db, "typingIndicators", key, "users", user.uid)).catch(() => {})
  }

  function pulseTypingIndicator(value) {
    if (!activeTypingKey || !user?.uid) return

    const trimmed = value.trim()
    if (!trimmed) {
      clearTimeout(typingTimerRef.current)
      clearTypingIndicator()
      return
    }

    const now = Date.now()
    if (now - lastTypingWriteRef.current >= TYPING_WRITE_INTERVAL_MS) {
      setDoc(
        doc(db, "typingIndicators", activeTypingKey, "users", user.uid),
        {
          uid: user.uid,
          displayName: profile?.displayName || "Johtaja",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {})
      lastTypingWriteRef.current = now
    }

    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      clearTypingIndicator()
    }, TYPING_TIMEOUT_MS)
  }

  useEffect(() => {
    if (!activeTypingKey) {
      setTypingUsers([])
      return
    }

    const q = query(
      collection(db, "typingIndicators", activeTypingKey, "users"),
      orderBy("updatedAt", "desc"),
      limit(20)
    )

    return onSnapshot(q, snap => {
      const now = Date.now()
      const users = snap.docs
        .map(d => {
          const data = d.data()
          return { ...data, updatedAtMs: data.updatedAt?.toMillis?.() || 0 }
        })
        .filter(t => t.uid && t.uid !== user.uid && now - t.updatedAtMs < TYPING_TIMEOUT_MS)
      setTypingUsers(users)
    })
  }, [activeTypingKey, user.uid])

  useEffect(() => {
    const iv = setInterval(() => {
      setTypingUsers(prev => prev.filter(t => Date.now() - (t.updatedAtMs || 0) < TYPING_TIMEOUT_MS))
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return
    if (Notification.permission !== "default") return
    Notification.requestPermission().catch(() => {})
  }, [])

  useEffect(() => {
    const key = activeTypingKey
    return () => {
      clearTimeout(typingTimerRef.current)
      if (key && user?.uid) {
        deleteDoc(doc(db, "typingIndicators", key, "users", user.uid)).catch(() => {})
      }
    }
  }, [activeTypingKey, user?.uid])

  // Sivupalkin leveyden pysyvyys
  useEffect(() => {
    try { localStorage.setItem("sidebarWidth", String(sidebarWidth)) } catch {}
  }, [sidebarWidth])

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(dmNotesStorageKey) || "{}")
      setDmNotes(parsed && typeof parsed === "object" ? parsed : {})
    } catch {
      setDmNotes({})
    }
  }, [dmNotesStorageKey])

  useEffect(() => {
    try { localStorage.setItem(dmNotesStorageKey, JSON.stringify(dmNotes)) } catch {}
  }, [dmNotes, dmNotesStorageKey])

  // Sivupalkin vedettävyys
  useEffect(() => {
    function onMouseMove(e) {
      if (!sidebarDragRef.current) return
      const delta = e.clientX - sidebarDragStartXRef.current
      const newW = Math.max(160, Math.min(480, sidebarDragStartWRef.current + delta))
      setSidebarWidth(newW)
    }
    function onMouseUp() {
      sidebarDragRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    return () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }
  }, [])

  function isChannelMuted(id) {
    const until = mutedChannels[id]
    if (!until) return false
    if (Date.now()>until) { setMutedChannels(prev=>{const n={...prev};delete n[id];return n}); return false }
    return true
  }

  function pushNotif(type,body,title,data) {
    if (profile?.status === 'busy') return

    if (
      type === "chat" &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      document.visibilityState === "hidden" &&
      Notification.permission === "granted"
    ) {
      const popup = new Notification(title || "Uusi viesti", {
        body: body || "Sinulle tuli uusi viesti",
        tag: data?.id ? `chat-${data.id}` : undefined,
      })
      popup.onclick = () => {
        window.focus()
        popup.close()
      }
    }

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

  function appendEmoji(emoji) {
    trackEmojiUsage(emoji)
    if (editingMsg) {
      setEditText(prev => `${prev}${emoji}`)
    } else {
      setText(prev => `${prev}${emoji}`)
      pulseTypingIndicator(`${text}${emoji}`)
    }
    setShowEmoji(false)
  }

  function trackEmojiUsage(emoji) {
    if (!emoji) return
    setFrequentEmojiUsage(prev => {
      const next = { ...prev, [emoji]: (prev[emoji] || 0) + 1 }
      try { localStorage.setItem(FREQUENT_EMOJIS_STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  function openReactionPicker(msg, anchorRect = null) {
    if (!msg) return
    const viewportW = window.innerWidth || 1280
    const viewportH = window.innerHeight || 720
    const fallbackX = Math.max(12, viewportW - REACTION_PICKER_WIDTH - 12)
    const fallbackY = Math.max(12, viewportH - REACTION_PICKER_HEIGHT - 12)

    const left = anchorRect
      ? Math.min(Math.max(12, anchorRect.right - REACTION_PICKER_WIDTH), Math.max(12, viewportW - REACTION_PICKER_WIDTH - 12))
      : fallbackX

    let top = fallbackY
    if (anchorRect) {
      const aboveTop = anchorRect.top - REACTION_PICKER_HEIGHT - 8
      const belowTop = anchorRect.bottom + 8
      const maxTop = Math.max(12, viewportH - REACTION_PICKER_HEIGHT - 12)

      if (aboveTop >= 12) {
        top = aboveTop
      } else if (belowTop <= maxTop) {
        top = belowTop
      } else {
        top = Math.min(Math.max(12, belowTop), maxTop)
      }
    }

    setReactionPickerPos({ x: left, y: top })
    setReactionPickerMsg(msg)
    setShowReactionEmojiPicker(true)
    setShowEmoji(false)
    setShowGif(false)
  }

  function resolveMenuPosition(clientX, clientY, menuHeight, menuWidth = 220) {
    const margin = 12
    const viewportW = window.innerWidth || 1280
    const viewportH = window.innerHeight || 720
    const safeLeft = Math.min(
      Math.max(margin, clientX),
      Math.max(margin, viewportW - menuWidth - margin)
    )
    const spaceBelow = viewportH - clientY - margin
    const spaceAbove = clientY - margin

    let top = clientY
    if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
      top = clientY - menuHeight
    } else {
      top = Math.min(
        Math.max(margin, clientY),
        Math.max(margin, viewportH - menuHeight - margin)
      )
    }

    return { x: safeLeft, y: top }
  }

  function openMessageContextMenu(e, msg) {
    e.preventDefault()
    e.stopPropagation()
    const estimatedHeight = activeChannel ? 380 : 290
    const pos = resolveMenuPosition(e.clientX, e.clientY, estimatedHeight, 230)
    setContextMenu({ ...pos, msg })
  }

  function openSidebarContextMenu(e, payload) {
    e.preventDefault()
    e.stopPropagation()
    const estimatedHeights = {
      channel: 330,
      notes: 170,
      dm: 290,
      equipment: 130,
    }
    const estimatedHeight = estimatedHeights[payload?.type] || 220
    const pos = resolveMenuPosition(e.clientX, e.clientY, estimatedHeight, 240)
    setSidebarCtxMenu({ ...pos, ...payload })
  }

  function openGlobalMenuFromChat(x, y) {
    setContextMenu(null)
    setSidebarCtxMenu(null)
    window.dispatchEvent(new CustomEvent("openGlobalContextMenu", { detail: { x, y } }))
  }

  async function sendMessage(gifUrl=pendingGif?.url||null, gifPreview=pendingGif?.preview||null) {
    const t = text.trim()
    if (!t && !gifUrl && pendingFiles.length===0 && pendingDriveFiles.length===0) return
    if (!activeChannel && !activeDm) return
    if (activeDm?.isEquipmentChat && activeDm?.closedAt) return

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
    if (pendingDriveFiles.length>0) {
      attachments = [...attachments, ...pendingDriveFiles.map(f => ({
        url: f.url,
        name: f.name,
        type: f.type,
        size: f.size || 0,
        source: "google-drive",
      }))]
    }

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
    clearTypingIndicator()
    setText(""); setPendingGif(null); setPendingFiles([]); setPendingDriveFiles([]); setReplyTo(null)
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
    const adding = !current.includes(user.uid)
    await updateDoc(path,{[`reactions.${emoji}`]:current.includes(user.uid)?arrayRemove(user.uid):arrayUnion(user.uid)})
    if (adding) trackEmojiUsage(emoji)
  }

  async function deleteMessage(msg, byModerator = false) {
    const path = activeChannel
      ? doc(db,"channels",activeChannel.id,"messages",msg.id)
      : doc(db,"directMessages",activeDm.id,"messages",msg.id)
    await updateDoc(path,{deleted:true,text:"",deletedByModerator:byModerator,deletedBy:byModerator?user.uid:null})
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

  async function copyMessageText(msg) {
    const txt = (msg?.text || "").trim()
    if (!txt) { pushNotif("info", "Viestissä ei ole kopioitavaa tekstiä"); return }
    try {
      await navigator.clipboard.writeText(txt)
      pushNotif("success", "Teksti kopioitu")
    } catch {
      pushNotif("error", "Kopiointi epäonnistui")
    }
    setContextMenu(null)
  }

  function openForwardModal(msg) {
    setForwardMsg(msg)
    setForwardTargetType(activeChannel ? "channel" : "dm")
    setForwardTargetId("")
    setShowForwardModal(true)
    setContextMenu(null)
  }

  async function forwardMessage() {
    if (!forwardMsg || !forwardTargetId) return

    const senderName = forwardMsg.senderName || "Tuntematon"
    const baseText = (forwardMsg.text || "").trim()
    const intro = `↪ Alkuperäinen lähettäjä: ${senderName}`
    const forwardedText = baseText ? `${intro}\n${baseText}` : `${intro}\n[GIF / liite]`

    const payload = {
      text: forwardedText,
      gifUrl: forwardMsg.gifUrl || null,
      gifPreview: forwardMsg.gifPreview || null,
      attachments: forwardMsg.attachments || [],
      senderId: user.uid,
      senderName: profile?.displayName || "Johtaja",
      senderPhoto: profile?.photoURL || null,
      replyTo: null,
      createdAt: serverTimestamp(),
      reactions: {},
      deleted: false,
      readBy: [user.uid],
    }

    if (forwardTargetType === "channel") {
      await addDoc(collection(db, "channels", forwardTargetId, "messages"), payload)
    } else {
      const dmId = [user.uid, forwardTargetId].sort().join("_")
      const dmRef = doc(db, "directMessages", dmId)
      const dmSnap = await getDoc(dmRef)
      if (!dmSnap.exists()) {
        await setDoc(dmRef, {
          participants: [user.uid, forwardTargetId],
          lastMessageAt: serverTimestamp(),
          lastMessage: "",
          isSelfNote: false,
        })
      }
      await addDoc(collection(db, "directMessages", dmId, "messages"), payload)
      await updateDoc(dmRef, { lastMessage: forwardedText.slice(0, 120), lastMessageAt: serverTimestamp() })
    }

    setShowForwardModal(false)
    setForwardMsg(null)
    setForwardTargetId("")
    pushNotif("success", "Viesti lähetetty uudelleen")
  }

  async function togglePinMessage(msg) {
    const path = activeChannel
      ? doc(db, "channels", activeChannel.id, "messages", msg.id)
      : doc(db, "directMessages", activeDm.id, "messages", msg.id)
    const isPinned = Boolean(msg.pinned)
    await updateDoc(path, {
      pinned: !isPinned,
      pinnedAt: !isPinned ? serverTimestamp() : null,
      pinnedBy: !isPinned ? user.uid : null,
    })
    pushNotif("info", !isPinned ? "Viesti kiinnitetty" : "Kiinnitys poistettu")
    setContextMenu(null)
  }

  function jumpToMessage(messageId) {
    if (!messageId) return
    setShowPinnedMessages(false)
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 40)
  }

  function togglePin(id) {
    setPinnedItems(prev => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      try { localStorage.setItem("pinnedItems", JSON.stringify(next)) } catch {}
      return next
    })
    setSidebarCtxMenu(null)
  }

  async function leaveChannel(ch) {
    if (!ch) return
    await updateDoc(doc(db, "channels", ch.id), { members: arrayRemove(user.uid) })
    if (activeChannel?.id === ch.id) { setActiveChannel(null); navigate("/chat") }
    pushNotif("info", `Poistuit kanavalta #${ch.name}`)
    setSidebarCtxMenu(null)
  }

  function hideDmUser(uid) {
    setHiddenDmUsers(prev => {
      const next = { ...prev, [uid]: true }
      try { localStorage.setItem("hiddenDmUsers", JSON.stringify(next)) } catch {}
      return next
    })
    if (activeDm?.otherUser?.id === uid) { setActiveDm(null); navigate("/chat") }
    setSidebarCtxMenu(null)
  }

  async function reportSidebarItem(item, type) {
    await addDoc(collection(db, "moderation"), {
      type,
      targetId: item.id,
      targetName: item.name || item.displayName,
      reporterId: user.uid,
      reporterName: profile?.displayName,
      status: "pending",
      createdAt: serverTimestamp(),
    })
    pushNotif("info", "Raportti lähetetty moderaattoreille")
    setSidebarCtxMenu(null)
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
    if (!activeChannel || !isChannelAdmin || !inviteTargetUserId) return
    const targetUser = allUsers.find(u => u.id === inviteTargetUserId)
    if (!targetUser) return

    const inviteKey = `${activeChannel.id}:${inviteTargetUserId}`
    const alreadySent = channelInviteSentMap[inviteKey] || await hasPendingChannelInvite(activeChannel.id, inviteTargetUserId)
    if (alreadySent) {
      setChannelInviteSentMap(prev => ({ ...prev, [inviteKey]: true }))
      pushNotif("info", `Kutsu on jo lähetetty käyttäjälle ${targetUser.displayName}`)
      return
    }

    const dmId = [user.uid, inviteTargetUserId].sort().join("_")
    const dmRef = doc(db, "directMessages", dmId)
    const dmSnap = await getDoc(dmRef)
    if (!dmSnap.exists()) {
      await setDoc(dmRef, {
        participants: [user.uid, inviteTargetUserId],
        lastMessageAt: serverTimestamp(),
        lastMessage: "",
        isSelfNote: false,
      })
    }

    const channelMemberCount = activeChannel.members?.length || 1
    const inviteText = `Kutsun sinut ryhmään #${activeChannel.name}`

    await addDoc(collection(db, "directMessages", dmId, "messages"), {
      text: inviteText,
      type: "channel_invite",
      channelId: activeChannel.id,
      channelName: activeChannel.name,
      channelDescription: activeChannel.description || "",
      channelMemberCount,
      channelCreatedAt: activeChannel.createdAt || null,
      invitedUserId: inviteTargetUserId,
      invitedById: user.uid,
      invitedByName: profile?.displayName || "Johtaja",
      inviteAcceptedBy: [],
      senderId: user.uid,
      senderName: profile?.displayName || "Johtaja",
      senderPhoto: profile?.photoURL || null,
      createdAt: serverTimestamp(),
      reactions: {},
      deleted: false,
      readBy: [user.uid],
    })

    await updateDoc(dmRef, {
      lastMessage: `Ryhmäkutsu: #${activeChannel.name}`,
      lastMessageAt: serverTimestamp(),
    })

    setChannelInviteSentMap(prev => ({
      ...prev,
      [inviteKey]: true,
    }))

    setInviteTargetUserId("")
    setShowInvite(false)
    pushNotif("success", `Kutsu lähetetty käyttäjälle ${targetUser.displayName}`)
  }

  async function hasPendingChannelInvite(channelId, targetUserId) {
    if (!channelId || !targetUserId) return false
    const dmId = [user.uid, targetUserId].sort().join("_")
    try {
      const inviteQuery = query(
        collection(db, "directMessages", dmId, "messages"),
        orderBy("createdAt", "desc"),
        limit(200)
      )
      const snap = await getDocs(inviteQuery)
      return snap.docs.some(d => {
        const m = d.data() || {}
        return m.type === "channel_invite" &&
          m.channelId === channelId &&
          m.invitedUserId === targetUserId &&
          !(m.inviteAcceptedBy || []).includes(targetUserId)
      })
    } catch {
      return false
    }
  }

  async function acceptChannelInvite(msg) {
    if (!msg?.channelId) return

    const channelRef = doc(db, "channels", msg.channelId)
    const channelSnap = await getDoc(channelRef)
    if (!channelSnap.exists()) {
      pushNotif("error", "Ryhmää ei löytynyt")
      return
    }

    const channelData = channelSnap.data() || {}
    const alreadyMember = (channelData.members || []).includes(user.uid)
    if (!alreadyMember) {
      await updateDoc(channelRef, { members: arrayUnion(user.uid) })
    }

    const msgRef = activeChannel
      ? doc(db, "channels", activeChannel.id, "messages", msg.id)
      : doc(db, "directMessages", activeDm.id, "messages", msg.id)
    await updateDoc(msgRef, {
      inviteAcceptedBy: arrayUnion(user.uid),
      inviteAcceptedAt: serverTimestamp(),
    })

    if (!alreadyMember) pushNotif("success", `Liityit ryhmään #${msg.channelName || "ryhma"}`)
  }

  function openInvitedChannel(msg) {
    if (!msg?.channelId) return
    const target = channels.find(ch => ch.id === msg.channelId)
    if (target) {
      selectChannel(target)
      return
    }
    const fallbackSlug = toChatSlug(msg.channelName || msg.channelId)
    navigate(`/chat/channel/${encodeURIComponent(fallbackSlug)}`)
  }

  async function openDM(targetUser) {
    const isSelf = targetUser.id===user.uid
    const dmId = isSelf ? user.uid+"_"+user.uid : [user.uid,targetUser.id].sort().join("_")
    const ref2 = doc(db,"directMessages",dmId)
    const snap = await getDoc(ref2)
    if (!snap.exists()) await setDoc(ref2,{participants:isSelf?[user.uid,user.uid]:[user.uid,targetUser.id],lastMessageAt:serverTimestamp(),lastMessage:"",isSelfNote:isSelf})
    if (isSelf && hiddenNotes) {
      setHiddenNotes(false)
      try { localStorage.setItem("hiddenNotes", "false") } catch {}
    }
    if (!isSelf && hiddenDmUsers[targetUser.id]) {
      setHiddenDmUsers(prev => {
        const next = { ...prev }
        delete next[targetUser.id]
        try { localStorage.setItem("hiddenDmUsers", JSON.stringify(next)) } catch {}
        return next
      })
    }
    const label = isSelf?{...targetUser,displayName:"📝 Muistiinpanot"}:targetUser
    setActiveDm({id:dmId,otherUser:label,isSelfNote:isSelf})
    setActiveChannel(null); setDmSettings(false)
    const nextPath = isSelf ? "/chat/notes" : `/chat/dm/${targetUser.id}`
    if (location.pathname !== nextPath) navigate(nextPath)
  }

  function openEquipmentChat(chat, updateRoute = true) {
    setActiveDm({ ...chat, isEquipmentChat: true })
    setActiveChannel(null)
    setDmSettings(false)
    if (!updateRoute) return
    const nextPath = `/chat/equipment/${chat.id}`
    if (location.pathname !== nextPath) navigate(nextPath)
  }

  function selectChannel(ch, updateRoute = true) {
    setActiveChannel(ch)
    setActiveDm(null)
    setDmSettings(false)
    if (!updateRoute) return
    const target = toChatSlug(ch?.name || ch?.id)
    const nextPath = `/chat/channel/${encodeURIComponent(target)}`
    if (location.pathname !== nextPath) navigate(nextPath)
  }

  useEffect(() => {
    if (!chatType) return

    if (chatType === "notes") {
      const self = allUsers.find(u => u.id === user.uid) || { id: user.uid, displayName: "Muistiinpanot" }
      openDM(self)
      return
    }

    if (chatType === "channel") {
      if (!chatTarget || channels.length === 0) return
      const target = toChatSlug(chatTarget)
      const ch = channels.find(c => toChatSlug(c.name) === target || c.id === chatTarget)
      if (ch && activeChannel?.id !== ch.id) selectChannel(ch, false)
      return
    }

    if (chatType === "dm") {
      if (!chatTarget || allUsers.length === 0) return
      const dmUser = allUsers.find(u => u.id === chatTarget)
      if (dmUser && activeDm?.otherUser?.id !== dmUser.id) openDM(dmUser)
      return
    }

    if (chatType === "equipment") {
      if (!chatTarget || equipmentChats.length === 0) return
      const equipmentChat = equipmentChats.find(chat => chat.id === chatTarget || chat.reservationId === chatTarget)
      if (equipmentChat && activeDm?.id !== equipmentChat.id) openEquipmentChat(equipmentChat, false)
    }
  }, [chatType, chatTarget, channels, allUsers, equipmentChats, user.uid])

  useEffect(() => {
    setMessageSearch("")
  }, [activeChannel?.id, activeDm?.id])

  useEffect(() => {
    if (!showInvite || !activeChannel) return
    if (inviteCandidates.length === 0) return

    let cancelled = false
    setLoadingInviteStatuses(true)

    Promise.all(inviteCandidates.map(async u2 => {
      const sent = await hasPendingChannelInvite(activeChannel.id, u2.id)
      return [u2.id, sent]
    })).then(entries => {
      if (cancelled) return
      setChannelInviteSentMap(prev => {
        const next = { ...prev }
        entries.forEach(([uid, sent]) => {
          next[`${activeChannel.id}:${uid}`] = Boolean(sent)
        })
        return next
      })
      setLoadingInviteStatuses(false)
    }).catch(() => {
      if (cancelled) return
      setLoadingInviteStatuses(false)
    })

    return () => {
      cancelled = true
    }
  }, [showInvite, activeChannel?.id, allUsers, user.uid])

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
      senderPhoto: profile?.photoURL || null,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      type: "equipment_action",
      reactions: {},
      deleted: false,
    })
    await updateDoc(doc(db,"directMessages",activeDm.id),{lastMessage:actionLabel,lastMessageAt:serverTimestamp()})
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

  async function closeEquipmentChat() {
    if (!activeDm?.isEquipmentChat || activeDm.closedAt) return
    const closeText = `🔒 Keskustelu suljettu (${profile?.displayName || "Johtaja"})`
    await addDoc(collection(db,"directMessages",activeDm.id,"messages"), {
      text: closeText,
      senderId: user.uid,
      senderName: profile?.displayName,
      senderPhoto: profile?.photoURL || null,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      type: "equipment_closed",
      reactions: {},
      deleted: false,
    })
    await updateDoc(doc(db,"directMessages",activeDm.id), {
      status: "closed",
      closedAt: serverTimestamp(),
      closedBy: user.uid,
      closedByName: profile?.displayName,
      lastMessage: closeText,
      lastMessageAt: serverTimestamp(),
    })
  }

  async function reopenEquipmentChat() {
    if (!activeDm?.isEquipmentChat || !activeDm.closedAt || !isEquipmentManager) return
    const reopenText = `🔓 Keskustelu avattu uudelleen (${profile?.displayName || "Johtaja"})`
    await addDoc(collection(db,"directMessages",activeDm.id,"messages"), {
      text: reopenText,
      senderId: user.uid,
      senderName: profile?.displayName,
      senderPhoto: profile?.photoURL || null,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      type: "equipment_reopened",
      reactions: {},
      deleted: false,
    })
    await updateDoc(doc(db,"directMessages",activeDm.id), {
      status: "open",
      closedAt: null,
      closedBy: null,
      closedByName: null,
      lastMessage: reopenText,
      lastMessageAt: serverTimestamp(),
    })
  }

  async function requestCancellation() {
    if (!activeDm?.isEquipmentChat || !equipmentRequestDetails) return
    if (equipmentRequestDetails.status !== "pending" && equipmentRequestDetails.status !== "approved") return
    if (equipmentRequestDetails.cancellationRequestedAt) return

    await updateDoc(doc(db, "equipment", equipmentRequestDetails.itemId, "reservations", equipmentRequestDetails.id), {
      cancellationRequestedAt: serverTimestamp(),
      cancellationRequestedBy: user.uid,
      cancellationRequestedByName: profile?.displayName,
    })

    const requestText = `🟠 Peruutuspyyntö: ${equipmentRequestDetails.itemName} (${profile?.displayName || "Pyytäjä"})`
    await addDoc(collection(db, "directMessages", activeDm.id, "messages"), {
      text: requestText,
      senderId: user.uid,
      senderName: profile?.displayName,
      senderPhoto: profile?.photoURL || null,
      createdAt: serverTimestamp(),
      readBy: [user.uid],
      type: "equipment_cancel_request",
      reactions: {},
      deleted: false,
    })
    await updateDoc(doc(db, "directMessages", activeDm.id), {
      lastMessage: requestText,
      lastMessageAt: serverTimestamp(),
    })
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

  // Tarkista Google Drive -linkitys
  useEffect(() => {
    setDriveLinked(isDriveLinked())
    const info = getDriveInfo()
    if (info) setDriveInfo(info)
  }, [])

  // Lataa Google Drive -tiedostot
  async function loadDriveFiles() {
    setLoadingDrive(true)
    try {
      const token = localStorage.getItem("google_drive_token")
      if (!token) {
        pushNotif("error", "Drive-token puuttuu. Linkitä Drive profiilissa.")
        return
      }
      const files = await listDriveFiles(token, 15)
      setDriveFiles(files)
    } catch (err) {
      pushNotif("error", "Tiedostojen lataus epäonnistui: " + err.message)
    } finally {
      setLoadingDrive(false)
    }
  }

  function formatTime(ts) { if (!ts) return ""; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"}) }
  function formatDate(ts) { if (!ts) return ""; const d=ts.toDate?ts.toDate():new Date(ts); return d.toLocaleDateString("fi-FI") }
  function formatChatDayLabel(ts) {
    if (!ts) return "Tuntematon päivä"
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    const base = d.toLocaleDateString("fi-FI", { day: "numeric", month: "long", year: "numeric" })
    return base.charAt(0).toUpperCase() + base.slice(1)
  }
  function getChatDayKey(ts) {
    if (!ts) return ""
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }
  function formatLastSeen(ts) {
    if (!ts) return "Ei tietoa"
    const d=ts.toDate?ts.toDate():new Date(ts); const diff=(Date.now()-d.getTime())/1000/60
    if (diff<2) return "Juuri nyt"; if (diff<60) return `${Math.round(diff)} min sitten`
    if (diff<1440) return `${Math.round(diff/60)} t sitten`; return d.toLocaleDateString("fi-FI")
  }
  function formatFileSize(b) { if (b<1024) return b+" B"; if (b<1048576) return (b/1024).toFixed(1)+" KB"; return (b/1048576).toFixed(1)+" MB" }
  function statusColor(m) { return m?.status==="away"?"#f59e0b":m?.status==="busy"?"#ef4444":m?.status==="offline"?"var(--text3)":m?.online?"#22c55e":"var(--text3)" }

  const channelMembers = activeChannel ? allUsers.filter(u=>activeChannel.type==="public"||activeChannel.members?.includes(u.id)) : []
  const isChannelAdmin = isAdmin||activeChannel?.createdBy===user.uid||activeChannel?.moderators?.includes(user.uid)
  const creatorUser = activeChannel ? allUsers.find(u=>u.id===activeChannel.createdBy) : null
  const charsLeft = MAX_MSG_LENGTH - text.length
  const slowMode = activeChannel?.slowMode||0
  const canSend = !activeDm?.closedAt && (text.trim().length>0||pendingGif||pendingFiles.length>0||pendingDriveFiles.length>0)
  const visibleDmUsers = allUsers.filter(u2=>u2.id!==user.uid&&!hiddenDmUsers[u2.id])
  const inviteCandidates = activeChannel
    ? allUsers.filter(u2 => u2.id !== user.uid && !activeChannel.members?.includes(u2.id))
    : []
  const inviteCandidatesWithState = inviteCandidates.map(u2 => ({
    ...u2,
    inviteSent: Boolean(activeChannel && channelInviteSentMap[`${activeChannel.id}:${u2.id}`]),
  }))
  const normalizedMessageSearch = messageSearch.trim().toLowerCase()
  const filteredMessages = normalizedMessageSearch
    ? messages.filter(msg => {
        const haystack = [
          msg.text,
          msg.senderName,
          msg.channelName,
          msg.channelDescription,
          msg.invitedByName,
        ].filter(Boolean).join(" ").toLowerCase()
        return haystack.includes(normalizedMessageSearch)
      })
    : messages
  const sortedChannels = [...channels].sort((a, b) => {
    const aPinned = pinnedItems[a.id] ? 1 : 0
    const bPinned = pinnedItems[b.id] ? 1 : 0
    if (aPinned !== bPinned) return bPinned - aPinned
    if (chatOrder === "unread") {
      const aScore = (channelBadges[a.id]?.mentions || 0) * 10 + (channelBadges[a.id]?.unread || 0)
      const bScore = (channelBadges[b.id]?.mentions || 0) * 10 + (channelBadges[b.id]?.unread || 0)
      if (aScore !== bScore) return bScore - aScore
    }
    if (chatOrder === "activity") {
      const aScore = (channelBadges[a.id]?.unread || 0)
      const bScore = (channelBadges[b.id]?.unread || 0)
      if (aScore !== bScore) return bScore - aScore
    }
    return (a.name || "").localeCompare(b.name || "", "fi")
  })
  const typingNames = typingUsers.map(u=>u.displayName?.split(" ")[0]).filter(Boolean)
  const typingText = typingNames.length===0
    ? ""
    : typingNames.length===1
      ? `${typingNames[0]} kirjoittaa...`
      : typingNames.length===2
        ? `${typingNames[0]} ja ${typingNames[1]} kirjoittavat...`
        : `${typingNames[0]} ja ${typingNames.length-1} muuta kirjoittavat...`

  useEffect(() => {
    if (!activeDm?.isEquipmentChat || !activeDm.itemId || !activeDm.reservationId) {
      setEquipmentRequestDetails(null)
      return
    }
    const resDoc = doc(db, "equipment", activeDm.itemId, "reservations", activeDm.reservationId)
    const unsub = onSnapshot(resDoc, snap => {
      if (snap.exists()) {
        setEquipmentRequestDetails({ id: snap.id, ...snap.data(), itemId: activeDm.itemId, itemName: activeDm.itemName, requesterId: activeDm.requesterId })
      } else {
        setEquipmentRequestDetails(null)
      }
    }, () => {
      setEquipmentRequestDetails(null)
    })
    return () => unsub()
  }, [activeDm?.id, activeDm?.isEquipmentChat, activeDm?.itemId, activeDm?.reservationId, activeDm?.itemName, activeDm?.requesterId])
  const isOverLimit = text.length > MAX_MSG_LENGTH
  const isClosedEquipmentChat = Boolean(activeDm?.isEquipmentChat && activeDm?.closedAt)
  const openEquipmentChats = equipmentChats.filter(chat => !chat.closedAt)
  const archivedEquipmentChats = equipmentChats.filter(chat => chat.closedAt)
  const frequentEmojis = Object.entries(frequentEmojiUsage)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .map(([emoji]) => emoji)
  const quickReactionEmojis = Array.from(new Set([...frequentEmojis, ...QUICK_REACTIONS])).slice(0, QUICK_REACTION_COUNT)
  const contextReactionEmojis = Array.from(new Set([...frequentEmojis, ...QUICK_REACTIONS])).slice(0, 8)
  const hasCancellationRequest = Boolean(equipmentRequestDetails?.cancellationRequestedAt) &&
    (equipmentRequestDetails?.status === "pending" || equipmentRequestDetails?.status === "approved")
  const equipmentStatusMeta = activeDm?.closedAt
    ? { text: "Suljettu", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" }
    : equipmentRequestDetails?.status === "returned"
      ? { text: "Palautettu", color: "#22c55e", bg: "rgba(34,197,94,0.12)" }
      : equipmentRequestDetails?.status === "denied"
        ? { text: "Peruttu", color: "#ef4444", bg: "rgba(239,68,68,0.12)" }
        : equipmentRequestDetails?.status === "approved"
          ? { text: "Hyväksytty", color: "#4f7ef7", bg: "rgba(79,126,247,0.12)" }
          : { text: "Odottaa hyväksyntää", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" }

  return (
    <div style={{display:"flex",flex:1,overflow:"hidden"}} onClick={()=>{setContextMenu(null);setSidebarCtxMenu(null);setShowEmoji(false);setShowReactionEmojiPicker(false);setReactionPickerMsg(null);setShowGif(false);setHoverMsg(null);setShowAttach(false)}}>

      {/* Sidebar */}
      {showSidebar && (
        <div style={{width:sidebarWidth,minWidth:160,maxWidth:480,background:"var(--bg2)",borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column",overflow:"hidden",position:"relative",flexShrink:0}}>
          {/* Vetorajapinta */}
          <div
            onMouseDown={e=>{e.preventDefault();sidebarDragRef.current=true;sidebarDragStartXRef.current=e.clientX;sidebarDragStartWRef.current=sidebarWidth;document.body.style.cursor="col-resize";document.body.style.userSelect="none"}}
            style={{position:"absolute",right:0,top:0,bottom:0,width:5,cursor:"col-resize",zIndex:10,background:"transparent",transition:"background 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(79,126,247,0.35)"}
            onMouseLeave={e=>{if(!sidebarDragRef.current)e.currentTarget.style.background="transparent"}}
          />
          <div style={{padding:"12px 10px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Kanavat</span>
            <button onClick={e=>{e.stopPropagation();setShowNewChannel(true)}} style={sectionAddBtn}>＋</button>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {loadingChannels && (
              <div style={{padding:"6px 12px",fontSize:12,color:"var(--text3)"}}>
                Ladataan ryhmiä...
              </div>
            )}
            {!loadingChannels && sortedChannels.length === 0 && (
              <div style={{padding:"6px 12px",fontSize:12,color:"var(--text3)"}}>
                Ei ryhmiä vielä.
              </div>
            )}
            {!loadingChannels && sortedChannels.map(ch=>(
              <div key={ch.id} onClick={()=>selectChannel(ch)}
                onContextMenu={e=>openSidebarContextMenu(e,{type:"channel",item:ch})}
                style={{padding:"6px 12px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:6,
                  background:activeChannel?.id===ch.id?"rgba(79,126,247,0.15)":"transparent",
                  color:activeChannel?.id===ch.id?"#4f7ef7":"var(--text2)"}}>
                <span style={{flex:1}}>{formatChannelLabel(ch)}</span>
                {pinnedItems[ch.id]&&<span style={{fontSize:10,opacity:0.6}}>📌</span>}
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
              <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Yksityisviestit</span>
              <button onClick={e=>{e.stopPropagation();setShowNewDM(true)}} style={sectionAddBtn} title="Uusi yksityisviesti">＋</button>
            </div>

            {/* Muistiinpanot */}
            {!hiddenNotes && (
              <div onClick={()=>{const me=allUsers.find(u=>u.id===user.uid)||{id:user.uid,displayName:"Muistiinpanot"};openDM(me)}}
                onContextMenu={e=>openSidebarContextMenu(e,{type:"notes"})}
                style={{padding:"5px 12px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:7,
                  background:activeDm?.isSelfNote?"rgba(79,126,247,0.15)":"transparent",
                  color:activeDm?.isSelfNote?"#4f7ef7":"var(--text2)"}}>
                <span style={{fontSize:16,lineHeight:"22px",flexShrink:0}}>📝</span>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>Muistiinpanot</span>
              </div>
            )}

            {/* DM-lista */}
            {loadingDmUsers && (
              <div style={{padding:"6px 12px",fontSize:12,color:"var(--text3)"}}>
                Ladataan keskusteluita...
              </div>
            )}
            {!loadingDmUsers && visibleDmUsers.length === 0 && (
              <div style={{padding:"6px 12px",fontSize:12,color:"var(--text3)"}}>
                Ei keskusteluita vielä.
              </div>
            )}
            {!loadingDmUsers && visibleDmUsers.map(u2=>(
              <div key={u2.id} onClick={()=>openDM(u2)}
                onContextMenu={e=>{const dmId=[user.uid,u2.id].sort().join("_");openSidebarContextMenu(e,{type:"dm",item:u2,dmId})}}
                style={{padding:"5px 10px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:7,
                  background:activeDm?.otherUser?.id===u2.id&&!activeDm?.isSelfNote?"rgba(79,126,247,0.15)":"transparent",
                  color:activeDm?.otherUser?.id===u2.id&&!activeDm?.isSelfNote?"#4f7ef7":"var(--text2)"}}>
                <div style={{position:"relative",flexShrink:0,width:22,height:22}}>
                  <Avatar src={u2.photoURL} name={u2.displayName} size={22} />
                  <div style={{position:"absolute",bottom:0,right:0,width:7,height:7,borderRadius:"50%",border:"1.5px solid var(--bg2)",
                    background:statusColor(u2)}} />
                </div>
                <div style={{flex:1,minWidth:0,lineHeight:1.25}}>
                  <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:"18px",fontSize:13}}>{u2.displayName}</div>
                  {(u2.role||u2.title)&&<div style={{fontSize:9,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:0.65}}>{[u2.role,u2.title].filter(Boolean).join(" | ")}</div>}
                </div>
                {pinnedItems[u2.id]&&<span style={{fontSize:10,opacity:0.6}}>📌</span>}
                {isChannelMuted([user.uid,u2.id].sort().join("_"))&&<span style={{fontSize:10}}>🔕</span>}
                {dmBadges[[user.uid,u2.id].sort().join("_")]?.unread > 0 && (
                  <span style={{minWidth:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700}}>
                    {dmBadges[[user.uid,u2.id].sort().join("_")].unread}
                  </span>
                )}
              </div>
            ))}

            <div style={{padding:"12px 10px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Kalustovaraukset</span>
                <button onClick={e=>{e.stopPropagation();setShowEquipmentChatPicker(true)}} style={sectionAddBtn} title="Kalustovaraukset">＋</button>
            </div>

            {loadingEquipmentChats && (
              <div style={{padding:"6px 12px",fontSize:12,color:"var(--text3)"}}>
                Ladataan kalustovarauksia...
              </div>
            )}

            {!loadingEquipmentChats && equipmentChats.length === 0 && (
              <div style={{padding:"6px 12px",fontSize:12,color:"var(--text3)"}}>
                Ei keskusteluja vielä.
              </div>
            )}

            {!loadingEquipmentChats && openEquipmentChats.map(chat => (
              <div key={chat.id} onClick={()=>openEquipmentChat(chat)}
                onContextMenu={e=>openSidebarContextMenu(e,{type:"equipment",item:chat})}
                style={{padding:"6px 10px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:8,
                  background:activeDm?.id===chat.id?"rgba(79,126,247,0.15)":"transparent",
                  color:activeDm?.id===chat.id?"#4f7ef7":"var(--text2)",
                  opacity: chat.closedAt ? 0.72 : 1}}>
                <div style={{width:22,height:22,borderRadius:7,background:"rgba(79,126,247,0.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>
                  {chat.itemEmoji || "🎒"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chat.itemName}</div>
                  <div style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {chat.requesterId === user.uid ? "Oma varaus" : chat.requesterName || "Kalustovaraus"}
                    {chat.closedAt ? " · Suljettu" : ""}
                  </div>
                </div>
                {pinnedItems[chat.id]&&<span style={{fontSize:10,opacity:0.6}}>📌</span>}
                {equipmentBadges[chat.id]?.unread > 0 && (
                  <span style={{minWidth:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700}}>
                    {equipmentBadges[chat.id].unread}
                  </span>
                )}
              </div>
            ))}

            {!loadingEquipmentChats && archivedEquipmentChats.length > 0 && (
              <>
                <div style={{padding:"12px 10px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Arkistoidut</span>
                  <span style={{fontSize:10,color:"var(--text3)"}}>{archivedEquipmentChats.length}</span>
                </div>
                {archivedEquipmentChats.map(chat => (
                  <div key={chat.id} onClick={()=>openEquipmentChat(chat)}
                    onContextMenu={e=>openSidebarContextMenu(e,{type:"equipment",item:chat})}
                    style={{padding:"6px 10px",cursor:"pointer",fontSize:13,borderRadius:6,margin:"1px 4px",display:"flex",alignItems:"center",gap:8,
                      background:activeDm?.id===chat.id?"rgba(245,158,11,0.15)":"transparent",
                      color:activeDm?.id===chat.id?"#f59e0b":"var(--text2)",
                      opacity:0.75}}>
                    <div style={{width:22,height:22,borderRadius:7,background:"rgba(245,158,11,0.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>
                      {chat.itemEmoji || "🎒"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chat.itemName}</div>
                      <div style={{fontSize:10,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {chat.requesterId === user.uid ? "Oma varaus" : chat.requesterName || "Kalustovaraus"} · Suljettu
                      </div>
                    </div>
                    {equipmentBadges[chat.id]?.unread > 0 && (
                      <span style={{minWidth:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700}}>
                        {equipmentBadges[chat.id].unread}
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Chat-alue */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{padding:"0 16px",height:52,borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10,background:"var(--bg2)",flexShrink:0}}>
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
                  {formatChannelLabel(activeChannel)}
                </span>
                {activeChannel?.description&&<span style={{fontSize:12,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeChannel.description}</span>}
                {slowMode>0&&<span style={{fontSize:11,color:"var(--text2)",background:"rgba(255,255,255,0.06)",padding:"1px 7px",borderRadius:10}}>🐌 {slowMode}s</span>}
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"baseline",gap:10,flex:1,minWidth:0}}>
                {activeDm.isEquipmentChat ? (
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:28,height:28,borderRadius:10,background:"rgba(79,126,247,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>
                      {activeDm.itemEmoji || "🎒"}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                        <span style={{fontWeight:600,fontSize:14,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeDm.itemName}</span>
                        <span style={{fontSize:11,color:equipmentStatusMeta.color,background:equipmentStatusMeta.bg,padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap"}}>{equipmentStatusMeta.text}</span>
                        {hasCancellationRequest && (
                          <span style={{fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,0.16)",padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap"}}>Peruutuspyyntö odottaa</span>
                        )}
                      </div>
                      <div style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {activeDm.requesterId === user.uid ? "Oma varaus" : `Pyytäjä: ${activeDm.requesterName || "—"}`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{position:"relative",flexShrink:0,width:24,height:24}}>
                      <Avatar src={activeDm.otherUser?.photoURL} name={activeDm.otherUser?.displayName} size={24} />
                      <div style={{position:"absolute",bottom:0,right:0,width:8,height:8,borderRadius:"50%",border:"1.5px solid var(--bg2)",background:statusColor(activeDm.otherUser)}}></div>
                    </div>
                    <span
                      style={{fontWeight:600,fontSize:14,cursor:"pointer",textDecoration:"underline"}}
                      onClick={() => activeDm.otherUser && setProfileModal(activeDm.otherUser)}
                      title="Avaa profiili"
                    >
                      {activeDm.otherUser?.displayName}
                    </span>
                    {activeDm.isSelfNote && (
                      <span style={{fontSize:12,color:"var(--text3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        Tänne voit laittaa säilöön omia muistiinpanoja halutessasi
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          ) : <span style={{fontSize:14,color:"var(--text3)",flex:1}}>Valitse kanava, henkilö tai kalustovaraus</span>
          }
          {(activeChannel || activeDm) && (
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <input
                value={messageSearch}
                onChange={e=>setMessageSearch(e.target.value)}
                placeholder="🔎 Hae viestejä..."
                style={{width:220,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:8,padding:"6px 10px",color:"var(--text)",fontSize:12,fontFamily:"system-ui",outline:"none"}}
              />
              <button onClick={()=>setShowPinnedMessages(true)} style={iconBtn} title="Kiinnitetyt viestit">📌</button>
            </div>
          )}
          {activeChannel&&isChannelMuted(activeChannel.id)&&(
            <button onClick={()=>setMutedChannels(prev=>{const n={...prev};delete n[activeChannel.id];return n})} style={{...iconBtn,color:"#f59e0b",fontSize:12}}>🔕</button>
          )}
          {activeChannel&&isChannelAdmin&&(
            <button onClick={e=>{e.stopPropagation();setShowInvite(true)}} style={iconBtn} title="Kutsu ryhmään">✉️</button>
          )}
          {activeChannel&&(isChannelAdmin || isEquipmentManager)&&(
            <button onClick={e=>{e.stopPropagation();openChannelSettings()}} style={iconBtn} title="Avaa kanavan säädöt">⚙️</button>
          )}
          {activeDm&&!activeDm.isSelfNote&&!activeDm.isEquipmentChat&&(
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
              <span key={r.id} style={{fontSize:12,color:"var(--text2)"}}>"{r.messageText?.slice(0,30)}..."
                <button onClick={()=>resolveReport(r.id,"resolved")} style={{marginLeft:6,background:"rgba(239,68,68,0.2)",border:"none",color:"#f87171",borderRadius:4,padding:"2px 7px",cursor:"pointer",fontSize:11}}>Poista</button>
                <button onClick={()=>resolveReport(r.id,"dismissed")} style={{marginLeft:4,background:"transparent",border:"none",color:"var(--text3)",cursor:"pointer",fontSize:11}}>Ohita</button>
              </span>
            ))}
          </div>
        )}

        {!activeChannel&&!activeDm&&(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,color:"var(--text3)"}}>
            <span style={{fontSize:40}}>💬</span>
            <span style={{fontSize:14}}>Valitse kanava, henkilö tai kalustovaraus vasemmalta</span>
          </div>
        )}

        {(activeChannel||activeDm)&&(
          <>
            <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:2}}>
              {normalizedMessageSearch && filteredMessages.length===0 && (
                <div style={{padding:"18px 10px",fontSize:13,color:"var(--text3)",textAlign:"center"}}>
                  Ei hakutuloksia haulla "{messageSearch.trim()}".
                </div>
              )}
              {filteredMessages.map((msg,i)=>{
                const showDayDivider = i===0 || getChatDayKey(filteredMessages[i-1]?.createdAt) !== getChatDayKey(msg.createdAt)
                const isMine=msg.senderId===user.uid
                const isChannelInviteMessage = msg.type === "channel_invite"
                const rawShowAvatar=isChannelInviteMessage||i===0||filteredMessages[i-1]?.senderId!==msg.senderId
                const showAvatar=!condensedChat&&rawShowAvatar
                const isHovered=hoverMsg===msg.id
                const readCount=msg.readBy?msg.readBy.filter(id=>id!==msg.senderId).length:0
                const isEquipmentSystemMessage = msg.type === "equipment_request" || msg.type === "equipment_action" || msg.type === "equipment_closed" || msg.type === "equipment_reopened" || msg.type === "equipment_cancel_request"
                const inviteJoined = isChannelInviteMessage && ((msg.inviteAcceptedBy || []).includes(user.uid) || channels.some(ch => ch.id === msg.channelId))
                const inviteForMe = isChannelInviteMessage && msg.invitedUserId === user.uid
                return (
                  <div key={msg.id} id={`msg-${msg.id}`}>
                    {showDayDivider && (
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",margin:"10px 0 8px"}}>
                        <span style={{fontSize:11,color:"var(--text3)",letterSpacing:"0.04em"}}>
                          {`--- ${formatChatDayLabel(msg.createdAt)} ---`}
                        </span>
                      </div>
                    )}
                    <div
                      onMouseEnter={()=>setHoverMsg(msg.id)} onMouseLeave={()=>setHoverMsg(null)}
                      onContextMenu={e=>openMessageContextMenu(e,msg)}
                      style={{display:"flex",gap:condensedChat?6:10,alignItems:"flex-start",padding:condensedChat?"2px 6px":"3px 6px",borderRadius:8,marginTop:showAvatar?10:0,position:"relative",
                        background:isHovered?"rgba(255,255,255,0.03)":"transparent"}}>
                    {isHovered&&!msg.deleted&&(
                      <div style={{position:"absolute",right:10,top:-4,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:10,padding:"3px 6px",display:"flex",gap:2,zIndex:5,boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}
                        onClick={e=>e.stopPropagation()}>
                        {quickReactionEmojis.map(e=>(
                          <button key={e} onClick={()=>toggleReaction(msg,e)} style={{fontSize:16,padding:"2px 4px",cursor:"pointer",border:"none",background:"transparent",borderRadius:5}}>{e}</button>
                        ))}
                        <button onClick={(e)=>openReactionPicker(msg, e.currentTarget.getBoundingClientRect())} style={{fontSize:16,padding:"2px 6px",cursor:"pointer",border:"none",background:"transparent",borderRadius:5,color:"var(--text2)"}} title="Lisää reaktio">＋</button>
                        <div style={{width:"1px",background:"var(--border2)",margin:"2px 4px"}}/>
                        <button onClick={()=>setReplyTo(msg)} style={{...iconBtn,fontSize:14,padding:"2px 6px"}} title="Vastaa">↩</button>
                        {isMine&&(<>
                          <button onClick={()=>{setEditingMsg(msg);setEditText(msg.text);setHoverMsg(null)}} style={{...iconBtn,fontSize:14,padding:"2px 6px"}} title="Muokkaa">✏️</button>
                          <button onClick={()=>deleteMessage(msg)} style={{...iconBtn,fontSize:14,padding:"2px 6px",color:"#f87171"}} title="Poista">🗑️</button>
                        </>)}
                      </div>
                    )}
                    <div style={{width:condensedChat?6:36,flexShrink:0,cursor:condensedChat?"default":"pointer"}} onClick={()=>{if(condensedChat)return;const u2=allUsers.find(u=>u.id===msg.senderId);if(u2)setProfileModal(u2)}}>
                      {showAvatar&&<Avatar src={msg.senderPhoto} name={msg.senderName} size={36} />}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      {(showAvatar||condensedChat)&&(
                        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}>
                          <span style={{fontWeight:600,fontSize:13,cursor:"pointer"}} onClick={()=>{const u2=allUsers.find(u=>u.id===msg.senderId);if(u2)setProfileModal(u2)}}>{msg.senderName}</span>
                          <span style={{fontSize:11,color:"var(--text3)"}}>{formatTime(msg.createdAt)}</span>
                          {msg.edited&&<span style={{fontSize:10,color:"var(--text3)"}}>(muokattu)</span>}
                        </div>
                      )}
                      {msg.replyTo&&(
                        <div style={{fontSize:12,color:"var(--text3)",borderLeft:"3px solid #4f7ef7",paddingLeft:8,marginBottom:5,background:"rgba(79,126,247,0.06)",borderRadius:"0 4px 4px 0",padding:"3px 8px"}}>
                          ↩ <strong style={{color:"var(--text2)"}}>{msg.replyTo.senderName}</strong>: {msg.replyTo.text}
                        </div>
                      )}
                      {msg.deleted
                        ? <span style={{fontStyle:"italic",color:"var(--text3)",fontSize:13}}>{msg.deletedByModerator ? "[Viesti poistettu modin toimesta]" : "[viesti poistettu]"}</span>
                        : editingMsg?.id===msg.id
                          ? <div onClick={e=>e.stopPropagation()}>
                              <textarea value={editText} onChange={e=>setEditText(e.target.value)}
                                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();saveEdit()}if(e.key==="Escape")setEditingMsg(null)}}
                                style={{width:"100%",background:"var(--bg3)",border:"1px solid #4f7ef7",borderRadius:8,padding:"8px 10px",color:"var(--text)",fontSize:14,resize:"none",fontFamily:"system-ui",outline:"none",boxSizing:"border-box"}} rows={2} autoFocus />
                              <div style={{display:"flex",gap:6,marginTop:4}}>
                                <button onClick={saveEdit} style={{...btnPrimary,fontSize:11,padding:"3px 10px"}}>Tallenna</button>
                                <button onClick={()=>setEditingMsg(null)} style={{...btnGhost,fontSize:11,padding:"3px 10px"}}>Peruuta</button>
                              </div>
                            </div>
                          : <>
                              {isChannelInviteMessage && msg.text && (
                                <p style={{margin:"0 0 6px",fontSize:14,lineHeight:1.55,wordBreak:"break-word",color:"var(--text)"}}>
                                  <TextWithLinks text={msg.text} onLinkClick={openLink}/>
                                </p>
                              )}
                              {isChannelInviteMessage && (
                                <div style={{marginTop:2,background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.25)",borderRadius:10,padding:"10px 12px"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                                    <div style={{fontSize:12,color:"#4f7ef7",fontWeight:600}}>📨 Ryhmäkutsu</div>
                                    <span style={{fontSize:10,color:inviteForMe?"#22c55e":"#f59e0b",background:inviteForMe?"rgba(34,197,94,0.14)":"rgba(245,158,11,0.14)",padding:"2px 7px",borderRadius:999}}>
                                      {inviteForMe ? "Kutsu sinulle" : "Kutsu lähetetty"}
                                    </span>
                                  </div>
                                  <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:4}}>#{msg.channelName || "Ryhmä"}</div>
                                  <div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>{msg.channelDescription || "Ei kuvausta"}</div>
                                  <div style={{fontSize:11,color:"var(--text3)",marginBottom:8}}>
                                    Jäseniä: {msg.channelMemberCount || 0} · Luotu: {formatDate(msg.channelCreatedAt)}
                                  </div>
                                  <button
                                    onClick={() => inviteJoined ? openInvitedChannel(msg) : acceptChannelInvite(msg)}
                                    style={{background:inviteJoined?"rgba(34,197,94,0.2)":"#4f7ef7",border:inviteJoined?"1px solid rgba(34,197,94,0.45)":"none",borderRadius:8,color:inviteJoined?"#22c55e":"#fff",padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"system-ui"}}
                                  >
                                    {inviteJoined ? "Liitytty" : "Liity ryhmään"}
                                  </button>
                                </div>
                              )}
                              {msg.text && !isChannelInviteMessage && (isEquipmentSystemMessage
                                ? <div style={{marginTop:2,background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.22)",borderLeft:"3px solid #4f7ef7",borderRadius:"0 8px 8px 0",padding:"7px 10px",fontSize:13,lineHeight:1.5,color:"var(--text2)"}}>
                                    <TextWithLinks text={msg.text} onLinkClick={openLink}/>
                                  </div>
                                : <p style={{margin:0,fontSize:14,lineHeight:1.55,wordBreak:"break-word",color:"var(--text)"}}><TextWithLinks text={msg.text} onLinkClick={openLink}/></p>
                              )}
                              {msg.gifUrl&&<img src={msg.gifUrl} alt="GIF" style={{maxWidth:280,borderRadius:8,marginTop:4,display:"block"}}/>}
                              {msg.attachments?.map((a,idx)=>(
                                a.source === "google-drive"
                                  ? <a key={idx} href={a.url} target="_blank" rel="noreferrer"
                                      style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:4,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:8,padding:"6px 10px",color:"#22c55e",fontSize:12,textDecoration:"none"}}>
                                      📂 {a.name} <span style={{color:"var(--text3)"}}>(Drive)</span>
                                    </a>
                                  : a.type?.startsWith("image/")
                                    ? <img key={idx} src={a.url} alt={a.name} style={{maxWidth:300,borderRadius:8,marginTop:4,display:"block",cursor:"pointer"}} onClick={()=>window.open(a.url,"_blank")}/>
                                    : <a key={idx} href={a.url} target="_blank" rel="noreferrer"
                                        style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:4,background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:8,padding:"6px 10px",color:"#4f7ef7",fontSize:12,textDecoration:"none"}}>
                                        📎 {a.name} <span style={{color:"var(--text3)"}}>({formatFileSize(a.size)})</span>
                                      </a>
                              ))}
                            </>
                      }
                      {msg.reactions&&Object.entries(msg.reactions).filter(([,v])=>v.length>0).length>0&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
                          {Object.entries(msg.reactions).filter(([,v])=>v.length>0).map(([emoji,uids])=>(
                            <button key={emoji} onClick={()=>toggleReaction(msg,emoji)}
                              style={{background:uids.includes(user.uid)?"rgba(79,126,247,0.25)":"rgba(255,255,255,0.06)",border:uids.includes(user.uid)?"1px solid rgba(79,126,247,0.5)":"1px solid var(--border2)",borderRadius:12,padding:"2px 8px",cursor:"pointer",fontSize:13,color:"var(--text)",fontFamily:"system-ui"}}>
                              {emoji} <span style={{fontSize:11,color:"var(--text2)"}}>{uids.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {isMine&&!msg.deleted&&(
                        <div style={{fontSize:10,color:"var(--text3)",marginTop:2}}>
                          {activeDm?.isSelfNote ? "✓ Tallennettu" : (readCount>0 ? `✓✓ Luettu (${readCount})` : "✓ Lähetetty")}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef}/>
            </div>

            {typingText && (
              <div style={{padding:"6px 20px 0",fontSize:12,color:"var(--text2)",fontStyle:"italic",background:"var(--bg)",borderTop:"1px solid var(--border)"}}>
                {typingText}
              </div>
            )}

            {/* Vastaa */}
            {replyTo&&(
              <div style={{margin:"0 20px",background:"rgba(79,126,247,0.08)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:"8px 8px 0 0",padding:"6px 12px",display:"flex",alignItems:"center",gap:8}} onClick={e=>e.stopPropagation()}>
                <span style={{fontSize:12,color:"var(--text2)",flex:1}}>↩ <strong>{replyTo.senderName}</strong> — {replyTo.text?.slice(0,60)}</span>
                <button onClick={()=>setReplyTo(null)} style={{...iconBtn,fontSize:14}}>✕</button>
              </div>
            )}

            {/* GIF esikatselu */}
            {pendingGif&&(
              <div style={{margin:"0 20px",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"8px 8px 0 0",padding:"8px 12px",display:"flex",alignItems:"center",gap:10}} onClick={e=>e.stopPropagation()}>
                <img src={pendingGif.preview} alt="" style={{height:50,borderRadius:6}}/>
                <span style={{fontSize:12,color:"var(--text2)",flex:1}}>GIF valittu</span>
                <button onClick={()=>setPendingGif(null)} style={{...iconBtn,fontSize:14}}>✕</button>
              </div>
            )}

            {/* Tiedostot */}
            {pendingFiles.length>0&&(
              <div style={{margin:"0 20px",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"8px 8px 0 0",padding:"8px 12px",display:"flex",gap:8,flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
                {pendingFiles.map((f,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(79,126,247,0.1)",border:"1px solid rgba(79,126,247,0.2)",borderRadius:6,padding:"3px 8px"}}>
                    <span style={{fontSize:12,color:"#4f7ef7"}}>{f.type?.startsWith("image/")?"🖼️":"📎"} {f.name}</span>
                    <button onClick={()=>setPendingFiles(prev=>prev.filter((_,j)=>j!==i))} style={{...iconBtn,fontSize:12,padding:"0 2px"}}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Drive-liitteet */}
            {pendingDriveFiles.length>0&&(
              <div style={{margin:"0 20px",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"8px 8px 0 0",padding:"8px 12px",display:"flex",gap:8,flexWrap:"wrap"}} onClick={e=>e.stopPropagation()}>
                {pendingDriveFiles.map((f,i)=>(
                  <div key={`${f.id || f.url}-${i}`} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(34,197,94,0.1)",border:"1px solid rgba(34,197,94,0.25)",borderRadius:6,padding:"3px 8px"}}>
                    <span style={{fontSize:12,color:"#22c55e"}}>📂 {f.name}</span>
                    <button onClick={()=>setPendingDriveFiles(prev=>prev.filter((_,j)=>j!==i))} style={{...iconBtn,fontSize:12,padding:"0 2px"}}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Syöttökenttä */}
            <div style={{padding:"12px 20px",borderTop:"1px solid var(--border)",background:"var(--bg2)",position:"relative"}} onClick={e=>e.stopPropagation()}>

              {/* Equipment request action pane */}
              {equipmentRequestDetails && activeDm?.isEquipmentChat && (
                <div style={{marginBottom:8,padding:"10px 12px",background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:8,color:"#d1fae5",display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,fontSize:12,fontWeight:600}}>
                    <span>🛠️ Varaus: {equipmentRequestDetails.itemName} ×{equipmentRequestDetails.quantity}</span>
                    <span style={{color:"#a7f3d0",fontSize:11}}>{equipmentRequestDetails.requesterId===user.uid?"Pyytäjä":"Vastaava"}</span>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:equipmentStatusMeta.color,background:equipmentStatusMeta.bg,padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap"}}>{equipmentStatusMeta.text}</span>
                    {hasCancellationRequest && (
                      <span style={{fontSize:11,color:"#f59e0b",background:"rgba(245,158,11,0.16)",padding:"2px 8px",borderRadius:999,whiteSpace:"nowrap"}}>Peruutuspyyntö odottaa</span>
                    )}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {equipmentRequestDetails.status === "pending" && isEquipmentManager && (
                      <>
                        <button onClick={handleApproveRequest} style={{...btnPrimary,fontSize:11,padding:"4px 10px"}}>✓ Hyväksy</button>
                        <button onClick={handleDenyRequest} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>{equipmentRequestDetails.cancellationRequestedAt ? "✗ Hyväksy peruutus" : "✗ Hylkää"}</button>
                      </>
                    )}
                    {equipmentRequestDetails.status === "approved" && isEquipmentManager && (
                      <>
                        <button onClick={handleMarkReturned} style={{...btnPrimary,fontSize:11,padding:"4px 10px"}}>📥 Palautettu</button>
                        <button onClick={handleDenyRequest} style={{...btnGhost,fontSize:11,padding:"4px 10px"}}>{equipmentRequestDetails.cancellationRequestedAt ? "✗ Hyväksy peruutus" : "✗ Peru"}</button>
                      </>
                    )}
                    {equipmentRequestDetails.requesterId === user.uid && (equipmentRequestDetails.status === "pending" || equipmentRequestDetails.status === "approved") && (
                      <>
                        <button
                          onClick={requestCancellation}
                          disabled={Boolean(equipmentRequestDetails.cancellationRequestedAt)}
                          style={{...btnGhost,fontSize:11,padding:"4px 10px",opacity:equipmentRequestDetails.cancellationRequestedAt?0.6:1,cursor:equipmentRequestDetails.cancellationRequestedAt?"default":"pointer"}}
                        >
                          {equipmentRequestDetails.cancellationRequestedAt ? "🟠 Peruutuspyyntö lähetetty" : "✉️ Pyydä peruutusta"}
                        </button>
                      </>
                    )}
                    <button onClick={closeEquipmentChat} disabled={Boolean(activeDm?.closedAt)} style={{...btnGhost,fontSize:11,padding:"4px 10px",opacity:activeDm?.closedAt?0.6:1,cursor:activeDm?.closedAt?"default":"pointer"}}>
                      {activeDm?.closedAt ? "🔒 Suljettu" : "Sulje keskustelu"}
                    </button>
                    {activeDm?.closedAt && isEquipmentManager && (
                      <button onClick={reopenEquipmentChat} style={{...btnPrimary,fontSize:11,padding:"4px 10px"}}>
                        🔓 Avaa uudelleen
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isClosedEquipmentChat && (
                <div style={{marginBottom:8,padding:"8px 12px",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,fontSize:12,color:"#f59e0b"}}>
                  🔒 Tämä kalustokeskustelu on suljettu. Vanhat viestit ja varauksen tila näkyvät edelleen, mutta uusia viestejä ei voi lähettää.
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
                <div style={{position:"absolute",bottom:70,left:20,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:12,padding:10,zIndex:10,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}} onClick={e=>e.stopPropagation()}>
                  <EmojiPicker
                    onEmojiClick={(emojiData) => appendEmoji(emojiData.emoji)}
                    theme={emojiPickerTheme}
                    width={320}
                    height={360}
                    previewConfig={{ showPreview: false }}
                    suggestedEmojisMode="frequent"
                    searchPlaceHolder="Hae emoji..."
                    lazyLoadEmojis
                  />
                </div>
              )}

              {/* GIF */}
              {showGif&&(
                <div style={{position:"absolute",bottom:70,left:20,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:12,padding:12,width:320,zIndex:10,boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                  <input value={gifSearch} onChange={e=>setGifSearch(e.target.value)} placeholder="Hae gifejä..." autoFocus
                    style={{width:"100%",background:"var(--bg)",border:"1px solid var(--border2)",borderRadius:8,padding:"7px 10px",color:"var(--text)",fontSize:13,marginBottom:10,boxSizing:"border-box",fontFamily:"system-ui",outline:"none"}}/>
                  {gifLoading&&<div style={{textAlign:"center",color:"var(--text3)",fontSize:12,padding:"16px 0"}}>Haetaan...</div>}
                  {!gifLoading&&gifResults.length===0&&<div style={{textAlign:"center",color:"var(--text3)",fontSize:12,padding:"16px 0"}}>{GIPHY_KEY==="KORVAA_GIPHY_API_KEY"?"Lisää Giphy API-avain":"Ei tuloksia"}</div>}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,maxHeight:200,overflowY:"auto"}}>
                    {gifResults.map(g=><img key={g.id} src={g.images?.fixed_height_small?.url} alt={g.title}
                      onClick={()=>{setPendingGif({url:g.images?.original?.url,preview:g.images?.fixed_height_small?.url});setShowGif(false);setGifSearch("")}}
                      style={{width:"100%",height:72,objectFit:"cover",borderRadius:7,cursor:"pointer",border:"1px solid var(--border)"}}/>)}
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
                <div style={{position:"absolute",bottom:80,left:20,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:10,padding:6,maxHeight:200,overflowY:"auto",zIndex:10,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",minWidth:200}}>
                  {allUsers.filter(u => u.displayName.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0,5).map((u, i) => (
                    <div key={u.id} onClick={() => {
                      const start = mentionStart >= 0 ? mentionStart : 0
                      const before = text.slice(0, start)
                      const after = text.slice(start + mentionQuery.length + 1)
                      setText(before + u.displayName.split(' ')[0] + ' ' + after)
                      setMentionStart(-1)
                      setShowMention(false)
                    }}
                      style={{padding:"6px 10px",cursor:"pointer",fontSize:13,color:"var(--text)",borderRadius:6,background:i===mentionIndex?"rgba(79,126,247,0.15)":"transparent",display:"flex",alignItems:"center",gap:8}}>
                      <Avatar src={u.photoURL} name={u.displayName} size={24} />
                      {u.displayName}
                    </div>
                  ))}
                </div>
              )}

              <div style={{display:"flex",gap:8,alignItems:"center",background:"var(--bg3)",border:`1px solid ${isOverLimit?"rgba(239,68,68,0.6)":"var(--border2)"}`,borderRadius:12,padding:"10px 12px"}}>
                <button onClick={()=>{if(isClosedEquipmentChat) return;setShowEmoji(s=>!s);setShowGif(false)}} style={{...iconBtn,opacity:isClosedEquipmentChat?0.45:1,cursor:isClosedEquipmentChat?"default":"pointer"}}>😊</button>
                <button onClick={()=>{if(isClosedEquipmentChat) return;setShowGif(s=>!s);setShowEmoji(false);if(!showGif)fetchGifs("")}} style={{...iconBtn,fontSize:11,fontWeight:600,opacity:isClosedEquipmentChat?0.45:1,cursor:isClosedEquipmentChat?"default":"pointer"}}>GIF</button>
                <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>{if(isClosedEquipmentChat) return;setShowAttach(s=>!s)}} style={{...iconBtn,opacity:isClosedEquipmentChat?0.45:1,cursor:isClosedEquipmentChat?"default":"pointer"}} title="Liitä">📎</button>
                  {showAttach&&(
                    <div style={{position:"absolute",bottom:36,left:0,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:10,padding:6,minWidth:170,zIndex:10,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                      <div onClick={()=>{fileInputRef.current?.click();setShowAttach(false)}} style={{padding:"7px 12px",cursor:"pointer",fontSize:13,color:"var(--text)",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>💻 Tietokoneelta</div>
                      <div onClick={()=>{if(driveLinked) {setShowDriveModal(true); loadDriveFiles()} else pushNotif("info", "Linkitä Google Drive profiilissa ensin"); setShowAttach(false)}} style={{padding:"7px 12px",cursor:"pointer",fontSize:13,color:driveLinked?"var(--text)":"var(--text3)",borderRadius:6,display:"flex",alignItems:"center",gap:8}}>📂 Google Drive {!driveLinked&&"(ei linkitetty)"}</div>
                    </div>
                  )}
                </div>
                <div style={{flex:1,position:"relative"}}>
                  <textarea ref={textAreaRef} value={text} disabled={isClosedEquipmentChat}
                    onChange={e=>{
                      const val = e.target.value
                      setText(val)
                      pulseTypingIndicator(val)
                      const cursor = e.target.selectionStart
                      const beforeCursor = val.slice(0, cursor)
                      const atIndex = beforeCursor.lastIndexOf('@')
                      if (atIndex !== -1 && (atIndex === 0 || beforeCursor[atIndex-1] === ' ' || beforeCursor[atIndex-1] === '\n')) {
                        const query = beforeCursor.slice(atIndex+1)
                        if (query.includes(' ')) {
                          setShowMention(false)
                          setMentionStart(-1)
                        } else {
                          setMentionQuery(query)
                          setMentionStart(atIndex)
                          setShowMention(true)
                          setMentionIndex(0)
                        }
                      } else {
                        setShowMention(false)
                        setMentionStart(-1)
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
                            const start = mentionStart >= 0 ? mentionStart : 0
                            const before = text.slice(0, start)
                            const after = text.slice(start + mentionQuery.length + 1)
                            setText(before + filteredUsers[mentionIndex].displayName.split(' ')[0] + ' ' + after)
                            setMentionStart(-1)
                            setShowMention(false)
                          }
                        } else if (e.key === 'Escape') {
                          setShowMention(false)
                          setMentionStart(-1)
                        }
                      } else {
                        if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}
                      }
                    }}
                    placeholder={isClosedEquipmentChat?"Keskustelu on suljettu":activeChannel?`Kirjoita #${activeChannel.name}...`:"Kirjoita viesti..."}
                    rows={1} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"var(--text)",fontSize:14,resize:"none",fontFamily:"system-ui",lineHeight:1.5,maxHeight:120,boxSizing:"border-box"}}/>
                  {/* Merkkimäärälaskuri */}
                  {text.length>MAX_MSG_LENGTH*0.8&&(
                    <div style={{position:"absolute",right:4,bottom:-16,fontSize:10,color:isOverLimit?"#ef4444":"var(--text3)",fontFamily:"system-ui"}}>
                      {charsLeft<0?charsLeft:charsLeft}
                    </div>
                  )}
                </div>
                {isOverLimit
                  ? <div style={{fontSize:11,color:"#ef4444",padding:"6px 10px",whiteSpace:"nowrap"}}>⚠ Liian pitkä</div>
                  : slowModeLeft>0
                    ? <div style={{fontSize:11,color:"#f59e0b",padding:"6px 10px",whiteSpace:"nowrap"}}>🐌 {slowModeLeft}s</div>
                    : uploading
                      ? <span style={{fontSize:12,color:"var(--text3)",padding:"6px 14px"}}>Ladataan...</span>
                        : <button onClick={()=>sendMessage()} disabled={!canSend || isClosedEquipmentChat}
                          style={{...btnPrimary,opacity:canSend && !isClosedEquipmentChat ? 1 : 0.5}}>Lähetä</button>
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
        <div style={{width:220,background:"var(--bg2)",borderLeft:"1px solid var(--border)",overflowY:"auto",padding:"0 0 16px"}}>
          <div style={{padding:"12px 14px 10px",fontSize:13,fontWeight:600,borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            ⚙️ DM-asetukset
            <button onClick={()=>setDmSettings(false)} style={{...iconBtn,fontSize:14}}>✕</button>
          </div>
          <div style={{padding:"16px 14px 12px",textAlign:"center",borderBottom:"1px solid var(--border)"}}>
            <div style={{margin:"0 auto 8px",display:"flex",justifyContent:"center"}}>
              <Avatar src={activeDm.otherUser?.photoURL} name={activeDm.otherUser?.displayName} size={52}/>
            </div>
            <div style={{fontSize:13,fontWeight:600}}>{activeDm.otherUser?.displayName}</div>
            <div style={{fontSize:11,color:"var(--text3)"}}>{activeDm.otherUser?.role}</div>
          </div>
          <div style={{padding:"12px 14px"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Muistiinpanot</div>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:12}}>Tallenna muistiinpanoja tästä käyttäjästä. Muistiinpanot ovat yksityisiä ja näkyvät vain sinulle.</div>
            {editingDmNote
              ? <div>
                  <textarea value={dmNoteText} onChange={e=>setDmNoteText(e.target.value)} placeholder="Kirjoita muistiinpano..." rows={5}
                    style={{width:"100%",background:"var(--bg3)",border:"1px solid rgba(79,126,247,0.4)",borderRadius:8,padding:"8px 10px",color:"var(--text)",fontSize:12,fontFamily:"system-ui",resize:"none",outline:"none",boxSizing:"border-box"}}/>
                  <div style={{display:"flex",gap:6,marginTop:6}}>
                    <button onClick={()=>{setDmNotes(prev=>{const next={...prev};const value=dmNoteText.trim();if(value)next[activeDm.id]=value;else delete next[activeDm.id];return next});setEditingDmNote(false)}}
                      style={{flex:1,padding:"6px",background:"#4f7ef7",border:"none",borderRadius:6,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>Tallenna</button>
                    <button onClick={()=>setEditingDmNote(false)}
                      style={{padding:"6px 10px",background:"transparent",border:"1px solid var(--border2)",borderRadius:6,color:"var(--text2)",fontSize:12,cursor:"pointer",fontFamily:"system-ui"}}>Peruuta</button>
                  </div>
                </div>
              : <div>
                  {dmNotes[activeDm.id]
                    ? <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.6,background:"var(--bg3)",borderRadius:8,padding:"8px 10px",marginBottom:8,whiteSpace:"pre-wrap"}}>{dmNotes[activeDm.id]}</div>
                    : <div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",marginBottom:8}}>Ei muistiinpanoja.</div>
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
                    style={{width:"100%",background:"var(--bg3)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,padding:"7px 10px",color:"var(--text)",fontSize:12,fontFamily:"system-ui",resize:"none",outline:"none",boxSizing:"border-box",marginBottom:6}}/>
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
        <div style={{width:200,background:"var(--bg2)",borderLeft:"1px solid var(--border)",overflowY:"auto"}}>
          <div style={{padding:"12px 12px 8px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em"}}>
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
            <div style={{padding:"6px 12px 4px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em"}}>⚫ Offline</div>
          )}
          {channelMembers.filter(m=>!m.online||m.status==="offline").map(m=><MemberRow key={m.id} m={m} isMod={activeChannel?.moderators?.includes(m.id)} onProfile={()=>setProfileModal(m)}/>)}
        </div>
      )}

      {/* Kontekstivalikko */}
      {contextMenu&&(
        <div style={{position:"fixed",left:contextMenu.x,top:contextMenu.y,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:10,padding:6,zIndex:100,minWidth:170,boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}
          onClick={e=>e.stopPropagation()}>
          <div onClick={()=>openGlobalMenuFromChat(contextMenu.x, contextMenu.y)} style={ctxItem}>➡️ Siirry...</div>
          <div style={ctxDivider}/>
          <div style={{display:"flex",flexWrap:"wrap",gap:2,marginBottom:4}}>
            {contextReactionEmojis.map(e=><button key={e} onClick={()=>{toggleReaction(contextMenu.msg,e);setContextMenu(null)}} style={{fontSize:18,padding:"3px 5px",cursor:"pointer",border:"none",background:"transparent",borderRadius:6}}>{e}</button>)}
            <button onClick={(e)=>{openReactionPicker(contextMenu.msg, e.currentTarget.getBoundingClientRect());setContextMenu(null)}} style={{fontSize:18,padding:"3px 7px",cursor:"pointer",border:"none",background:"transparent",borderRadius:6,color:"var(--text2)"}} title="Lisää reaktio">＋</button>
          </div>
          <div style={ctxDivider}/>
          <div onClick={()=>{setReplyTo(contextMenu.msg);setContextMenu(null)}} style={ctxItem}>↩ Vastaa</div>
          <div onClick={()=>copyMessageText(contextMenu.msg)} style={ctxItem}>📋 Kopioi teksti</div>
          <div onClick={()=>openForwardModal(contextMenu.msg)} style={ctxItem}>📨 Lähetä uudelleen viesti</div>
          <div style={ctxDivider}/>
          <div onClick={()=>togglePinMessage(contextMenu.msg)} style={ctxItem}>{contextMenu.msg.pinned ? "📌 Poista kiinnitys" : "📌 Kiinnitä"}</div>
          {contextMenu.msg.senderId===user.uid&&!contextMenu.msg.deleted&&(
            <div onClick={()=>{setEditingMsg(contextMenu.msg);setEditText(contextMenu.msg.text);setContextMenu(null)}} style={ctxItem}>✏️ Muokkaa</div>
          )}
          {(contextMenu.msg.senderId===user.uid || (activeChannel && isChannelAdmin && contextMenu.msg.senderId!==user.uid))&&(
            <div onClick={()=>deleteMessage(contextMenu.msg, Boolean(activeChannel && isChannelAdmin && contextMenu.msg.senderId!==user.uid))} style={{...ctxItem,color:"#f87171"}}>
              🗑️ Poista
            </div>
          )}
          <div style={ctxDivider}/>
          <div onClick={()=>{const u2=allUsers.find(u=>u.id===contextMenu.msg.senderId);if(u2){setProfileModal(u2);setContextMenu(null)}}} style={ctxItem}>👤 Profiili</div>
          <div onClick={()=>reportMessage(contextMenu.msg)} style={{...ctxItem,color:"var(--text2)"}}>🚩 Raportoi</div>
          {activeChannel&&(<>
            <div style={ctxDivider}/>
            <div style={{padding:"4px 10px 2px",fontSize:10,color:"var(--text3)"}}>Mykistä kanava</div>
            {[15,60,480,1440].map(m=><div key={m} onClick={()=>muteChannel(activeChannel.id,m)} style={ctxItem}>🔕 {m<60?m+" min":m<1440?m/60+" t":"24 t"}</div>)}
          </>)}
        </div>
      )}

      {showReactionEmojiPicker && reactionPickerMsg && (
        <div style={{position:"fixed",inset:0,background:"transparent",zIndex:130}} onClick={()=>{setShowReactionEmojiPicker(false);setReactionPickerMsg(null)}}>
          <div style={{position:"absolute",left:reactionPickerPos.x,top:reactionPickerPos.y,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:12,padding:10,boxShadow:"0 10px 40px rgba(0,0,0,0.6)",width:REACTION_PICKER_WIDTH,maxWidth:"calc(100vw - 24px)"}} onClick={e=>e.stopPropagation()}>
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                toggleReaction(reactionPickerMsg, emojiData.emoji)
                setShowReactionEmojiPicker(false)
                setReactionPickerMsg(null)
              }}
              theme={emojiPickerTheme}
              width="100%"
              height={360}
              previewConfig={{ showPreview: false }}
              suggestedEmojisMode="frequent"
              searchPlaceHolder="Hae reaktio..."
              lazyLoadEmojis
            />
          </div>
        </div>
      )}

      {/* Sivupalkin oikeaklikkausvalikko */}
      {sidebarCtxMenu&&(
        <div style={{position:"fixed",left:sidebarCtxMenu.x,top:sidebarCtxMenu.y,background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:10,padding:6,zIndex:100,minWidth:190,boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}
          onClick={e=>e.stopPropagation()}>
          <div onClick={()=>openGlobalMenuFromChat(sidebarCtxMenu.x, sidebarCtxMenu.y)} style={ctxItem}>➡️ Siirry...</div>
          <div style={ctxDivider}/>
          {/* --- KANAVA --- */}
          {sidebarCtxMenu.type==="channel"&&(<>
            <div onClick={()=>togglePin(sidebarCtxMenu.item.id)} style={ctxItem}>
              {pinnedItems[sidebarCtxMenu.item.id]?"📌 Poista kiinnitys":"📌 Kiinnitä kanava"}
            </div>
            <div style={ctxDivider}/>
            <div style={{padding:"4px 10px 2px",fontSize:10,color:"var(--text3)"}}>Mykistä</div>
            {[15,60,480,1440].map(m=>(
              <div key={m} onClick={()=>{setMutedChannels(prev=>({...prev,[sidebarCtxMenu.item.id]:Date.now()+m*60000}));pushNotif("info",`Mykistetty ${m<60?m+" min":m<1440?m/60+" t":"24 t"}`);setSidebarCtxMenu(null)}} style={ctxItem}>
                🔕 {m<60?m+" min":m<1440?m/60+" t":"24 t"}
              </div>
            ))}
            {isChannelMuted(sidebarCtxMenu.item.id)&&(
              <div onClick={()=>{setMutedChannels(prev=>{const n={...prev};delete n[sidebarCtxMenu.item.id];return n});setSidebarCtxMenu(null)}} style={ctxItem}>🔔 Poista mykistys</div>
            )}
            <div style={ctxDivider}/>
            <div onClick={()=>{selectChannel(sidebarCtxMenu.item);setShowChannelInfo(true);setSidebarCtxMenu(null)}} style={ctxItem}>ℹ️ Kanavan tiedot</div>
            <div onClick={()=>reportSidebarItem(sidebarCtxMenu.item,"channel_report")} style={{...ctxItem,color:"var(--text2)"}}>🚩 Raportoi kanava</div>
            {sidebarCtxMenu.item.type==="private"&&sidebarCtxMenu.item.members?.includes(user.uid)&&(
              <>
                <div style={ctxDivider}/>
                <div onClick={()=>leaveChannel(sidebarCtxMenu.item)} style={{...ctxItem,color:"#f87171"}}>🚪 Poistu ryhmästä</div>
              </>
            )}
          </>)}

          {/* --- MUISTIINPANOT --- */}
          {sidebarCtxMenu.type==="notes"&&(<>
            <div onClick={()=>{const me=allUsers.find(u=>u.id===user.uid)||{id:user.uid,displayName:"Muistiinpanot"};openDM(me);setSidebarCtxMenu(null)}} style={ctxItem}>📝 Avaa muistiinpanot</div>
            <div style={ctxDivider}/>
            <div onClick={()=>{const me=allUsers.find(u=>u.id===user.uid)||profile;if(me)setProfileModal(me);setSidebarCtxMenu(null)}} style={ctxItem}>👤 Omat tiedot</div>
            <div style={ctxDivider}/>
            <div onClick={()=>{const next=!hiddenNotes;setHiddenNotes(next);try{localStorage.setItem("hiddenNotes",String(next))}catch{};setSidebarCtxMenu(null)}} style={{...ctxItem,color:"var(--text3)"}}>
              {hiddenNotes?"👁 Näytä muistiinpanot":"🙈 Piilota muistiinpanot"}
            </div>
          </>)}

          {/* --- DM --- */}
          {sidebarCtxMenu.type==="dm"&&(<>
            <div onClick={()=>togglePin(sidebarCtxMenu.item.id)} style={ctxItem}>
              {pinnedItems[sidebarCtxMenu.item.id]?"📌 Poista kiinnitys":"📌 Kiinnitä"}
            </div>
            <div style={ctxDivider}/>
            <div style={{padding:"4px 10px 2px",fontSize:10,color:"var(--text3)"}}>Mykistä</div>
            {[15,60,480,1440].map(m=>(
              <div key={m} onClick={()=>{setMutedChannels(prev=>({...prev,[sidebarCtxMenu.dmId]:Date.now()+m*60000}));pushNotif("info",`Mykistetty ${m<60?m+" min":m<1440?m/60+" t":"24 t"}`);setSidebarCtxMenu(null)}} style={ctxItem}>
                🔕 {m<60?m+" min":m<1440?m/60+" t":"24 t"}
              </div>
            ))}
            {isChannelMuted(sidebarCtxMenu.dmId)&&(
              <div onClick={()=>{setMutedChannels(prev=>{const n={...prev};delete n[sidebarCtxMenu.dmId];return n});setSidebarCtxMenu(null)}} style={ctxItem}>🔔 Poista mykistys</div>
            )}
            <div style={ctxDivider}/>
            <div onClick={()=>{setProfileModal(sidebarCtxMenu.item);setSidebarCtxMenu(null)}} style={ctxItem}>👤 Jäsenen tiedot</div>
            <div onClick={()=>reportSidebarItem(sidebarCtxMenu.item,"dm_report")} style={{...ctxItem,color:"var(--text2)"}}>🚩 Raportoi käyttäjä</div>
            <div style={ctxDivider}/>
            <div onClick={()=>hideDmUser(sidebarCtxMenu.item.id)} style={{...ctxItem,color:"var(--text3)"}}>🙈 Piilota keskustelu</div>
          </>)}

          {/* --- KALUSTO --- */}
          {sidebarCtxMenu.type==="equipment"&&(<>
            <div onClick={()=>togglePin(sidebarCtxMenu.item.id)} style={ctxItem}>
              {pinnedItems[sidebarCtxMenu.item.id]?"📌 Poista kiinnitys":"📌 Kiinnitä"}
            </div>
            <div style={ctxDivider}/>
            <div onClick={()=>{openEquipmentChat(sidebarCtxMenu.item);setSidebarCtxMenu(null)}} style={ctxItem}>ℹ️ Varauksen tiedot</div>
          </>)}
        </div>
      )}

      {/* Profiili-modal */}
      {profileModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setProfileModal(null)}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:16,padding:28,width:340,maxWidth:"90vw",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{position:"relative",display:"inline-block",marginBottom:14}}>
              <Avatar src={profileModal.photoURL} name={profileModal.displayName} size={68}/>
              <div style={{position:"absolute",bottom:2,right:2,width:14,height:14,borderRadius:"50%",background:statusColor(profileModal),border:"3px solid var(--bg2)"}}/>
            </div>
            <div style={{fontWeight:600,fontSize:17,marginBottom:3}}>{profileModal.displayName}</div>
            <div style={{fontSize:12,color:"var(--text2)",marginBottom:2}}>{profileModal.role}</div>
            {profileModal.title&&<div style={{fontSize:12,color:"var(--text3)",marginBottom:8}}>{profileModal.title}</div>}
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>{profileModal.online?"🟢 Paikalla":`Viimeksi paikalla: ${formatLastSeen(profileModal.lastSeen)}`}</div>
            {profileModal.bio&&<p style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,background:"var(--bg3)",padding:"10px 14px",borderRadius:8,margin:"0 0 14px",textAlign:"left"}}>{profileModal.bio}</p>}
            {profileModal.phone&&<div style={{fontSize:13,color:"var(--text3)",marginBottom:14}}>📞 {profileModal.phone}</div>}
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button onClick={()=>setProfileModal(null)} style={btnGhost}>Sulje</button>
              {profileModal.id===user.uid
                ? <button onClick={()=>{openDM(profileModal);setProfileModal(null)}} style={btnPrimary}>📝 Avaa muistiinpanot</button>
                : <button onClick={()=>{openDM(profileModal);setProfileModal(null)}} style={btnPrimary}>💬 Lähetä viesti</button>
              }
            </div>
          </div>
        </div>
      )}

      {/* Kanavan tiedot (lue vain) */}
      {showChannelInfo&&activeChannel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowChannelInfo(false)}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:16,padding:24,width:420,maxWidth:"90vw",maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontWeight:700,fontSize:16}}>ℹ️ #{activeChannel.name}</span>
              <button onClick={()=>setShowChannelInfo(false)} style={iconBtn}>✕</button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Kuvaus</div>
              <div style={{fontSize:13,color:"var(--text)"}}>{activeChannel.description||"Ei kuvausta"}</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Tyyppi</div>
              <div style={{fontSize:13,color:"var(--text)"}}>{activeChannel.type==="private"?"🔒 Yksityinen":"🌐 Julkinen"}</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"var(--text2)",marginBottom:4}}>Viestiraja</div>
              <div style={{fontSize:13,color:"var(--text)"}}>{activeChannel.slowMode?`${activeChannel.slowMode}s`:"Ei"}</div>
            </div>
            <div style={{marginBottom:10,fontSize:12,color:"var(--text2)"}}>Jäsenet ({channelMembers.length})</div>
            {channelMembers.map(m=> (
              <div key={m.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"var(--bg3)",marginBottom:4}}>
                <span style={{fontSize:13}}>{m.displayName}</span>
                <span style={{fontSize:11,color:"var(--text2)"}}>{m.id===activeChannel.createdBy?"Luoja":activeChannel.moderators?.includes(m.id)?"Moderaattori":m.role||"Jäsen"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanavan asetukset */}
      {showChannelSettings&&activeChannel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setShowChannelSettings(false)}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:16,padding:24,width:480,maxWidth:"90vw",maxHeight:"88vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <span style={{fontWeight:600,fontSize:16}}>⚙️ #{activeChannel.name}</span>
              <button onClick={()=>setShowChannelSettings(false)} style={iconBtn}>✕</button>
            </div>
            <div style={{background:"var(--bg3)",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
              <label style={lbl}>Nimi</label>
              <input value={editCh.name} onChange={e=>setEditCh(s=>({...s,name:e.target.value}))} style={inp} disabled={!isChannelAdmin}/>
              <label style={lbl}>Kuvaus</label>
              <input value={editCh.description} onChange={e=>setEditCh(s=>({...s,description:e.target.value}))} style={inp} disabled={!isChannelAdmin}/>
              <label style={lbl}>🐌 Etanatila — viestien väli (sekunteina, 0 = ei rajoitusta)</label>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="number" min={0} max={3600} value={editCh.slowMode} onChange={e=>setEditCh(s=>({...s,slowMode:e.target.value}))} style={{...inp,width:100}} disabled={!isChannelAdmin}/>
                <span style={{fontSize:12,color:"var(--text3)"}}>sekuntia</span>
                <div style={{display:"flex",gap:5}}>
                  {[0,5,10,30,60].map(s=><button key={s} onClick={()=>isChannelAdmin&&setEditCh(c=>({...c,slowMode:s}))}
                    style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:`1px solid ${Number(editCh.slowMode)===s?"rgba(79,126,247,0.5)":"var(--border2)"}`,background:Number(editCh.slowMode)===s?"rgba(79,126,247,0.15)":"transparent",color:Number(editCh.slowMode)===s?"#4f7ef7":"var(--text2)",cursor:isChannelAdmin?"pointer":"not-allowed",fontFamily:"system-ui"}}>
                    {s===0?"Ei":s+"s"}
                  </button>)}
                </div>
              </div>
              {isChannelAdmin ? (
                <button onClick={saveChannelSettings} style={{...btnPrimary,marginTop:12,fontSize:12,padding:"6px 14px"}}>Tallenna</button>
              ) : (
                <div style={{fontSize:12,color:"var(--text2)",marginTop:10}}>Vain moderaattorit voivat muokata kanavan asetuksia.</div>
              )}
            </div>
            <div style={{background:"var(--bg3)",borderRadius:10,padding:"12px 16px",marginBottom:14,fontSize:12,color:"var(--text2)",display:"flex",flexDirection:"column",gap:6}}>
              <div>👤 Luoja: <span style={{color:"var(--text)"}}>{creatorUser?.displayName||activeChannel.createdByName||"—"}</span></div>
              <div>📅 Luotu: <span style={{color:"var(--text)"}}>{formatDate(activeChannel.createdAt)}</span></div>
              <div>🔒 Tyyppi: <span style={{color:"var(--text)"}}>{activeChannel.type==="private"?"Yksityinen":"Julkinen"}</span></div>
            </div>
            <div style={{background:"var(--bg3)",borderRadius:10,padding:"12px 16px",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Rajoitettu kirjoitusoikeus</div><div style={{fontSize:11,color:"var(--text3)"}}>Vain moderaattorit voivat kirjoittaa</div></div>
                <button onClick={toggleWriteRestricted} style={{width:42,height:24,borderRadius:12,border:"none",cursor:"pointer",position:"relative",transition:"background 0.2s",background:activeChannel.writeRestricted?"#4f7ef7":"var(--border2)"}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,transition:"left 0.2s",left:activeChannel.writeRestricted?21:3}}/>
                </button>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Jäsenet</div>
            {channelMembers.map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg3)",borderRadius:8,marginBottom:6}}>
                <Avatar src={m.photoURL} name={m.displayName} size={28}/>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{m.displayName}</div><div style={{fontSize:11,color:"var(--text3)"}}>{m.id===activeChannel.createdBy?"Luoja":m.role}</div></div>
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
              <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.08em",margin:"14px 0 8px"}}>Lisää jäsen</div>
              {allUsers.filter(u2=>!channelMembers.find(m=>m.id===u2.id)).map(u2=>(
                <div key={u2.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 12px",borderRadius:8,marginBottom:4}}>
                  <div style={{fontSize:13,flex:1,color:"var(--text2)"}}>{u2.displayName}</div>
                  <button onClick={()=>addMemberToChannel(u2.id)} style={{fontSize:11,padding:"3px 10px",borderRadius:6,border:"1px solid rgba(34,197,94,0.3)",background:"transparent",color:"#22c55e",cursor:"pointer",fontFamily:"system-ui"}}>+ Lisää</button>
                </div>
              ))}
            </>)}
            {(isAdmin||activeChannel.createdBy===user.uid)&&(
              <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--border)"}}>
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
          <p style={{fontSize:12,color:"var(--text3)",margin:"0 0 14px"}}>Valitse henkilö jolle haluat lähettää viestiä:</p>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:300,overflowY:"auto"}}>
            {allUsers.filter(u2=>u2.id!==user.uid).map(u2=>(
              <div key={u2.id} onClick={()=>{openDM(u2);setShowNewDM(false)}}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"var(--bg3)",borderRadius:9,cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{position:"relative"}}>
                  <Avatar src={u2.photoURL} name={u2.displayName} size={36}/>
                  <div style={{position:"absolute",bottom:0,right:0,width:9,height:9,borderRadius:"50%",background:statusColor(u2),border:"2px solid var(--bg3)"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{u2.displayName}</div>
                  <div style={{fontSize:11,color:"var(--text3)"}}>{u2.role}</div>
                </div>
                <span style={{fontSize:12,color:"#4f7ef7"}}>💬</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {showEquipmentChatPicker&&(
        <Modal title="Kalustovaraukset" onClose={()=>setShowEquipmentChatPicker(false)}>
          <p style={{fontSize:12,color:"var(--text3)",margin:"0 0 14px"}}>Avaa olemassa oleva keskustelu tai aloita uusi kalustovaraus kalustot sivulta. Voit avata kalustot napista alempaa.</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button onClick={()=>{navigate("/kalusto");setShowEquipmentChatPicker(false)}} style={{...btnPrimary,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span>🎒</span>
              <span>Uusi kalustovaraus</span>
            </button>

            {openEquipmentChats.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em",margin:"6px 0 8px"}}>Aktiiviset keskustelut</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:210,overflowY:"auto"}}>
                  {openEquipmentChats.map(chat => (
                    <div key={chat.id} onClick={()=>{openEquipmentChat(chat);setShowEquipmentChatPicker(false)}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"var(--bg3)",borderRadius:9,cursor:"pointer",border:"1px solid rgba(255,255,255,0.06)"}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"rgba(79,126,247,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                        {chat.itemEmoji || "🎒"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chat.itemName}</div>
                        <div style={{fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {chat.requesterId === user.uid ? "Oma varaus" : chat.requesterName || "Kalustovaraus"}
                        </div>
                      </div>
                      {equipmentBadges[chat.id]?.unread > 0 && (
                        <span style={{minWidth:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",background:"#ef4444",color:"#fff",fontSize:11,fontWeight:700}}>
                          {equipmentBadges[chat.id].unread}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {archivedEquipmentChats.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em",margin:"6px 0 8px"}}>Arkistoidut</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto"}}>
                  {archivedEquipmentChats.map(chat => (
                    <div key={chat.id} onClick={()=>{openEquipmentChat(chat);setShowEquipmentChatPicker(false)}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:"rgba(245,158,11,0.08)",borderRadius:9,cursor:"pointer",border:"1px solid rgba(245,158,11,0.14)"}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"rgba(245,158,11,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                        {chat.itemEmoji || "🎒"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chat.itemName}</div>
                        <div style={{fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {chat.requesterId === user.uid ? "Oma varaus" : chat.requesterName || "Kalustovaraus"} · Suljettu
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {equipmentChats.length === 0 && (
              <div style={{fontSize:12,color:"var(--text3)",background:"var(--bg3)",borderRadius:9,padding:"12px 14px"}}>
                Kalustokeskusteluja ei ole vielä. Luo ensimmäinen varaus kalustosivulta.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Kutsu */}
      {showInvite&&(
        <Modal title={activeChannel ? `Kutsu ryhmään #${activeChannel.name}` : "Kutsu ryhmään"} onClose={()=>setShowInvite(false)}>
          {!activeChannel && (
            <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>Valitse ensin ryhmä, johon haluat kutsua jäsenen.</div>
          )}
          {activeChannel && (
            <>
              <label style={lbl}>Valitse jäsen</label>
              <select value={inviteTargetUserId} onChange={e=>setInviteTargetUserId(e.target.value)} style={inp}>
                <option value="">Valitse jäsen...</option>
                {inviteCandidatesWithState.map(u2 => (
                  <option key={u2.id} value={u2.id}>{u2.displayName}{u2.inviteSent ? " (kutsu lähetetty)" : ""}</option>
                ))}
              </select>
              {loadingInviteStatuses && (
                <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Tarkistetaan aiempia kutsuja...</div>
              )}
              {inviteTargetUserId && inviteCandidatesWithState.find(u2 => u2.id === inviteTargetUserId)?.inviteSent && (
                <div style={{fontSize:12,color:"#f59e0b",marginTop:8}}>Tälle jäsenelle on jo lähetetty kutsu tähän ryhmään.</div>
              )}
              {inviteCandidates.length === 0 && (
                <div style={{fontSize:12,color:"var(--text3)",marginTop:8}}>Kaikki jäsenet ovat jo tässä ryhmässä.</div>
              )}
            </>
          )}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
            <button onClick={()=>setShowInvite(false)} style={btnGhost}>Peruuta</button>
            <button
              onClick={sendInvite}
              disabled={!activeChannel || !inviteTargetUserId || loadingInviteStatuses || Boolean(inviteCandidatesWithState.find(u2 => u2.id === inviteTargetUserId)?.inviteSent)}
              style={{
                ...btnPrimary,
                opacity:(!activeChannel || !inviteTargetUserId || loadingInviteStatuses || Boolean(inviteCandidatesWithState.find(u2 => u2.id === inviteTargetUserId)?.inviteSent))?0.55:1,
                cursor:(!activeChannel || !inviteTargetUserId || loadingInviteStatuses || Boolean(inviteCandidatesWithState.find(u2 => u2.id === inviteTargetUserId)?.inviteSent))?"default":"pointer"
              }}>
              Lähetä kutsu
            </button>
          </div>
        </Modal>
      )}

      {showForwardModal && (
        <Modal title="Lähetä uudelleen viesti" onClose={()=>{setShowForwardModal(false);setForwardMsg(null);setForwardTargetId("")}}>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>
            Alkuperäinen lähettäjä: <strong style={{color:"var(--text2)"}}>{forwardMsg?.senderName || "Tuntematon"}</strong>
          </div>
          <div style={{fontSize:12,color:"var(--text3)",background:"var(--bg3)",borderRadius:8,padding:"8px 10px",marginBottom:12}}>
            {forwardMsg?.text?.slice(0,120) || "[GIF / liite]"}
          </div>

          <label style={lbl}>Kohdetyyppi</label>
          <select value={forwardTargetType} onChange={e=>{setForwardTargetType(e.target.value);setForwardTargetId("")}} style={inp}>
            <option value="channel">Ryhmä</option>
            <option value="dm">Jäsen (yksityisviesti)</option>
          </select>

          <label style={lbl}>Kohde</label>
          <select value={forwardTargetId} onChange={e=>setForwardTargetId(e.target.value)} style={inp}>
            <option value="">Valitse kohde...</option>
            {forwardTargetType === "channel"
              ? channels.map(ch => <option key={ch.id} value={ch.id}>#{ch.name}</option>)
              : allUsers.filter(u2 => u2.id !== user.uid).map(u2 => <option key={u2.id} value={u2.id}>{u2.displayName}</option>)}
          </select>

          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
            <button onClick={()=>{setShowForwardModal(false);setForwardMsg(null);setForwardTargetId("")}} style={btnGhost}>Peruuta</button>
            <button onClick={forwardMessage} disabled={!forwardTargetId}
              style={{...btnPrimary,opacity:forwardTargetId?1:0.55,cursor:forwardTargetId?"pointer":"default"}}>
              Lähetä
            </button>
          </div>
        </Modal>
      )}

      {showPinnedMessages && (
        <Modal title="Kiinnitetyt viestit" onClose={()=>setShowPinnedMessages(false)}>
          {pinnedMessages.length === 0 ? (
            <div style={{fontSize:12,color:"var(--text3)",padding:"6px 2px"}}>Ei kiinnitettyjä viestejä tässä keskustelussa.</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:360,overflowY:"auto"}}>
              {pinnedMessages.map(pm => (
                <div key={pm.id}
                  style={{textAlign:"left",background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:9,padding:"9px 10px",color:"var(--text)",fontFamily:"system-ui"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:3}}>
                    <div style={{fontSize:12,fontWeight:600}}>{pm.senderName || "Tuntematon"}</div>
                    {(pm.senderId === user.uid || isAdmin || (activeChannel && isChannelAdmin)) && (
                      <button
                        onClick={()=>togglePinMessage(pm)}
                        style={{background:"transparent",border:"1px solid var(--border2)",borderRadius:6,color:"var(--text2)",fontSize:11,padding:"3px 8px",cursor:"pointer",fontFamily:"system-ui"}}
                      >
                        Poista kiinnitys
                      </button>
                    )}
                  </div>
                  <button onClick={()=>jumpToMessage(pm.id)}
                    style={{textAlign:"left",background:"transparent",border:"none",padding:0,cursor:"pointer",color:"inherit",fontFamily:"system-ui",width:"100%"}}>
                    <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.45,wordBreak:"break-word"}}>{pm.text?.slice(0,140) || "[GIF / liite]"}</div>
                    <div style={{fontSize:10,color:"var(--text3)",marginTop:4}}>{formatDate(pm.pinnedAt || pm.createdAt)} {formatTime(pm.pinnedAt || pm.createdAt)}</div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Luku-tiedot modal */}
      {readDetails&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:250}}
          onClick={()=>setReadDetails(null)}>
          <div style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:16,padding:24,width:380,maxWidth:"90vw",maxHeight:"70vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <span style={{fontWeight:600,fontSize:15}}>📬 Viestin tila</span>
              <button onClick={()=>setReadDetails(null)} style={{background:"transparent",border:"none",color:"var(--text2)",cursor:"pointer",fontSize:18}}>✕</button>
            </div>
            {/* Viestin esikatselu */}
            <div style={{background:"var(--bg3)",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:13,color:"var(--text2)",fontStyle:"italic",borderLeft:"3px solid #4f7ef7"}}>
              {readDetails.msg.text?.slice(0,80)||"GIF/Liite"}{readDetails.msg.text?.length>80&&"..."}
            </div>
            {/* Lähetetty */}
            <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              ✓ Lähetetty
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg3)",borderRadius:8,marginBottom:14}}>
              <Avatar src={profile?.photoURL} name={profile?.displayName} size={32}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{profile?.displayName} (sinä)</div>
              </div>
              <div style={{fontSize:11,color:"var(--text3)"}}>{readDetails.msg.createdAt?.toDate?.().toLocaleTimeString("fi-FI",{hour:"2-digit",minute:"2-digit"})||""}</div>
            </div>
            {/* Lukeneet */}
            <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>
              ✓✓ Lukeneet ({(readDetails.readers||[]).filter(id=>id!==user.uid).length})
            </div>
            {(readDetails.readers||[]).filter(id=>id!==user.uid).length===0&&(
              <div style={{fontSize:13,color:"var(--text3)",fontStyle:"italic",padding:"8px 0"}}>Ei vielä luettu</div>
            )}
            {(readDetails.readers||[]).filter(id=>id!==user.uid).map(rid=>{
              const ru=allUsers.find(u=>u.id===rid)
              if (!ru) return null
              const sc=statusColor(ru)
              return (
                <div key={rid} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"var(--bg3)",borderRadius:8,marginBottom:6}}>
                  <div style={{position:"relative"}}>
                    <Avatar src={ru.photoURL} name={ru.displayName} size={32}/>
                    <div style={{position:"absolute",bottom:0,right:0,width:8,height:8,borderRadius:"50%",background:sc,border:"2px solid var(--bg3)"}}/>
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
                <div style={{fontSize:12,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.07em",margin:"14px 0 10px"}}>Ei luettu</div>
                {channelMembers.filter(m=>m.id!==user.uid&&!(readDetails.readers||[]).includes(m.id)).map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,0.02)",borderRadius:8,marginBottom:6,opacity:0.6}}>
                    <Avatar src={m.photoURL} name={m.displayName} size={32}/>
                    <div style={{flex:1,fontSize:13,color:"var(--text2)"}}>{m.displayName}</div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>✓ Toimitettu</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <LinkWarningModal pending={linkPending} onClose={closeLink}/>

      {/* Google Drive Modal */}
      {showDriveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250 }}
          onClick={() => setShowDriveModal(false)}>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 16, padding: 24, width: 520, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>📂 Google Drive - Tiedostot</h3>
              <button onClick={() => setShowDriveModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>

            {driveInfo && (
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                👤 {driveInfo.name}
              </div>
            )}

            {driveFiles.length === 0 ? (
              <button onClick={loadDriveFiles} disabled={loadingDrive}
                style={{ width: "100%", padding: "10px", background: "#4f7ef7", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, opacity: loadingDrive ? 0.7 : 1, fontFamily: "system-ui" }}>
                {loadingDrive ? "Ladataan..." : "📥 Lataa tiedostot"}
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {driveFiles.map(file => (
                  <div key={file.id} style={{ padding: 10, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 8, display: "flex", alignItems: "start", gap: 10 }}>
                    <span style={{ fontSize: 16, marginTop: 2 }}>
                      {file.mimeType.includes("folder") ? "📁" : file.mimeType.includes("image") ? "🖼️" : file.mimeType.includes("sheet") ? "📊" : file.mimeType.includes("document") ? "📄" : "📎"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 13, color: "#4f7ef7", textDecoration: "none", wordBreak: "break-word" }}>
                        {file.name}
                      </a>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                        {new Date(file.modifiedTime).toLocaleDateString("fi-FI")}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setPendingDriveFiles(prev => {
                          if (prev.some(p => p.id === file.id)) return prev
                          return [...prev, {
                            id: file.id,
                            name: file.name,
                            url: file.webViewLink,
                            type: file.mimeType || "application/octet-stream",
                            size: Number(file.size || 0),
                          }]
                        })
                        pushNotif("success", `Drive-tiedosto lisätty liitteeksi: ${file.name}`)
                        setShowDriveModal(false)
                      }}
                      style={{ background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.35)", borderRadius:8, color:"#22c55e", cursor:"pointer", fontSize:12, padding:"6px 10px", fontFamily:"system-ui", whiteSpace:"nowrap" }}>
                      Liitä viestiin
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowDriveModal(false)}
              style={{ width: "100%", marginTop: 16, padding: "9px", background: "#4f7ef7", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "system-ui" }}>
              Sulje
            </button>
          </div>
        </div>
      )}

      {/* Chat-ilmoitukset */}
      <div style={{position:"fixed",bottom:24,right:24,display:"flex",flexDirection:"column",gap:8,zIndex:300,pointerEvents:"none"}}>
        {notifications.map(n=>(
          <div key={n.id} onClick={()=>setNotifications(prev=>prev.filter(x=>x.id!==n.id))}
            style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:12,padding:"10px 14px",maxWidth:300,pointerEvents:"all",cursor:"pointer",boxShadow:"0 8px 24px rgba(0,0,0,0.4)",
              borderLeft:n.type==="chat"?"3px solid #4f7ef7":n.type==="success"?"3px solid #22c55e":"3px solid #f59e0b",animation:"slideIn 0.2s ease"}}>
            {n.title&&<div style={{fontSize:11,color:"var(--text3)",marginBottom:2}}>{n.title}</div>}
            <div style={{fontSize:13,color:"var(--text)"}}>{n.body}</div>
          </div>
        ))}
      </div>

      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

function MemberRow({ m, isMod, onProfile }) {
  const sc = m?.status==="away"?"#f59e0b":m?.status==="busy"?"#ef4444":m?.status==="offline"?"var(--text3)":m?.online?"#22c55e":"var(--text3)"
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",cursor:"pointer",borderRadius:6,margin:"1px 4px"}} onClick={onProfile}>
      <div style={{position:"relative",flexShrink:0}}>
        <Avatar src={m.photoURL} name={m.displayName} size={26}/>
        <div style={{position:"absolute",bottom:0,right:0,width:7,height:7,borderRadius:"50%",border:"1.5px solid var(--bg2)",background:sc}}/>
      </div>
      <span style={{fontSize:12,color:"var(--text2)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {m.displayName?.split(" ")[0]}{isMod&&<span style={{fontSize:9,color:"#4f7ef7",marginLeft:4}}>MOD</span>}
      </span>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={onClose}>
      <div style={{background:"var(--bg2)",border:"1px solid var(--border2)",borderRadius:16,padding:24,width:420,maxWidth:"90vw",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontWeight:600,fontSize:16}}>{title}</span>
          <button onClick={onClose} style={{...iconBtn,fontSize:18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const iconBtn   = {background:"transparent",border:"none",color:"var(--text2)",cursor:"pointer",fontSize:16,padding:"4px 6px",borderRadius:6,fontFamily:"system-ui"}
const sectionAddBtn = {...iconBtn,display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,padding:0,lineHeight:1,fontSize:18}
const lbl       = {display:"block",fontSize:12,fontWeight:500,color:"var(--text2)",marginBottom:6,marginTop:10}
const inp       = {width:"100%",background:"var(--bg)",border:"1px solid var(--border2)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:14,boxSizing:"border-box",fontFamily:"system-ui",outline:"none"}
const btnPrimary= {background:"#4f7ef7",border:"none",borderRadius:8,color:"#fff",padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:500,fontFamily:"system-ui"}
const btnGhost  = {background:"transparent",border:"1px solid var(--border2)",borderRadius:8,color:"var(--text2)",padding:"8px 18px",cursor:"pointer",fontSize:13,fontFamily:"system-ui"}
const ctxItem   = {padding:"6px 10px",cursor:"pointer",fontSize:13,color:"var(--text)",borderRadius:6}
const ctxDivider= {height:"1px",background:"var(--border)",margin:"4px 0"}