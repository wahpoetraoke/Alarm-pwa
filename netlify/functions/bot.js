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

async function generateReceiptImage(items, total){
  const W = 400, lineH = 28, H = 200 + items.length*lineH;
  const img = new Jimp(W, H, 0xffffffff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  let y = 20;
  img.print(fontBold, 10, y, {text:'WARUNG PASANG INTERNET', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, W-20);
  y+=45;
  img.print(font, 10, y, {text:'Bandar Lampung - '+new Date().toLocaleString('id-ID'), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER}, W-20);
  y+=30;
  img.print(font, 10, y, '----------------------------------------'); y+=25;
  items.forEach(it=>{
    img.print(font, 10, y, `${it.name} ${it.qty}x Rp${it.price}`);
    img.print(font, 10, y+16, ` = Rp${it.price*it.qty}`);
    y+=35;
  });
  img.print(font, 10, y, '----------------------------------------'); y+=25;
  img.print(fontBold, 10, y, `TOTAL: Rp${total}`); y+=40;
  img.print(font, 10, y, 'Terima kasih!');
  return await img.getBufferAsync(Jimp.MIME_JPEG);
}

async function generateReceiptPdf(items, total, orderId){
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([300, 400+items.length*20]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  let y = 380;
  page.drawText(`STRUK #${orderId}`, {x:10, y, size:14, font}); y-=20;
  page.drawText(`Warung Pasang Internet`, {x:10, y, size:10, font}); y-=15;
  page.drawText(`------------------------------`, {x:10, y, size:10, font}); y-=15;
  items.forEach(it=>{
    page.drawText(`${it.name} ${it.qty}x${it.price} = ${it.qty*it.price}`, {x:10, y, size:9, font}); y-=12;
  });
  y-=5;
  page.drawText(`------------------------------`, {x:10, y, size:10, font}); y-=15;
  page.drawText(`TOTAL: Rp${total}`, {x:10, y, size:12, font});
  return await pdf.save();
}

export const handler = async (event) => {
  try{
    const body = event.isBase64Encoded? Buffer.from(event.body,'base64').toString(): event.body;
    const update = JSON.parse(body);
    const msg = update.message; if(!msg?.text) return {statusCode:200, body:'ok'};
    const chatId = msg.chat.id; const userId = msg.from.id; const text = msg.text.trim();

    if(text.startsWith('/menu')){
      const menus = await sql`SELECT * FROM menus ORDER BY id`;
      let t = '*MENU:*\n'; menus.forEach(m=> t+=`${m.id}. ${m.name} - Rp${m.price}\n`);
      t+=`\nCara pesan: /pesan 1x2 2x1`;
      await sendMessage(chatId, t);
    }
    else if(text.startsWith('/pesan')){
      // format: /pesan 1x2 3x1
      const parts = text.replace('/pesan','').trim().split(' ');
      for(const p of parts){
        const [idStr, qtyStr] = p.split('x'); const id=parseInt(idStr); const qty=parseInt(qtyStr||1);
        const m = (await sql`SELECT * FROM menus WHERE id=${id}`)[0];
        if(!m) continue;
        await sql`INSERT INTO carts(user_id, menu_id, name, price, qty) VALUES(${userId}, ${id}, ${m.name}, ${m.price}, ${qty})
          ON CONFLICT(user_id, menu_id) DO UPDATE SET qty = carts.qty + ${qty}`;
      }
      await sendMessage(chatId, '✅ Masuk keranjang. Cek /keranjang');
    }
    else if(text.startsWith('/keranjang')){
      const carts = await sql`SELECT * FROM carts WHERE user_id=${userId}`;
      if(!carts.length) return await sendMessage(chatId, 'Keranjang kosong');
      let total=0; let t='*KERANJANG:*\n'; carts.forEach(c=>{ const sub=c.price*c.qty; total+=sub; t+=`${c.name} ${c.qty}x Rp${c.price} = Rp${sub}\n`; });
      t+=`\n*TOTAL: Rp${total}*\nKetik /checkout untuk cetak struk`;
      await sendMessage(chatId, t);
    }
    else if(text.startsWith('/checkout')){
      const carts = await sql`SELECT * FROM carts WHERE user_id=${userId}`;
      if(!carts.length) return await sendMessage(chatId, 'Keranjang kosong');
      let total=0; carts.forEach(c=> total+=c.price*c.qty);
      const order = (await sql`INSERT INTO orders(user_id, total) VALUES(${userId}, ${total}) RETURNING id`)[0];
      for(const c of carts){
        await sql`INSERT INTO order_items(order_id, menu_id, name, price, qty) VALUES(${order.id}, ${c.menu_id}, ${c.name}, ${c.price}, ${c.qty})`;
      }
      await sql`DELETE FROM carts WHERE user_id=${userId}`;

      // Generate struk
      const imgBuf = await generateReceiptImage(carts, total);
      const pdfBuf = await generateReceiptPdf(carts, total, order.id);

      await sendPhoto(chatId, imgBuf, `Struk #${order.id} - TOTAL Rp${total}`);
      await sendDoc(chatId, pdfBuf, `struk-${order.id}.pdf`);
      await sendMessage(chatId, `✅ Order #${order.id} selesai. Total Rp${total}`);
    }
    else if(text.startsWith('/start')){
      await sendMessage(chatId, 'Halo! /menu untuk lihat makanan, /pesan 1x2 2x1, /keranjang, /checkout');
    }
  }catch(e){ console.error(e); }
  return {statusCode:200, body:'ok'};
};