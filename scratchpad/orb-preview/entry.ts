import { createSceneController } from "../../apps/web/features/chat/scene/sceneController";
import type { SceneMode } from "../../apps/web/features/chat/scene/sceneTypes";

const root = document.getElementById("root")!;
const controller = createSceneController(root, {
  mode: "idle",
  agents: [],
  dock: [],
  reducedMotion: false,
});

const label = document.getElementById("label")!;
function set(mode: SceneMode) {
  controller.setInputs({ mode, agents: [], dock: [], reducedMotion: false });
  label.textContent = mode;
}
(window as unknown as { setMode: (m: SceneMode) => void }).setMode = set;
// Simulate streaming energy for the streaming shot.
(window as unknown as { pump: () => void }).pump = () => {
  for (let i = 0; i < 8; i++) controller.pushActivity(6);
};
