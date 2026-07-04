const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["confirmed", "blocked", "pending", "cancelled"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function isValidDate(value) {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function validDateOrNull(value) {
  const text = clean(value, 20);
  return DATE_RE.test(text) ? text : null;
}

function requireDb(env) {
  if (!env.DB) return json({ error: "D1 database binding DB is not configured." }, 500);
  return null;
}

function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return json({ error: "ADMIN_TOKEN is not configured." }, 503);

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerToken = request.headers.get("x-admin-token") || "";
  const token = bearer || headerToken;

  if (token !== expected) return json({ error: "Unauthorized." }, 401);
  return null;
}

function validateReservation(input) {
  const status = clean(input.status || "confirmed", 20);
  const startDate = clean(input.startDate || input.start_date, 20);
  const endDate = clean(input.endDate || input.end_date, 20);
  const guests = Number(input.guests || 1);
  const totalPrice = input.totalPrice === "" || input.totalPrice == null ? null : Number(input.totalPrice);

  if (!STATUSES.has(status)) return { error: "Invalid status." };
  if (!isValidDate(startDate)) return { error: "Invalid start date." };
  if (!isValidDate(endDate)) return { error: "Invalid end date." };
  if (startDate >= endDate) return { error: "End date must be after start date." };
  if (!Number.isFinite(guests) || guests < 0 || guests > 30) return { error: "Invalid guests value." };
  if (totalPrice != null && (!Number.isFinite(totalPrice) || totalPrice < 0)) {
    return { error: "Invalid total price." };
  }

  return {
    value: {
      status,
      startDate,
      endDate,
      guestName: clean(input.guestName || input.guest_name, 160),
      guestContact: clean(input.guestContact || input.guest_contact, 220),
      guests,
      source: clean(input.source || "direct", 80),
      totalPrice,
      notes: clean(input.notes, 1200),
    },
  };
}

async function handleAvailability(request, env) {
  const dbError = requireDb(env);
  if (dbError) return dbError;

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || addDays(from, 365);

  if (!isValidDate(from) || !isValidDate(to) || from >= to) {
    return json({ error: "Use valid from/to dates in YYYY-MM-DD format." }, 400);
  }

  const { results } = await env.DB
    .prepare(
      `SELECT start_date, end_date, status
       FROM reservations
       WHERE status IN ('confirmed', 'blocked')
         AND end_date > ?
         AND start_date < ?
       ORDER BY start_date ASC`
    )
    .bind(from, to)
    .all();

  return json({
    from,
    to,
    occupied: results.map((row) => ({
      start: row.start_date,
      end: row.end_date,
      status: row.status,
    })),
  });
}

async function handleInquiry(request, env) {
  const dbError = requireDb(env);
  if (dbError) return dbError;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const name = clean(body.name, 120);
  const contact = clean(body.contact, 180);
  const requestedStart = validDateOrNull(body.requestedStart);
  const requestedEnd = validDateOrNull(body.requestedEnd);
  const guests = Number.isFinite(Number(body.guests)) ? Number(body.guests) : null;
  const message = clean(body.message, 1200);

  if (!contact && !message) return json({ error: "Contact or message is required." }, 400);

  const result = await env.DB
    .prepare(
      `INSERT INTO inquiries (name, contact, requested_start, requested_end, guests, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(name || null, contact || null, requestedStart, requestedEnd, guests, message || null)
    .run();

  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function handleAdminReservations(request, env) {
  const adminError = requireAdmin(request, env);
  if (adminError) return adminError;

  const dbError = requireDb(env);
  if (dbError) return dbError;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const includeCancelled = url.searchParams.get("includeCancelled") === "true";
    const sql = includeCancelled
      ? `SELECT * FROM reservations ORDER BY start_date DESC, id DESC LIMIT 500`
      : `SELECT * FROM reservations WHERE status != 'cancelled' ORDER BY start_date DESC, id DESC LIMIT 500`;
    const { results } = await env.DB.prepare(sql).all();
    return json({ reservations: results });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = validateReservation(body);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const value = parsed.value;

  if (request.method === "POST") {
    const result = await env.DB
      .prepare(
        `INSERT INTO reservations
         (status, start_date, end_date, guest_name, guest_contact, guests, source, total_price, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        value.status,
        value.startDate,
        value.endDate,
        value.guestName || null,
        value.guestContact || null,
        value.guests,
        value.source || "direct",
        value.totalPrice,
        value.notes || null
      )
      .run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  }

  if (request.method === "PATCH") {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return json({ error: "Valid id is required." }, 400);

    await env.DB
      .prepare(
        `UPDATE reservations
         SET status = ?, start_date = ?, end_date = ?, guest_name = ?, guest_contact = ?,
             guests = ?, source = ?, total_price = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(
        value.status,
        value.startDate,
        value.endDate,
        value.guestName || null,
        value.guestContact || null,
        value.guests,
        value.source || "direct",
        value.totalPrice,
        value.notes || null,
        id
      )
      .run();
    return json({ ok: true, id });
  }

  return json({ error: "Method not allowed." }, 405);
}

async function routeApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/availability" && request.method === "GET") {
    return handleAvailability(request, env);
  }
  if (url.pathname === "/api/inquiries" && request.method === "POST") {
    return handleInquiry(request, env);
  }
  if (url.pathname === "/api/admin/reservations") {
    return handleAdminReservations(request, env);
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return routeApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
