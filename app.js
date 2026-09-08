let alarms = JSON.parse(localStorage.getItem('alarms')||'[]');
const clockEl=document.getElementById('clock');
const timeInput=document.getElementById('timeInput');
const labelInput=document.getElementById('labelInput');
const setBtn=document.getElementById('setBtn');
const alarmListEl=document.getElementById('alarmList');
const permissionBtn=document.getElementById('permissionBtn');
const statusEl=document.getElementById('status');
const alarmSound=document.getElementById('alarmSound');

if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }

permissionBtn.onclick = async ()=>{
  const p = await Notification.requestPermission();
  statusEl.textContent = p==='granted'?'✅ Notifikasi aktif, silakan tes 1 menit lagi':'❌ Izin ditolak - cek setting Chrome';
  console.log('permission',p);
};

setInterval(()=>{
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString('id-ID',{hour12:false});
  // cek setiap detik 0
  if(now.getSeconds()===0){
    const cur = now.toTimeString().slice(0,5);
    console.log('cek alarm',cur,alarms);
    alarms.forEach(a=>{ if(a.active && a.time===cur) bunyi(a); });
  }
},1000);

setBtn.onclick = async ()=>{
  if(!timeInput.value){ alert('Pilih jam dulu!'); return; }
  if(Notification.permission!=='granted'){
    await Notification.requestPermission();
  }
  alarms.push({id:Date.now(), time:timeInput.value, label:labelInput.value||'Alarm', active:true});
  localStorage.setItem('alarms',JSON.stringify(alarms));
  render();
  statusEl.textContent = `✅ Alarm ${timeInput.value} disimpan. Jangan tutup tab ini untuk tes!`;
  labelInput.value='';
};

function render(){
  alarmListEl.innerHTML='';
  if(alarms.length===0){ alarmListEl.innerHTML='<li style="opacity:0.5">Belum ada alarm</li>'; return; }
  alarms.forEach(a=>{
    const li=document.createElement('li');
    li.className = a.active?'active':'';
    li.innerHTML=`<div><b>${a.time}</b><br><small>${a.label}</small></div>
    <div>
      <button onclick="toggleAlarm(${a.id})">${a.active?'ON':'OFF'}</button>
      <button onclick="deleteAlarm(${a.id})" style="background:#ef4444;margin-left:5px">Hapus</button>
    </div>`;
    alarmListEl.appendChild(li);
  });
}
window.toggleAlarm=(id)=>{ alarms=alarms.map(a=>a.id===id?{...a,active:!a.active}:a); localStorage.setItem('alarms',JSON.stringify(alarms)); render(); };
window.deleteAlarm=(id)=>{ alarms=alarms.filter(a=>a.id!==id); localStorage.setItem('alarms',JSON.stringify(alarms)); render(); };

function bunyi(alarm){
  console.log('BUNYI!',alarm);
  // 1. Suara 5 detik
  alarmSound.currentTime=0;
  alarmSound.play().then(()=>{ setTimeout(()=>{alarmSound.pause(); alarmSound.currentTime=0;},5000); }).catch(e=>console.log('audio error',e));
  // 2. Getar
  if(navigator.vibrate){ navigator.vibrate([800,200,800]); setTimeout(()=>navigator.vibrate(0),5000); }
  // 3. Notif - pakai 2 cara biar pasti muncul
  const opsi = {body:`Alarm jam ${alarm.time} - ${alarm.label}`, icon:'./icon-192.png', badge:'./icon-192.png', vibrate:[800,200,800], tag:'alarm'};
  try{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification('⏰ '+alarm.label, opsi);
        setTimeout(()=>{ reg.getNotifications({tag:'alarm'}).then(n=>n.forEach(x=>x.close())); },5000);
      });
    } else {
      const n = new Notification('⏰ '+alarm.label, opsi);
      setTimeout(()=>n.close(),5000);
    }
  }catch(e){
    alert('⏰ '+alarm.label+' jam '+alarm.time);
  }
  statusEl.textContent = `🔔 BUNYI! ${alarm.time} - ${alarm.label} (berhenti 5 detik)`;
}
render();