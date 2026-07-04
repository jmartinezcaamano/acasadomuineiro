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

function requireAdmin(context) {
  const expected = context.env.ADMIN_TOKEN;
  if (!expected) return { error: json({ error: "ADMIN_TOKEN is not configured." }, 503) };

  const auth = context.request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerToken = context.request.headers.get("x-admin-token") || "";
  const token = bearer || headerToken;

  if (token !== expected) return { error: json({ error: "Unauthorized." }, 401) };
  return { ok: true };
}

function validateReservation(input, partial = false) {
  const status = clean(input.status || "confirmed", 20);
  const startDate = clean(input.startDate || input.start_date, 20);
  const endDate = clean(input.endDate || input.end_date, 20);
  const guests = Number(input.guests || 1);
  const totalPrice = input.totalPrice === "" || input.totalPrice == null ? null : Number(input.totalPrice);

  if (!partial || input.status != null) {
    if (!STATUSES.has(status)) return { error: "Invalid status." };
  }
  if (!partial || input.startDate != null || input.start_date != null) {
    if (!isValidDate(startDate)) return { error: "Invalid start date." };
  }
  if (!partial || input.endDate != null || input.end_date != null) {
    if (!isValidDate(endDate)) return { error: "Invalid end date." };
  }
  if (startDate && endDate && startDate >= endDate) {
    return { error: "End date must be after start date." };
  }
  if (!Number.isFinite(guests) || guests < 0 || guests > 30) {
    return { error: "Invalid guests value." };
  }
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

export async function onRequestGet(context) {
  const auth = requireAdmin(context);
  if (auth.error) return auth.error;

  const db = context.env.DB;
  if (!db) return json({ error: "D1 database binding DB is not configured." }, 500);

  const url = new URL(context.request.url);
  const includeCancelled = url.searchParams.get("includeCancelled") === "true";
  const sql = includeCancelled
    ? `SELECT * FROM reservations ORDER BY start_date DESC, id DESC LIMIT 500`
    : `SELECT * FROM reservations WHERE status != 'cancelled' ORDER BY start_date DESC, id DESC LIMIT 500`;

  const { results } = await db.prepare(sql).all();
  return json({ reservations: results });
}

export async function onRequestPost(context) {
  const auth = requireAdmin(context);
  if (auth.error) return auth.error;

  const db = context.env.DB;
  if (!db) return json({ error: "D1 database binding DB is not configured." }, 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = validateReservation(body);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const value = parsed.value;

  const result = await db
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

export async function onRequestPatch(context) {
  const auth = requireAdmin(context);
  if (auth.error) return auth.error;

  const db = context.env.DB;
  if (!db) return json({ error: "D1 database binding DB is not configured." }, 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return json({ error: "Valid id is required." }, 400);

  const parsed = validateReservation(body);
  if (parsed.error) return json({ error: parsed.error }, 400);
  const value = parsed.value;

  await db
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
