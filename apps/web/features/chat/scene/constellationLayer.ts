import * as THREE from "three";
import type { SceneAgent } from "./sceneTypes";

/**
 * The floating sub-agent constellation: one sprite avatar per deduped agent
 * (see {@link buildConstellation}) orbiting the orb on its own tilted, non-lockstep
 * path, with a DOM label tracking its screen position. Avatars fade as they pass
 * behind the orb, breathe gently at rest, and fade in on first appearance (no flash
 * on load). Built imperatively so the 60fps label positioning never round-trips
 * React (the reference's "thin DOM overlay for text labels").
 */

const BASE_SCALE = 0.42;
/** Reveal ramp when the roster first appears, seconds. */
const REVEAL_SECONDS = 1.2;
/** Orb apparent radius in NDC (radius-1 sphere at origin, 45° fov, camera z≈6). */
const ORB_NDC_RADIUS = 0.42;
const GOLDEN_ANGLE = 2.399963229728653;
/** Distance from the camera a docked avatar hovers at — near the orb's own depth
 * so it reads at a natural size (not blown up close to the lens). */
const DOCK_DISTANCE = 5;

interface AgentNode {
  agent: SceneAgent;
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  label: HTMLDivElement;
  radius: number;
  speed: number;
  angle: number;
  euler: THREE.Euler;
  breathePhase: number;
  /** Dispatch flare (Tier 5): a transient brightness/scale bump, decays to 0. */
  flare: number;
  /** Working pulse (Tier 5): sustained while the agent has a live run. */
  working: boolean;
}

export interface ConstellationContext {
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  reducedMotion: boolean;
  /** agentId → dock-chip centre in container pixels. A docked agent flies out of
   * orbit to hover at its slot (Tier 5); absent agents keep orbiting. */
  dockTargets: Map<string, { x: number; y: number }>;
}

export interface ConstellationLayer {
  object3d: THREE.Group;
  /** Replace the roster. A no-op when the id set is unchanged (avoids rebuild →
   * no flash); otherwise disposes old avatars and fades the new set in. */
  setAgents(agents: SceneAgent[]): void;
  /** Fire a dispatch flare on one agent (Tier 5). */
  flare(agentId: string): void;
  /** Set which agents currently have a live run — sustained working pulse (Tier 5). */
  setWorking(agentIds: Set<string>): void;
  /** World position of an agent's avatar, or null if absent (Tier 5 beams). */
  positionOf(agentId: string): THREE.Vector3 | null;
  update(dt: number, elapsed: number, ctx: ConstellationContext): void;
  dispose(): void;
}

