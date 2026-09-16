import { neon } from '@neondatabase/serverless';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const BOT_TOKEN = process.env.BOT_TOKEN;
const sql = neon(process.env.DATABASE_URL);

async function sendMessage(chatId, text){
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: chatId, text, parse_mode:'Markdown'})
  });
}
async function sendDoc(chatId, buffer, filename){
  const fd = new FormData();
  fd.append('chat_id', String(chatId));
  fd.append('document', new Blob([buffer], {type:'application/pdf'}), filename);
  fd.append('caption', filename);
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,{method:'POST', body: fd});
}

function parseOrder(text){
  const items=[];
  const lines=text.split('\n');
  for(let line of lines){
    line=line.trim();
    if(!line) continue;
    if(line.startsWith('/')) line=line.replace(/^\/(pesan|add|order|start)\s*/i,'');
    const m=line.match(/^(.+?)\s+(\d+)\s+(\d+)$/);
    if(m){
      items.push({name:m[1].trim(), qty:parseInt(m[2]), price:parseInt(m[3])});
    }
  }
  return items;
}

async function makePdf(items, total, orderId){
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([380, 380 + items.length*30]);
  const font=await pdf.embedFont(StandardFonts.Courier);
  const fontBold=await pdf.embedFont(StandardFonts.CourierBold);
  let y=360 + items.length*30;
  page.drawText(`WARUNG PASANG INTERNET`,{x:10,y,size:14,font:fontBold}); y-=18;
  page.drawText(`Bandar Lampung`,{x:10,y,size:9,font}); y-=10;
  page.drawText(new Date().toLocaleString('id-ID'),{x:10,y,size:8,font}); y-=15;
  page.drawText(`STRUK #${orderId}`,{x:10,y,size:11,font:fontBold}); y-=15;
  page.drawText('--------------------------------------',{x:10,y,size:10,font}); y-=15;
  for(const it of items){
    const line1=`${it.name}`;
    const line2=`  ${it.qty} x ${it.price.toLocaleString('id-ID')} = ${(it.qty*it.price).toLocaleString('id-ID')}`;
    page.drawText(line1,{x:10,y,size:10,font}); y-=12;
    page.drawText(line2,{x:10,y,size:10,font}); y-=16;
  }
  page.drawText('--------------------------------------',{x:10,y,size:10,font}); y-=15;
  page.drawText(`TOTAL: Rp${total.toLocaleString('id-ID')}`,{x:10,y,size:13,font:fontBold}); y-=20;
  page.drawText('Terima kasih!',{x:10,y,size:10,font});
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

    await sql`CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, user_id BIGINT, total INT, created_at TIMESTAMP DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY, order_id INT, name TEXT, price INT, qty INT)`;
    await sql`CREATE TABLE IF NOT EXISTS items(id SERIAL PRIMARY KEY, user_id BIGINT, title TEXT, created_at TIMESTAMP DEFAULT NOW())`;

    if(text.startsWith('/start')){
      await sendMessage(chatId,
`Bot struk FIX ✅

Ketik langsung:
Bakso 5 2000
Es Susu 4 5000

Format: NAMA QTY HARGA`);
      return {statusCode:200, body:'ok'};
    }

    if(text.startsWith('/add ')){
      const title=text.replace('/add','').trim();
      const r=await sql`INSERT INTO items(user_id, title) VALUES(${userId}, ${title}) RETURNING id`;
      await sendMessage(chatId,`✅ ID ${r[0].id} kesimpen`);
      return {statusCode:200, body:'ok'};
    }

    const items=parseOrder(text);
    if(items.length===0){
      if(text.length>3 && !text.startsWith('/')) {
        await sendMessage(chatId,'Format: Bakso 5 2000 (Nama Qty Harga)');
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
    items.forEach(it=> reply+=`${it.name} ${it.qty}x Rp${it.price.toLocaleString('id-ID')} = Rp${(it.qty*it.price).toLocaleString('id-ID')}\n`);
    reply+=`\n*TOTAL: Rp${total.toLocaleString('id-ID')}*`;
    await sendMessage(chatId, reply);

    const pdfBuf=await makePdf(items, total, order.id);
    await sendDoc(chatId, pdfBuf, `struk-${order.id}.pdf`);

  }catch(e){
    console.error(e);
  }
  return {statusCode:200, body:'ok'};
};
