// ============================================================================
//  api/lead.js — Vercel Serverless Function (Node.js)
//  Conversions API (CAPI) da Meta — Edifício Monalisa
//
//  Envia o evento "Lead" SERVER-SIDE usando o MESMO event_id do Pixel,
//  para que a Meta deduplique (Pixel no navegador + CAPI no servidor = 1 evento).
//
//  Segurança:
//   - Access Token vem SOMENTE de process.env.META_CAPI_TOKEN
//     (nunca hardcoded, nunca no client, nunca versionado).
//   - Toda comunicação com a Graph API é feita aqui no servidor.
// ============================================================================

import crypto from "node:crypto";

const GRAPH_VERSION = "v21.0";
const DATASET_ID = "1034525752246405"; // Pixel/Dataset "Edifício Monalisa" (público — não é segredo)

// SHA-256 para dados pessoais (caso um dia existam email/telefone).
// IP e User-Agent NÃO são hasheados.
const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const hashEmail = (e) => sha256(String(e).trim().toLowerCase());
const hashPhone = (p) => sha256(String(p).replace(/[^0-9]/g, ""));

export default async function handler(req, res) {
  // CORS (permite a LP chamar mesmo se estiver em outro domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed", detail: "Use POST." });
  }

  const TOKEN = process.env.META_CAPI_TOKEN;
  if (!TOKEN) {
    console.error("[CAPI] META_CAPI_TOKEN ausente nas Environment Variables.");
    return res.status(500).json({
      error: "missing_token",
      detail: "Defina META_CAPI_TOKEN nas Environment Variables da Vercel.",
    });
  }

  // body pode chegar como objeto (já parseado), string ou Buffer (sendBeacon/Blob)
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString("utf8")); } catch { body = {}; }
  } else if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  if (!body.event_id) {
    return res.status(400).json({
      error: "missing_event_id",
      detail: "event_id é obrigatório (deduplicação com o Pixel).",
    });
  }

  // IP real (x-forwarded-for) e User-Agent — NÃO hashear estes dois
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "";
  const ua = body.user_agent || req.headers["user-agent"] || "";

  const user_data = {
    client_ip_address: ip,
    client_user_agent: ua,
  };
  // _fbp / _fbc melhoram a correspondência (não são PII, não hashear)
  if (body.fbp) user_data.fbp = body.fbp;
  if (body.fbc) user_data.fbc = body.fbc;
  // dados pessoais (se um dia enviados) -> SHA-256
  if (body.email) user_data.em = [hashEmail(body.email)];
  if (body.phone) user_data.ph = [hashPhone(body.phone)];

  // custom_data: 5 UTMs + codigo_unico (MNL-XXXXXX)
  const custom_data = {
    codigo_unico: body.codigo_unico || "",
    utm_source: body.utm_source || "",
    utm_medium: body.utm_medium || "",
    utm_campaign: body.utm_campaign || "",
    utm_content: body.utm_content || "",
    utm_term: body.utm_term || "",
  };
  if (body.cta) custom_data.cta = body.cta;

  const event = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: body.event_source_url || "",
    event_id: body.event_id, // MESMO id do Pixel -> deduplicação
    user_data,
    custom_data,
  };

  const payload = { data: [event] };

  // test_event_code via env OPCIONAL:
  //  - se META_TEST_EVENT_CODE existir -> aparece em "Testar eventos"
  //  - se não existir -> envia como produção
  if (process.env.META_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET_ID}/events?access_token=${encodeURIComponent(TOKEN)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await r.json();

    if (!r.ok) {
      console.error("[CAPI] erro da Graph API:", JSON.stringify(json));
      return res.status(502).json({ error: "graph_api_error", meta: json });
    }

    console.log(
      `[CAPI] Lead OK | event_id=${body.event_id} | codigo=${custom_data.codigo_unico} | received=${json.events_received}`
    );
    return res.status(200).json({
      ok: true,
      events_received: json.events_received ?? 1,
      fbtrace_id: json.fbtrace_id,
      test: !!process.env.META_TEST_EVENT_CODE,
    });
  } catch (err) {
    console.error("[CAPI] exceção:", err);
    return res.status(500).json({ error: "exception", detail: String(err) });
  }
}
