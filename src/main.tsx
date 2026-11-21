import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { initDb } from "./data/db";
import { applyTheme } from "./data/settings";
import App from "./app/App";

applyTheme();
const root = createRoot(document.getElementById("root")!);

void initDb().then(({ persistent }) => {
  root.render(
    <StrictMode>
      <App persistent={persistent} />
    </StrictMode>,
  );
});
