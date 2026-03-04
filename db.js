// =====================================================
// CRISISMESH — FIREBASE DATABASE SERVICE
// All Firestore CRUD operations live here
// =====================================================

import {
  db, auth,
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, onSnapshot, query, orderBy,
  serverTimestamp, where,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut
} from './firebase-config.js';

// ─── COLLECTION NAMES ───────────────────────────────
const COLS = {
  incidents:  'incidents',
  needs:      'needs',
  volunteers: 'volunteers',
  citizens:   'citizens',
  users:      'users',
};

// ─── HELPER ─────────────────────────────────────────
function generateId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

function cleanObj(obj) {
  // Remove undefined values before writing to Firestore
  return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

// =====================================================
// REAL-TIME LISTENERS (data stays live)
// =====================================================

function onSnapErr(name) {
  return (err) => {
    console.error(`[${name}] Firestore error:`, err.code, err.message);
    if (err.code === 'permission-denied') {
      showFirestoreRulesWarning();
    }
  };
}

function showFirestoreRulesWarning() {
  // Only show once
  if (document.getElementById('rulesWarning')) return;
  const div = document.createElement('div');
  div.id = 'rulesWarning';
  div.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;background:#f25a5a;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-family:monospace;max-width:520px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.4)';
  div.innerHTML = `⚠️ <strong>Firestore permission denied.</strong><br>Go to Firebase Console → Firestore → <strong>Rules</strong> tab and paste:<br><br>
<code style="background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;display:block;margin-top:6px">
allow read, write: if true;
</code><br>Then click <strong>Publish</strong>. <button onclick="this.parentElement.remove()" style="margin-left:10px;background:rgba(255,255,255,0.2);border:none;color:#fff;padding:4px 10px;border-radius:6px;cursor:pointer">✕</button>`;
  document.body.appendChild(div);
}

export function listenIncidents(callback) {
  const q = query(collection(db, COLS.incidents), orderBy('created_at', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onSnapErr('incidents'));
}

export function listenNeeds(callback) {
  const q = query(collection(db, COLS.needs), orderBy('created_at', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onSnapErr('needs'));
}

export function listenVolunteers(callback) {
  const q = query(collection(db, COLS.volunteers), orderBy('trust', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onSnapErr('volunteers'));
}

export function listenCitizens(callback) {
  const q = query(collection(db, COLS.citizens), orderBy('joined', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onSnapErr('citizens'));
}

// =====================================================
// INCIDENTS
// =====================================================

export async function createIncident(data) {
  const payload = cleanObj({
    type:         data.type,
    title:        data.title,
    description:  data.description || '',
    severity:     Number(data.severity) || 1,
    location:     data.location || '',
    lat:          Number(data.lat) || 13.0827,
    lng:          Number(data.lng) || 80.2707,
    status:       'active',
    reported_by:  data.reported_by || 'anonymous',
    reported_by_name: data.reported_by_name || '',
    urgency_score: Number((Number(data.severity) * 2.5).toFixed(1)),
    created_at:   serverTimestamp(),
  });
  const ref = await addDoc(collection(db, COLS.incidents), payload);
  // Increment citizen's incidents_reported count
  if (data.reported_by && data.reported_by !== 'anonymous') {
    try {
      const citRef = doc(db, COLS.citizens, data.reported_by);
      const snap = await getDoc(citRef);
      if (snap.exists()) {
        await updateDoc(citRef, { incidents_reported: (snap.data().incidents_reported || 0) + 1 });
      }
    } catch(e) { /* citizen may be a volunteer */ }
  }
  return { id: ref.id, ...payload };
}

export async function updateIncident(id, data) {
  await updateDoc(doc(db, COLS.incidents, id), cleanObj(data));
}

export async function deleteIncident(id) {
  await deleteDoc(doc(db, COLS.incidents, id));
}

// =====================================================
// NEEDS
// =====================================================

export async function createNeed(data) {
  const payload = cleanObj({
    incident_id:  data.incident_id,
    category:     data.category || 'other',
    description:  data.description,
    urgency:      Number(data.urgency) || 1,
    quantity:     Number(data.quantity) || 1,
    status:       'open',
    assigned_to:  '',
    assigned_name:'',
    posted_by:    data.posted_by || '',
    posted_by_name: data.posted_by_name || '',
    created_at:   serverTimestamp(),
  });
  const ref = await addDoc(collection(db, COLS.needs), payload);
  return { id: ref.id, ...payload };
}

export async function updateNeed(id, data) {
  const updates = cleanObj(data);
  // When completing, boost volunteer trust & task count
  if (data.status === 'completed' && data.assigned_to) {
    try {
      const volRef = doc(db, COLS.volunteers, data.assigned_to);
      const snap = await getDoc(volRef);
      if (snap.exists()) {
        const v = snap.data();
        await updateDoc(volRef, {
          tasks_completed: (v.tasks_completed || 0) + 1,
          trust: Math.min(100, (v.trust || 0) + 3),
        });
      }
    } catch(e) {}
  }
  await updateDoc(doc(db, COLS.needs, id), updates);
}

// =====================================================
// VOLUNTEERS
// =====================================================

export async function createVolunteer(data, uid) {
  const id = uid || generateId('VOL');
  const payload = cleanObj({
    name:            data.name,
    email:           data.email,
    phone:           data.phone || '',
    skill:           data.skill || 'General Aid',
    zone:            data.zone || 'Unknown',
    trust:           10,
    tasks_completed: 0,
    available:       true,
    verified:        false,
    rating:          0.0,
    lat:             13.0827,
    lng:             80.2707,
    joined:          new Date().toISOString().split('T')[0],
    role:            'volunteer',
  });
  await setDoc(doc(db, COLS.volunteers, id), payload);
  return { id, ...payload };
}

export async function updateVolunteer(id, data) {
  await updateDoc(doc(db, COLS.volunteers, id), cleanObj(data));
}

export async function deleteVolunteer(id) {
  await deleteDoc(doc(db, COLS.volunteers, id));
}

export async function getVolunteer(id) {
  const snap = await getDoc(doc(db, COLS.volunteers, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// =====================================================
// CITIZENS
// =====================================================

export async function createCitizen(data, uid) {
  const id = uid || generateId('CIT');
  const payload = cleanObj({
    name:               data.name,
    email:              data.email,
    phone:              data.phone || '',
    zone:               data.zone || 'Unknown',
    trust:              10,
    incidents_reported: 0,
    joined:             new Date().toISOString().split('T')[0],
    role:               'citizen',
  });
  await setDoc(doc(db, COLS.citizens, id), payload);
  return { id, ...payload };
}

export async function updateCitizen(id, data) {
  await updateDoc(doc(db, COLS.citizens, id), cleanObj(data));
}

export async function deleteCitizen(id) {
  await deleteDoc(doc(db, COLS.citizens, id));
}

// =====================================================
// USER PROFILE (for auth)
// =====================================================

export async function saveUserProfile(uid, data) {
  await setDoc(doc(db, COLS.users, uid), cleanObj(data), { merge: true });
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, COLS.users, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// =====================================================
// AUTH
// =====================================================

export async function registerUser({ name, email, password, phone, role, zone, skill }) {
  // Admin cannot register (hardcoded)
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid  = cred.user.uid;
  let profile;
  if (role === 'volunteer') {
    profile = await createVolunteer({ name, email, phone, skill, zone }, uid);
  } else {
    profile = await createCitizen({ name, email, phone, zone }, uid);
  }
  await saveUserProfile(uid, { name, email, role, zone, skill: skill||'', phone });
  return { id: uid, name, email, role, trust: 10, ...profile };
}

export async function loginUser(email, password) {
  // Hardcoded admin — bypasses Firebase Auth entirely
  if (email === 'admin@crisismesh.com' && password === 'admin123') {
    return { id: 'ADMIN001', name: 'Command Admin', email, role: 'admin', trust: 100 };
  }
  const cred    = await signInWithEmailAndPassword(auth, email, password);
  const uid     = cred.user.uid;
  const profile = await getUserProfile(uid);
  if (!profile) throw new Error('User profile not found. Please register first.');
  return { id: uid, ...profile };
}

export async function logoutUser() {
  try { await signOut(auth); } catch(e) { /* admin has no Firebase session */ }
}

// =====================================================
// VOLUNTEER MATCHING
// =====================================================

export async function matchVolunteersToNeed(need, volunteers) {
  const skillMap = {
    medical:   'Medical / First Aid',
    rescue:    'Search & Rescue',
    transport: 'Transport / Logistics',
    tech:      'Tech Support',
  };
  const preferredSkill = skillMap[need.category] || 'General Aid';
  return volunteers
    .filter(v => v.available === true || v.available === 'true')
    .map(v => ({
      ...v,
      matchScore: (v.trust || 0) + (v.skill === preferredSkill ? 20 : 0),
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}

// =====================================================
// SEED DATA (first-time setup)
// =====================================================

export async function seedInitialData() {
  // Only seed if no data exists
  const snap = await getDocs(collection(db, COLS.incidents));
  if (!snap.empty) return; // already seeded

  console.log('🌱 Seeding initial data...');

  const volunteers = [
    { name:'Arjun Mehta',       email:'arjun@mesh.com',   phone:'9841001001', skill:'Search & Rescue',      zone:'T Nagar',       trust:92, tasks_completed:48, available:true,  verified:true,  rating:4.9, lat:13.042, lng:80.234, joined:'2024-01-15', role:'volunteer' },
    { name:'Dr. Kavitha Rajan', email:'kavitha@mesh.com', phone:'9841001002', skill:'Medical / First Aid',   zone:'Anna Nagar',    trust:95, tasks_completed:55, available:true,  verified:true,  rating:5.0, lat:13.085, lng:80.210, joined:'2024-01-16', role:'volunteer' },
    { name:'Raj Kumar',         email:'raj@mesh.com',     phone:'9841001003', skill:'Transport / Logistics', zone:'Velachery',     trust:78, tasks_completed:29, available:true,  verified:false, rating:4.2, lat:12.981, lng:80.218, joined:'2024-01-17', role:'volunteer' },
    { name:'Sindhu Nair',       email:'sindhu@mesh.com',  phone:'9841001004', skill:'General Aid',           zone:'Adyar',         trust:85, tasks_completed:33, available:true,  verified:true,  rating:4.6, lat:13.001, lng:80.256, joined:'2024-01-18', role:'volunteer' },
    { name:'Vikram Iyer',       email:'vikram@mesh.com',  phone:'9841001005', skill:'Tech Support',          zone:'OMR',           trust:70, tasks_completed:18, available:false, verified:false, rating:3.9, lat:12.901, lng:80.227, joined:'2024-01-19', role:'volunteer' },
    { name:'Meena Devi',        email:'meena@mesh.com',   phone:'9841001006', skill:'Medical / First Aid',   zone:'Tambaram',      trust:88, tasks_completed:37, available:true,  verified:true,  rating:4.8, lat:12.924, lng:80.100, joined:'2024-01-20', role:'volunteer' },
    { name:'Suresh Babu',       email:'suresh@mesh.com',  phone:'9841001007', skill:'Search & Rescue',       zone:'Ambattur',      trust:72, tasks_completed:24, available:true,  verified:false, rating:4.1, lat:13.114, lng:80.154, joined:'2024-01-21', role:'volunteer' },
    { name:'Deepak Velu',       email:'deepak@mesh.com',  phone:'9841001009', skill:'Transport / Logistics', zone:'Guindy',        trust:80, tasks_completed:31, available:true,  verified:true,  rating:4.4, lat:13.006, lng:80.220, joined:'2024-01-22', role:'volunteer' },
    { name:'Priya Krishnan',    email:'priya@mesh.com',   phone:'9841001010', skill:'Medical / First Aid',   zone:'Mylapore',      trust:91, tasks_completed:42, available:true,  verified:true,  rating:4.9, lat:13.034, lng:80.269, joined:'2024-01-23', role:'volunteer' },
    { name:'Karthik Raj',       email:'karthik@mesh.com', phone:'9841001011', skill:'Search & Rescue',       zone:'Sholinganallur',trust:77, tasks_completed:27, available:true,  verified:false, rating:4.3, lat:12.900, lng:80.228, joined:'2024-01-24', role:'volunteer' },
  ];

  const citizens = [
    { name:'Ravi Sundaram',  email:'ravi@gmail.com',    phone:'9841002001', zone:'T Nagar',    trust:45, incidents_reported:3, joined:'2024-01-20', role:'citizen' },
    { name:'Lalitha Mohan',  email:'lalitha@gmail.com', phone:'9841002002', zone:'Anna Nagar', trust:60, incidents_reported:7, joined:'2024-01-22', role:'citizen' },
    { name:'Bala Murugan',   email:'bala@gmail.com',    phone:'9841002003', zone:'Velachery',  trust:35, incidents_reported:2, joined:'2024-01-25', role:'citizen' },
    { name:'Sumathi Raj',    email:'sumathi@gmail.com', phone:'9841002004', zone:'Adyar',      trust:55, incidents_reported:5, joined:'2024-02-01', role:'citizen' },
    { name:'Vinoth Kumar',   email:'vinoth@gmail.com',  phone:'9841002005', zone:'OMR',        trust:40, incidents_reported:4, joined:'2024-02-05', role:'citizen' },
    { name:'Nithya Priya',   email:'nithya@gmail.com',  phone:'9841002006', zone:'Tambaram',   trust:50, incidents_reported:6, joined:'2024-02-10', role:'citizen' },
    { name:'Senthil Nathan', email:'senthil@gmail.com', phone:'9841002007', zone:'Ambattur',   trust:30, incidents_reported:1, joined:'2024-02-15', role:'citizen' },
    { name:'Kaveri Devi',    email:'kaveri@gmail.com',  phone:'9841002008', zone:'Porur',      trust:65, incidents_reported:8, joined:'2024-02-20', role:'citizen' },
  ];

  const incidents = [
    { type:'flood',   title:'Flooding in T Nagar',          description:'Water levels rising rapidly near Anna Flyover. Residents stranded.', severity:4, location:'T Nagar, Chennai',  lat:13.0418, lng:80.2341, status:'active',   urgency_score:9.5 },
    { type:'medical', title:'Medical Emergency — Anna Salai', description:'Multiple casualties from road accident near Spencer Plaza.',        severity:4, location:'Anna Salai',        lat:13.0569, lng:80.2520, status:'active',   urgency_score:9.2 },
    { type:'power',   title:'Power Outage — Velachery',       description:'Complete power failure. Hospital on backup generator.',            severity:3, location:'Velachery',          lat:12.9815, lng:80.2180, status:'active',   urgency_score:7.1 },
    { type:'fire',    title:'Factory Fire — Ambattur',         description:'Industrial fire at chemical factory. 3 fire engines deployed.',    severity:3, location:'Ambattur',           lat:13.1143, lng:80.1548, status:'active',   urgency_score:7.8 },
    { type:'accident',title:'Multi-vehicle Accident OMR',     description:'Pile-up on OMR near Sholinganallur.',                              severity:2, location:'OMR',                lat:12.9010, lng:80.2279, status:'resolved', urgency_score:5.0 },
    { type:'flood',   title:'Waterlogging — Adyar',           description:'Adyar river overflowing. Low-lying areas submerged.',             severity:3, location:'Adyar',              lat:13.0012, lng:80.2565, status:'active',   urgency_score:7.3 },
    { type:'medical', title:'Heat Stroke — Tambaram',         description:'3 elderly persons collapsed due to heat.',                         severity:3, location:'Tambaram',           lat:12.9249, lng:80.1000, status:'active',   urgency_score:6.9 },
    { type:'power',   title:'Transformer Burst — Guindy',     description:'High voltage transformer burst. Area blacked out.',               severity:2, location:'Guindy',             lat:13.0067, lng:80.2206, status:'active',   urgency_score:5.5 },
  ];

  // Write volunteers
  for (const v of volunteers) {
    const ref = doc(collection(db, COLS.volunteers));
    await setDoc(ref, { ...v, created_at: serverTimestamp() });
  }

  // Write citizens
  for (const c of citizens) {
    const ref = doc(collection(db, COLS.citizens));
    await setDoc(ref, { ...c, created_at: serverTimestamp() });
  }

  // Write incidents & get their IDs for needs
  const incIds = [];
  for (const inc of incidents) {
    const ref = await addDoc(collection(db, COLS.incidents), { ...inc, reported_by: 'admin', created_at: serverTimestamp() });
    incIds.push(ref.id);
  }

  // Write needs linked to incidents
  const needsData = [
    { incident_id: incIds[0], category:'food',      description:'Food packets for 40 families in flood zone',           urgency:4, quantity:40,  status:'open',        assigned_to:'' },
    { incident_id: incIds[0], category:'rescue',    description:'Boat rescue for elderly residents on 1st floor',       urgency:4, quantity:3,   status:'in-progress', assigned_to:'' },
    { incident_id: incIds[1], category:'medical',   description:'Blood O+ urgently needed for accident victims',        urgency:4, quantity:5,   status:'open',        assigned_to:'' },
    { incident_id: incIds[2], category:'power',     description:'Power banks and charging stations for hospital',       urgency:2, quantity:20,  status:'in-progress', assigned_to:'' },
    { incident_id: incIds[3], category:'rescue',    description:'Evacuation assistance for factory workers',            urgency:3, quantity:15,  status:'in-progress', assigned_to:'' },
    { incident_id: incIds[0], category:'shelter',   description:'Temporary shelter for 100 displaced people',          urgency:3, quantity:100, status:'open',        assigned_to:'' },
    { incident_id: incIds[4], category:'medical',   description:'First aid kits and paramedics at accident site',      urgency:3, quantity:2,   status:'completed',   assigned_to:'' },
    { incident_id: incIds[1], category:'transport', description:'Ambulance coordination and routing help',             urgency:4, quantity:1,   status:'in-progress', assigned_to:'' },
    { incident_id: incIds[5], category:'food',      description:'Drinking water packets for flood victims',            urgency:3, quantity:200, status:'open',        assigned_to:'' },
    { incident_id: incIds[6], category:'medical',   description:'ORS packets and medical team for heat stroke',        urgency:3, quantity:50,  status:'open',        assigned_to:'' },
  ];

  for (const n of needsData) {
    await addDoc(collection(db, COLS.needs), { ...n, posted_by:'admin', created_at: serverTimestamp() });
  }

  console.log('✅ Seed data written to Firestore!');
}
