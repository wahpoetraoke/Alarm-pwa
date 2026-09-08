const clockEl = document.getElementById('clock');
const timeInput = document.getElementById('timeInput');
const labelInput = document.getElementById('labelInput');
const setBtn = document.getElementById('setBtn');
const alarmListEl = document.getElementById('alarmList');
const permissionBtn = document.getElementById('permissionBtn');
const statusEl = document.getElementById('status');
const alarmSound = document.getElementById('alarmSound');

let alarms = JSON.parse(localStorage.getItem('alarms') || '[]');

// 1. Daftar Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// 2. Minta izin notifikasi
async function requestPermission(){
  const result = await Notification.requestPermission();
  statusEl.textContent = result === 'granted' ? '✅ Notifikasi aktif!' : '❌ Izin ditolak, notifikasi tidak akan muncul';
  return result;
}
permissionBtn.onclick = requestPermission;

// 3. Jam realtime
setInterval(() => {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('id-ID', {hour12:false});
  checkAlarms(now);
}, 1000);

// 4. Set alarm
setBtn.onclick = async () => {
  if(!timeInput.value) return alert('Pilih jam dulu!');
  const perm = Notification.permission;
  if(perm !== 'granted') await requestPermission();

  alarms.push({
    id: Date.now(),
    time: timeInput.value, // format "HH:MM"
    label: labelInput.value || 'Alarm',
    active: true
  });
  saveAndRender();
  labelInput.value = '';
  statusEl.textContent = `Alarm jam ${timeInput.value} disimpan`;
};

function saveAndRender(){
  localStorage.setItem('alarms', JSON.stringify(alarms));
  renderAlarms();
}

function renderAlarms(){
  alarmListEl.innerHTML = '';
  alarms.forEach(a => {
    const li = document.createElement('li');
    li.className = a.active ? 'active' : '';
    li.innerHTML = `<div><b>${a.time}</b><br><small>${a.label}</small></div>
      <div><button onclick="toggleAlarm(${a.id})">${a.active?'Off':'On'}</button>
      <button onclick="deleteAlarm(${a.id})" style="background:#ef4444;margin-left:5px">Hapus</button></div>`;
    alarmListEl.appendChild(li);
  });
}

window.toggleAlarm = (id) => {
  alarms = alarms.map(a => a.id===id ? {...a, active:!a.active} : a);
  saveAndRender();
}
window.deleteAlarm = (id) => {
  alarms = alarms.filter(a => a.id!==id);
  saveAndRender();
}

// 5. Cek dan trigger
function checkAlarms(now){
  const current = now.toTimeString().slice(0,5); // HH:MM
  const seconds = now.getSeconds();
  if(seconds !== 0) return; // cek hanya pas detik 0 biar gak spam

  alarms.forEach(a => {
    if(a.active && a.time === current){
      triggerAlarm(a);
    }
  });
}

function triggerAlarm(alarm){
  // Bunyi
  alarmSound.play().catch(()=>{});
  
  // Getar di HP
  if(navigator.vibrate) navigator.vibrate([500,300,500]);

  // Notifikasi lewat SW
  if(navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({
      type: 'ALARM_TRIGGER',
      time: alarm.time,
      label: alarm.label
    });
  } else {
    new Notification('⏰ WAKTUNYA BANGUN!', { body: alarm.label });
  }

  // Auto stop setelah 30 detik
  setTimeout(()=> alarmSound.pause(), 30000);
}

renderAlarms();
// Auto minta izin pas awal
if(Notification.permission !== 'granted'){
  statusEl.textContent = 'Klik "Aktifkan Notifikasi" agar alarm muncul di luar browser';
}