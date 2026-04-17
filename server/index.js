// ═══════════════════════════════════════════════════════
//  PETPALS SERVER  –  server/index.js
//  Deploy en Railway: railway up
// ═══════════════════════════════════════════════════════
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const Stripe   = require('stripe');
const db       = require('./db');

const app    = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const PORT   = process.env.PORT || 3000;

// ── Stripe webhook necesita raw body ────────────
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(cors({ origin: '*' }));
app.use(express.json());

// ═══════════════════════════════════════════════
//  CATÁLOGO DE MASCOTAS (fuente de verdad)
// ═══════════════════════════════════════════════
const CATALOG = [
  // GRATIS
  { id: 'cat_basic',  name: 'Gatito',   tier: 'free',    price: 0,    emoji: '🐱', description: 'El clásico infaltable', behaviors: ['walk','idle','sleep'] },
  { id: 'dog_basic',  name: 'Perrito',  tier: 'free',    price: 0,    emoji: '🐶', description: 'Fiel compañero',        behaviors: ['walk','idle','sleep'] },
  { id: 'frog_basic', name: 'Ranita',   tier: 'free',    price: 0,    emoji: '🐸', description: 'Salta y trepa',         behaviors: ['walk','idle','sleep'] },

  // PREMIUM INDIVIDUAL
  { id: 'ghost_pixel',  name: 'Ghost.exe',    tier: 'premium', price: 199, priceId: process.env.PRICE_GHOST,   emoji: '👻', description: 'Flota entre ventanas, aparece y desaparece', behaviors: ['float','glitch','haunt','sleep'] },
  { id: 'dragon_pixel', name: 'Dragón Pixel', tier: 'premium', price: 199, priceId: process.env.PRICE_DRAGON,  emoji: '🐲', description: 'Lanza fuego al hacer doble clic',             behaviors: ['walk','fire','sleep','fly'] },
  { id: 'ninja_pixel',  name: 'Ninja',        tier: 'premium', price: 199, priceId: process.env.PRICE_NINJA,   emoji: '🥷', description: 'Se teletransporta al borde de la pantalla',  behaviors: ['walk','teleport','idle','sleep'] },
  { id: 'cat_witch',    name: 'Gata Bruja',   tier: 'premium', price: 199, priceId: process.env.PRICE_WITCH,   emoji: '🧙‍♀️', description: 'Lanza hechizos, deja estrellas al caminar',  behaviors: ['walk','spell','sleep','broom'] },
  { id: 'robot_pet',    name: 'RoboMascota',  tier: 'premium', price: 249, priceId: process.env.PRICE_ROBOT,   emoji: '🤖', description: 'Calcula, hackea y te muestra el tiempo',      behaviors: ['walk','compute','idle','scan'] },

  // PETPASS EXCLUSIVOS
  { id: 'unicorn_pp',  name: 'Unicornio', tier: 'petpass', price: 0, emoji: '🦄', description: 'Exclusivo PetPass — deja un rastro arcoíris', behaviors: ['walk','rainbow','idle','sleep'] },
  { id: 'alien_pp',    name: 'Alien',     tier: 'petpass', price: 0, emoji: '👾', description: 'Exclusivo PetPass — escanea tu escritorio',    behaviors: ['walk','scan','abduct','sleep'] },
];

// ── GET /catalog ────────────────────────────────
app.get('/catalog', (req, res) => {
  res.json(CATALOG.map(p => ({ ...p, priceId: undefined }))); // nunca exponemos priceId
});

// ── GET /license/check?email=&key= ──────────────
app.get('/license/check', (req, res) => {
  const { email, key } = req.query;
  if (!email || !key) return res.status(400).json({ error: 'Faltan parámetros' });

  const license = db.getLicense(email, key);
  if (!license) return res.status(404).json({ valid: false });

  const unlockedIds = db.getUnlocked(license.id);
  res.json({ valid: true, plan: license.plan, unlocked: unlockedIds, expiresAt: license.expires_at });
});

// ── POST /checkout/single ───────────────────────
// Crea sesión de pago para una mascota individual
app.post('/checkout/single', async (req, res) => {
  const { petId, email } = req.body;
  const pet = CATALOG.find(p => p.id === petId && p.tier === 'premium');
  if (!pet) return res.status(404).json({ error: 'Mascota no encontrada' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [{ price: pet.priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL}/cancel`,
      metadata: { petId, type: 'single' },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /checkout/petpass ──────────────────────
app.post('/checkout/petpass', async (req, res) => {
  const { interval, email } = req.body; // 'month' | 'year'
  const priceId = interval === 'year'
    ? process.env.PRICE_PETPASS_YEAR
    : process.env.PRICE_PETPASS_MONTH;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.APP_URL}/cancel`,
      metadata: { type: 'petpass', interval },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /poll/:sessionId ────────────────────────
// La app hace polling aquí para saber si el pago completó
app.get('/poll/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.json({ ready: false });
    }
    const email = session.customer_details?.email;
    const license = db.getLicense(email);
    if (!license) return res.json({ ready: false });
    const unlockedIds = db.getUnlocked(license.id);
    res.json({ ready: true, email, key: license.key, plan: license.plan, unlocked: unlockedIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /webhook (Stripe) ──────────────────────
app.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const email    = session.customer_details?.email;
    const meta     = session.metadata || {};
    const isPass   = meta.type === 'petpass';
    const petId    = meta.petId;
    const interval = meta.interval || 'month';
    const subId    = session.subscription;

    if (isPass) {
      const expiresAt = interval === 'year'
        ? Date.now() + 365 * 86400000
        : Date.now() + 30  * 86400000;
      const license = db.upsertLicense(email, 'petpass', subId, expiresAt);
      const petpassIds = CATALOG.filter(p => p.tier === 'petpass' || p.tier === 'premium').map(p => p.id);
      db.unlockPets(license.id, petpassIds);
    } else if (petId) {
      const license = db.upsertLicense(email, 'premium', null, null);
      db.unlockPets(license.id, [petId]);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub   = event.data.object;
    const email = sub.customer_email || sub.metadata?.email;
    if (email) db.revokePetpass(email);
  }

  res.json({ received: true });
});

app.listen(PORT, () => console.log(`PetPals server on :${PORT}`));