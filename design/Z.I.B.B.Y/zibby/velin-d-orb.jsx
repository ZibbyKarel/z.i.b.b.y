// ZIBBY Velín-D — sdílená WebGL orb komponenta (Three.js).
// Drátěný ikosaedr s displacementem podél normál (3D simplex šum) + fresnel
// + měkká glow slupka. Jedna instance = jedno <canvas>. Barva = identita,
// tvar/rychlost pohybu = stav. Vše exponenciálně doznívá k cíli (~95 % / 0.6 s).
const { useEffect: useEffectOrb, useRef: useRefOrb } = React;

// ── Pohyb podle stavu (amplituda + rychlost šumu + záře + dech) ────────────
const ORB_MOTION = {
  idle:      { amp: 0.05,  speed: 0.18, glow: 0.5,  breath: 1.0  },
  thinking:  { amp: 0.17,  speed: 0.95, glow: 0.82, breath: 0.7  }, // střed „přemýšlí"
  working:   { amp: 0.15,  speed: 0.85, glow: 0.78, breath: 0.75 },
  report:    { amp: 0.085, speed: 0.42, glow: 0.68, breath: 0.9  },
  await:     { amp: 0.05,  speed: 0.16, glow: 0.6,  breath: 1.35 },
  incident:  { amp: 0.02,  speed: 0.05, glow: 0.5,  breath: 0.14 },
};

const ORB_SIMPLEX = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ── Nízkoúrovňový orb (vanilla Three) ──────────────────────────────────────
function createZOrb(container, opts) {
  const detail = opts.detail || 3;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: !!opts.antialias, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  // devicePixelRatio se v některých hostitelských náhledech hlásí < 1 (škálovaný
  // wrapper), což by jinak vykreslilo canvas v nižším rozlišení, než je jeho CSS
  // velikost, a orb by vypadal rozmazaně — proto vždy vzorkujeme min. na 2×.
  renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, 2), 3));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.pointerEvents = 'none';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.63); // koule ≈ 80 % výšky plátna

  const grp = new THREE.Group();
  scene.add(grp);

  const uniforms = {
    uTime:  { value: Math.random() * 40 },
    uAmp:   { value: ORB_MOTION.idle.amp },
    uSpeed: { value: ORB_MOTION.idle.speed },
    uColor: { value: new THREE.Color(opts.hex || '#5b8def') },
    uGlow:  { value: ORB_MOTION.idle.glow },
  };

  const wireMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, wireframe: true, blending: THREE.NormalBlending,
    vertexShader: ORB_SIMPLEX + `
      uniform float uTime; uniform float uAmp; uniform float uSpeed;
      varying float vFres;
      void main(){
        vec3 dir = normalize(position);
        float t = uTime * uSpeed;
        float n1 = snoise(dir * 1.7 + vec3(0.0,0.0,t));
        float n2 = snoise(dir * 3.4 + vec3(t*0.7,0.0,0.0));
        float disp = (n1*0.72 + n2*0.28) * uAmp;
        vec3 p = position + normal * disp;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        vec3 N = normalize(normalMatrix * normal);
        vec3 V = normalize(-mv.xyz);
        vFres = pow(1.0 - abs(dot(N,V)), 1.8);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vFres;
      void main(){ float a = mix(0.6,0.95,clamp(vFres,0.0,1.0)); gl_FragColor = vec4(uColor,a); }`,
  });
  grp.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), wireMat));

  const glowMat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `
      varying float vFres;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 N = normalize(normalMatrix * normal);
        vec3 V = normalize(-mv.xyz);
        vFres = pow(1.0 - abs(dot(N,V)), 3.2);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uGlow; varying float vFres;
      void main(){ gl_FragColor = vec4(uColor, vFres * uGlow); }`,
  });
  grp.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.12, 2), glowMat));

  // živý + cílový stav
  const targetColor = new THREE.Color(opts.hex || '#5b8def');
  let tgt = Object.assign({}, ORB_MOTION[opts.state] || ORB_MOTION.idle);
  const cur = Object.assign({}, tgt);

  function setTarget(hex, state) {
    if (hex) targetColor.set(hex);
    const m = ORB_MOTION[state] || ORB_MOTION.idle;
    tgt.amp = m.amp; tgt.speed = m.speed; tgt.glow = m.glow; tgt.breath = m.breath;
  }

  const TAU = 0.2;
  let last = performance.now();
  let simT = uniforms.uTime.value;
  let raf = null;

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();

  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    const k = 1 - Math.exp(-dt / TAU);

    const breathPhase = (now / 1000) * (Math.PI * 2 / 7);
    const breath = Math.sin(breathPhase) * 0.5 + 0.5;

    cur.amp = cur.amp + (tgt.amp - cur.amp) * k;
    cur.speed = cur.speed + (tgt.speed - cur.speed) * k;
    cur.glow = cur.glow + (tgt.glow - cur.glow) * k;
    cur.breath = cur.breath + (tgt.breath - cur.breath) * k;

    uniforms.uColor.value.lerp(targetColor, k);
    simT += dt * (reduce ? 0 : 1);
    uniforms.uTime.value = simT;
    uniforms.uSpeed.value = cur.speed;
    uniforms.uAmp.value = cur.amp * (1 + (breath - 0.5) * 0.28 * cur.breath);
    uniforms.uGlow.value = cur.glow * (0.82 + breath * 0.18);

    const scale = 1 + (breath - 0.5) * 0.03 * cur.breath;
    grp.scale.setScalar(scale);

    if (!reduce) {
      grp.rotation.y += dt * 0.16;
      grp.rotation.x += dt * 0.07;
      grp.rotation.z = Math.sin(now / 1000 * 0.12) * 0.09;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setTarget, resize,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss(); // uvolní GPU context slot hned, ne až při GC
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}

// ── React obal ─────────────────────────────────────────────────────────────
// diameter = cílový průměr koule v px; plátno je o něco větší kvůli glow.
const ZOrb3D = ({ diameter = 72, hex = '#5b8def', state = 'idle', detail = 3, antialias = false }) => {
  const mountRef = useRefOrb(null);
  const apiRef = useRefOrb(null);
  const canvasPx = Math.round(diameter / 0.8);

  useEffectOrb(() => {
    if (!mountRef.current || typeof THREE === 'undefined') return;
    apiRef.current = createZOrb(mountRef.current, { hex, state, detail, antialias });
    return () => { apiRef.current && apiRef.current.dispose(); apiRef.current = null; };
  }, []);

  useEffectOrb(() => { apiRef.current && apiRef.current.setTarget(hex, state); }, [hex, state]);

  return (
    <div ref={mountRef} style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      width: canvasPx, height: canvasPx, pointerEvents: 'none', zIndex: 2,
    }}></div>
  );
};

Object.assign(window, { ZOrb3D, createZOrb, ORB_MOTION });
