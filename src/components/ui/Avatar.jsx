export function Avatar({ src, name, size=36, style={} }) {
  const initials = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()
  const colors = ["#4f7ef7","#a78bfa","#22c55e","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"]
  const color = colors[(name||"").charCodeAt(0) % colors.length]

  if (src) return (
    <img src={src} alt={name||""} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", flexShrink:0, ...style }}
      onError={e => { e.target.style.display="none"; e.target.nextSibling.style.display="flex" }} />
  )

  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:color, display:"flex", alignItems:"center",
      justifyContent:"center", fontSize:size*0.38, fontWeight:600, color:"#fff", flexShrink:0, userSelect:"none", ...style }}>
      {initials}
    </div>
  )
}