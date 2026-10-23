import "./avatar-init.js";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./page-src.tsx";
createRoot(document.getElementById("root")).render(React.createElement(App));
