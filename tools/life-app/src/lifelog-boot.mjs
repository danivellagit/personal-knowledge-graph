// Starts the life-log writer before the app renders (imported by entry.jsx). See lifelog.mjs and pill-bridge.mjs.
import { createLifeLog, fakeGithub } from "./lifelog.mjs";
import { installPillBridge } from "./pill-bridge.mjs";

(() => {
  if (typeof window === "undefined" || !window.localStorage) return;
  const given = globalThis.__LIFE_LOG__ || null;
  // automated browsers (verify scripts, navigator.webdriver) never write to the real log
  const mock = !!(given && given.mock) || (!!given && navigator.webdriver === true);
  const build = document.documentElement.getAttribute("data-build") || "unknown";
  let fetchFn = window.fetch ? window.fetch.bind(window) : null, config = given ? { ...given, build } : { build };
  if (mock) { const f = fakeGithub(); globalThis.__LIFE_LOG_MOCK__ = f; fetchFn = f.fetch; config = { mock: true, repo: "mock/life-log", build }; }
  const L = createLifeLog({ storage: window.localStorage, fetch: fetchFn, config });
  globalThis.__lifeLog = { emit: L.emit, flush: L.flush, queue: L.queue, live: L.live, mock };
  installPillBridge(window.Storage && window.Storage.prototype, window.localStorage, L);
  const kick = () => { if (document.visibilityState !== "hidden") L.kick(); };
  window.addEventListener("online", kick);
  document.addEventListener("visibilitychange", kick);
  L.flush();
})();
