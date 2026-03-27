// src/pages/LoadingScreen.jsx
export default function LoadingScreen({ message = "Ladataan..." }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"var(--bg)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:999, fontFamily:"system-ui" }}>
      <div style={{ marginBottom:28, position:"relative", width:64, height:64 }}>
        <img src="/favicon.png" alt="logo"
          style={{ width:48, height:48, objectFit:"contain", position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)" }}
          onError={e => { e.target.style.display="none" }} />
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ position:"absolute", top:0, left:0, animation:"spin 1.2s linear infinite" }}>
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(79,126,247,0.15)" strokeWidth="3" />
          <circle cx="32" cy="32" r="28" fill="none" stroke="#4f7ef7" strokeWidth="3"
            strokeDasharray="44 132" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ fontSize:14, color:"var(--text2)", fontWeight:500 }}>{message}</div>
      <div style={{ fontSize:11, color:"var(--text3)", marginTop:6 }}>Maahiset-portaali</div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}