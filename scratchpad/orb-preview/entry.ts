import { createSceneController } from "../../apps/web/features/chat/scene/sceneController";
import type { SceneMode } from "../../apps/web/features/chat/scene/sceneTypes";

const root = document.getElementById("root")!;
const controller = createSceneController(root, { mode: "idle", agents: [], dock: [], reducedMotion: false });
const label = document.getElementById("label")!;
const w = window as unknown as Record<string, unknown>;
w.setMode = (mode: SceneMode) => { controller.setInputs({ mode, agents: [], dock: [], reducedMotion: false }); label.textContent = mode; };
w.pump = () => { for (let i = 0; i < 8; i++) controller.pushActivity(6); };
w.flash = () => controller.flashComplete();
