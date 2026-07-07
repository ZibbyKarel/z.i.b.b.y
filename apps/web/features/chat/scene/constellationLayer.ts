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
/**
 * Visual-scale multiplier for pipeline/chain nodes over the quieter agent default
 * (Phase 35 — "pipelines should read as clearly more prominent than agents"). Chains
 * get the same boost: a chain is itself a composition of pipelines/agents, so it
 * should never read quieter than a plain pipeline.
 */
const PROMINENT_SCALE = 1.3;
/** At-rest sprite opacity for the quieter agent mark vs. the brighter pipeline/chain
 * mark — combined with the size + glow + halo-ring boost below so the two kinds are
 * unmistakable even before the DOM label loads. */
const AGENT_BASE_OPACITY = 0.55;
const PROMINENT_BASE_OPACITY = 0.78;

/** Pipelines and chains are the constellation's stronger mark; a plain agent stays
 * the quieter default. */
function isProminentKind(kind: SceneAgent["kind"]): boolean {
  return kind !== "agent";
}

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
  /** Whether this node is the constellation's stronger mark (pipeline/chain) — cached
   * from `agent.kind` at build time so the per-frame update doesn't re-derive it. */
  prominent: boolean;
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

const AVATAR_SIZE = 128;

/** Draw the glow + accent ring an avatar sits inside — shared by the image and the
 * initial fallback so both read as the same node type. Pipelines/chains (Phase 35)
 * get a hotter, wider glow plus an outer halo ring so the stronger mark reads even
 * before the accent ring or label are legible. */
function drawAvatarFrame(ctx: CanvasRenderingContext2D, agent: SceneAgent): void {
  const size = AVATAR_SIZE;
  const c = size / 2;
  const prominent = isProminentKind(agent.kind);
  ctx.clearRect(0, 0, size, size);

  // Soft outer glow.
  const glow = ctx.createRadialGradient(c, c, 8, c, c, c);
  glow.addColorStop(0, hexToRgba(agent.color, prominent ? 0.75 : 0.55));
  glow.addColorStop(1, hexToRgba(agent.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  // Halo ring — the pipeline/chain-only extra ring outside the core accent ring.
  if (prominent) {
    ctx.strokeStyle = hexToRgba(agent.color, 0.55);
    ctx.lineWidth = size * 0.028;
    ctx.beginPath();
    ctx.arc(c, c, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Draw an avatar disc: soft glow, accent ring, dark core, and the name's initial —
 * the fallback for a node with no image (all chains, imageless agents/pipelines). */
function drawAvatarFallback(ctx: CanvasRenderingContext2D, agent: SceneAgent): void {
  const size = AVATAR_SIZE;
  const c = size / 2;
  const prominent = isProminentKind(agent.kind);
  drawAvatarFrame(ctx, agent);

  // Dark core.
  ctx.fillStyle = "#0b1422";
  ctx.beginPath();
  ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Accent ring — thicker for the stronger pipeline/chain mark.
  ctx.strokeStyle = agent.color;
  ctx.lineWidth = size * (prominent ? 0.055 : 0.035);
  ctx.beginPath();
  ctx.arc(c, c, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();

  // Initial.
  const initial = (agent.name.trim()[0] ?? "?").toUpperCase();
  ctx.fillStyle = agent.color;
  ctx.font = `600 ${size * 0.34}px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initial, c, c + size * 0.02);
}

/** Draw the loaded avatar image clipped to the disc, framed by the accent ring. */
function drawAvatarImage(
  ctx: CanvasRenderingContext2D,
  agent: SceneAgent,
  img: HTMLImageElement,
): void {
  const size = AVATAR_SIZE;
  const c = size / 2;
  const r = size * 0.3;
  const prominent = isProminentKind(agent.kind);
  drawAvatarFrame(ctx, agent);

  // Image clipped to the disc (cover-fit so a non-square portrait fills it).
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  const scale = Math.max((2 * r) / img.width, (2 * r) / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, c - w / 2, c - h / 2, w, h);
  ctx.restore();

  // Accent ring on top — thicker for the stronger pipeline/chain mark.
  ctx.strokeStyle = agent.color;
  ctx.lineWidth = size * (prominent ? 0.055 : 0.035);
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Build the avatar texture. The initial-in-a-disc fallback is drawn synchronously
 * (so the sprite never flashes empty); if the node carries an image it loads in the
 * background and repaints the same canvas on arrival — the "prefer agents with
 * images" half of the TODO note. A failed load simply keeps the fallback.
 */
function makeAvatarTexture(agent: SceneAgent): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d")!;
  drawAvatarFallback(ctx, agent);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  if (agent.avatar) {
    const img = new Image();
    img.onload = () => {
      drawAvatarImage(ctx, agent, img);
      texture.needsUpdate = true;
    };
    img.src = agent.avatar;
  }

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
        const prominent = isProminentKind(agent.kind);
        const sprite = new THREE.Sprite(material);
        sprite.scale.setScalar(BASE_SCALE * (prominent ? PROMINENT_SCALE : 1));
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
          prominent,
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

        // Breathing + flare scale, plus a sustained working swell. Reduced motion
        // holds the avatars still (no breathe/working oscillation). The prominent
        // (pipeline/chain) size multiplier rides on top so the stronger mark stays
        // stronger through every animated state, not just at rest.
        const breathe = ctx.reducedMotion ? 1 : 1 + 0.08 * Math.sin(elapsed * 1.2 + n.breathePhase);
        const workingSwell =
          n.working && !ctx.reducedMotion ? 0.12 * (0.5 + 0.5 * Math.sin(elapsed * 4)) : 0;
        const sizeScale = n.prominent ? PROMINENT_SCALE : 1;
        n.sprite.scale.setScalar(BASE_SCALE * sizeScale * (breathe + workingSwell + n.flare * 0.4));

        // Project for the label + depth fade.
        ndc.copy(n.sprite.position).project(ctx.camera);
        viewPos.copy(n.sprite.position).applyMatrix4(ctx.camera.matrixWorldInverse);
        const orbViewZ = -ctx.camera.position.length();
        const behind = viewPos.z < orbViewZ;
        const ndcDist = Math.hypot(ndc.x, ndc.y);
        const occlude =
          behind && ndcDist < ORB_NDC_RADIUS ? 1 - ndcDist / ORB_NDC_RADIUS : 0;

        const working = n.working ? 0.25 + 0.25 * Math.sin(elapsed * 4 + n.breathePhase) : 0;
        // Pipelines/chains sit brighter at rest than the quieter agent default —
        // stronger glow/opacity is part of the Phase 35 visual hierarchy.
        const baseOpacity = n.prominent ? PROMINENT_BASE_OPACITY : AGENT_BASE_OPACITY;
        const opacity = reveal * (baseOpacity + working + n.flare * 0.45) * (1 - 0.85 * occlude);
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
