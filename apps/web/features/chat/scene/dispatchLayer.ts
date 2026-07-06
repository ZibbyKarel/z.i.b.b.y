import * as THREE from "three";

/**
 * Dispatch reactions (Tier 5): when a `tool` event names an agent, a luminous beam
 * races from the orb out to that agent's avatar and back in the agent's accent
 * colour, a ring pulses at the orb the instant it fires, and an expanding ring
 * blooms at the agent when the beam reaches it. All transient — pooled objects that
 * fade and are recycled. Agent positions are resolved every frame (the avatar keeps
 * orbiting), so the beam tracks a moving target.
 */

const BEAM_LIFE = 2.2;

let ringTexture: THREE.Texture | null = null;
function getRingTexture(): THREE.Texture {
  if (ringTexture) return ringTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.06;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ringTexture = new THREE.CanvasTexture(canvas);
  return ringTexture;
}

interface Beam {
  agentId: string;
  color: THREE.Color;
  t: number;
  line: THREE.Line;
  lineMaterial: THREE.LineBasicMaterial;
  positions: Float32Array;
  pulse: THREE.Sprite;
  pulseMaterial: THREE.SpriteMaterial;
  agentRingFired: boolean;
}

interface RingPulse {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  t: number;
  life: number;
  from: number;
  to: number;
}

export type PositionResolver = (agentId: string) => THREE.Vector3 | null;

export interface DispatchLayer {
  object3d: THREE.Group;
  /** Fire a dispatch toward an agent's avatar in the given colour. */
  fire(agentId: string, color: THREE.Color): void;
  update(dt: number, resolve: PositionResolver): void;
  dispose(): void;
}

export function createDispatchLayer(): DispatchLayer {
  const group = new THREE.Group();
  const beams: Beam[] = [];
  const pulses: RingPulse[] = [];
  const origin = new THREE.Vector3(0, 0, 0);
  const tmp = new THREE.Vector3();

  function spawnRing(pos: THREE.Vector3, color: THREE.Color, from: number, to: number, life: number) {
    const material = new THREE.SpriteMaterial({
      map: getRingTexture(),
      color: color.clone(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    sprite.scale.setScalar(from);
    group.add(sprite);
    pulses.push({ sprite, material, t: 0, life, from, to });
  }

  return {
    object3d: group,
    fire(agentId, color) {
      const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geometry, lineMaterial);
      line.frustumCulled = false;
      group.add(line);

      const pulseMaterial = new THREE.SpriteMaterial({
        map: getRingTexture(),
        color: color.clone(),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pulse = new THREE.Sprite(pulseMaterial);
      pulse.scale.setScalar(0.22);
      group.add(pulse);

      beams.push({
        agentId,
        color: color.clone(),
        t: 0,
        line,
        lineMaterial,
        positions,
        pulse,
        pulseMaterial,
        agentRingFired: false,
      });

      // Ring pulse at the orb the instant the dispatch fires.
      spawnRing(origin, color, 0.3, 1.1, 0.7);
    },
    update(dt, resolve) {
      // Beams.
      for (let i = beams.length - 1; i >= 0; i--) {
        const beam = beams[i]!;
        beam.t += dt / BEAM_LIFE;
        const target = resolve(beam.agentId);
        if (!target || beam.t >= 1) {
          group.remove(beam.line, beam.pulse);
          beam.line.geometry.dispose();
          beam.lineMaterial.dispose();
          beam.pulseMaterial.dispose();
          beams.splice(i, 1);
          continue;
        }
        // Update the line endpoint to the (moving) avatar.
        beam.positions[3] = target.x;
        beam.positions[4] = target.y;
        beam.positions[5] = target.z;
        beam.line.geometry.attributes.position!.needsUpdate = true;
        beam.lineMaterial.opacity = 0.6 * (1 - beam.t);

        // Pulse races out (t 0->0.5) then back (0.5->1).
        const p = beam.t < 0.5 ? beam.t / 0.5 : (1 - beam.t) / 0.5;
        tmp.copy(origin).lerp(target, p);
        beam.pulse.position.copy(tmp);
        beam.pulse.scale.setScalar(0.22 + p * 0.1);
        beam.pulseMaterial.opacity = 0.9 * Math.sin(Math.PI * beam.t);

        // Bloom an expanding ring at the agent when the beam arrives.
        if (!beam.agentRingFired && beam.t >= 0.48) {
          beam.agentRingFired = true;
          spawnRing(target, beam.color, 0.3, 1.6, 0.9);
        }
      }

      // Expanding ring pulses.
      for (let i = pulses.length - 1; i >= 0; i--) {
        const ring = pulses[i]!;
        ring.t += dt / ring.life;
        if (ring.t >= 1) {
          group.remove(ring.sprite);
          ring.material.dispose();
          pulses.splice(i, 1);
          continue;
        }
        const e = 1 - Math.pow(1 - ring.t, 2); // ease-out
        ring.sprite.scale.setScalar(ring.from + (ring.to - ring.from) * e);
        ring.material.opacity = (1 - ring.t) * 0.8;
      }
    },
    dispose() {
      for (const beam of beams) {
        beam.line.geometry.dispose();
        beam.lineMaterial.dispose();
        beam.pulseMaterial.dispose();
      }
      for (const ring of pulses) ring.material.dispose();
      beams.length = 0;
      pulses.length = 0;
    },
  };
}
