// ============================================================================
// Conversions API (CAPI) — Edifício Monalisa
// Recebe o beacon do site e envia o evento "Lead" server-side para a Meta,
// usando o MESMO event_id do Pixel (deduplicação automática).
//
// Deploy: Vercel (pasta /api -> rota /api/lead) ou Netlify Functions.
// Variáveis de ambiente necessárias:
//   META_CAPI_TOKEN      = Token de acesso da Conversions API
//                          (Events Manager > Configurações > Conversions API)
//   META_TEST_EVENT_CODE = (opcional) código de teste p/ aba "Testar eventos"
// ============================================================================

// Pixel ID é público (já está no front-end), portanto não precisa de env var
const PIXEL_ID    = "1034525752246405";
const GRAPH_VERSION = "v21.0";

export default async function handler(req, res) {
    // CORS — necessário quando o site estiver em domínio diferente do endpoint
  res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST")   return res.status(405).json({ error: "method_not_allowed" });

  const TOKEN     = process.env.META_CAPI_TOKEN;
    const TEST_CODE = process.env.META_TEST_EVENT_CODE || "";

  if (!TOKEN) {
        console.error("META_CAPI_TOKEN não configurado");
        return res.status(500).json({ error: "missing_env", detail: "Defina META_CAPI_TOKEN nas variáveis de ambiente da Vercel" });
  }

  // body pode chegar como string (sendBeacon) ou objeto já parseado
  let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

  // IP e User-Agent reais do visitante (melhoram o "match quality" da CAPI)
  const ip =
        (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
        req.socket?.remoteAddress || "";
    const ua = req.headers["user-agent"] || "";

  // user_data: IP e user-agent NÃO são hasheados (spec da Meta)
  const user_data = {
        client_ip_address: ip,
        client_user_agent: ua,
  };
  // fbp e fbc melhoram a correspondência — chegam do cookie do navegador
  if (body.fbp) user_data.fbp = body.fbp;
    if (body.fbc) user_data.fbc = body.fbc;

  // custom_data: UTMs + código único p/ cruzar com conversas no WhatsApp
  const custom_data = Object.assign(
    {
            content_name: "Edifício Monalisa",
            cta:          body.cta       || "",
            lead_code:    body.lead_code || body.event_id || "",
    },
        // UTMs e campos extras vindos do body.custom_data (enviado pelo front-end)
        body.custom_data || {}
      );

  // Remove campos undefined/null para não sujar o payload
  Object.keys(custom_data).forEach(k => {
        if (custom_data[k] == null || custom_data[k] === "") delete custom_data[k];
  });

  const event = {
        event_name:       body.event_name || "Lead",
        event_time:       Math.floor(Date.now() / 1000),
        event_id:         body.event_id,          // ← MESMO que o Pixel → deduplicação automática
        event_source_url: body.event_source_url || "",
        action_source:    "website",
        user_data,
        custom_data,
  };

  if (!event.event_id) {
        console.warn("event_id ausente — deduplicação não funcionará");
  }

  const payload = { data: [event] };
    // TEST_CODE ativo somente em staging (defina META_TEST_EVENT_CODE no painel da Vercel)
      if (TEST_CODE) payload.test_event_code = TEST_CODE;

  try {
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${TOKEN}`;
        const r   = await fetch(url, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(payload),
        });
        const json = await r.json();

      if (!r.ok) {
              console.error("CAPI error", JSON.stringify(json));
              return res.status(502).json({ error: "capi_failed", meta: json });
      }

      console.log(`Lead CAPI ok | event_id=${event.event_id} | events_received=${json.events_received}`);
        return res.status(200).json({ ok: true, event_id: event.event_id, events_received: json.events_received ?? 1 });
  } catch (err) {
        console.error("CAPI exception", err);
        return res.status(500).json({ error: "exception", detail: String(err) });
  }
}
