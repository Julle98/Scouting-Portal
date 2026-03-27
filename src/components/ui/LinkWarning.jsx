import { useState } from "react"

export function useLinkWarning() {
  const [pending, setPending] = useState(null) // { url }
  const open = (url) => setPending({ url })
  const close = () => setPending(null)
  return { pending, open, close }
}

export function LinkWarningModal({ pending, onClose }) {
  if (!pending) return null
  const trusted = JSON.parse(localStorage.getItem("trustedDomains") || "[]")
  const domain = (() => { try { return new URL(pending.url).hostname } catch { return pending.url } })()
  const isTrusted = trusted.includes(domain)

  function trust() {
    const updated = [...new Set([...trusted, domain])]
    localStorage.setItem("trustedDomains", JSON.stringify(updated))
    window.open(pending.url, "_blank", "noopener noreferrer")
    onClose()
  }
  function go() {
    window.open(pending.url, "_blank", "noopener noreferrer")
    onClose()
  }

  if (isTrusted) { go(); return null }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:500 }}
      onClick={onClose}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:28, width:380, maxWidth:"90vw" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:28, textAlign:"center", marginBottom:12 }}>🔗</div>
        <h3 style={{ textAlign:"center", margin:"0 0 8px", fontSize:16, fontWeight:600 }}>Ulkoinen linkki</h3>
        <p style={{ fontSize:13, color:"var(--text2)", textAlign:"center", margin:"0 0 16px", lineHeight:1.5 }}>
          Tämä linkki vie sivustolle:
        </p>
        <div style={{ background:"var(--bg3)", border:"1px solid var(--border2)", borderRadius:8, padding:"8px 14px", marginBottom:20, fontSize:13, color:"#4f7ef7", wordBreak:"break-all", textAlign:"center" }}>
          {pending.url}
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={go}
            style={{ width:"100%", padding:"10px", background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"system-ui" }}>
            Avaa linkki
          </button>
          <button onClick={trust}
            style={{ width:"100%", padding:"10px", background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.25)", borderRadius:8, color:"#22c55e", fontSize:13, cursor:"pointer", fontFamily:"system-ui" }}>
            Luotan tähän sivustoon — älä kysy uudelleen
          </button>
          <button onClick={onClose}
            style={{ width:"100%", padding:"10px", background:"transparent", border:"1px solid var(--border2)", borderRadius:8, color:"var(--text2)", fontSize:13, cursor:"pointer", fontFamily:"system-ui" }}>
            Peruuta
          </button>
        </div>
      </div>
    </div>
  )
}

export function TextWithLinks({ text, onLinkClick }) {
  if (!text) return null
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part)
          ? <span key={i} onClick={() => onLinkClick(part)}
              style={{ color:"#4f7ef7", textDecoration:"underline", cursor:"pointer", wordBreak:"break-all" }}>
              {part}
            </span>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}
