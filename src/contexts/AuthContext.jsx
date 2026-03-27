import { createContext, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, updateDoc, deleteField } from "firebase/firestore"
import { auth, db, googleProvider } from "../services/firebase"

const ALLOWED_DOMAIN = "maahiset.net"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let profileUnsub = null
    let sessionId = localStorage.getItem("sessionId")
    if (!sessionId && typeof crypto !== "undefined" && crypto.randomUUID) {
      sessionId = crypto.randomUUID()
      localStorage.setItem("sessionId", sessionId)
    }

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      if (!firebaseUser) {
        setUser(null); setProfile(null); setLoading(false); return
      }

      const email = firebaseUser.email?.toLowerCase() || ""
      const emailDomain = email.split("@")[1] || ""
      const userRef = doc(db, "users", firebaseUser.uid)
      const userSnap = await getDoc(userRef)

      if (userSnap.exists()) {
        setUser(firebaseUser)
        setError(null)
        const existingData = (await getDoc(userRef)).data()
        const chosenStatus = existingData?.status || "online"

        const sessionMeta = {
          id: sessionId,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
          lastSeen: serverTimestamp(),
        }

        const updates = {
          online: chosenStatus !== "offline" && chosenStatus !== "away" && chosenStatus !== "busy"
            ? true
            : chosenStatus === "offline" ? false : true,
          lastSeen: serverTimestamp(),
          [`sessions.${sessionId}`]: sessionMeta,
        }

        if (!Array.isArray(existingData?.roles) || existingData.roles.length === 0) {
          updates.roles = [existingData?.role || "johtaja"]
        }

        if (existingData?.isDebug) {
          updates.lastUsed = serverTimestamp()
          updates.displayName = existingData.displayName || "Debug User"
          updates.photoURL = existingData.photoURL || null
        } else {
          updates.photoURL = firebaseUser.photoURL
          updates.displayName = firebaseUser.displayName
        }

        await updateDoc(userRef, updates)
        profileUnsub = onSnapshot(userRef, snap => {
          if (snap.exists()) setProfile(snap.data())
        })

      } else if (emailDomain === ALLOWED_DOMAIN) {
        const sessionMeta = {
          id: sessionId,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
          lastSeen: serverTimestamp(),
        }
        await setDoc(userRef, {
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          role: "johtaja",        
          roles: ["johtaja"],
          online: true,
          joinedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          autoApproved: true,   
          sessions: { [sessionId]: sessionMeta },
        })
        setUser(firebaseUser)
        setError(null)
        profileUnsub = onSnapshot(userRef, snap => {
          if (snap.exists()) setProfile(snap.data())
        })

      } else {
        const invSnap = await getDocs(
          query(collection(db, "invites"), where("email","==",email), where("used","==",false))
        )
        if (!invSnap.empty) {
          const inv = invSnap.docs[0]
          const isDebug = inv.data().isDebug || false
          const sessionMeta = {
          id: sessionId,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          platform: typeof navigator !== "undefined" ? navigator.platform : "unknown",
          lastSeen: serverTimestamp(),
        }
        await setDoc(userRef, {
            displayName: isDebug ? "Debug User" : firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: isDebug ? null : firebaseUser.photoURL,
          role: inv.data().role || "johtaja",
          roles: [inv.data().role || "johtaja"],
            online: true,
            joinedAt: serverTimestamp(),
            lastSeen: serverTimestamp(),
            isDebug,
            isInvisible: isDebug,
            lastUsed: serverTimestamp(),
            sessions: { [sessionId]: sessionMeta },
          })
          await updateDoc(doc(db, "invites", inv.id), {
            used: true, usedAt: serverTimestamp(), usedBy: firebaseUser.uid
          })
          setUser(firebaseUser)
          setError(null)
          profileUnsub = onSnapshot(userRef, snap => {
            if (snap.exists()) setProfile(snap.data())
          })
        } else {
          await signOut(auth)
          setError(
            `Pääsy estetty. Kirjaudu @${ALLOWED_DOMAIN}-osoitteella tai pyydä lippukunnanjohtajaa kutsumaan sinut.`
          )
          setUser(null)
          setProfile(null)
        }
      }
      setLoading(false)
    })

    return () => { authUnsub(); if (profileUnsub) profileUnsub() }
  }, [])

  async function loginWithGoogle() {
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Kirjautuminen epäonnistui: " + err.message)
      }
    }
  }

  async function logout() {
    if (user) {
      const sessionId = localStorage.getItem("sessionId")
      if (sessionId) {
        await updateDoc(doc(db, "users", user.uid), {
          online: false,
          lastSeen: serverTimestamp(),
          [`sessions.${sessionId}`]: deleteField(),
        }).catch(() => {})
      } else {
        await updateDoc(doc(db, "users", user.uid), { online: false, lastSeen: serverTimestamp() }).catch(() => {})
      }
    }
    await signOut(auth)
  }

  const profileRoles = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? profile.roles
    : [profile?.role].filter(Boolean)
  const isAdmin = profileRoles.includes("admin") || profileRoles.includes("lippukunnanjohtaja")

  return (
    <AuthContext.Provider value={{ user, profile, loading, error, loginWithGoogle, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)