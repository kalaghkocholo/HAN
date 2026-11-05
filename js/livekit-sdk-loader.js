(function (root) {
  "use strict";

  const VERSION = "2.23.0";
  const SCRIPT_PATH = "./vendor/livekit/livekit-client-" + VERSION + ".umd.js";
  const TIMEOUT_MS = 15000;
  let loadingPromise = null;

  function isReady() {
    return Boolean(root.LivekitClient &&
      typeof root.LivekitClient.Room === "function" &&
      root.LivekitClient.RoomEvent &&
      root.LivekitClient.Track);
  }

  function load() {
    if (isReady()) return Promise.resolve(root.LivekitClient);
    if (loadingPromise) return loadingPromise;

    if (!root.document || !root.document.head || typeof root.document.createElement !== "function") {
      return Promise.reject(new Error("LiveKit SDK loader requires a browser document."));
    }

    loadingPromise = new Promise(function (resolve, reject) {
      const script = root.document.createElement("script");
      let settled = false;
      let timer = null;

      function finish(error) {
        if (settled) return;
        settled = true;
        if (timer !== null) root.clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        if (error) {
          script.remove();
          loadingPromise = null;
          reject(error);
          return;
        }
        if (!isReady()) {
          script.remove();
          loadingPromise = null;
          reject(new Error("The local LiveKit SDK loaded but its expected API was not found."));
          return;
        }
        resolve(root.LivekitClient);
      }

      script.async = true;
      script.dataset.farnazLivekitSdk = VERSION;
      script.src = SCRIPT_PATH;
      script.onload = function () { finish(null); };
      script.onerror = function () {
        finish(new Error("Could not load the locally hosted LiveKit SDK: " + SCRIPT_PATH));
      };
      timer = root.setTimeout(function () {
        finish(new Error("Timed out loading the locally hosted LiveKit SDK."));
      }, TIMEOUT_MS);
      root.document.head.appendChild(script);
    });

    return loadingPromise;
  }

  root.FarnazLiveKitSdk = Object.freeze({
    load: load,
    version: VERSION,
    assetPath: SCRIPT_PATH,
    loadStatus: "lazy-local-only"
  });
})(typeof window !== "undefined" ? window : globalThis);
