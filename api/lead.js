// ============================================================================
//  Conversions API (CAPI) — Edifício Monalisa
//  Recebe o beacon do site e envia o evento "Lead" server-side para a Meta,
//  usando o MESMO event_id do Pixel (deduplicação automática).
//
//  Deploy: Vercel (pasta /api  -> rota /api/lead) ou Netlify Functions.
//  Variáveis de ambiente necessárias:
//    META_PIXEL_ID        = ID do seu Pixel (mesmo do front-end)
//    META_CAPI_TOKEN      = Token de acesso da Conversions API
//                           (Events Manager > Configurações > Conversions API)
//    META_TEST_EVENT_CODE = (opcional) código de teste p/ aba "Testar eventos"
// ============================================================================

const GRAPH_VERSION = "v19.0";

export default async function handler(req, res) {
  // CORS simples (caso o site esteja em domínio diferente do endpoint)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const TOKEN = process.env.META_CAPI_TOKEN;
  const TEST_CODE = process.env.META_TEST_EVENT_CODE || "";

  if (!PIXEL_ID || !TOKEN) {
    return res.status(500).json({ error: "missing_env", detail: "Defina META_PIXEL_ID e META_CAPI_TOKEN" });
  }

  // body pode chegar como string (sendBeacon) ou objeto já parseado
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // IP e User-Agent reais do visitante (melhoram o "match quality")
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress || "";
  const ua = req.headers["user-agent"] || "";

  const user_data = {
    client_ip_address: ip,
    client_user_agent: ua,
  };
  if (body.fbp) user_data.fbp = body.fbp;
  if (body.fbc) user_data.fbc = body.fbc;

  const event = {
    event_name: body.event_name || "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.event_id, // <-- igual ao do Pixel => deduplicação
    event_source_url: body.event_source_url || "",
    action_source: body.action_source || "website",
    user_data,
    custom_data: body.custom_data || { lead_code: body.lead_code, cta: body.cta },
  };

  const payload = { data: [event] };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${TOKEN}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await r.json();
    if (!r.ok) {
      console.error("CAPI error", json);
      return res.status(502).json({ error: "capi_failed", meta: json });
    }
    return res.status(200).json({ ok: true, events_received: json.events_received ?? 1 });
  } catch (err) {
    console.error("CAPI exception", err);
    return res.status(500).json({ error: "exception", detail: String(err) });
  }
}
