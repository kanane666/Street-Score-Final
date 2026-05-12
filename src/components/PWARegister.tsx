import { useEffect } from "react";

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!import.meta.env.PROD) return;

    const host = window.location.hostname;
    const isPreview =
      host.includes("id-preview--") ||
      host.includes("lovableproject.com") ||
      host === "localhost" ||
      host === "127.0.0.1";

    if (isInIframe() || isPreview) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        }).catch(() => {});
      }
      return;
    }

    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        registerSW({ immediate: true });
      })
      .catch(() => {
        // module not available in dev — fine
      });
  }, []);

  return null;
}
