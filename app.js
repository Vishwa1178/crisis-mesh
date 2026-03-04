// =====================================================
// CRISISMESH v3 — MAIN APPLICATION LOGIC
// Powered by Firebase Firestore (real-time, persistent)
// =====================================================

import {
  loginUser, logoutUser, registerUser,
  listenIncidents, listenNeeds, listenVolunteers, listenCitizens,
  createIncident, updateIncident, deleteIncident,
  createNeed, updateNeed,
  updateVolunteer, deleteVolunteer,
  updateCitizen, deleteCitizen,
  matchVolunteersToNeed,
  seedInitialData,
} from './db.js';

// ─── APP STATE ────────────────────────────────────
const S = {
  user: null,
  incidents:  [],
  needs:      [],
  volunteers: [],
  citizens:   [],
  notifs:     [],
  maps:       {},
  repType:    null,
  repSev:     null,
  repMarker:  null,
  mapFilter:  'all',
  simRunning: false,
  feedFilter: 'all',
  unsubscribers: [],   // Firestore listeners
};

// ─── TYPE META ────────────────────────────────────
const TYPE_META = {
  flood:    { icon:'fa-water',               chip:'chip-flood'    },
  fire:     { icon:'fa-fire',                chip:'chip-fire'     },
  medical:  { icon:'fa-heartbeat',           chip:'chip-medical'  },
  accident: { icon:'fa-car-crash',           chip:'chip-accident' },
  power:    { icon:'fa-bolt',                chip:'chip-power'    },
  protest:  { icon:'fa-fist-raised',         chip:'chip-protest'  },
  natural:  { icon:'fa-cloud-showers-heavy', chip:'chip-natural'  },
  other:    { icon:'fa-exclamation-circle',  chip:'chip-other'    },
};

const avatarColors = [
  'linear-gradient(135deg,#4f8ef7,#a78bfa)',
  'linear-gradient(135deg,#f25a5a,#f5a623)',
  'linear-gradient(135deg,#27c47a,#4f8ef7)',
  'linear-gradient(135deg,#f5a623,#f25a5a)',
  'linear-gradient(135deg,#a78bfa,#27c47a)',
];

// =====================================================
// AUTH
// =====================================================
let loginRole = 'citizen';

window.selectLoginRole = function(role, el) {
  loginRole = role;
  document.querySelectorAll('.role-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
};

window.switchAuthTab = function(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
};

window.toggleSkillField = function() {
  const role = document.getElementById('regRole').value;
  document.getElementById('skillField').style.display = role === 'volunteer' ? 'block' : 'none';
};

window.handleLogin = async function() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!email || !password) { toast('Please fill in all fields', 'error'); return; }
  showLoader('Signing in...');
  try {
    const user = await loginUser(email, password);
    await enterApp(user);
  } catch (err) {
    hideLoader();
    toast(err.message || 'Login failed. Check credentials.', 'error');
  }
};

window.handleRegister = async function() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  const phone    = document.getElementById('regPhone').value.trim();
  const role     = document.getElementById('regRole').value;
  const zone     = document.getElementById('regZone').value;
  const skill    = document.getElementById('regSkill')?.value || 'General Aid';
  if (!name || !email || !password) { toast('Please fill required fields', 'error'); return; }
  showLoader('Creating account...');
  try {
    const user = await registerUser({ name, email, password, phone, role, zone, skill });
    await enterApp(user);
    toast(`Welcome to CrisisMesh, ${name}!`, 'success');
  } catch (err) {
    hideLoader();
    toast(err.message || 'Registration failed.', 'error');
  }
};

window.quickDemo = async function() {
  showLoader('Loading demo...');
  await enterApp({ id:'ADMIN001', name:'Demo Admin', email:'admin@crisismesh.com', role:'admin', trust:100 });
};

async function enterApp(user) {
  S.user = user;

  // Seed data on first load (only if Firestore is empty)
  try { await seedInitialData(); } catch(e) { console.warn('Seed skipped:', e.message); }

  // Start real-time listeners
  attachListeners();

  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainApp').classList.remove('hidden');

  const initials = user.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById('userDot').textContent = initials;
  document.getElementById('headerUserName').textContent = user.name;
  document.getElementById('headerUserRole').textContent = user.role.toUpperCase();

  // Admin-only nav items
  if (user.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  hideLoader();
  initApp();
  toast(`Welcome, ${user.name}!`, 'success');
}

window.handleLogout = async function() {
  // Detach all Firestore listeners
  S.unsubscribers.forEach(fn => fn());
  S.unsubscribers = [];
  try { await logoutUser(); } catch(e) {}
  location.reload();
};

// =====================================================
// FIRESTORE REAL-TIME LISTENERS
// =====================================================
function attachListeners() {
  const u1 = listenIncidents(data => {
    S.incidents = data;
    refreshAll();
  });
  const u2 = listenNeeds(data => {
    S.needs = data;
    refreshAll();
  });
  const u3 = listenVolunteers(data => {
    S.volunteers = data;
    refreshAll();
  });
  const u4 = listenCitizens(data => {
    S.citizens = data;
    refreshAll();
  });
  S.unsubscribers.push(u1, u2, u3, u4);
}

function refreshAll() {
  updateKPIs();
  updateNavBadges();
  updatePreviews();
  updateTicker();
  renderFeed();
  renderMiniMarkers();
  renderPriorityNeeds();
  renderTopVols();
  renderNeedsGrid();
  renderVolunteersGrid();
  renderCitizensGrid();
  checkEscalation();
  if (S.maps.main) renderMapMarkers();
}

// =====================================================
// APP INIT
// =====================================================
function initApp() {
  startClock();
  setGreeting();
  initMiniMap();
  setInterval(startClock, 1000);
  setInterval(() => { updateTicker(); }, 15000);
}

function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashGreeting').textContent =
    `${g}, ${S.user.name} · ${new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })}`;
}

