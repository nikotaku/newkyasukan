import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

test('Oborozuki inventory starts at zero without changing other rooms; fixtures use the existing room properties', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE stores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text);
      CREATE TABLE rooms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, name text, is_active boolean DEFAULT true, internal_notes text);
      CREATE TABLE room_supplies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid, store_id uuid, name text, quantity int, unit text, category text, notes text, stock_level text, quantity_confirmed boolean, storage_location text, storage_code text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE facility_equipment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid, item_type text, name text, quantity int, unit text, custom_fields jsonb DEFAULT '{}');
      INSERT INTO stores(slug) VALUES ('tsuyaka'), ('other');
      INSERT INTO rooms(store_id,name) SELECT id,'華月' FROM stores WHERE slug='tsuyaka';
      INSERT INTO rooms(store_id,name) SELECT id,'艶月' FROM stores WHERE slug='tsuyaka';
      INSERT INTO rooms(store_id,name) SELECT id,'朧月' FROM stores WHERE slug='other';
      INSERT INTO room_supplies(room_id,store_id,name,quantity,stock_level,quantity_confirmed,storage_code)
        SELECT r.id,r.store_id,'備品' || n,7,'普通',false,'K01' FROM rooms r CROSS JOIN generate_series(1,23) n WHERE r.name IN ('華月','艶月');
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261119143000_oborozuki_inventory_and_fixtures.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const { rows: rooms } = await db.query(`SELECT r.* FROM rooms r JOIN stores s ON s.id=r.store_id WHERE s.slug='tsuyaka' AND r.name='朧月'`);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0].is_active, false);
    const oboro = rooms[0];
    const { rows: supplies } = await db.query('SELECT * FROM room_supplies WHERE room_id=$1', [oboro.id]);
    assert.equal(supplies.length, 23);
    assert.ok(supplies.every(i => i.quantity === 0 && i.quantity_confirmed && i.stock_level === 'なし' && i.storage_code === 'K01'));
    const { rows: preserved } = await db.query(`SELECT * FROM room_supplies WHERE room_id<>$1`, [oboro.id]);
    assert.equal(preserved.length, 46);
    assert.ok(preserved.every(i => i.quantity === 7 && i.stock_level === '普通' && !i.quantity_confirmed));
    const { rows: fixtures } = await db.query('SELECT * FROM facility_equipment');
    assert.deepEqual(fixtures.map(i=>i.name).sort(), ['置き時計','観葉植物','乾燥機','洗濯機'].sort());
    assert.ok(fixtures.every(i=>i.custom_fields.__room_id === oboro.id && i.store_id === oboro.store_id && i.quantity === 0 && i.item_type === 'furniture'));
    await db.exec(migration);
    assert.equal((await db.query('SELECT * FROM facility_equipment')).rows.length, 4);
    assert.equal((await db.query('SELECT * FROM room_supplies WHERE room_id=$1', [oboro.id])).rows.length, 23);

  } finally { await db.close(); }
});
