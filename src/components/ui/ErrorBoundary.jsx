// src/components/ui/ErrorBoundary.jsx
import { Component } from "react"
import { auth, db } from "../../services/firebase"
import { addDoc, collection, serverTimestamp } from "firebase/firestore"

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.breadcrumbs = []
    this.maxBreadcrumbs = 30
    this.boundRecordClick = this.recordClick.bind(this)
    this.boundRecordSubmit = this.recordSubmit.bind(this)
    this.boundRecordNavigation = this.recordNavigation.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidMount() {
    this.recordNavigation("mount")
    document.addEventListener("click", this.boundRecordClick, true)
    document.addEventListener("submit", this.boundRecordSubmit, true)
    window.addEventListener("popstate", this.boundRecordNavigation)
    window.addEventListener("hashchange", this.boundRecordNavigation)
  }

  componentWillUnmount() {
    document.removeEventListener("click", this.boundRecordClick, true)
    document.removeEventListener("submit", this.boundRecordSubmit, true)
    window.removeEventListener("popstate", this.boundRecordNavigation)
    window.removeEventListener("hashchange", this.boundRecordNavigation)
  }

  pushBreadcrumb(entry) {
    this.breadcrumbs.push({
      at: new Date().toLocaleString("fi-FI"),
      path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      ...entry,
    })
    if (this.breadcrumbs.length > this.maxBreadcrumbs) this.breadcrumbs.shift()
  }

  formatTarget(target) {
    if (!target || !(target instanceof Element)) return ""
    const tag = target.tagName?.toLowerCase?.() || ""
    const id = target.id ? `#${target.id}` : ""
    const cls = target.className && typeof target.className === "string"
      ? "." + target.className.trim().split(/\s+/).slice(0, 2).join(".")
      : ""
    const text = (target.textContent || "").trim().slice(0, 40)
    return `${tag}${id}${cls}${text ? ` (${text})` : ""}`
  }

  recordClick(event) {
    this.pushBreadcrumb({ type: "click", target: this.formatTarget(event.target) })
  }

  recordSubmit(event) {
    this.pushBreadcrumb({ type: "submit", target: this.formatTarget(event.target) })
  }

  recordNavigation(reason = "navigation") {
    this.pushBreadcrumb({ type: reason, target: document.title || "" })
  }

  async componentDidCatch(error, info) {
    try {
      const currentUser = auth.currentUser
      await addDoc(collection(db, "errorLog"), {
        message:   error.message,
        stack:     error.stack?.slice(0, 1000) || "",
        component: info.componentStack?.slice(0, 500) || "",
        url:       window.location.href,
        user: {
          uid: currentUser?.uid || null,
          email: currentUser?.email || null,
          displayName: currentUser?.displayName || null,
        },
        breadcrumbs: this.breadcrumbs.slice(-10),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        createdAt: serverTimestamp(),
      })
    } catch {}
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ position:"fixed", inset:0, background:"#0e1117", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui", zIndex:999 }}>
        <div style={{ background:"#161b27", border:"1px solid rgba(239,68,68,0.3)", borderRadius:16, padding:32, width:440, maxWidth:"90vw", textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🤷‍♂️</div>
          <h2 style={{ color:"#f87171", fontSize:18, margin:"0 0 10px" }}>Jotain meni pieleen</h2>
          <p style={{ color:"#8b92a8", fontSize:13, lineHeight:1.6, margin:"0 0 20px" }}>
            Sovelluksessa tapahtui odottamaton virhe. Virhe on kirjattu ylläpidolle automaattisesti.
          </p>
          <div style={{ background:"#1e2535", borderRadius:8, padding:"10px 14px", marginBottom:20, fontSize:11, color:"#545d75", textAlign:"left", wordBreak:"break-all" }}>
            {this.state.error?.message}
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
            <button onClick={() => window.location.reload()}
              style={{ background:"#4f7ef7", border:"none", borderRadius:8, color:"#fff", padding:"9px 20px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
              🔄 Lataa uudelleen
            </button>
            <button onClick={() => { window.location.href = "/" }}
              style={{ background:"transparent", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, color:"#8b92a8", padding:"9px 20px", cursor:"pointer", fontSize:13, fontFamily:"system-ui" }}>
              Etusivulle
            </button>
          </div>
        </div>
      </div>
    )
  }
}