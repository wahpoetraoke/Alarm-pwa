const clockEl = document.getElementById('clock');
const timeInput = document.getElementById('timeInput');
const labelInput = document.getElementById('labelInput');
const setBtn = document.getElementById('setBtn');
const alarmListEl = document.getElementById('alarmList');
const permissionBtn = document.getElementById('permissionBtn');
const statusEl = document.getElementById('status');
const alarmSound = document.getElementById('alarmSound');
const overlay = document.getElementById('alarmOverlay');
const overlayLabel = document.getElementById('overlayLabel');
const overlayTime = document.getElementById('overlayTime');
const stopBtn = document.getElementById('stopBtn');

let alarms = JSON.parse(localStorage.getItem('alarms') || '[]');
let alarmTimeout, countdownInterval;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

async function requestPermission(){
  const result = await Notification.requestPermission();
  statusEl.textContent = result === 'granted' ? '✅ Notifikasi aktif!' : '❌ Izin ditolak';
  return result;
}
permissionBtn.onclick = requestPermission;

setInterval(() => {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('id-ID', {hour12:false});
  checkAlarms(now);
}, 1000);

setBtn.onclick = async () => {
  if(!timeInput.value) return alert('Pilih jam dulu!');
  if(Notification.permission !== 'granted') await requestPermission();
  alarms.push({ id: Date.now(), time: timeInput.value, label: labelInput.value || 'Alarm', active: true });
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
function checkAlarms(now){
  const current = now.toTimeString().slice(0,5);
  if(now.getSeconds() !== 0) return;
  alarms.forEach(a => { if(a.active && a.time === current) triggerAlarm(a); });
}
function triggerAlarm(alarm){
  overlayLabel.textContent = alarm.label;
  overlayTime.textContent = alarm.time;
  overlay.classList.add('show');
  alarmSound.currentTime = 0;
  alarmSound.play().catch(()=>{});
  if(navigator.vibrate) navigator.vibrate([1000,200,1000,200,1000]);

  if(navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({ type: 'ALARM_TRIGGER', time: alarm.time, label: alarm.label });
  }

  let sisa = 5;
  stopBtn.textContent = `Matikan Alarm (${sisa}s)`;
  clearInterval(countdownInterval);
  countdownInterval = setInterval(()=>{
    sisa--;
    stopBtn.textContent = `Matikan Alarm (${sisa}s)`;
    if(sisa<=0) stopAlarm();
  },1000);
  setTimeout(()=> stopAlarm(), 5000);
}
function stopAlarm(){
  overlay.classList.remove('show');
  alarmSound.pause();
  if(navigator.vibrate) navigator.vibrate(0);
  clearInterval(countdownInterval);
  if(navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(r=>r.getNotifications().then(n=>n.forEach(x=>x.close())));
  }
}
stopBtn.onclick = stopAlarm;
overlay.onclick = (e)=> { if(e.target===overlay) stopAlarm(); }

renderAlarms();
if(Notification.permission !== 'granted'){
  statusEl.textContent = 'Klik "Aktifkan Notifikasi" agar alarm muncul';
}