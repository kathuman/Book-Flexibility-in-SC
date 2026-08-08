(() => {
  const { network, disruptions, scenarios } = ATLAS_DATA;

  const TYPE_RGB = {
    weather: [79, 163, 255],
    strike: [255, 207, 79],
    geopolitical: [255, 92, 122]
  };
  const COLORS = {
    port: '#3fd0ff',
    factory: '#ffb84f',
    buffer: '#7cff8a',
    altsupplier: '#c98bff',
    baseline: 'rgba(63,208,255,0.55)',
    disabled: 'rgba(255,77,94,0.25)',
    atrisk: 'rgba(255,140,60,0.85)',
    reroute: '#7cff8a'
  };

  // ---- Build unified node lookup (ports + factories) ----
  const nodeById = {};
  network.ports.forEach(p => { nodeById[p.id] = { ...p, kind: 'port' }; });
  network.factories.forEach(f => { nodeById[f.id] = { ...f, kind: 'factory' }; });

  const disruptionById = {};
  disruptions.forEach(d => { disruptionById[d.id] = d; });

  // ---- State ----
  const state = {
    scenarioId: 'baseline',
    toggles: { ports: true, factories: true, corridors: true, disruptions: true, labels: false }
  };

  // ---- DOM refs ----
  const el = id => document.getElementById(id);
  const scenarioSelect = el('scenario-select');
  const scenarioNarrative = el('scenario-narrative');
  const scenarioStats = el('scenario-stats');
  const infoPanel = el('info-panel');
  const infoBody = el('info-body');
  const signalFeed = el('signal-feed');
  const clockEl = el('clock');
  const loadingEl = el('loading');

  scenarios.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.shortLabel;
    scenarioSelect.appendChild(opt);
  });
  scenarioSelect.addEventListener('change', () => {
    state.scenarioId = scenarioSelect.value;
    render();
  });

  ['ports', 'factories', 'corridors', 'disruptions', 'labels'].forEach(key => {
    el(`toggle-${key}`).addEventListener('change', e => {
      state.toggles[key] = e.target.checked;
      render();
    });
  });
  state.toggles.labels = el('toggle-labels').checked;

  el('info-close').addEventListener('click', () => infoPanel.classList.add('hidden'));

  // ---- Globe setup ----
  const world = Globe()(el('globe'))
    .globeImageUrl('vendor/img/earth-blue-marble.jpg')
    .bumpImageUrl('vendor/img/earth-topology.png')
    .backgroundImageUrl('vendor/img/night-sky.png')
    .atmosphereColor('#3fd0ff')
    .atmosphereAltitude(0.18)
    .pointAltitude(0.012)
    .pointRadius(d => (d.kind === 'disruption' ? 0.28 + d.severity * 0.05 : d.kind === 'port' ? 0.45 : 0.35))
    .pointColor(pointColor)
    .pointLabel(pointTooltip)
    .pointsMerge(false)
    .onPointClick(showInfo)
    .arcColor(d => arcColorFor(d.status))
    .arcAltitude(0.22)
    .arcStroke(d => (d.status === 'reroute' ? 0.6 : d.status === 'disabled' ? 0.25 : 0.4))
    .arcDashLength(d => (d.status === 'reroute' ? 0.45 : 0.35))
    .arcDashGap(d => (d.status === 'reroute' ? 0.2 : 0.5))
    .arcDashAnimateTime(d => (d.status === 'reroute' || d.status === 'atrisk' ? 2200 : 5500))
    .arcLabel(d => `${d.lane || ''}${d.note ? ` — ${d.note}` : ''}`)
    .ringColor(d => ringColorFn(d))
    .ringMaxRadius(d => 2 + d.severity * 0.7)
    .ringPropagationSpeed(d => 1 + d.severity * 0.4)
    .ringRepeatPeriod(d => Math.max(500, 2400 - d.severity * 320))
    .labelText(d => d.name)
    .labelSize(d => (d.kind === 'port' ? 0.55 : 0.45))
    .labelColor(d => (d.kind === 'port' ? COLORS.port : COLORS.factory))
    .labelDotRadius(0)
    .labelAltitude(0.014)
    .onGlobeReady(() => loadingEl.classList.add('hidden'));

  world.pointOfView({ lat: 18, lng: 20, altitude: 2.3 }, 0);

  const controls = world.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;

  function resize() {
    const wrap = el('globe-wrap');
    world.width(wrap.clientWidth).height(wrap.clientHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Color helpers ----
  function arcColorFor(status) {
    switch (status) {
      case 'reroute': return COLORS.reroute;
      case 'atrisk': return COLORS.atrisk;
      case 'disabled': return COLORS.disabled;
      default: return COLORS.baseline;
    }
  }

  function ringColorFn(d) {
    const rgb = TYPE_RGB[d.type] || [255, 255, 255];
    return t => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, 1 - t)})`;
  }

  function pointColor(d) {
    if (d.kind === 'disruption') {
      const rgb = TYPE_RGB[d.type] || [255, 255, 255];
      return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    }
    if (d.isAltSupplier) return COLORS.altsupplier;
    if (d.isBuffer) return COLORS.buffer;
    return d.kind === 'port' ? COLORS.port : COLORS.factory;
  }

  function pointTooltip(d) {
    if (d.kind === 'disruption') {
      return `<div style="font:12px sans-serif;color:#fff"><b>${d.name}</b><br/>${d.type.toUpperCase()} · severity ${d.severity}/5</div>`;
    }
    const tag = d.kind === 'port' ? 'Port' : 'Factory';
    const extra = d.isBuffer ? ' · buffer active' : d.isAltSupplier ? ' · alt-supplier active' : '';
    return `<div style="font:12px sans-serif;color:#fff"><b>${d.name}</b><br/>${tag}${extra}</div>`;
  }

  // ---- Data builders ----
  function currentScenario() {
    return scenarios.find(s => s.id === state.scenarioId) || scenarios[0];
  }

  function buildArcs(scenario) {
    const disabledSet = new Set(scenario.disabledCorridors);
    const affected = new Set(disruptions.flatMap(d => d.affectsCorridors));
    const arcs = [];
    network.corridors.forEach(c => {
      const from = nodeById[c.from], to = nodeById[c.to];
      if (!from || !to) return;
      const status = disabledSet.has(c.id) ? 'disabled' : affected.has(c.id) ? 'atrisk' : 'normal';
      arcs.push({ ...c, startLat: from.lat, startLng: from.lng, endLat: to.lat, endLng: to.lng, status });
    });
    scenario.addedArcs.forEach(a => {
      const from = nodeById[a.from], to = nodeById[a.to];
      if (!from || !to) return;
      arcs.push({ ...a, startLat: from.lat, startLng: from.lng, endLat: to.lat, endLng: to.lng, status: 'reroute' });
    });
    return arcs;
  }

  function buildPoints(scenario) {
    const bufferMap = {};
    scenario.bufferSites.forEach(b => { bufferMap[b.portId] = b.note; });
    const altMap = {};
    scenario.alternateSuppliers.forEach(a => { altMap[a.factoryId] = a.note; });

    const pts = [];
    if (state.toggles.ports) {
      network.ports.forEach(p => {
        pts.push({ ...p, kind: 'port', isBuffer: !!bufferMap[p.id], bufferNote: bufferMap[p.id] || null });
      });
    }
    if (state.toggles.factories) {
      network.factories.forEach(f => {
        pts.push({ ...f, kind: 'factory', isAltSupplier: !!altMap[f.id], altNote: altMap[f.id] || null });
      });
    }
    if (state.toggles.disruptions) {
      disruptions.forEach(d => pts.push({ ...d, kind: 'disruption' }));
    }
    return pts;
  }

  function buildLabels() {
    if (!state.toggles.labels) return [];
    const labels = [];
    if (state.toggles.ports) network.ports.forEach(p => labels.push({ ...p, kind: 'port' }));
    if (state.toggles.factories) network.factories.forEach(f => labels.push({ ...f, kind: 'factory' }));
    return labels;
  }

  function buildRings() {
    if (!state.toggles.disruptions) return [];
    return disruptions;
  }

  // ---- Info panel ----
  function showInfo(d) {
    infoPanel.classList.remove('hidden');
    if (d.kind === 'disruption') {
      const lanes = d.affectsCorridors
        .map(id => network.corridors.find(c => c.id === id))
        .filter(Boolean)
        .map(c => c.lane);
      infoBody.innerHTML = `
        <span class="kind">${d.type} signal</span>
        <h3>${d.name}</h3>
        <p class="sev">Severity ${d.severity} / 5</p>
        <p>${d.description}</p>
        <p class="kv"><b>Affected lanes:</b> ${[...new Set(lanes)].join(', ') || 'none'}</p>
      `;
    } else if (d.kind === 'port') {
      infoBody.innerHTML = `
        <span class="kind">Port</span>
        <h3>${d.name}</h3>
        <p class="kv">Annual throughput: ${Number(d.throughputTEU).toLocaleString()} TEU</p>
        ${d.isBuffer ? `<p class="kv" style="color:${COLORS.buffer}"><b>Buffer stock active:</b> ${d.bufferNote}</p>` : ''}
      `;
    } else {
      const feeder = nodeById[d.feederPort];
      infoBody.innerHTML = `
        <span class="kind">Factory</span>
        <h3>${d.name}</h3>
        <p class="kv">Sector: ${d.sector}</p>
        <p class="kv">Feeder port: ${feeder ? feeder.name : d.feederPort}</p>
        ${d.isAltSupplier ? `<p class="kv" style="color:${COLORS.altsupplier}"><b>Alternate supplier active:</b> ${d.altNote}</p>` : ''}
      `;
    }
  }

  // ---- Scenario panel ----
  function renderScenarioPanel(scenario) {
    scenarioNarrative.textContent = scenario.narrative;
    const chips = [];
    if (scenario.extraTransitDays > 0) {
      chips.push(`<span class="stat-chip warn">+${scenario.extraTransitDays} days transit</span>`);
    } else {
      chips.push(`<span class="stat-chip good">On-schedule</span>`);
    }
    chips.push(`<span class="stat-chip">${scenario.disabledCorridors.length} lanes suspended</span>`);
    chips.push(`<span class="stat-chip good">${scenario.addedArcs.length} reroutes active</span>`);
    if (scenario.bufferSites.length) chips.push(`<span class="stat-chip good">${scenario.bufferSites.length} buffer sites</span>`);
    if (scenario.alternateSuppliers.length) chips.push(`<span class="stat-chip good">${scenario.alternateSuppliers.length} alt suppliers</span>`);
    scenarioStats.innerHTML = chips.join('');
  }

  // ---- Live signal feed (simulated) ----
  const feedTemplates = [
    n => `Monitoring update: severity holding for "${n}".`,
    n => `New satellite/AIS pass confirms elevated risk near "${n}".`,
    n => `Carrier advisory reiterated for "${n}".`,
    n => `Sensor network refreshed status for "${n}" — no material change.`
  ];

  function timeStr(date) {
    return date.toTimeString().slice(0, 8);
  }

  function addFeedItem(type, title, text) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="feed-time">${timeStr(new Date())}</span><span class="feed-type ${type}">${type}</span> — ${title}: ${text}`;
    signalFeed.prepend(li);
    while (signalFeed.children.length > 14) signalFeed.removeChild(signalFeed.lastChild);
  }

  function seedFeed() {
    signalFeed.innerHTML = '';
    [...disruptions].sort((a, b) => b.severity - a.severity).forEach(d => {
      addFeedItem(d.type, d.name, d.description);
    });
  }

  function tickFeed() {
    const d = disruptions[Math.floor(Math.random() * disruptions.length)];
    const template = feedTemplates[Math.floor(Math.random() * feedTemplates.length)];
    addFeedItem(d.type, d.name, template(d.name));
  }

  // ---- Clock ----
  function tickClock() {
    clockEl.textContent = timeStr(new Date());
  }
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(tickFeed, 6000);

  // ---- Main render ----
  function render() {
    const scenario = currentScenario();
    world
      .arcsData(state.toggles.corridors ? buildArcs(scenario) : [])
      .pointsData(buildPoints(scenario))
      .ringsData(buildRings())
      .labelsData(buildLabels());
    renderScenarioPanel(scenario);
  }

  seedFeed();
  render();
})();
