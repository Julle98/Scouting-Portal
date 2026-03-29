import { useRef, useState } from "react"

const VERSION = import.meta.env.VITE_VERSION
const AUTHOR_NAME = import.meta.env.VITE_AUTHOR_NAME
const AUTHOR_LINK = import.meta.env.VITE_AUTHOR_LINK

function parseVersion(v) {
  if (!v) return [0, 0, 0]
  return String(v)
    .replace(/^v/i, "")
    .split(".")
    .slice(0, 3)
    .map(n => Number(n) || 0)
}

function compareVersions(a, b) {
  const aa = parseVersion(a)
  const bb = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (aa[i] > bb[i]) return 1
    if (aa[i] < bb[i]) return -1
  }
  return 0
}

async function fetchRemoteChangelog() {
  try {
    const res = await fetch("/changelog.json", { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return data
  } catch {
    return null
  }
}

export default function HomePage() {
  const [checking, setChecking] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(null)
  const pagesRef = useRef(null)
  const updatesRef = useRef(null)
  const issuesRef = useRef(null)
  const tipsRef = useRef(null)

  function jumpToSection(ref) {
    if (!ref?.current) return
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  async function checkForUpdates() {
    setChecking(true)
    try {
      const remote = await fetchRemoteChangelog()
      const latest = remote?.[0]?.version || VERSION
      if (compareVersions(latest, VERSION) > 0) {
        window.__pushToast?.(`Uusi versio ${latest} saatavilla - päivitä sivu`, "info")
      } else {
        window.__pushToast?.("Sivu on ajan tasalla ✓", "success")
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: showHelp ? "auto" : "hidden", display: "flex", alignItems: showHelp ? "flex-start" : "center", justifyContent: "center", padding: 24, background: "linear-gradient(180deg, rgba(79,126,247,0.06) 0%, rgba(79,126,247,0) 42%)" }}>
      <div style={{ width: "100%", maxWidth: 880, margin: "0 auto", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, boxShadow: "0 24px 48px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            {!logoLoadFailed && (
              <img
                src="/favicon.png"
                alt="Maahiset-logo"
                style={{ width: 34, height: 34, objectFit: "contain" }}
                onError={() => setLogoLoadFailed(true)}
              />
            )}
            {logoLoadFailed && <span style={{ fontSize: 20 }}>🏕️</span>}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>Maahiset-Portaali</div>
        </div>
        <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 6 }}>Versio: {VERSION}</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
          Sivuston tekijä:{" "}
          {AUTHOR_LINK ? (
            <a href={AUTHOR_LINK} target="_blank" rel="noreferrer" style={{ color: "#7ea6ff", textDecoration: "none" }}>
              {AUTHOR_NAME || "Tuntematon"}
            </a>
          ) : (
            <span>{AUTHOR_NAME || "Tuntematon"}</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowHelp(v => !v)}
            style={{ background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: 10, padding: "10px 14px", fontSize: 14, cursor: "pointer", fontFamily: "system-ui" }}
          >
            {showHelp ? "Piilota ohjeet" : "Ohjeet"}
          </button>
          <button
            onClick={checkForUpdates}
            disabled={checking}
            style={{ background: "#4f7ef7", border: "1px solid #4f7ef7", color: "#fff", borderRadius: 10, padding: "10px 14px", fontSize: 14, cursor: checking ? "wait" : "pointer", opacity: checking ? 0.75 : 1, fontFamily: "system-ui" }}
          >
            {checking ? "Tarkistetaan..." : "Tarkista päivitykset"}
          </button>
        </div>

        {showHelp && (
          <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
            <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Ohjeet</div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--text2)", lineHeight: 1.65 }}>
                Maahiset-portaali on johtajien yhteinen työkalu viestintään, kaluston hallintaan ja arjen koordinointiin.
                Tältä sivulta löydät tärkeimmät käyttöohjeet nopeasti.
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setShowTermsModal("terms")}
                  style={{ background: "var(--bg2)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: 8, padding: "7px 11px", fontSize: 12, cursor: "pointer", fontFamily: "system-ui" }}
                >
                  📋 Käyttöehdot
                </button>
                <button
                  onClick={() => setShowTermsModal("privacy")}
                  style={{ background: "var(--bg2)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: 8, padding: "7px 11px", fontSize: 12, cursor: "pointer", fontFamily: "system-ui" }}
                >
                  🔒 Tietosuoja
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <section ref={pagesRef} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, scrollMarginTop: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>1. Sivut</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text2)", lineHeight: 1.65 }}>
                  <li>Chat: kanavat, yksityisviestit ja ilmoitukset.</li>
                  <li>Kalusto: varaukset, kalustotiedot ja kalustokeskustelut.</li>
                  <li>Johtajat: yhteystiedot, roolit ja paikallaolotiedot.</li>
                  <li>Kokousvuorot: tulevat vastuut ja vuorojen suunnittelu.</li>
                  <li>Asetukset: teema, chat-asetukset ja päivitysten tarkistus.</li>
                </ul>
              </section>

              <section ref={updatesRef} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, scrollMarginTop: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>2. Ilmoitukset ja päivitykset</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text2)", lineHeight: 1.65 }}>
                  <li>Chat-kuvake näyttää lukemattomien viestien määrän.</li>
                  <li>Toast-ilmoitukset kertovat uusista tapahtumista reaaliajassa.</li>
                  <li>Tarkista päivitykset vertaa nykyistä versiota uusimpaan julkaisuun.</li>
                  <li>Jos uusi versio löytyy, päivitä selainikkuna käyttöönottamiseksi.</li>
                </ul>
              </section>

              <section ref={issuesRef} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, scrollMarginTop: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>3. Ongelmatilanteet</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text2)", lineHeight: 1.65 }}>
                  <li>Jos sivu jumittaa, päivitä selain ja kirjaudu tarvittaessa uudelleen.</li>
                  <li>Jos viestit eivät päivity, tarkista verkkoyhteys ja selaimen ilmoitusasetukset.</li>
                  <li>Jos oikeudet puuttuvat, ota yhteys admineihin.</li>
                  <li>Jos löydät virheen, kirjaa ylös missä sivulla ongelma tapahtui ja raportoi se.</li>
                </ul>
              </section>
            </div>

            <section ref={tipsRef} style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, scrollMarginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>4. Vinkkejä sujuvaan käyttöön</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text2)", lineHeight: 1.65 }}>
                <li>Käytä hiiren oikean klikkauksen valikkoa viesteissä, kun haluat lisätoimintoja nopeasti.</li>
                <li>Päivitä profiilisi säännöllisesti: kuva, rooli, titteli ja yhteystiedot helpottavat yhteistyötä.</li>
                <li>Merkitse kalustovaraukset ajoissa, jotta päällekkäiset varaukset vähenevät.</li>
                <li>Pidä ilmoitukset päällä selaimessa, jotta tärkeät viestit eivät jää huomaamatta.</li>
              </ul>
            </section>
          </div>
        )}
      </div>

      {showTermsModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 350 }}
          onClick={() => setShowTermsModal(null)}
        >
          <div
            style={{ background: "var(--bg2)", border: "1px solid var(--border2)", borderRadius: 16, padding: 28, width: 460, maxWidth: "90vw", maxHeight: "78vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
              {showTermsModal === "terms" ? "Käyttöehdot" : "Tietosuojakäytäntö"}
            </h3>
            {showTermsModal === "terms" ? (
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8 }}>
                <p><strong style={{ color: "var(--text)" }}>1. Sovelluksen käyttö</strong><br />Partio-portaali on tarkoitettu Maahiset-lippukunnan johtajien sisäiseen käyttöön.</p>
                <p><strong style={{ color: "var(--text)" }}>2. Käyttäytyminen</strong><br />Käyttäjät sitoutuvat asialliseen käytökseen. Häirintä tai asiattomat viestit voivat johtaa käyttöoikeuden poistoon.</p>
                <p><strong style={{ color: "var(--text)" }}>3. Sisältö</strong><br />Käyttäjä vastaa lähettämästään sisällöstä. Laitonta sisältöä ei sallita.</p>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.8 }}>
                <p><strong style={{ color: "var(--text)" }}>Kerättävät tiedot</strong><br />Tallennamme Google-tilisi nimen, sähköpostin ja profiilikuvan. Lisäksi laitteen yleisiä tietoja ja mahdollisesti liitetyt ulkoiset palvelut.</p>
                <p><strong style={{ color: "var(--text)" }}>Tietojen käyttö</strong><br />Tietoja käytetään vain sovelluksen toimintaan. Tietoja ei myydä ulkopuolisille.</p>
                <p><strong style={{ color: "var(--text)" }}>Tietojen säilytys</strong><br />Tietoja säilytetään vain niin kauan kuin on tarpeen sovelluksen toiminnan kannalta.</p>
                <p><strong style={{ color: "var(--text)" }}>Oikeutesi</strong><br />Voit poistaa tilisi ja tietosi koska tahansa profiiliasetuksista.</p>
              </div>
            )}

            <button
              onClick={() => setShowTermsModal(null)}
              style={{ marginTop: 16, width: "100%", padding: "9px", background: "#4f7ef7", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "system-ui" }}
            >
              Sulje
            </button>
          </div>
        </div>
      )}

    </div>
  )
}