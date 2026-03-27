const RECAPTCHA_SCRIPT_ID = "google-recaptcha-api"
const RECAPTCHA_SRC = "https://www.google.com/recaptcha/api.js?render=explicit"

let recaptchaLoader = null

function resolveWhenRecaptchaReady(resolve, reject) {
  if (!window.grecaptcha) {
    reject(new Error("reCAPTCHA ei alustunut"))
    return
  }
  if (typeof window.grecaptcha.ready === "function") {
    window.grecaptcha.ready(() => resolve(window.grecaptcha))
  } else {
    resolve(window.grecaptcha)
  }
}

export async function loadRecaptchaScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("reCAPTCHA toimii vain selaimessa")
  }

  if (window.grecaptcha?.render) return window.grecaptcha
  if (recaptchaLoader) return recaptchaLoader

  recaptchaLoader = new Promise((resolve, reject) => {
    let script = document.getElementById(RECAPTCHA_SCRIPT_ID)

    const onLoad = () => resolveWhenRecaptchaReady(resolve, reject)
    const onError = () => reject(new Error("reCAPTCHA-skriptin lataus epaonnistui"))

    if (script) {
      if (window.grecaptcha?.render) {
        onLoad()
        return
      }
      script.addEventListener("load", onLoad, { once: true })
      script.addEventListener("error", onError, { once: true })
      return
    }

    script = document.createElement("script")
    script.id = RECAPTCHA_SCRIPT_ID
    script.src = RECAPTCHA_SRC
    script.async = true
    script.defer = true
    script.addEventListener("load", onLoad, { once: true })
    script.addEventListener("error", onError, { once: true })
    document.head.appendChild(script)
  }).catch((err) => {
    recaptchaLoader = null
    throw err
  })

  return recaptchaLoader
}

export async function renderRecaptchaWidget({
  container,
  siteKey,
  onVerify,
  onExpired,
  onError,
  theme = "light",
}) {
  if (!container) throw new Error("reCAPTCHA-kontti puuttuu")
  if (!siteKey) throw new Error("VITE_RECAPTCHA_SITE_KEY puuttuu")

  const grecaptcha = await loadRecaptchaScript()

  if (!container.isConnected) return null

  return grecaptcha.render(container, {
    sitekey: siteKey,
    callback: onVerify,
    "expired-callback": onExpired,
    "error-callback": onError,
    theme,
  })
}

export function resetRecaptchaWidget(widgetId) {
  if (typeof window === "undefined") return
  if (widgetId === null || widgetId === undefined) return
  if (!window.grecaptcha?.reset) return
  window.grecaptcha.reset(widgetId)
}
