import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean((window as any).WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

/** Attractive static/CSS fallback for devices without WebGL (or if three.js fails to load). */
export function NeuralFallback() {
  return (
    <div className="relative grid h-full w-full place-items-center" aria-hidden>
      <div className="absolute h-72 w-72 rounded-full border border-electric/20" style={{ animation: "nfs-spin-slow 40s linear infinite" }} />
      <div className="absolute h-52 w-52 rounded-full border border-violet-nfs/25" style={{ animation: "nfs-spin-slow 28s linear infinite reverse" }} />
      <div className="absolute h-80 w-80 rounded-full bg-electric/10 blur-3xl" style={{ animation: "nfs-pulse 6s ease-in-out infinite" }} />
      <div style={{ animation: "nfs-float 6s ease-in-out infinite" }}><LogoMark size={150} /></div>
    </div>
  );
}

/**
 * Lightweight three.js "neural intelligence core": a sphere of connected glowing nodes, an inner wireframe
 * core and drifting data particles. three.js is imported lazily, the loop pauses when the tab/element is not
 * visible, pixel ratio is capped, and everything is disposed on unmount. Honors prefers-reduced-motion.
 */
export default function NeuralCore() {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!webglAvailable()) { setFallback(true); return; }
    let disposed = false;
    let cleanup = () => {};

    import("three").then((THREE) => {
      const el = host.current;
      if (disposed || !el) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
      catch { setFallback(true); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 50);
      camera.position.z = 6.4;
      const group = new THREE.Group();
      scene.add(group);

      // deterministic pseudo-random so the scene looks the same on every load
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

      // nodes on a (jittered) Fibonacci sphere
      const N = 72, R = 1.7, pts: InstanceType<typeof THREE.Vector3>[] = [];
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * Math.PI * (3 - Math.sqrt(5));
        const j = 1 + (rnd() - 0.5) * 0.18;
        pts.push(new THREE.Vector3(Math.cos(th) * r * R * j, y * R * j, Math.sin(th) * r * R * j));
      }
      const nodePos = new Float32Array(N * 3), nodeCol = new Float32Array(N * 3);
      const cyan = new THREE.Color("#22D3EE"), violet = new THREE.Color("#8B5CF6"), c = new THREE.Color();
      pts.forEach((p, i) => { nodePos.set([p.x, p.y, p.z], i * 3); c.copy(cyan).lerp(violet, (p.y / R + 1) / 2); nodeCol.set([c.r, c.g, c.b], i * 3); });
      const nodeGeo = new THREE.BufferGeometry();
      nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
      nodeGeo.setAttribute("color", new THREE.BufferAttribute(nodeCol, 3));
      const nodeMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true });
      group.add(new THREE.Points(nodeGeo, nodeMat));

      // connections between nearby nodes
      const seg: number[] = [];
      for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) if (pts[a].distanceTo(pts[b]) < 1.05) seg.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(seg), 3));
      const lineMat = new THREE.LineBasicMaterial({ color: "#3B82F6", transparent: true, opacity: 0.28 });
      group.add(new THREE.LineSegments(lineGeo, lineMat));

      // inner core
      const coreGeo = new THREE.IcosahedronGeometry(0.62, 1);
      const coreMat = new THREE.MeshBasicMaterial({ color: "#22D3EE", wireframe: true, transparent: true, opacity: 0.55 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);
      const glowGeo = new THREE.SphereGeometry(0.34, 20, 20);
      const glowMat = new THREE.MeshBasicMaterial({ color: "#6366F1", transparent: true, opacity: 0.55 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      group.add(glow);

      // drifting data particles
      const P = 160, ppos = new Float32Array(P * 3), pvel = new Float32Array(P);
      for (let i = 0; i < P; i++) { const a = rnd() * Math.PI * 2, rr = 2.2 + rnd() * 1.8; ppos.set([Math.cos(a) * rr, (rnd() - 0.5) * 4.2, Math.sin(a) * rr], i * 3); pvel[i] = 0.2 + rnd() * 0.5; }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
      const pMat = new THREE.PointsMaterial({ size: 0.035, color: "#93C5FD", transparent: true, opacity: 0.7 });
      const particles = new THREE.Points(pGeo, pMat);
      scene.add(particles);

      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
        camera.aspect = w / h; camera.updateProjectionMatrix();
        if (reduced) renderer.render(scene, camera);
      };
      const ro = new ResizeObserver(resize); ro.observe(el); resize();

      let px = 0, py = 0;
      const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); px = ((e.clientX - r.left) / r.width - 0.5) * 2; py = ((e.clientY - r.top) / r.height - 0.5) * 2; };
      window.addEventListener("pointermove", onMove, { passive: true });

      let raf = 0, last = performance.now(), visible = true;
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 }); io.observe(el);
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (!visible || document.hidden) { last = now; return; }
        const dt = Math.min((now - last) / 1000, 0.05); last = now;
        group.rotation.y += dt * 0.18;
        group.rotation.x += (py * 0.25 - group.rotation.x) * 0.04;
        core.rotation.y -= dt * 0.5; core.rotation.x += dt * 0.25;
        const pulse = 1 + Math.sin(now / 900) * 0.06; glow.scale.setScalar(pulse);
        const arr = pGeo.getAttribute("position") as InstanceType<typeof THREE.BufferAttribute>;
        for (let i = 0; i < P; i++) { let y = arr.getY(i) + pvel[i] * dt * 0.5; if (y > 2.2) y = -2.2; arr.setY(i, y); }
        arr.needsUpdate = true;
        particles.rotation.y += dt * 0.05 + px * 0.0005;
        renderer.render(scene, camera);
      };
      if (reduced) renderer.render(scene, camera); else raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener("pointermove", onMove);
        [nodeGeo, lineGeo, coreGeo, glowGeo, pGeo].forEach((g) => g.dispose());
        [nodeMat, lineMat, coreMat, glowMat, pMat].forEach((m) => m.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    }).catch(() => setFallback(true));

    return () => { disposed = true; cleanup(); };
  }, []);

  return fallback ? <NeuralFallback /> : <div ref={host} className="h-full w-full" aria-hidden />;
}
