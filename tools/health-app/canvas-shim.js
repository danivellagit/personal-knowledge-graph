// Optional compatibility shim. Some canvas tools write React pages that import their hooks and
// theme from a host module (e.g. `import { useState, useGrokTheme } from "grok/canvas"`).
// build.mjs aliases that import to this file, so such a page runs unchanged as a normal React
// app. A page that imports only from "react" (like example-page.tsx) never touches it.
export { useState, useEffect, useRef, useMemo, useCallback, useReducer, Fragment } from "react";
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, "Helvetica Neue", Arial, sans-serif';
const THEME = {
  kind: "dark",
  font: { family: FONT, mono: 'ui-monospace, "SF Mono", Menlo, monospace' },
  bg: { base: "#0B0E10", elevated: "#15191C" },
  text: { primary: "#FFFFFF", secondary: "#B5BCC2", tertiary: "#7D868D", onColor: "#000000", success: "#16EC06", warning: "#FFDE00" },
  border: { subtle: "#232A2F", weak: "#1E2428", default: "#2A3136" },
  fill: { secondary: "#1E2428", warningSubtle: "#2A2500", successSubtle: "#0E2A0B" },
  dataviz: { categorical: ["#00F19F", "#0093E7", "#9C7ED9"], other: "#5E676E", areaAlpha: "33" },
};
export function useTheme() { return THEME; }
export const useGrokTheme = useTheme;