// =====================================================
// CLOCK & TICKER
// =====================================================
function startClock() {
  const el = document.getElementById('headerClock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
}

function updateTicker() {
  const msgs = [
    ...S.incidents.slice(0,3).map(i => `${(i.type||'').toUpperCase()}: ${i.title} — ${i.location}`),
    `${S.volunteers.filter(v => v.available === true || v.available === 'true').length} volunteers active`,
    `${S.needs.filter(n => n.status === 'open').length} needs awaiting response`,
  ];
  const t = document.getElementById('tickerMsg');
  if (t) t.textContent = msgs.join('  ·  ');
  const s = document.getElementById('headerStatusText');
  if (s) s.textContent = `Network Online — ${S.incidents.filter(i=>i.status==='active').length} Active`;
}

// =====================================================
// KPIs
// =====================================================
function updateKPIs() {
  const active    = S.incidents.filter(i => i.status === 'active').length;
  const openNeeds = S.needs.filter(n => n.status === 'open').length;
  const completed = S.needs.filter(n => n.status === 'completed').length;
  const vols      = S.volunteers.filter(v => v.available === true || v.available === 'true').length;
  countUp('kpiActive',   active);
  countUp('kpiNeeds',    openNeeds);
  countUp('kpiResolved', completed);
  countUp('kpiVols',     vols);
}

function countUp(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur  = parseInt(el.textContent) || 0;
  const diff = target - cur;
  if (!diff) return;
  let step = 0;
  const t = setInterval(() => {
    step++;
    el.textContent = Math.round(cur + diff * step / 20);
    if (step >= 20) { el.textContent = target; clearInterval(t); }
  }, 20);
}

function updateNavBadges() {
  const mc = document.getElementById('navMapCount');
  const nc = document.getElementById('navNeedsCount');
  if (mc) mc.textContent = S.incidents.filter(i => i.status === 'active').length;
  if (nc) nc.textContent = S.needs.filter(n => n.status === 'open').length;
}

function updatePreviews() {
  const pi = document.getElementById('prevIncidents');
  const pv = document.getElementById('prevVolunteers');
  const pn = document.getElementById('prevNeeds');
  if (pi) pi.textContent = S.incidents.filter(i => i.status === 'active').length;
  if (pv) pv.textContent = S.volunteers.length;
  if (pn) pn.textContent = S.needs.filter(n => n.status === 'open').length;
}

// =====================================================
// VIEW NAVIGATION
// =====================================================
window.gotoView = function(viewId, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const view = document.getElementById('view-' + viewId);
  if (view) view.classList.add('active');
  if (btn) btn.classList.add('active');

  if (viewId === 'map')       { setTimeout(() => { S.maps.main?.invalidateSize(); renderMapMarkers(); }, 100); initMainMap(); }
  if (viewId === 'report')    initReportMap();
  if (viewId === 'analytics') renderAnalytics();
  if (viewId === 'needs')     renderNeedsGrid();
  if (viewId === 'volunteers')renderVolunteersGrid();
  if (viewId === 'citizens')  renderCitizensGrid();
};

// =====================================================
// ESCALATION
// =====================================================
function checkEscalation() {
  const radius = 0.04;
  const active = S.incidents.filter(i => i.status === 'active');
  let hasCluster = false;
  active.forEach(inc => {
    const nearby = active.filter(o =>
      o.id !== inc.id &&
      Math.abs((o.lat||0) - (inc.lat||0)) < radius &&
      Math.abs((o.lng||0) - (inc.lng||0)) < radius
    );
    if (nearby.length >= 1) hasCluster = true;
  });
  const alert = document.getElementById('escalationAlert');
  if (alert) {
    if (hasCluster) {
      alert.classList.remove('hidden');
    }
  }
}

// =====================================================
// INCIDENT FEED
// =====================================================
function renderFeed() {
  const list = document.getElementById('feedList');
  if (!list) return;
  let data = [...S.incidents];
  if (S.feedFilter === 'critical') data = data.filter(i => parseInt(i.severity) >= 4);
  if (S.feedFilter === 'active')   data = data.filter(i => i.status === 'active');

  list.innerHTML = data.map(inc => {
    const t   = TYPE_META[inc.type] || TYPE_META.other;
    const sev = parseInt(inc.severity) || 1;
    return `
    <div class="feed-item sev-${sev}" onclick="focusIncident('${inc.id}')">
      <div class="feed-row1">
        <span class="type-chip ${t.chip}"><i class="fas ${t.icon}"></i> ${(inc.type||'').toUpperCase()}</span>
        <span class="status-chip ${inc.status === 'active' ? 'stat-active' : 'stat-resolved'}">${inc.status}</span>
      </div>
      <div class="feed-title">${inc.title}</div>
      <div class="feed-meta">
        <span><i class="fas fa-map-marker-alt"></i>${inc.location}</span>
        <span><i class="fas fa-exclamation-circle"></i>Sev ${sev}/4</span>
        <span class="urg-score"><i class="fas fa-tachometer-alt"></i>${inc.urgency_score || (sev*2.5).toFixed(1)}</span>
      </div>
      ${S.user?.role === 'admin' ? `
      <div class="feed-admin-btns">
        <button class="btn-mini btn-resolve" onclick="event.stopPropagation();resolveIncident('${inc.id}')" ${inc.status==='resolved'?'disabled':''}>
          <i class="fas fa-check"></i> Resolve
        </button>
        <button class="btn-mini btn-delete-inc" onclick="event.stopPropagation();deleteIncidentById('${inc.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>` : ''}
    </div>`;
  }).join('') || '<p class="empty-msg">No incidents match this filter</p>';
}

window.filterFeed = function(type, el) {
  document.querySelectorAll('#feedTabs .tab-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  S.feedFilter = type;
  renderFeed();
};

window.focusIncident = function(id) {
  const inc = S.incidents.find(i => i.id === id);
  if (!inc) return;
  gotoView('map', document.querySelector('[data-view=map]'));
  setTimeout(() => {
    if (S.maps.main) { S.maps.main.setView([inc.lat||13.0827, inc.lng||80.2707], 15); showMapDetail(inc); }
  }, 200);
};

window.resolveIncident = async function(id) {
  try {
    await updateIncident(id, { status: 'resolved' });
    toast('Incident marked as resolved', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.deleteIncidentById = async function(id) {
  if (!confirm('Delete this incident? This cannot be undone.')) return;
  try {
    await deleteIncident(id);
    toast('Incident deleted', 'info');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// =====================================================
// MAPS
// =====================================================
function initMiniMap() {
  if (S.maps.mini) return;
  S.maps.mini = L.map('miniMap', { zoomControl:false, scrollWheelZoom:false, dragging:false, attributionControl:false })
    .setView([13.0827, 80.2707], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(S.maps.mini);
}

function renderMiniMarkers() {
  if (!S.maps.mini) return;
  if (S.maps.miniLg) S.maps.miniLg.clearLayers();
  S.maps.miniLg = L.layerGroup().addTo(S.maps.mini);
  S.incidents.forEach(inc => {
    if (inc.lat && inc.lng) {
      L.marker([inc.lat, inc.lng], { icon: makeIcon(inc) }).addTo(S.maps.miniLg);
    }
  });
}

function initMainMap() {
  if (S.maps.main) return;
  S.maps.main = L.map('mainMap', { zoomControl:true, attributionControl:false })
    .setView([13.0827, 80.2707], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(S.maps.main);
  renderMapMarkers();
}

function renderMapMarkers() {
  if (!S.maps.main) return;
  if (S.maps.mainLg) S.maps.mainLg.clearLayers();
  S.maps.mainLg = L.layerGroup().addTo(S.maps.main);
  const data = S.mapFilter === 'all' ? S.incidents : S.incidents.filter(i => i.type === S.mapFilter);
  data.forEach(inc => {
    if (!inc.lat || !inc.lng) return;
    L.marker([inc.lat, inc.lng], { icon: makeIcon(inc) })
      .addTo(S.maps.mainLg)
      .on('click', () => showMapDetail(inc));
  });
}

function makeIcon(inc) {
  const sev      = parseInt(inc.severity) || 1;
  const sevClass = ['','cm-low','cm-medium','cm-high','cm-critical'][sev] || 'cm-low';
  const t        = TYPE_META[inc.type] || TYPE_META.other;
  return L.divIcon({
    className: '',
    html: `<div class="cmap-marker ${sevClass}"><i class="fas ${t.icon}" style="font-size:12px;color:#fff"></i></div>`,
    iconSize: [30,30], iconAnchor: [15,15],
  });
}

function showMapDetail(inc) {
  const t         = TYPE_META[inc.type] || TYPE_META.other;
  const sev       = parseInt(inc.severity);
  const sevColors = ['','#4f8ef7','#27c47a','#f5a623','#f25a5a'];
  const relNeeds  = S.needs.filter(n => n.incident_id === inc.id);
  document.getElementById('mapDetail').innerHTML = `
    <div class="map-detail">
      <span class="type-chip ${t.chip}" style="margin-bottom:2px"><i class="fas ${t.icon}"></i> ${(inc.type||'').toUpperCase()}</span>
      <h4>${inc.title}</h4>
      <p>${inc.description || ''}</p>
      <div class="map-detail-meta">
        <div class="detail-row"><i class="fas fa-map-marker-alt"></i>${inc.location}</div>
        <div class="detail-row"><i class="fas fa-signal"></i>Severity: <strong style="color:${sevColors[sev]}">${['','Low','Medium','High','Critical'][sev]}</strong></div>
        <div class="detail-row"><i class="fas fa-tachometer-alt"></i>Urgency Score: <strong>${inc.urgency_score}</strong></div>
        <div class="detail-row"><i class="fas fa-hands-helping"></i>${relNeeds.length} needs posted</div>
        <div class="detail-row"><i class="fas fa-circle" style="color:${inc.status==='active'?'#27c47a':'#4f8ef7'}"></i>${inc.status}</div>
      </div>
      <div class="map-detail-btns">
        <button class="btn-primary" onclick="openNeedForm('${inc.id}')"><i class="fas fa-plus"></i> Add Need</button>
        <button class="btn-outline" onclick="gotoView('needs', document.querySelector('[data-view=needs]'))"><i class="fas fa-list"></i> View Needs</button>
        ${S.user?.role==='admin' ? `<button class="btn-outline" onclick="resolveIncident('${inc.id}')"><i class="fas fa-check"></i> Resolve</button>` : ''}
      </div>
    </div>`;
}

window.setMapFilter = function(type, el) {
  document.querySelectorAll('#mapFilterRow .filter-tag').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  S.mapFilter = type;
  renderMapMarkers();
};

function initReportMap() {
  if (S.maps.report) { S.maps.report.invalidateSize(); return; }
  S.maps.report = L.map('reportMapBox', { zoomControl:false, attributionControl:false })
    .setView([13.0827, 80.2707], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(S.maps.report);
  S.maps.report.on('click', e => {
    if (S.repMarker) S.maps.report.removeLayer(S.repMarker);
    S.repMarker = L.marker(e.latlng).addTo(S.maps.report);
    document.getElementById('repGPS').value = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
  });
}

// =====================================================
// REPORT INCIDENT
// =====================================================
window.pickType = function(type, el) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active'); S.repType = type;
};

window.pickSev = function(val, el) {
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active'); S.repSev = val;
};

window.detectGPS = function() {
  if (!navigator.geolocation) { toast('GPS not supported', 'error'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    document.getElementById('repGPS').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (S.maps.report) {
      S.maps.report.setView([lat, lng], 14);
      if (S.repMarker) S.maps.report.removeLayer(S.repMarker);
      S.repMarker = L.marker([lat, lng]).addTo(S.maps.report);
    }
    toast('GPS detected!', 'success');
  }, () => { toast('Could not get GPS — click map to set location', 'info'); });
};

window.submitReport = async function() {
  const title    = document.getElementById('repTitle').value.trim();
  const desc     = document.getElementById('repDesc').value.trim();
  const location = document.getElementById('repLocation').value.trim();
  const gps      = document.getElementById('repGPS').value.trim();

  if (!S.repType)  { toast('Please select an incident type', 'error'); return; }
  if (!S.repSev)   { toast('Please select severity level', 'error'); return; }
  if (!title)      { toast('Please enter a title', 'error'); return; }
  if (!location)   { toast('Please enter the location', 'error'); return; }

  let lat = 13.0827 + (Math.random()-0.5)*0.1;
  let lng = 80.2707 + (Math.random()-0.5)*0.1;
  if (gps) {
    const p = gps.split(',');
    if (p.length === 2) { lat = parseFloat(p[0]); lng = parseFloat(p[1]); }
  }
  if (S.repMarker) { const ll = S.repMarker.getLatLng(); lat = ll.lat; lng = ll.lng; }

  showLoader('Broadcasting incident...');
  try {
    const inc = await createIncident({
      type: S.repType, title, description: desc, severity: S.repSev,
      location, lat, lng,
      reported_by: S.user.id,
      reported_by_name: S.user.name,
    });
    clearReport();
    hideLoader();
    toast('Incident broadcast to the network!', 'success');
    addNotif(`New incident: ${inc.title}`, 'red');
    gotoView('dashboard', document.querySelector('[data-view=dashboard]'));
  } catch(e) {
    hideLoader();
    toast('Error: ' + e.message, 'error');
  }
};

window.clearReport = function() {
  document.getElementById('repTitle').value    = '';
  document.getElementById('repDesc').value     = '';
  document.getElementById('repLocation').value = '';
  document.getElementById('repGPS').value      = '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  S.repType = null; S.repSev = null;
};

// =====================================================
// NEEDS
// =====================================================
window.openNeedForm = function(incidentId) {
  const sel = document.getElementById('needIncidentSel');
  sel.innerHTML = S.incidents.map(i =>
    `<option value="${i.id}" ${i.id === incidentId ? 'selected' : ''}>${i.title}</option>`
  ).join('');
  document.getElementById('needModal').classList.remove('hidden');
};

window.closeNeedForm = function() {
  document.getElementById('needModal').classList.add('hidden');
};

window.submitNeed = async function() {
  const incident_id = document.getElementById('needIncidentSel').value;
  const category    = document.getElementById('needCat').value;
  const urgency     = document.getElementById('needUrg').value;
  const description = document.getElementById('needDesc').value.trim();
  const quantity    = document.getElementById('needQty').value;
  if (!description) { toast('Please enter a description', 'error'); return; }

  showLoader('Posting need...');
  try {
    const need = await createNeed({
      incident_id, category, urgency, description, quantity,
      posted_by: S.user.id,
      posted_by_name: S.user.name,
    });
    closeNeedForm();
    hideLoader();
    toast('Need posted! Matching volunteers...', 'success');
    setTimeout(() => autoMatch(need), 1500);
  } catch(e) {
    hideLoader();
    toast('Error: ' + e.message, 'error');
  }
};

async function autoMatch(need) {
  const candidates = await matchVolunteersToNeed(need, S.volunteers);
  const best       = candidates[0];
  if (!best) return;
  try {
    await updateNeed(need.id, { status:'assigned', assigned_to: best.id, assigned_name: best.name });
    addNotif(`${best.name} matched to: ${need.description.slice(0,40)}`, 'blue');
    toast(`${best.name} auto-matched to this need!`, 'success');
  } catch(e) {}
}

let needFilter = 'all';
window.filterNeeds = function(type, el) {
  document.querySelectorAll('#needsFilterRow .filter-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  needFilter = type;
  renderNeedsGrid();
};

function renderNeedsGrid() {
  const grid = document.getElementById('needsGrid');
  if (!grid) return;
  let data   = [...S.needs];
  const cats = ['food','medical','rescue','shelter','transport','power','other'];
  if (cats.includes(needFilter)) data = data.filter(n => n.category === needFilter);
  else if (['open','assigned','in-progress','completed'].includes(needFilter)) data = data.filter(n => n.status === needFilter);

  const catIcons = { food:'utensils', medical:'heartbeat', rescue:'life-ring', shelter:'home', transport:'truck', power:'bolt', other:'question-circle' };

  grid.innerHTML = data.map(n => {
    const inc        = S.incidents.find(i => i.id === n.incident_id);
    const urg        = parseInt(n.urgency) || 1;
    const assignedVol= S.volunteers.find(v => v.id === n.assigned_to);
    const assignedName = n.assigned_name || assignedVol?.name || '';
    let actions = '';
    if (n.status === 'open') {
      actions = `<div class="need-card-btns">
        <button class="btn-accept" onclick="acceptNeed('${n.id}')"><i class="fas fa-check"></i> Accept</button>
        ${S.user?.role==='admin'?`<button class="btn-mini btn-delete-inc" onclick="deleteNeedById('${n.id}')"><i class="fas fa-trash"></i></button>`:''}
      </div>`;
    } else if (n.status === 'assigned' || n.status === 'in-progress') {
      actions = `<div class="need-card-btns">
        <button class="btn-complete-need" onclick="completeNeed('${n.id}')"><i class="fas fa-flag-checkered"></i> Mark Complete</button>
      </div>`;
    }
    const dots  = [1,2,3,4].map(i => `<div class="urg-d ${i<=urg?'u'+urg:''}"></div>`).join('');
    const score = urg * 2.5 + Math.min(parseInt(n.quantity)||1, 10)*0.3;
    return `
    <div class="need-card status-${n.status}">
      <div class="need-card-top">
        <span class="cat-badge cat-${n.category}"><i class="fas fa-${catIcons[n.category]||'question'}"></i> ${n.category}</span>
        <span class="need-status st-${n.status}">${n.status.replace('-',' ')}</span>
      </div>
      <div class="need-title">${n.description}</div>
      <div class="need-info">
        <span><i class="fas fa-layer-group"></i>Qty: ${n.quantity}</span>
        <span><i class="fas fa-map-marker-alt"></i>${inc?.location||'Unknown'}</span>
        ${assignedName ? `<span><i class="fas fa-user-check"></i>${assignedName}</span>` : ''}
      </div>
      <div class="need-footer">
        <div class="urgency-dots">${dots}</div>
        <span class="urg-score"><i class="fas fa-calculator"></i>${score.toFixed(1)}</span>
      </div>
      ${actions}
    </div>`;
  }).join('') || '<p class="empty-msg" style="grid-column:1/-1">No needs found for this filter</p>';
}

window.acceptNeed = async function(id) {
  const need = S.needs.find(n => n.id === id);
  if (!need) return;
  try {
    await updateNeed(id, { status:'in-progress', assigned_to: S.user.id, assigned_name: S.user.name });
    toast('You accepted this task!', 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.completeNeed = async function(id) {
  const need = S.needs.find(n => n.id === id);
  if (!need) return;
  try {
    await updateNeed(id, { status:'completed', assigned_to: need.assigned_to });
    toast('🎉 Task completed! Great work!', 'success');
    addNotif(`Need completed: ${need.description.slice(0,40)}`, 'green');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.deleteNeedById = async function(id) {
  if (!confirm('Delete this need?')) return;
  try {
    const { deleteDoc, doc } = await import('./firebase-config.js');
    // We'll use updateNeed with a deleted flag or just leave it
    await updateNeed(id, { status: 'deleted' });
    toast('Need removed', 'info');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

function renderPriorityNeeds() {
  const el = document.getElementById('priorityNeedsList');
  if (!el) return;
  const catColors = {
    food:['#27c47a','var(--green-g)'], medical:['#f25a5a','var(--red-g)'],
    rescue:['#f5a623','var(--amber-g)'], shelter:['#4f8ef7','var(--accent-g)'],
    power:['#ffe082','rgba(255,224,130,0.1)'], transport:['#a78bfa','rgba(167,139,250,0.1)'],
    other:['#8896b3','rgba(136,150,179,0.1)']
  };
  const catIcons = { food:'utensils', medical:'heartbeat', rescue:'life-ring', shelter:'home', transport:'truck', power:'bolt', other:'question-circle' };
  const sorted   = [...S.needs].filter(n => n.status !== 'completed' && n.status !== 'deleted')
    .sort((a,b) => (parseInt(b.urgency)*2.5) - (parseInt(a.urgency)*2.5)).slice(0,5);

  el.innerHTML = sorted.map(n => {
    const [col, bg] = catColors[n.category] || catColors.other;
    const score     = (parseInt(n.urgency)||1) * 2.5;
    return `
    <div class="prio-item">
      <div class="prio-cat-icon" style="background:${bg};color:${col}"><i class="fas fa-${catIcons[n.category]||'question'}"></i></div>
      <div class="prio-info">
        <div class="prio-desc">${n.description.slice(0,50)}${n.description.length>50?'...':''}</div>
        <div class="prio-meta">${n.category} · Qty ${n.quantity} · ${n.status}</div>
      </div>
      <div class="prio-score">${score.toFixed(0)}</div>
    </div>`;
  }).join('') || '<p class="empty-msg">All needs resolved!</p>';
}

// =====================================================
// VOLUNTEERS
// =====================================================
let volSearchQuery = '';
window.searchVols = function(q) { volSearchQuery = q.toLowerCase(); renderVolunteersGrid(); };

function renderVolunteersGrid() {
  const grid = document.getElementById('volsGrid');
  if (!grid) return;
  const vols = S.volunteers.filter(v =>
    !volSearchQuery ||
    (v.name||'').toLowerCase().includes(volSearchQuery) ||
    (v.zone||'').toLowerCase().includes(volSearchQuery) ||
    (v.skill||'').toLowerCase().includes(volSearchQuery)
  );

  grid.innerHTML = vols.map((v, i) => {
    const initials = (v.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const avail    = v.available === true || v.available === 'true';
    const trust    = parseInt(v.trust) || 0;
    return `
    <div class="person-card">
      ${v.verified ? '<span class="verified-badge">✓ Verified</span>' : ''}
      <div class="person-avatar" style="background:${avatarColors[i%avatarColors.length]}">${initials}</div>
      <div class="person-name">${v.name}</div>
      <div class="person-sub">${v.skill}</div>
      <div class="person-zone"><i class="fas fa-map-marker-alt"></i> ${v.zone}</div>
      <div class="person-stats">
        <div class="pstat"><div class="pstat-num" style="color:var(--accent)">${v.tasks_completed||0}</div><div class="pstat-label">Tasks</div></div>
        <div class="pstat"><div class="pstat-num" style="color:var(--amber)">${v.rating||'N/A'}</div><div class="pstat-label">Rating</div></div>
        <div class="pstat"><div class="pstat-num" style="color:var(--teal)">${trust}</div><div class="pstat-label">Trust</div></div>
      </div>
      <div class="trust-bar-wrap"><div class="trust-bar-fill" style="width:${trust}%"></div></div>
      <span class="avail-tag ${avail ? 'avail-yes' : 'avail-no'}">${avail ? '● Available' : '○ Busy'}</span>
      ${S.user?.role === 'admin' ? `
      <div class="admin-vol-btns">
        <button class="btn-mini" onclick="toggleVolAvailability('${v.id}',${avail})">${avail ? 'Set Busy' : 'Set Available'}</button>
        <button class="btn-mini" onclick="verifyVolunteer('${v.id}',${!!v.verified})">${v.verified?'Unverify':'Verify'}</button>
        <button class="btn-mini btn-delete-inc" onclick="removeVolunteer('${v.id}')"><i class="fas fa-trash"></i></button>
      </div>` : ''}
    </div>`;
  }).join('') || '<p class="empty-msg" style="grid-column:1/-1">No volunteers found</p>';
}

window.toggleVolAvailability = async function(id, isAvail) {
  try {
    await updateVolunteer(id, { available: !isAvail });
    toast('Volunteer availability updated', 'info');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.verifyVolunteer = async function(id, isVerified) {
  try {
    await updateVolunteer(id, { verified: !isVerified });
    toast(`Volunteer ${isVerified ? 'unverified' : 'verified'}`, 'success');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

window.removeVolunteer = async function(id) {
  if (!confirm('Remove this volunteer from the database?')) return;
  try {
    await deleteVolunteer(id);
    toast('Volunteer removed', 'info');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

function renderTopVols() {
  const el = document.getElementById('topVolsList');
  if (!el) return;
  const top = [...S.volunteers].sort((a,b) => parseInt(b.trust)-parseInt(a.trust)).slice(0,5);
  el.innerHTML = top.map((v, i) => {
    const initials = (v.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const avail    = v.available === true || v.available === 'true';
    return `
    <div class="topvol-row">
      <div class="topvol-avatar" style="background:${avatarColors[i%avatarColors.length]}">${initials}</div>
      <div class="topvol-info">
        <div class="topvol-name">${v.name}</div>
        <div class="topvol-skill">${v.skill} · ${v.zone}</div>
      </div>
      <div class="topvol-trust"><i class="fas fa-star"></i>${v.trust}</div>
      ${v.verified ? '<span class="topvol-tag">Verified</span>' : ''}
      ${avail ? '<span class="topvol-tag" style="background:rgba(79,142,247,0.1);border-color:rgba(79,142,247,0.2);color:var(--accent)">Available</span>' : ''}
    </div>`;
  }).join('');
}

// =====================================================
// CITIZENS
// =====================================================
let citSearchQuery = '';
window.searchCitizens = function(q) { citSearchQuery = q.toLowerCase(); renderCitizensGrid(); };

function renderCitizensGrid() {
  const grid = document.getElementById('citizensGrid');
  if (!grid) return;
  const citizens = S.citizens.filter(c =>
    !citSearchQuery ||
    (c.name||'').toLowerCase().includes(citSearchQuery) ||
    (c.zone||'').toLowerCase().includes(citSearchQuery)
  );

  grid.innerHTML = citizens.map((c, i) => {
    const initials = (c.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    return `
    <div class="person-card">
      <div class="person-avatar" style="background:${avatarColors[i%avatarColors.length]}">${initials}</div>
      <div class="person-name">${c.name}</div>
      <div class="person-sub"><i class="fas fa-user" style="font-size:10px"></i> Citizen</div>
      <div class="person-zone"><i class="fas fa-map-marker-alt"></i> ${c.zone}</div>
      <div class="person-stats">
        <div class="pstat"><div class="pstat-num" style="color:var(--red)">${c.incidents_reported||0}</div><div class="pstat-label">Reports</div></div>
        <div class="pstat"><div class="pstat-num" style="color:var(--teal)">${c.trust||0}</div><div class="pstat-label">Trust</div></div>
        <div class="pstat"><div class="pstat-num" style="color:var(--t2);font-size:11px">${(c.joined||'—').slice(0,7)}</div><div class="pstat-label">Joined</div></div>
      </div>
      <div class="trust-bar-wrap"><div class="trust-bar-fill" style="width:${c.trust||0}%"></div></div>
      ${S.user?.role === 'admin' ? `
      <div class="admin-vol-btns">
        <button class="btn-mini btn-delete-inc" onclick="removeCitizen('${c.id}')"><i class="fas fa-trash"></i> Remove</button>
      </div>` : ''}
    </div>`;
  }).join('') || '<p class="empty-msg" style="grid-column:1/-1">No citizens found</p>';
}

window.removeCitizen = async function(id) {
  if (!confirm('Remove this citizen?')) return;
  try {
    await deleteCitizen(id);
    toast('Citizen removed', 'info');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
};

// =====================================================
// ANALYTICS
// =====================================================
const chartDefaults = {
  responsive: true,
  plugins: {
    legend: { labels: { color:'#8896b3', font:{ family:'JetBrains Mono', size:11 }, padding:16 } }
  },
  scales: {
    x: { ticks:{ color:'#4a5a7a', font:{ family:'JetBrains Mono', size:10 } }, grid:{ color:'rgba(255,255,255,0.04)' } },
    y: { ticks:{ color:'#4a5a7a', font:{ family:'JetBrains Mono', size:10 } }, grid:{ color:'rgba(255,255,255,0.04)' } },
  }
};

function renderAnalytics() {
  const hours    = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}:00`);
  const timeData = hours.map(() => Math.floor(Math.random()*4));
  killChart('chartTimeline');
  new Chart(document.getElementById('chartTimeline'), {
    type:'line',
    data:{ labels:hours, datasets:[{ label:'Incidents', data:timeData, borderColor:'#4f8ef7', backgroundColor:'rgba(79,142,247,0.08)', tension:0.4, fill:true, pointRadius:2 }] },
    options: { ...chartDefaults }
  });

  const types = {};
  S.incidents.forEach(i => { types[i.type] = (types[i.type]||0)+1; });
  killChart('chartType');
  new Chart(document.getElementById('chartType'), {
    type:'doughnut',
    data:{ labels:Object.keys(types).map(t=>t.toUpperCase()), datasets:[{ data:Object.values(types), backgroundColor:['#29b6f6','#f5a623','#f25a5a','#a78bfa','#ffe082','#27c47a','#4f8ef7','#8896b3'], borderWidth:0 }] },
    options:{ responsive:true, plugins:{ legend:{ labels:{ color:'#8896b3', font:{family:'JetBrains Mono',size:10} } } } }
  });

  const stCounts = { open:0, assigned:0, 'in-progress':0, completed:0 };
  S.needs.forEach(n => { if (stCounts[n.status] !== undefined) stCounts[n.status]++; });
  killChart('chartNeedStatus');
  new Chart(document.getElementById('chartNeedStatus'), {
    type:'bar',
    data:{ labels:['Open','Assigned','In Progress','Completed'], datasets:[{ label:'Needs', data:Object.values(stCounts), backgroundColor:['rgba(79,142,247,0.7)','rgba(245,166,35,0.7)','rgba(245,166,35,0.5)','rgba(39,196,122,0.7)'], borderRadius:6 }] },
    options:{ ...chartDefaults }
  });

  const sevs = [1,2,3,4].map(s => S.incidents.filter(i=>parseInt(i.severity)===s).length);
  killChart('chartSeverity');
  new Chart(document.getElementById('chartSeverity'), {
    type:'polarArea',
    data:{ labels:['Low','Medium','High','Critical'], datasets:[{ data:sevs, backgroundColor:['rgba(79,142,247,0.5)','rgba(39,196,122,0.5)','rgba(245,166,35,0.5)','rgba(242,90,90,0.5)'], borderWidth:0 }] },
    options:{ responsive:true, plugins:{ legend:{ labels:{ color:'#8896b3', font:{family:'JetBrains Mono',size:10} } } } }
  });

  killChart('chartVols');
  new Chart(document.getElementById('chartVols'), {
    type:'bar',
    data:{
      labels: S.volunteers.slice(0,6).map(v=>(v.name||'').split(' ')[0]),
      datasets:[{ label:'Tasks Completed', data:S.volunteers.slice(0,6).map(v=>parseInt(v.tasks_completed)||0), backgroundColor:'rgba(0,212,170,0.5)', borderColor:'rgba(0,212,170,0.8)', borderWidth:1, borderRadius:4 }]
    },
    options:{ ...chartDefaults }
  });

  const resolved = S.needs.filter(n=>n.status==='completed').length;
  const resRate  = S.needs.length ? Math.round(resolved/S.needs.length*100) : 0;
  document.getElementById('intelGrid').innerHTML = [
    { label:'Total Incidents',      value: S.incidents.length },
    { label:'Active Incidents',     value: S.incidents.filter(i=>i.status==='active').length },
    { label:'Open Needs',           value: S.needs.filter(n=>n.status==='open').length },
    { label:'Resolution Rate',      value: resRate + '%' },
    { label:'Critical Incidents',   value: S.incidents.filter(i=>parseInt(i.severity)===4).length },
    { label:'Available Volunteers', value: S.volunteers.filter(v=>v.available===true||v.available==='true').length },
    { label:'Verified Volunteers',  value: S.volunteers.filter(v=>v.verified===true||v.verified==='true').length },
    { label:'Total Citizens',       value: S.citizens.length },
  ].map(item => `<div class="intel-item"><div class="intel-label">${item.label}</div><div class="intel-value">${item.value}</div></div>`).join('');
}

function killChart(id) {
  const c = document.getElementById(id);
  if (!c) return;
  const ex = Chart.getChart(c);
  if (ex) ex.destroy();
}

// =====================================================
// NOTIFICATIONS
// =====================================================
function addNotif(msg, type = 'blue') {
  const colorMap = { red:'var(--red)', blue:'var(--accent)', green:'var(--green)', amber:'var(--amber)' };
  const color    = colorMap[type] || 'var(--accent)';
  S.notifs.unshift({ msg, time: new Date(), color });
  renderNotifs();
  const badge = document.getElementById('notifBadge');
  badge.style.display = 'flex';
  badge.textContent   = Math.min(S.notifs.length, 99);
}

function renderNotifs() {
  const el = document.getElementById('notifItems');
  if (!el) return;
  if (!S.notifs.length) { el.innerHTML = '<p class="empty-msg">No notifications</p>'; return; }
  el.innerHTML = S.notifs.map(n => `
    <div class="notif-item" style="border-left:3px solid ${n.color}">
      <div>${n.msg}</div>
      <div class="notif-time">${timeAgo(n.time)}</div>
    </div>`).join('');
}

window.clearNotifs = function() {
  S.notifs = [];
  document.getElementById('notifBadge').style.display = 'none';
  renderNotifs();
};

window.toggleNotif = function() {
  const panel = document.getElementById('notifDropdown');
  panel.classList.toggle('hidden');
  renderNotifs();
};

document.addEventListener('click', e => {
  const panel = document.getElementById('notifDropdown');
  const btn   = document.getElementById('notifToggle');
  if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !btn?.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

// =====================================================
// SIMULATION (adds to Firestore)
// =====================================================
window.runSimulation = function() {
  if (S.simRunning) return;
  S.simRunning = true;
  document.getElementById('simModal').classList.remove('hidden');
  const steps = [
    {p:10, m:'Initializing crisis scenario...'},
    {p:25, m:'Generating incidents...'},
    {p:50, m:'Creating needs...'},
    {p:75, m:'Running urgency scoring...'},
    {p:90, m:'Syncing to Firebase...'},
    {p:100, m:'Simulation complete!'},
  ];
  let i = 0;
  const run = () => {
    if (i >= steps.length) { finishSim(); return; }
    document.getElementById('simBar').style.width = steps[i].p + '%';
    document.getElementById('simMsg').textContent = steps[i].m;
    i++; setTimeout(run, 600);
  };
  run();
};

async function finishSim() {
  const locs  = [[13.09,80.25],[13.07,80.29],[13.11,80.26],[13.06,80.27],[13.08,80.30]];
  const types = ['flood','fire','medical','accident','power'];
  const cats  = ['food','medical','rescue','shelter'];

  for (let i = 0; i < locs.length; i++) {
    const type = types[i % types.length];
    const sev  = Math.ceil(Math.random() * 4);
    try {
      const inc = await createIncident({
        type, severity: sev,
        title: `[SIM] ${type.toUpperCase()} Incident Zone ${i+1}`,
        description: 'Simulated crisis for demonstration.',
        location: `Sim Zone ${i+1}`,
        lat: locs[i][0] + (Math.random()-0.5)*0.01,
        lng: locs[i][1] + (Math.random()-0.5)*0.01,
        reported_by: 'SIM',
      });
      await createNeed({
        incident_id: inc.id,
        category: cats[Math.floor(Math.random()*cats.length)],
        description: `Simulated need for ${inc.title}`,
        urgency: Math.ceil(Math.random()*4),
        quantity: Math.ceil(Math.random()*20),
        posted_by: 'SIM',
      });
    } catch(e) {}
  }

  setTimeout(() => {
    document.getElementById('simModal').classList.add('hidden');
    S.simRunning = false;
    toast('Simulation complete! Data saved to Firebase.', 'success');
    addNotif('SIMULATION: Crisis scenarios deployed to Firestore', 'red');
  }, 500);
}

window.abortSim = function() {
  S.simRunning = false;
  document.getElementById('simModal').classList.add('hidden');
  toast('Simulation aborted', 'info');
};

// =====================================================
// TOAST & LOADER
// =====================================================
window.toast = function(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3200);
};

function showLoader(msg = 'Loading...') {
  let ld = document.getElementById('globalLoader');
  if (!ld) {
    ld = document.createElement('div');
    ld.id = 'globalLoader';
    ld.innerHTML = `<div class="loader-inner"><i class="fas fa-satellite-dish fa-spin"></i><span id="loaderMsg"></span></div>`;
    document.body.appendChild(ld);
  }
  document.getElementById('loaderMsg').textContent = msg;
  ld.style.display = 'flex';
}

function hideLoader() {
  const ld = document.getElementById('globalLoader');
  if (ld) ld.style.display = 'none';
}

// =====================================================
// UTILS
// =====================================================
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (!S.user) return;
  if (e.key === 'r' && e.ctrlKey) { e.preventDefault(); gotoView('report', document.querySelector('[data-view=report]')); }
  if (e.key === 'm' && e.ctrlKey) { e.preventDefault(); gotoView('map',    document.querySelector('[data-view=map]'));    }
  if (e.key === 'Escape') {
    document.getElementById('needModal').classList.add('hidden');
    document.getElementById('notifDropdown').classList.add('hidden');
  }
});
