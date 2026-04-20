// server/db.js  –  SQLite con better-sqlite3
const Database = require('better-sqlite3');
const crypto   = require('crypto');
const path     = require('path');

const db = new Database(path.join(__dirname, 'petpals.db'));

// ── Schema ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    key        TEXT    NOT NULL,
    plan       TEXT    NOT NULL DEFAULT 'free',
    stripe_sub TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS unlocked (
    license_id INTEGER NOT NULL,
    pet_id     TEXT    NOT NULL,
    PRIMARY KEY (license_id, pet_id),
    FOREIGN KEY (license_id) REFERENCES licenses(id)
  );
`);

// ── Helpers ─────────────────────────────────────
function genKey() {
  return 'PET-' + crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g).join('-');
}

function getLicense(email, key = null) {
  if (key) return db.prepare('SELECT * FROM licenses WHERE email=? AND key=?').get(email, key);
  return db.prepare('SELECT * FROM licenses WHERE email=?').get(email);
}

function upsertLicense(email, plan, stripeSubId = null, expiresAt = null) {
  const existing = getLicense(email);
  if (existing) {
    db.prepare('UPDATE licenses SET plan=?, stripe_sub=?, expires_at=? WHERE id=?')
      .run(plan, stripeSubId, expiresAt, existing.id);
    return { ...existing, plan, stripe_sub: stripeSubId, expires_at: expiresAt };
  }
  const key = genKey();
  const info = db.prepare(
    'INSERT INTO licenses (email, key, plan, stripe_sub, expires_at) VALUES (?,?,?,?,?)'
  ).run(email, key, plan, stripeSubId, expiresAt);
  return { id: info.lastInsertRowid, email, key, plan };
}

function getUnlocked(licenseId) {
  return db.prepare('SELECT pet_id FROM unlocked WHERE license_id=?')
    .all(licenseId).map(r => r.pet_id);
}

function unlockPets(licenseId, petIds) {
  const insert = db.prepare('INSERT OR IGNORE INTO unlocked (license_id, pet_id) VALUES (?,?)');
  const tx = db.transaction((ids) => ids.forEach(id => insert.run(licenseId, id)));
  tx(petIds);
}

function revokePetpass(email) {
  const lic = getLicense(email);
  if (!lic) return;
  db.prepare("UPDATE licenses SET plan='premium', expires_at=NULL WHERE id=?").run(lic.id);
  // mantiene compras individuales, solo quita exclusivos petpass
  db.prepare("DELETE FROM unlocked WHERE license_id=? AND pet_id LIKE '%_pp'").run(lic.id);
}

module.exports = { getLicense, upsertLicense, getUnlocked, unlockPets, revokePetpass };