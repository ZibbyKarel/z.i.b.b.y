import { createSceneController } from "../../apps/web/features/chat/scene/sceneController";
import { categoryColor } from "../../apps/web/features/chat/scene/tokens";
import type { SceneAgent, SceneDockItem, SceneMode } from "../../apps/web/features/chat/scene/sceneTypes";

const ROSTER: Array<[string, string, string]> = [
  ["architekt","Architekt","Vývoj"],["koder","Kodér","Vývoj"],["reviewer","Reviewer","Kvalita"],
  ["tester","Tester","Kvalita"],["researcher","Researcher","Výzkum"],["dokumentator","Dokumentátor","Dokumentace"],
  ["kurator","Kurátor","Média"],["hospodar","Hospodář","Domácnost"],["kronikar","Kronikář","Psaní"],
];
const agents: SceneAgent[] = ROSTER.map(([id,name,category]) => ({ id,name,category,specialty:`${name} — ${category}`,color:categoryColor(category) }));
const root = document.getElementById("root")!;
let dock: SceneDockItem[] = [];
const controller = createSceneController(root, { mode:"idle", agents, dock, reducedMotion:false });
const label = document.getElementById("label")!;
const w = window as unknown as Record<string, unknown>;
function push(mode: SceneMode){ controller.setInputs({ mode, agents, dock, reducedMotion:false }); label.textContent = mode; }
w.setMode = push;
w.setDock = (items: Array<[string,string,string,"agent"|"pipeline"]>) => {
  dock = items.map(([key,targetId,name,kind]) => ({ key,targetId,name,kind,status:"running",color: kind==="agent"?categoryColor(agents.find(a=>a.id===targetId)?.category ?? ""):"#5b8def" }));
  controller.setInputs({ mode:(label.textContent as SceneMode)||"idle", agents, dock, reducedMotion:false });
};
w.dispatch = (id: string) => controller.triggerDispatch(id);
w.pump = () => { for (let i=0;i<8;i++) controller.pushActivity(6); };
