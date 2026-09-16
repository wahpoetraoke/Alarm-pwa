import { neon } from '@neondatabase/serverless';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import Jimp from 'jimp';

const BOT_TOKEN = process.env.BOT_TOKEN;
const sql = neon(process.env.DATABASE_URL);

async function sendMessage(chatId, text){
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: chatId, text, parse_mode:'Markdown'})
  });
}
async function sendPhoto(chatId, buffer, caption){
  const fd = new FormData();
  fd.append('chat_id', chatId);
  fd.append('caption', caption);
  fd.append('photo', new Blob([buffer]), 'struk.jpg');
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,{method:'POST', body: fd});
}
async function sendDoc(chatId, buffer, filename){
  const fd = new FormData();
  fd.append('chat_id', chatId);
  fd.append('document', new Blob([buffer]), filename);
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,{method:'POST', body: fd});
}

function parseKetikBebas(text){
  const lines = text.split('\n').filter(l=>l.trim());
  const items = [];
  for(const line of lines){
    const clean = line.replace('/pesan','').replace('/add','').trim();
    if(!clean) continue;
    // format: Nama 2 5000  atau Nama 2x 5000
    const m = clean.match(/^(.+?)\s+(\d+)x?\s+(\d+)$/i);
    if(m){
      items.push({ name: m[1].trim(), qty: parseInt(m[2]), price: parseInt(m[3]) });
    }
  }
  return items;
}

async function generateReceiptImage(items, total){
  const W=420, H=280+items.length*55;
  const img = new Jimp(W, H, 0xffffffff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_12_BLACK);
  let y=20;
  img.print(fontBold, 10, y, {text:'STRUK BELANJA', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, W-20); y+=45;
  img.print(fontSmall, 10, y, {text: new Date().toLocaleString('id-ID'), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, W-20); y+=25;
  img.print(font, 10, y, '----------------------------------------'); y+=25;
  items.forEach(it=>{
    img.print(font, 10, y, `${it.name}`);
    y+=18;
    img.print(font, 10, y, `  ${it.qty} x Rp${it.price} = Rp${it.qty*it.price}`);
    y+=30;
  });
  img.print(font, 10, y, '----------------------------------------'); y+=25;
  img.print(fontBold, 10, y, `TOTAL: Rp${total}`);
  return await img.getBufferAsync(Jimp.MIME_JPEG);
}

async function generateReceiptPdf(items, total, orderId){
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([360, 320+items.length*28]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  let y=300+items.length*28;
  page.drawText(`STRUK #${orderId}`, {x:10, y, size:14, font}); y-=20;
  page.drawText(`Pasanginternetbot`, {x:10, y, size:10, font}); y-=12;
  page.drawText(new Date().toLocaleString('id-ID'), {x:10, y, size:8, font}); y-=15;
  page.drawText('------------------------------', {x:10, y, size:10, font}); y-=15;
  items.forEach(it=>{
    page.drawText(`${it.name}`, {x:10, y, size:10, font}); y-=12;
    page.drawText(` ${it.qty} x ${it.price} = ${it.qty*it.price}`, {x:10, y, size:10, font}); y-=15;
  });
  page.drawText('------------------------------', {x:10, y, size:10, font}); y-=15;
  page.drawText(`TOTAL: Rp${total}`, {x:10, y, size:12, font});
  return await pdf.save();
}

export const handler = async (event) => {
  try{
    const body = event.isBase64Encoded? Buffer.from(event.body,'base64').toString(): event.body;
    const update = JSON.parse(body);
    const msg = update.message; 
    if(!msg?.text) return {statusCode:200, body:'ok'};
    const chatId = msg.chat.id; 
    const userId = msg.from.id; 
    const text = msg.text.trim();

    // 1. START
    if(text.startsWith('/start')){
      await sendMessage(chatId,
`*Bot Hidup!*

Cara pakai baru (ketik bebas):
\`\`\`
Bakso 5 2000
Es Susu 4 5000
\`\`\`
Format: NAMA QTY HARGA

Perintah lama masih bisa:
/add pedro
/list
`);
      return {statusCode:200, body:'ok'};
    }

    // 2. Cek format ketik bebas dulu: Bakso 5 2000
    const customItems = parseKetikBebas(text);
    if(customItems.length > 0 && !text.startsWith('/add')){
      let total=0; customItems.forEach(i=> total+= i.qty*i.price);
      // buat tabel kalau belum ada
      await sql`CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, user_id BIGINT, total INT, created_at TIMESTAMP DEFAULT NOW())`;
      await sql`CREATE TABLE IF NOT EXISTS order_items(id SERIAL PRIMARY KEY, order_id INT, name TEXT, price INT, qty INT)`;
      const order = (await sql`INSERT INTO orders(user_id, total) VALUES(${userId}, ${total}) RETURNING id`)[0];
      for(const it of customItems){
        await sql`INSERT INTO order_items(order_id, name, price, qty) VALUES(${order.id}, ${it.name}, ${it.price}, ${it.qty})`;
      }
      let reply=`*Rincian:*\n`;
      customItems.forEach(it=> reply+=`${it.name} ${it.qty}x Rp${it.price} = Rp${it.qty*it.price}\n`);
      reply+=`\n*TOTAL: Rp${total}*`;
      await sendMessage(chatId, reply);
      const imgBuf = await generateReceiptImage(customItems, total);
      const pdfBuf = await generateReceiptPdf(customItems, total, order.id);
      await sendPhoto(chatId, imgBuf, `Struk #${order.id} - Rp${total}`);
      await sendDoc(chatId, pdfBuf, `struk-${order.id}.pdf`);
      return {statusCode:200, body:'ok'};
    }

    // 3. Perintah lama /add /list biar gak diem
    await sql`CREATE TABLE IF NOT EXISTS items(id SERIAL PRIMARY KEY, user_id BIGINT, title TEXT, created_at TIMESTAMP DEFAULT NOW())`;
    if(text.startsWith('/add ')){
      const title = text.replace('/add','').trim();
      const r = await sql`INSERT INTO items(user_id, title) VALUES(${userId}, ${title}) RETURNING id`;
      await sendMessage(chatId, `✅ ID ${r[0].id} kesimpen`);
    } else if(text.startsWith('/list')){
      const rows = await sql`SELECT id, title FROM items WHERE user_id=${userId} ORDER BY id DESC LIMIT 20`;
      if(rows.length==0) await sendMessage(chatId, 'Kosong, /add dulu');
      else await sendMessage(chatId, rows.map(x=>`${x.id}. ${x.title}`).join('\n'));
    }

  }catch(e){ console.error('ERROR:', e); }
  return {statusCode:200, body:'ok'};
};
