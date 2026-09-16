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

// Parser: Indomie 2 5000 -> {name, qty, price}
function parseKetikBebas(text){
  const lines = text.split('\n').filter(l=>l.trim());
  const items = [];
  for(const line of lines){
    // hapus /pesan kalau ada
    const clean = line.replace('/pesan','').trim();
    // regex: ambil 2 angka di akhir
    const m = clean.match(/^(.+?)\s+(\d+)\s+(\d+)$/);
    if(m){
      items.push({ name: m[1].trim(), qty: parseInt(m[2]), price: parseInt(m[3]) });
    }
  }
  return items;
}

async function generateReceiptImage(items, total){
  const W=400, H=250+items.length*50;
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
    img.print(font, 10, y, `${it.qty} x Rp${it.price} = Rp${it.qty*it.price}`);
    y+=30;
  });
  img.print(font, 10, y, '----------------------------------------'); y+=25;
  img.print(fontBold, 10, y, `TOTAL: Rp${total}`);
  return await img.getBufferAsync(Jimp.MIME_JPEG);
}

async function generateReceiptPdf(items, total){
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([350, 300+items.length*25]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  let y=280+items.length*25;
  page.drawText('STRUK BELANJA', {x:10, y, size:14, font}); y-=20;
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
    const msg = update.message; if(!msg?.text) return {statusCode:200, body:'ok'};
    const chatId = msg.chat.id; const text = msg.text.trim();

    if(text.startsWith('/start')){
      await sendMessage(chatId,
`Ketik bebas kayak gini boy, langsung jadi struk:

\`\`\`
Indomie 2 5000
Bakso 3 4000
Es gooday 3 4000
\`\`\`
Format: NAMA QTY HARGA_SATUAN

Bot auto hitung total + kirim gambar & PDF struk.`);
      return {statusCode:200, body:'ok'};
    }

    const items = parseKetikBebas(text);
    if(items.length===0) return {statusCode:200, body:'ok'};

    let total=0;
    items.forEach(i=> total+= i.qty * i.price);

    // Simpan ke DB
    const order = (await sql`INSERT INTO orders(user_id, total) VALUES(${msg.from.id}, ${total}) RETURNING id`)[0];
    for(const it of items){
      await sql`INSERT INTO order_items(order_id, name, price, qty) VALUES(${order.id}, ${it.name}, ${it.price}, ${it.qty})`;
    }

    const imgBuf = await generateReceiptImage(items, total);
    const pdfBuf = await generateReceiptPdf(items, total);

    let reply = `*Rincian:*\n`;
    items.forEach(it=> reply+=`${it.name} ${it.qty}x Rp${it.price} = Rp${it.qty*it.price}\n`);
    reply+=`\n*TOTAL: Rp${total}*`;
    await sendMessage(chatId, reply);
    await sendPhoto(chatId, imgBuf, `Struk #${order.id} - Total Rp${total}`);
    await sendDoc(chatId, pdfBuf, `struk-${order.id}.pdf`);

  }catch(e){ console.error(e); }
  return {statusCode:200, body:'ok'};
};