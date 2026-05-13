import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (e) {
  document.getElementById("root")!.innerHTML =
    `<div style="padding:32px;font-family:sans-serif"><h1 style="color:#c00">起動エラー</h1><pre style="background:#f5f5f5;padding:16px;overflow:auto;font-size:13px">${e instanceof Error ? e.message + "\n" + e.stack : String(e)}</pre><button onclick="location.reload()" style="margin-top:16px;padding:8px 16px">再読み込み</button></div>`;
}
