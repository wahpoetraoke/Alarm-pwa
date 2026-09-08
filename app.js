let alarms=JSON.parse(localStorage.getItem('alarms')||'[]');
const clockEl=document.getElementById('clock'),timeInput=document.getElementById('timeInput'),labelInput=document.getElementById('labelInput'),setBtn=document.getElementById('setBtn'),alarmListEl=document.getElementById('alarmList'),permissionBtn=document.getElementById('permissionBtn'),statusEl=document.getElementById('status'),alarmSound=document.getElementById('alarmSound');
const fullAlert=document.getElementById('fullAlert'),alertLabel=document.getElementById('alertLabel'),alertTime=document.getElementById('alertTime'),countdownEl=document.getElementById('countdown'),closeBtn=document.getElementById('closeAlertBtn');

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
permissionBtn.onclick=async()=>{const p=await Notification.requestPermission();statusEl.textContent=p==='granted'?'✅ Aktif':'❌ Ditolak';};

setInterval(()=>{clockEl.textContent=new Date().toLocaleTimeString('id-ID',{hour12:false});if(new Date().getSeconds()===0){const cur=new Date().toTimeString().slice(0,5);alarms.forEach(a=>{if(a.active&&a.time===cur)showFullAlert(a);});}},1000);

setBtn.onclick=async()=>{if(!timeInput.value)return alert('Pilih jam');if(Notification.permission!=='granted')await Notification.requestPermission();alarms.push({id:Date.now(),time:timeInput.value,label:labelInput.value||'Alarm',active:true});localStorage.setItem('alarms',JSON.stringify(alarms));render();};
function render(){alarmListEl.innerHTML='';alarms.forEach(a=>{const li=document.createElement('li');li.innerHTML=`<div><b>${a.time}</b><br><small>${a.label}</small></div><div><button onclick="toggleA(${a.id})">${a.active?'ON':'OFF'}</button><button onclick="delA(${a.id})" style="background:#ef4444;margin-left:5px">X</button></div>`;alarmListEl.appendChild(li);});}
window.toggleA=id=>{alarms=alarms.map(a=>a.id===id?{...a,active:!a.active}:a);localStorage.setItem('alarms',JSON.stringify(alarms));render();};
window.delA=id=>{alarms=alarms.filter(a=>a.id!==id);localStorage.setItem('alarms',JSON.stringify(alarms));render();};

let timer, countTimer;
function showFullAlert(alarm){
  alertLabel.textContent=alarm.label;
  alertTime.textContent=alarm.time;
  fullAlert.classList.add('show');
  
  // Bunyi loop
  alarmSound.currentTime=0; alarmSound.play().catch(()=>{});
  if(navigator.vibrate) navigator.vibrate([1000,300,1000,300,1000,300,1000]);

  // Notif juga
  if(navigator.serviceWorker.ready){
    navigator.serviceWorker.ready.then(r=>r.showNotification('⏰ '+alarm.label,{body:`Alarm ${alarm.time}`,icon:'./icon-192.png',tag:'alarm'}));
  }

  // Hitung mundur 15 detik
  let sisa=15;
  countdownEl.textContent=`Tutup otomatis ${sisa} detik`;
  clearInterval(countTimer);
  countTimer=setInterval(()=>{sisa--;countdownEl.textContent=`Tutup otomatis ${sisa} detik`;if(sisa<=0)closeAlert();},1000);

  // Auto tutup 15 detik
  clearTimeout(timer);
  timer=setTimeout(()=>closeAlert(),15000);
}

function closeAlert(){
  fullAlert.classList.remove('show');
  alarmSound.pause(); alarmSound.currentTime=0;
  if(navigator.vibrate) navigator.vibrate(0);
  clearInterval(countTimer); clearTimeout(timer);
  if(navigator.serviceWorker.ready){
    navigator.serviceWorker.ready.then(r=>r.getNotifications().then(n=>n.forEach(x=>x.close())));
  }
}
closeBtn.onclick=closeAlert;
render();