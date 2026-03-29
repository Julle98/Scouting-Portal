// src/services/googleDriveService.js
import { auth, googleProvider } from "./firebase"
import { GoogleAuthProvider, linkWithPopup } from "firebase/auth"

const DRIVE_TOKEN_KEY = "google_drive_token"
const DRIVE_INFO_KEY = "google_drive_info"

/**
 * Linkitä Google Drive käyttäjän tiliin
 */
export async function linkGoogleDrive(user) {
  try {
    // Käytä firebase.js:n googleProvider:ia, jolla on oikeat scopes
    const result = await linkWithPopup(user, googleProvider)
    
    // Hae access token credential-objektista
    let accessToken = null
    
    // Yritä eri tavoin saada accessToken
    if (result.credential?.accessToken) {
      accessToken = result.credential.accessToken
    } else if (result.user) {
      console.warn("⚠️ credential.accessToken puuttuu")
      // Vaihtoehtoinen tapa: hae tokenin tunnistautumisesta
      try {
        const tokenResult = await result.user.getIdTokenResult()
        if (tokenResult) {
          // Yritä hakea Drive API:n kautta käyttäjä info
          const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
            headers: { "Authorization": `Bearer ${result.credential?.accessToken || ""}` }
          })
          if (response.ok) {
            const data = await response.json()
            return {
              success: true,
              message: "Google Drive linkitetty onnistuneesti!",
              info: { email: data.email, name: data.name, id: data.id }
            }
          }
        }
      } catch (e) {
        console.error("Token fetch error:", e)
      }
    }
    
    // Jos accessToken löytyi, tallenna se
    if (accessToken) {
      localStorage.setItem(DRIVE_TOKEN_KEY, accessToken)
      
      // Hae käyttäjän Drive-tiedot
      const driveInfo = await getDriveUserInfo(accessToken)
      if (driveInfo) {
        localStorage.setItem(DRIVE_INFO_KEY, JSON.stringify(driveInfo))
      }
      
      return {
        success: true,
        message: "Google Drive linkitetty onnistuneesti!",
        info: driveInfo
      }
    } else {
      // Token-haku epäonnistui, mutta linkitys voi silti onnistua
      // Tallenna vähintään käyttäjä tieto
      const userInfo = {
        email: result.user?.email || result.user?.auth?.currentUser?.email,
        name: result.user?.displayName || "Käyttäjä",
        id: result.user?.uid
      }
      localStorage.setItem(DRIVE_INFO_KEY, JSON.stringify(userInfo))
      
      return {
        success: true,
        message: "Google Drive linkitetty onnistuneesti!",
        info: userInfo
      }
    }
  } catch (err) {
    // Jos Google-credential on jo käytössä toisessa Firebase-käyttäjässä,
    // käytä silti OAuth tokenia Drive-oikeuden tallentamiseen.
    if (err.code === "auth/credential-already-in-use") {
      try {
        const credential = GoogleAuthProvider.credentialFromError(err)
        const accessToken = credential?.accessToken

        if (accessToken) {
          localStorage.setItem(DRIVE_TOKEN_KEY, accessToken)

          const driveInfo = await getDriveUserInfo(accessToken)
          if (driveInfo) {
            localStorage.setItem(DRIVE_INFO_KEY, JSON.stringify(driveInfo))
          } else {
            const fallbackInfo = {
              email: user?.email || "",
              name: user?.displayName || "Google Drive",
              picture: user?.photoURL || "",
            }
            localStorage.setItem(DRIVE_INFO_KEY, JSON.stringify(fallbackInfo))
          }

          return {
            success: true,
            message: "Google Drive yhdistetty onnistuneesti.",
            info: driveInfo || {
              email: user?.email || "",
              name: user?.displayName || "Google Drive",
              picture: user?.photoURL || "",
            },
          }
        }
      } catch (fallbackErr) {
        console.error("Drive fallback link error:", fallbackErr)
      }
    }

    console.error("❌ Drive linkitys epäonnistui:", err)
    let errorMsg = err.message
    
    if (err.code === "auth/credential-already-in-use") {
      errorMsg = "Tämä Google-tili on jo käytössä."
    } else if (err.code === "auth/popup-blocked") {
      errorMsg = "Popup-ikkuna estettiin. Salli ponnahdusikkunat selaimessasi ja yritä uudelleen."
    } else if (err.code === "auth/popup-closed-by-user") {
      errorMsg = "Suljet kirjautumisen popup-ikkunan. Yritä uudelleen."
    } else if (err.code === "auth/network-request-failed") {
      errorMsg = "Verkko-ongelma. Tarkista internet-yhteytesi ja yritä uudelleen."
    }
    
    return {
      success: false,
      message: errorMsg
    }
  }
}

/**
 * Irroita Google Drive
 */
export function unlinkGoogleDrive() {
  localStorage.removeItem(DRIVE_TOKEN_KEY)
  localStorage.removeItem(DRIVE_INFO_KEY)
  return { success: true, message: "Google Drive irroitettu" }
}

/**
 * Tarkista, onko Google Drive linkitetty
 */
export function isDriveLinked() {
  return !!localStorage.getItem(DRIVE_TOKEN_KEY)
}

/**
 * Hae Google Drive token
 */
export function getDriveToken() {
  return localStorage.getItem(DRIVE_TOKEN_KEY)
}

/**
 * Hae Drive-käyttäjän tiedot
 */
export function getDriveInfo() {
  const info = localStorage.getItem(DRIVE_INFO_KEY)
  return info ? JSON.parse(info) : null
}

/**
 * Hae käyttäjän Drive-profiilin tiedot
 */
async function getDriveUserInfo(accessToken) {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    
    if (!res.ok) throw new Error("Drive API error")
    
    const data = await res.json()
    return {
      name: data.user?.displayName || "Google Drive",
      email: data.user?.emailAddress || "",
      picture: data.user?.photoLink || ""
    }
  } catch (err) {
    console.error("Failed to fetch Drive user info:", err)
    return null
  }
}

/**
 * Hae tiedostot Google Drivesta
 */
export async function listDriveFiles(accessToken, maxResults = 10) {
  try {
    const query = encodeURIComponent("trashed=false and mimeType!='application/vnd.google-apps.folder'")
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,size,owners,webViewLink)&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    
    if (!res.ok) throw new Error("Drive API error")
    
    const data = await res.json()
    return data.files || []
  } catch (err) {
    console.error("Failed to list Drive files:", err)
    return []
  }
}

/**
 * Hae kansiot Google Drivesta
 */
export async function listDriveFolders(accessToken, maxResults = 10) {
  try {
    const query = encodeURIComponent("trashed=false and mimeType='application/vnd.google-apps.folder'")
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=${maxResults}&fields=files(id,name,modifiedTime,children)&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    
    if (!res.ok) throw new Error("Drive API error")
    
    const data = await res.json()
    return data.files || []
  } catch (err) {
    console.error("Failed to list Drive folders:", err)
    return []
  }
}

/**
 * Lataa tiedosto Google Drivesta
 */
export async function downloadDriveFile(accessToken, fileId, fileName) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    
    if (!res.ok) throw new Error("Download failed")
    
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    
    return { success: true, message: `${fileName} ladattu!` }
  } catch (err) {
    console.error("Download error:", err)
    return { success: false, message: err.message }
  }
}

/**
 * Hae tiedoston koko ja muutettu aika
 */
export function formatDriveFile(file) {
  const size = formatBytes(file.size || 0)
  const modified = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString("fi-FI") : "Ei tietoa"
  return `${size} · ${modified}`
}

function formatBytes(bytes) {
  if (!bytes) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
}
