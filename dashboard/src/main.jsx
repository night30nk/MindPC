import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyTheme, readTheme } from "./hooks";

// Apply the saved theme before the first paint, so a dark choice never flashes light.
applyTheme(readTheme());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
