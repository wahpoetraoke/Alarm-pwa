import { Telegraf } from 'telegraf';
import { neon } from '@neondatabase/serverless';

const bot = new Telegraf(process.env.BOT_TOKEN || 'dummy');
const sql = neon(process.env.DATABASE_URL || '');

bot.start((ctx) => ctx.reply('Bot hidup! /add /list /edit /delete'));
bot.help((ctx) => ctx.reply('/add judul, /list, /edit id judul_baru, /delete id'));

bot.command('add', async (ctx) => {
  try {
    const title = ctx.message.text.replace('/add','').trim();
    if(!title) return ctx.reply('Format: /add beli kopi');
    const r = await sql`INSERT INTO items(user_id, title) VALUES(${ctx.from.id}, ${title}) RETURNING id`;
    await ctx.reply(`✅ ID ${r[0].id} kesimpen`);
  } catch(e){ console.error(e); await ctx.reply('DB Error: '+e.message) }
});

bot.command('list', async (ctx) => {
  try {
    const rows = await sql`SELECT id, title FROM items WHERE user_id=${ctx.from.id} ORDER BY id DESC LIMIT 20`;
    if(!rows.length) return ctx.reply('Kosong');
    await ctx.reply(rows.map(r=>`${r.id}. ${r.title}`).join('\n'));
  } catch(e){ console.error(e); await ctx.reply('DB Error: '+e.message) }
});

bot.command('edit', async (ctx) => {
  const parts = ctx.message.text.replace('/edit','').trim().split(' ');
  const id = parts.shift(); const newTitle = parts.join(' ');
  if(!id ||!newTitle) return ctx.reply('Format: /edit 1 judul baru');
  await sql`UPDATE items SET title=${newTitle} WHERE id=${id} AND user_id=${ctx.from.id}`;
  ctx.reply('✅ Updated');
});

bot.command('delete', async (ctx) => {
  const id = ctx.message.text.replace('/delete','').trim();
  if(!id) return ctx.reply('Format: /delete 1');
  await sql`DELETE FROM items WHERE id=${id} AND user_id=${ctx.from.id}`;
  ctx.reply('🗑️ Deleted');
});

export const handler = async (event) => {
  try {
    if(!event.body) return { statusCode: 200, body: 'no body' };
    const body = event.isBase64Encoded? Buffer.from(event.body, 'base64').toString() : event.body;
    await bot.handleUpdate(JSON.parse(body));
  } catch (err) {
    console.error('HANDLER ERROR:', err);
    // PENTING: tetep balikin 200 biar gak di-spam Telegram
  }
  return { statusCode: 200, body: 'ok' };
};