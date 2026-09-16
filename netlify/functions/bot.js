import { Telegraf } from 'telegraf';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// /start
bot.start((ctx) => {
  ctx.reply(
`Halo ${ctx.from.first_name}!

Bot CRUD siap.
Perintah:
/add Judul catatan
/list - lihat semua
/edit <id> <judul baru>
/delete <id>
/help`
  );
});

// CREATE
bot.command('add', async (ctx) => {
  const title = ctx.message.text.replace('/add','').trim();
  if(!title) return ctx.reply('Format: /add Nasi goreng enak');
  try {
    const res = await pool.query(
      'INSERT INTO items(user_id, title) VALUES($1, $2) RETURNING id',
      [ctx.from.id, title]
    );
    ctx.reply(`✅ Berhasil disimpan! ID: ${res.rows[0].id}`);
  } catch(e){ ctx.reply('Error: ' + e.message) }
});

// READ
bot.command('list', async (ctx) => {
  const { rows } = await pool.query(
    'SELECT id, title, created_at FROM items WHERE user_id=$1 ORDER BY id DESC',
    [ctx.from.id]
  );
  if(rows.length === 0) return ctx.reply('Belum ada catatan.');
  let msg = '📝 Daftar kamu:\n\n';
  rows.forEach(r => {
    msg += `${r.id}. ${r.title} \n`;
  });
  msg += '\nEdit: /edit <id> <baru> | Hapus: /delete <id>';
  ctx.reply(msg);
});

// UPDATE
bot.command('edit', async (ctx) => {
  const args = ctx.message.text.replace('/edit','').trim().split(' ');
  const id = args.shift();
  const newTitle = args.join(' ');
  if(!id ||!newTitle) return ctx.reply('Format: /edit 2 Judul baru');
  const res = await pool.query(
    'UPDATE items SET title=$1 WHERE id=$2 AND user_id=$3',
    [newTitle, id, ctx.from.id]
  );
  if(res.rowCount === 0) return ctx.reply('ID tidak ketemu.');
  ctx.reply(`✅ ID ${id} diupdate jadi: ${newTitle}`);
});

// DELETE
bot.command('delete', async (ctx) => {
  const id = ctx.message.text.replace('/delete','').trim();
  if(!id) return ctx.reply('Format: /delete 2');
  const res = await pool.query(
    'DELETE FROM items WHERE id=$1 AND user_id=$2',
    [id, ctx.from.id]
  );
  if(res.rowCount === 0) return ctx.reply('ID tidak ketemu.');
  ctx.reply(`🗑️ ID ${id} dihapus.`);
});

bot.command('help', (ctx) => ctx.reply('/add, /list, /edit, /delete'));

export const handler = async (event) => {
  try {
    await bot.handleUpdate(JSON.parse(event.body));
    return { statusCode: 200, body: 'OK' };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: e.toString() };
  }
};