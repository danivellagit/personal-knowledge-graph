import "./avatar-init.js";
import "./hair-init.js";
import "./lifelog-init.js";
import "./lifelog-boot.mjs";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.tsx";
createRoot(document.getElementById("root")).render(React.createElement(App));
