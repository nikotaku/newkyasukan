import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import { AppProvider } from "./hooks/useApp";
import "./index.css";

// URLを持てない埋め込みプレビュー用に、VITE_ROUTER=memory でビルドするとメモリ上のルーターを使う
const Router = import.meta.env.VITE_ROUTER === "memory" ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <AppProvider>
        <App />
        <Toaster position="top-center" richColors closeButton />
      </AppProvider>
    </Router>
  </StrictMode>,
);
