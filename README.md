# Edifício Monalisa — Landing Page (Fersary Imóveis)

Landing page de alto padrão para o **Edifício Monalisa** (Indaial/SC), com **CTA direto para o WhatsApp** (sem formulário, baixa fricção) e **medição exata de leads** via **Meta Pixel + Conversions API (CAPI)** e camada de dados do **Google Tag Manager**.

Cada clique no WhatsApp:
1. dispara o evento padrão **`Lead`** no **Pixel** (navegador), com um `event_id` único;
2. faz `dataLayer.push({event:'whatsapp_lead', ...})` para o **GTM**;
3. envia o **mesmo evento** pela **Conversions API** (servidor) com o **mesmo `event_id`** → a Meta **deduplica** e conta **1 lead** real;
4. abre o WhatsApp com uma **mensagem pré-preenchida** contendo a **campanha (UTM)** e um **código único** (`MNL-XXXXXX`) — assim cada lead chega rastreável e atribuível à campanha.

---

## 1. Estrutura

```
monalisa-lp/
├── index.html          # a página (HTML + CSS + JS, tudo embutido)
├── api/lead.js         # endpoint serverless da Conversions API (Vercel/Netlify)
├── assets/img/         # imagens otimizadas (render, fachada, planta, etc.)
└── README.md
```

## 2. Configuração obrigatória (antes de publicar)

Abra o `index.html` e edite o bloco **`window.MONALISA_CONFIG`** (perto do fim do arquivo):

| Campo | O que colocar |
|---|---|
| `WHATSAPP_NUMBER` | Número da Fersary com DDI+DDD, só dígitos. Ex.: `5547999998888` |
| `PIXEL_ID` | ID do Meta Pixel. Vazio = modo preview (apenas console) |
| `GTM_ID` | ID do container GTM (`GTM-XXXXXX`). Opcional |
| `CAPI_ENDPOINT` | Caminho do endpoint da CAPI. Padrão `/api/lead`. Vazio = desativa o servidor |
| `LEAD_VALUE` | Valor estimado por lead (opcional, ajuda a otimização) |

> A página **já funciona** com os campos vazios (para visualização). O Pixel e a CAPI só passam a contar de verdade depois de preenchidos.

## 3. Medição — Conversions API (a parte "exata")

A CAPI roda no `api/lead.js`. Configure as variáveis de ambiente no seu host:

```
META_PIXEL_ID        = 1034525752246405     # Pixel "Edifício Monalisa" (mesmo do front-end)
META_CAPI_TOKEN      = EAAW...              # token da Conversions API (já gerado — ver abaixo)
META_TEST_EVENT_CODE = TEST12345           # opcional, só para a aba "Testar eventos"
```

> ✅ **Já configurado:** o Pixel ID e o token da Conversions API já estão preenchidos no arquivo
> local **`.env`** (ignorado pelo git). No deploy, copie `META_PIXEL_ID` e `META_CAPI_TOKEN` de
> `.env` para as Environment Variables do projeto (Vercel/Netlify). O token foi gerado em
> Events Manager → dataset *Edifício Monalisa* → Configurações → API de Conversões (sem Dataset
> Quality API). Se precisar revogar/rotacionar, gere um novo no mesmo lugar e atualize o `.env`.

### Deploy rápido (Vercel — recomendado)
```bash
npm i -g vercel
cd monalisa-lp
vercel            # publica o site; /api/lead vira a rota da CAPI automaticamente
vercel env add META_PIXEL_ID
vercel env add META_CAPI_TOKEN
vercel --prod
```

### Alternativas
- **Netlify:** mova `api/lead.js` para `netlify/functions/lead.js` e ajuste `CAPI_ENDPOINT` para `/.netlify/functions/lead`.
- **Só Pixel (sem servidor):** deixe `CAPI_ENDPOINT: ""`. Você perde a deduplicação server-side, mas o evento `Lead` do Pixel continua contando.
- **Cloudflare Workers:** a mesma lógica do `lead.js` funciona; troque `export default handler` pelo formato `fetch(request)` do Worker.

## 4. Como validar

1. **Events Manager → Testar eventos:** preencha `META_TEST_EVENT_CODE`, clique num botão de WhatsApp e veja chegarem **dois** sinais do `Lead` (Browser + Server) **mesclados** pelo mesmo `event_id` (= 1 evento deduplicado).
2. **Meta Pixel Helper** (extensão Chrome): confirma o disparo no navegador.
3. **GTM Preview:** confirma o `dataLayer` `whatsapp_lead`.
4. **Relatório:** no Events Manager, filtre o evento `Lead` por `utm_campaign`/`utm_source` (estão no `custom_data`) para ver **quantos leads cada campanha gerou**.

## 5. Atribuição por campanha

Use URLs com UTM nos anúncios, por exemplo:
```
https://SEU-DOMINIO.com/?utm_source=meta&utm_medium=cpc&utm_campaign=monalisa_outubro&utm_content=criativo_a
```
As UTMs são persistidas (cookie 30 dias), enviadas no evento `Lead` (Pixel + CAPI) **e** incluídas na mensagem do WhatsApp. O `fbclid` é convertido em `_fbc` para melhorar a qualidade de correspondência da CAPI.

## 6. Conteúdo / identidade visual

- **Cores:** navy `#13203b`, dourado `#c6a256→#e7cf95`, creme `#f6f1e7` — extraídas do material do empreendimento.
- **Tipografia (Google Fonts):** **Cinzel** (logo/wordmark, equivalente à serifada inscricional "MONALISA"), **Cormorant Garamond** (títulos editoriais) e **Montserrat** (texto/UI).
- **Logo:** wordmark "MONALISA" com o emblema da Mona Lisa recriado em **SVG vetorial** (nítido em qualquer tamanho).
- **Imagens:** render, fachada e planta foram recortados e tratados a partir do material oficial. *Imagens meramente ilustrativas.*

> Observação: o Drive do empreendimento continha sobretudo fotos de um evento no escritório + o banner (roll-up) com o render e a planta. O render foi extraído e limpo a partir desse banner. Se a Fersary tiver **renders em alta resolução, fotos da obra/decorado e a planta vetorial**, é só substituir os arquivos em `assets/img/` para um acabamento ainda melhor.
