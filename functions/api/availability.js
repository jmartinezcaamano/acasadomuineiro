const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function isValidDate(value) {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return json({ error: "D1 database binding DB is not configured." }, 500);

  const url = new URL(context.request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || addDays(from, 365);

  if (!isValidDate(from) || !isValidDate(to) || from >= to) {
    return json({ error: "Use valid from/to dates in YYYY-MM-DD format." }, 400);
  }

  const { results } = await db
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
