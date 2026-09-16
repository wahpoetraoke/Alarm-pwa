import { neon } from '@neondatabase/serverless';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import Jimp from 'jimp';

const BOT_TOKEN = process.env.BOT_TOKEN;
const sql = neon(process.env.DATABASE_URL);

async function sendMessage(chatId, text){
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: chatId, text, parse_mode:'Markdown'})
  });
}
async function sendPhoto(chatId, buffer, caption){
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('photo', new Blob([buffer], {type:'image/jpeg'}), 'struk.jpg');
  fd.append('caption', caption);
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,{method:'POST', body: fd});
}
async function sendDoc(chatId, buffer, filename){
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', new Blob([buffer], {type:'application/pdf'}), filename);
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,{method:'POST', body: fd});
}

function parseOrder(text){
  const items=[];
  const lines=text.split('\n');
  for(let line of lines){
    line=line.trim();
    if(!line) continue;
    if(line.startsWith('/')) line=line.replace(/^\/(pesan|add|order)\s*/i,'');
    // Format: Nama Barang  QTY  HARGA  -> contoh: Bakso 5 2000  atau Es Susu 4 5000
    const m=line.match(/^(.+?)\s+(\d+)\s+(\d+)$/);
    if(m){
      items.push({name:m[1].trim(), qty:parseInt(m[2]), price:parseInt(m[3])});
    }
  }
  return items;
}

async function makeImage(items, total, orderId){
  const W=420;
  const H=320 + items.length*60;
  const img=new Jimp(W,H,0xffffffff);
  const f16=await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const f32=await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const f12=await Jimp.loadFont(Jimp.FONT_SANS_12_BLACK);
  let y=20;
  img.print(f32,0,y,{text:`STRUK #${orderId}`, alignmentX:Jimp.HORIZONTAL_ALIGN_CENTER},W); y+=45;
  img.print(f12,0,y,{text:new Date().toLocaleString('id-ID')+' WIB', alignmentX:Jimp.HORIZONTAL_ALIGN_CENTER},W); y+=30;
  img.print(f16,10,y,'----------------------------------------'); y+=25;
  for(const it of items){
    img.print(f16,10,y,`${it.name}`); y+=20;
    img.print(f16,10,y,`  ${it.qty} x ${it.price.toLocaleString('id-ID')} = ${(it.qty*it.price).toLocaleString('id-ID')}`); y+=35;
  }
  img.print(f16,10,y,'----------------------------------------'); y+=25;
  img.print(f32,10,y,`TOTAL Rp${total.toLocaleString('id-ID')}`);
  return await img.getBufferAsync(Jimp.MIME_JPEG);
}

async function makePdf(items, total, orderId){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([380, 360 + items.length*30]);
  const font=await pdf.embedFont(StandardFonts.Courier);
  let y=340 + items.length*30;
  page.drawText(`STRUK #${orderId} - Pasanginternetbot`,{x:10,y,size:13,font}); y-=20;
  page.drawText(new Date().toLocaleString('id-ID'),{x:10,y,size:9,font}); y-=15;
  page.drawText('--------------------------------------',{x:10,y,size:10,font}); y-=15;
  for(const it of items){
    page.drawText(`${it.name}`,{x:10,y,size:10,font}); y-=12;
    page.drawText(` ${it.qty} x ${it.price} = ${it.qty*it.price}`,{x:10,y,size:10,font}); y-=15;
  }
  page.drawText('--------------------------------------',{x:10,y,size:10,font}); y-=15;
  page.drawText(`TOTAL: Rp${total}`,{x:10,y,size:12,font});
  return await pdf.save();
}

export const handler=async(event)=>{
  try{
    const body=event.isBase64Encoded?Buffer.from(event.body,'base64').toString():event.body;
    const upd=JSON.parse(body);
    const msg=upd.message;
    if(!msg?.text) return {statusCode:200, body:'ok'};
    const chatId=msg.chat.id;
    const userId=msg.from.id;
    const text=msg.text.trim();

    // pastikan tabel ada
    await sql`CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, user_id BIGINT, total INT, created_at TIMESTAMP DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY, order_id INT, name TEXT, price INT, qty INT)`;
    await sql`CREATE TABLE IF NOT EXISTS items(id SERIAL PRIMARY KEY, user_id BIGINT, title TEXT, created_at TIMESTAMP DEFAULT NOW())`;

    if(text.startsWith('/start')){
      await sendMessage(chatId,
`/start - bantuan
Ketik langsung kayak gini biar jadi struk:

Bakso 5 2000
Es Susu 4 5000

Format: NAMA QTY HARGA_SATUAN
Contoh: Indomie 2 5000

Nanti bot balas TOTAL + Gambar Struk + PDF Struk`);
      return {statusCode:200, body:'ok'};
    }

    if(text.startsWith('/list')){
      const rows=await sql`SELECT id, title FROM items WHERE user_id=${userId} ORDER BY id DESC LIMIT 20`;
      if(rows.length==0) await sendMessage(chatId,'Kosong, ketik /add nama atau ketik orderan');
      else await sendMessage(chatId, rows.map(r=>`${r.id}. ${r.title}`).join('\n'));
      return {statusCode:200, body:'ok'};
    }

    if(text.startsWith('/add ')){
      const title=text.replace('/add','').trim();
      if(title){
        const r=await sql`INSERT INTO items(user_id, title) VALUES(${userId}, ${title}) RETURNING id`;
        await sendMessage(chatId,`✅ ID ${r[0].id} kesimpen`);
      }
      return {statusCode:200, body:'ok'};
    }

    const items=parseOrder(text);
    if(items.length===0){
      // kalau cuma chat biasa tanpa angka, jangan diem, kasih tau format
      if(!text.startsWith('/')) {
        await sendMessage(chatId,'Format salah boy. Contoh bener:\nBakso 5 2000\nEs Susu 4 5000');
      }
      return {statusCode:200, body:'ok'};
    }

    let total=0;
    items.forEach(i=> total+=i.qty*i.price);
    const order=(await sql`INSERT INTO orders(user_id, total) VALUES(${userId}, ${total}) RETURNING id`)[0];
    for(const it of items){
      await sql`INSERT INTO order_items(order_id, name, price, qty) VALUES(${order.id}, ${it.name}, ${it.price}, ${it.qty})`;
    }

    let reply=`*Rincian Order #${order.id}:*\n`;
    items.forEach(it=> reply+=`${it.name} ${it.qty}x Rp${it.price} = Rp${it.qty*it.price}\n`);
    reply+=`\n*TOTAL: Rp${total.toLocaleString('id-ID')}*`;
    await sendMessage(chatId, reply);

    const imgBuf=await makeImage(items, total, order.id);
    const pdfBuf=await makePdf(items, total, order.id);
    await sendPhoto(chatId, imgBuf, `Struk #${order.id} - TOTAL Rp${total}`);
    await sendDoc(chatId, pdfBuf, `struk-${order.id}.pdf`);

  }catch(e){
    console.error(e);
  }
  return {statusCode:200, body:'ok'};
};
