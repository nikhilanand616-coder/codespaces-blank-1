(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scene = document.querySelector('.orbital-scene');
  const canvas = document.getElementById('motion-canvas');
  if (!scene || !canvas) return;

  const lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  const pointer = { x: 0, y: 0 };
  let renderer;
  let camera;
  let animationFrame;
  let depthFrame;
  let lastRender = 0;

  function updatePageDepth() {
    if (reduced.matches) return;
    cancelAnimationFrame(depthFrame);
    depthFrame = requestAnimationFrame(() => {
      document.querySelectorAll('.depth-surface').forEach((surface) => {
        const box = surface.getBoundingClientRect();
        const distance = (box.top + box.height / 2 - innerHeight / 2) / innerHeight;
        surface.style.setProperty('--scroll-depth', `${Math.max(-18, Math.min(18, distance * -12))}px`);
        surface.style.setProperty('--scroll-angle', `${Math.max(-1.8, Math.min(1.8, distance * 1.4))}deg`);
      });
    });
  }

  function createWebGLScene() {
    if (!window.THREE || reduced.matches) return;

    const THREE = window.THREE;
    if (renderer) renderer.dispose();
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPower, powerPreference: lowPower ? 'low-power' : 'high-performance' });
    renderer.setPixelRatio(lowPower ? 1 : Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const world = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 1.4, 15);

    world.add(new THREE.AmbientLight(0x8edfff, 1.5));
    const cyanLight = new THREE.PointLight(0x5cf0ff, 42, 30);
    cyanLight.position.set(4, 5, 7);
    world.add(cyanLight);
    const violetLight = new THREE.PointLight(0x9970ff, 34, 26);
    violetLight.position.set(-6, -2, 3);
    world.add(violetLight);

    const root = new THREE.Group();
    root.rotation.x = -0.18;
    world.add(root);

    const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x091d3e, metalness: .82, roughness: .22, emissive: 0x063b61, emissiveIntensity: .7 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25, lowPower ? 1 : 2), coreMaterial);
    root.add(core);
    const innerCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.78, lowPower ? 1 : 2), new THREE.MeshBasicMaterial({ color: 0x55e8ff, wireframe: true, transparent: true, opacity: .22 }));
    root.add(innerCore);

    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x7cf2ff, transparent: true, opacity: .62, side: THREE.DoubleSide });
    const ringData = lowPower ? [[3.2, .13, .28], [3.8, -.55, -.18]] : [[3.2, .13, .28], [3.65, -.55, -.18], [4.1, .8, .4]];
    ringData.forEach(([radius, x, z], index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .018 + index * .008, 6, lowPower ? 48 : 96), ringMaterial.clone());
      ring.rotation.x = Math.PI / 2 + x;
      ring.rotation.z = z;
      ring.userData.speed = (index % 2 ? -1 : 1) * (.0016 + index * .0006);
      root.add(ring);
    });

    const barMaterial = new THREE.MeshStandardMaterial({ color: 0x71f0ff, emissive: 0x1689b8, emissiveIntensity: 1.8, metalness: .35, roughness: .25 });
    const barCount = lowPower ? 10 : 18;
    for (let index = 0; index < barCount; index += 1) {
      const angle = (index / barCount) * Math.PI * 2;
      const radius = 4.1 + Math.sin(index * 2.1) * .22;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.055, .35 + (index % 5) * .16, .055), barMaterial);
      bar.position.set(Math.cos(angle) * radius, Math.sin(index * 1.4) * .35, Math.sin(angle) * radius);
      bar.lookAt(0, 0, 0);
      bar.userData.phase = index * .55;
      root.add(bar);
    }

    const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0xb6f9ff });
    const nodeCount = lowPower ? 12 : 26;
    for (let index = 0; index < nodeCount; index += 1) {
      const angle = (index / nodeCount) * Math.PI * 2;
      const node = new THREE.Mesh(new THREE.SphereGeometry(.055 + (index % 3) * .018, 10, 10), nodeMaterial);
      node.position.set(Math.cos(angle) * (5.1 + (index % 4) * .18), Math.sin(index * 2.7) * 1.3, Math.sin(angle) * (5.1 + (index % 4) * .18));
      node.userData.phase = index * .37;
      root.add(node);
    }

    const clock = new THREE.Clock();
    function render() {
      animationFrame = requestAnimationFrame(render);
      const now = performance.now();
      if (lowPower && now - lastRender < 33) return;
      lastRender = now;
      const elapsed = clock.getElapsedTime();
      root.rotation.y += .0012;
      root.rotation.x += (pointer.y * .035 - root.rotation.x) * .018;
      root.rotation.z += (pointer.x * .025 - root.rotation.z) * .018;
      core.rotation.y = elapsed * .12;
      innerCore.rotation.y = -elapsed * .18;
      root.children.forEach((object) => {
        if (object.userData.speed) object.rotation.y += object.userData.speed;
        if (object.userData.phase !== undefined) object.scale.y = 0.82 + Math.sin(elapsed * 1.4 + object.userData.phase) * .18;
      });
      camera.position.x += (pointer.x * 1.15 - camera.position.x) * .025;
      camera.position.y += (1.4 - pointer.y * .75 - camera.position.y) * .025;
      camera.lookAt(0, 0, 0);
      renderer.render(world, camera);
    }
    render();
  }

  function resize() {
    if (renderer) renderer.setSize(innerWidth, innerHeight, false);
    if (camera) {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }
  }

  function tilt(element) {
    element.addEventListener('pointermove', (event) => {
      if (reduced.matches || event.pointerType === 'touch') return;
      const box = element.getBoundingClientRect();
      element.style.setProperty('--tilt-x', `${((event.clientY - box.top) / box.height - .5) * -8}deg`);
      element.style.setProperty('--tilt-y', `${((event.clientX - box.left) / box.width - .5) * 10}deg`);
      element.classList.add('is-tilting');
    });
    element.addEventListener('pointerleave', () => { element.classList.remove('is-tilting'); element.style.removeProperty('--tilt-x'); element.style.removeProperty('--tilt-y'); });
  }

  function start() {
    document.documentElement.classList.toggle('low-power', Boolean(lowPower));
    document.documentElement.classList.add('motion-ready');
    document.querySelectorAll('.vision-glass, .ai-bot-panel, .pricing-card, .upgrade-panel, .auth-card, .hero-3d-stage').forEach(tilt);
    document.querySelectorAll('#hero, .premium-upgrade, #calculators, footer').forEach((surface) => surface.classList.add('depth-surface'));
    document.querySelectorAll('.ai-bot-panel, .calc-box, .command-metric, .hero-share, .upgrade-copy, .upgrade-actions').forEach((surface, index) => {
      surface.classList.add('depth-reveal');
      surface.style.setProperty('--reveal-delay', `${Math.min(index * 70, 420)}ms`);
    });
    cancelAnimationFrame(animationFrame);
    createWebGLScene();
    updatePageDepth();
  }

  addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / innerWidth - .5) * 2;
    pointer.y = (event.clientY / innerHeight - .5) * 2;
    scene.style.setProperty('--pointer-x', `${pointer.x * 14}px`);
    scene.style.setProperty('--pointer-y', `${pointer.y * 10}px`);
  }, { passive: true });
  addEventListener('resize', resize, { passive: true });
  addEventListener('scroll', updatePageDepth, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(animationFrame);
    else if (!reduced.matches) createWebGLScene();
  });
  reduced.addEventListener('change', start);
  start();
})();
