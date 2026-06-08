const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validDateOrNull(value) {
  const text = clean(value, 20);
  return DATE_RE.test(text) ? text : null;
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database binding DB is not configured." }, 500);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const name = clean(body.name, 120);
  const contact = clean(body.contact, 180);
  const requestedStart = validDateOrNull(body.requestedStart);
  const requestedEnd = validDateOrNull(body.requestedEnd);
  const guests = Number.isFinite(Number(body.guests)) ? Number(body.guests) : null;
  const message = clean(body.message, 1200);

  if (!contact && !message) {
    return json({ error: "Contact or message is required." }, 400);
  }

  const result = await db
    .prepare(
      `INSERT INTO inquiries (name, contact, requested_start, requested_end, guests, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(name || null, contact || null, requestedStart, requestedEnd, guests, message || null)
    .run();

  return json({ ok: true, id: result.meta.last_row_id }, 201);
}