/** Draw an avatar disc: soft glow, accent ring, dark core, and the name's initial. */
function makeAvatarTexture(agent: SceneAgent): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);

  // Soft outer glow.
  const glow = ctx.createRadialGradient(c, c, 8, c, c, c);
  glow.addColorStop(0, hexToRgba(agent.color, 0.55));
  glow.addColorStop(1, hexToRgba(agent.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  // Dark core.
  ctx.fillStyle = "#0b1422";
  ctx.beginPath();
  ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Accent ring.
  ctx.strokeStyle = agent.color;
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();

  // Initial (avatar fallback: no image in the catalog, so glyph/initial).
  const initial = (agent.name.trim()[0] ?? "?").toUpperCase();
  ctx.fillStyle = agent.color;
  ctx.font = `600 ${size * 0.34}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initial, c, c + size * 0.02);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

function makeLabel(agent: SceneAgent): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = agent.name;
  el.title = agent.specialty;
  el.style.position = "absolute";
  el.style.left = "0";
  el.style.top = "0";
  el.style.transform = "translate(-9999px, -9999px)";
  el.style.font = "600 11px ui-monospace, monospace";
  el.style.letterSpacing = "0.04em";
  el.style.color = agent.color;
  el.style.textShadow = "0 1px 4px rgba(0,0,0,0.9)";
  el.style.whiteSpace = "nowrap";
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  el.style.willChange = "transform, opacity";
  return el;
}

export function createConstellationLayer(labelRoot: HTMLElement): ConstellationLayer {
  const group = new THREE.Group();
  let nodes: AgentNode[] = [];
  let revealElapsed = 0;

  const ndc = new THREE.Vector3();
  const viewPos = new THREE.Vector3();
  const orbitPos = new THREE.Vector3();
  const dockWorld = new THREE.Vector3();

  function currentIds(): string {
    return nodes.map((n) => n.agent.id).join("|");
  }

  function clear() {
    for (const n of nodes) {
      group.remove(n.sprite);
      n.material.dispose();
      n.texture.dispose();
      n.label.remove();
    }
    nodes = [];
  }

  return {
    object3d: group,
    setAgents(agents) {
      const nextIds = agents.map((a) => a.id).join("|");
      if (nextIds === currentIds()) return; // unchanged — keep avatars, no flash
      clear();
      revealElapsed = 0;
      nodes = agents.map((agent, i) => {
        const texture = makeAvatarTexture(agent);
        const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.setScalar(BASE_SCALE);
        group.add(sprite);
        const label = makeLabel(agent);
        labelRoot.appendChild(label);
        return {
          agent,
          sprite,
          material,
          texture,
          label,
          // Spread orbits so paths never clump or move in lockstep.
          radius: 2.1 + (i % 3) * 0.5,
          speed: (0.05 + (i % 4) * 0.014) * (i % 2 === 0 ? 1 : -1),
          angle: i * GOLDEN_ANGLE,
          euler: new THREE.Euler(
            ((i % 5) - 2) * 0.22,
            0,
            (((i * 37) % 7) - 3) * 0.12,
          ),
          breathePhase: i * 0.7,
          flare: 0,
          working: false,
        };
      });
    },
    flare(agentId) {
      const node = nodes.find((n) => n.agent.id === agentId);
      if (node) node.flare = 1;
    },
    setWorking(agentIds) {
      for (const n of nodes) n.working = agentIds.has(n.agent.id);
    },
    positionOf(agentId) {
      const node = nodes.find((n) => n.agent.id === agentId);
      return node ? node.sprite.position.clone() : null;
    },
    update(dt, elapsed, ctx) {
      revealElapsed += dt;
      const reveal = Math.min(1, revealElapsed / REVEAL_SECONDS);

      for (const n of nodes) {
        if (!ctx.reducedMotion) n.angle += dt * n.speed;
        n.flare = Math.max(0, n.flare - dt / 1.4);

        // Orbit position on the tilted plane.
        orbitPos
          .set(Math.cos(n.angle) * n.radius, 0, Math.sin(n.angle) * n.radius)
          .applyEuler(n.euler);

        // A docked agent (in the dock, has a live run) flies out of orbit to hover
        // at its dock chip; everyone else eases to their orbit point.
        const dockPx = ctx.dockTargets.get(n.agent.id);
        if (dockPx) {
          const ndcX = (dockPx.x / ctx.width) * 2 - 1;
          const ndcY = -((dockPx.y / ctx.height) * 2 - 1);
          // Cast a ray to the chip and place the avatar a fixed distance along it,
          // so it sits at the chip's screen position at a natural depth/size.
          dockWorld
            .set(ndcX, ndcY, 0.5)
            .unproject(ctx.camera)
            .sub(ctx.camera.position)
            .normalize()
            .multiplyScalar(DOCK_DISTANCE)
            .add(ctx.camera.position);
          n.sprite.position.lerp(dockWorld, 1 - Math.exp(-dt * 3));
        } else {
          n.sprite.position.lerp(orbitPos, 1 - Math.exp(-dt * 3));
        }

        // Breathing + flare scale, plus a sustained working swell.
        const breathe = 1 + 0.08 * Math.sin(elapsed * 1.2 + n.breathePhase);
        const workingSwell = n.working ? 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 4)) : 0;
        n.sprite.scale.setScalar(BASE_SCALE * (breathe + workingSwell + n.flare * 0.4));

        // Project for the label + depth fade.
        ndc.copy(n.sprite.position).project(ctx.camera);
        viewPos.copy(n.sprite.position).applyMatrix4(ctx.camera.matrixWorldInverse);
        const orbViewZ = -ctx.camera.position.length();
        const behind = viewPos.z < orbViewZ;
        const ndcDist = Math.hypot(ndc.x, ndc.y);
        const occlude =
          behind && ndcDist < ORB_NDC_RADIUS ? 1 - ndcDist / ORB_NDC_RADIUS : 0;

        const working = n.working ? 0.25 + 0.25 * Math.sin(elapsed * 4 + n.breathePhase) : 0;
        const opacity = reveal * (0.55 + working + n.flare * 0.45) * (1 - 0.85 * occlude);
        n.material.opacity = Math.min(1, opacity);
        n.sprite.renderOrder = -viewPos.z; // nearer avatars paint over farther

        // Label follow — hidden while docked (the dock chip carries the name).
        const onScreen = !dockPx && ndc.z < 1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
        if (!onScreen) {
          n.label.style.opacity = "0";
        } else {
          const px = (ndc.x * 0.5 + 0.5) * ctx.width;
          const py = (-ndc.y * 0.5 + 0.5) * ctx.height;
          n.label.style.transform = `translate(${Math.round(px + 12)}px, ${Math.round(py - 6)}px)`;
          n.label.style.opacity = String(Math.min(1, opacity * 1.1));
        }
      }
    },
    dispose() {
      clear();
    },
  };
}
