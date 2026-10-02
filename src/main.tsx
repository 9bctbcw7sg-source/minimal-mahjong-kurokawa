import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MahjongGame } from "./components/MahjongGame";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("ゲームの表示先が見つかりません");

createRoot(root).render(
  <StrictMode>
    <MahjongGame />
  </StrictMode>,
);
