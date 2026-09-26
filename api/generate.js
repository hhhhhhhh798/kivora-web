// Kivora — Image Generation Endpoint
//
// Only providers that need a secret credential or an async workflow go through this
// function: Nanobanana (needs a key we must not expose to the browser) and AI Horde
// (needs submit-then-poll). FLUX and Turbo are anonymous and public, so the front-end
// calls image.pollinations.ai directly — one less network hop, one less thing that can
// break here.
//
// Every failure below is returned with its real cause (HTTP status + upstream message).
// Nothing is caught and silently swapped for a generic "try again" string, and nothing
// silently falls back to a different provider without saying so — if you picked a
// provider and it failed, you get told exactly why, in the response and in this
// function's server logs (Vercel dashboard → your project → Deployments → open the
// latest one → Functions/Logs tab).

const STYLE_MODIFIERS = {
  'photorealistic': 'hyperrealistic photograph, natural light, 35mm film, fine detail',
  'anime': 'anime illustration, clean line art, cel shading, vibrant palette',
  'digital-art': 'digital painting, concept art, confident brushwork, dramatic lighting',
  'cyberpunk': 'cyberpunk city at night, neon signage, wet asphalt reflections, atmospheric haze',
};

const MAX_DIMENSION = 1440;
const MIN_DIMENSION = 256;
const HORDE_POLL_BUDGET_MS = 100_000;
const HORDE_POLL_INTERVAL_MS = 3_000;
const CLIENT_AGENT = 'Kivora:1.0:kivora-project';

function clamp(value, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, n));
}

function snapTo64(n) {
  return Math.max(64, Math.round(n / 64) * 64);
}

async function toDataUrl(response) {
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

async function safeErrorBody(response) {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Nanobanana (Gemini 3.1 Flash Image, Pollinations "seed" tier) ---
async function generateNanobanana({ encodedPrompt, width, height, seed }) {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'لسا ما في مفتاح Nanobanana معرّف على السيرفر. أضف متغير البيئة POLLINATIONS_API_KEY ' +
      'من Vercel → Settings → Environment Variables (المفتاح من enter.pollinations.ai)، وبعدها اعمل Redeploy.'
    );
    err.status = 400;
    throw err;
  }

  const url =
    `https://gen.pollinations.ai/image/${encodedPrompt}` +
    `?key=${encodeURIComponent(apiKey)}&model=nanobanana&width=${width}&height=${height}&seed=${seed}`;

  const response = await fetch(url);
  if (!response.ok) {
    const body = await safeErrorBody(response);
    const err = new Error(`Nanobanana رجّع خطأ (HTTP ${response.status}): ${body || 'بدون تفاصيل إضافية'}`);
    err.status = 502;
    throw err;
  }
  const image_url = await toDataUrl(response);
  return { image_url, provider: 'Kivora Engine · Nanobanana (Gemini 3.1 Flash Image)', model: 'nanobanana' };
}

// --- AI Horde (crowdsourced, open-source Stable Diffusion models, no signup required) ---
async function generateHorde({ prompt, width, height }) {
  const apiKey = process.env.AIHORDE_API_KEY || '0000000000'; // anonymous tier if not set
  const w = snapTo64(width);
  const h = snapTo64(height);

  const submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey,
      'Client-Agent': CLIENT_AGENT,
    },
    body: JSON.stringify({
      prompt,
      params: {
        width: w,
        height: h,
        steps: 22,
        cfg_scale: 7,
        sampler_name: 'k_euler_a',
        karras: true,
        n: 1,
      },
      r2: true,
      nsfw: false,
    }),
  });

  if (!submitRes.ok) {
    const body = await safeErrorBody(submitRes);
    const err = new Error(`AI Horde رفض الطلب (HTTP ${submitRes.status}): ${body || 'بدون تفاصيل إضافية'}`);
    err.status = 502;
    throw err;
  }
  const { id, message } = await submitRes.json();
  if (!id) {
    const err = new Error(`AI Horde ما رجّع رقم طلب (id). الرسالة: ${message || 'غير معروفة'}`);
    err.status = 502;
    throw err;
  }

  const deadline = Date.now() + HORDE_POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await sleep(HORDE_POLL_INTERVAL_MS);
    const checkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${id}`, {
      headers: { 'Client-Agent': CLIENT_AGENT },
    });
    if (!checkRes.ok) continue; // transient — keep polling until the deadline
    const check = await checkRes.json();
    if (check.faulted) {
      const err = new Error('الموديل يلي اختاره الطابور توقف أثناء الرسم (faulted). جرب مرة ثانية.');
      err.status = 502;
      throw err;
    }
    if (check.done) {
      const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${id}`, {
        headers: { 'Client-Agent': CLIENT_AGENT },
      });
      if (!statusRes.ok) {
        const body = await safeErrorBody(statusRes);
        const err = new Error(`تعذّر جلب نتيجة AI Horde (HTTP ${statusRes.status}): ${body || ''}`);
        err.status = 502;
        throw err;
      }
      const status = await statusRes.json();
      const gen = status.generations && status.generations[0];
      if (!gen || !gen.img) {
        const err = new Error('AI Horde قال إنه خلص، بس ما رجّع صورة.');
        err.status = 502;
        throw err;
      }
      return {
        image_url: gen.img,
        provider: `Kivora Engine · AI Horde (${gen.model || 'Stable Diffusion مجتمعي'})`,
        model: gen.model || 'unknown',
      };
    }
  }

  const err = new Error('الطابور المجتمعي مزدحم وما خلص خلال الوقت المسموح. جرب مرة ثانية بعد شوي.');
  err.status = 504;
  throw err;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الرجاء إرسال الطلب عبر POST' });
  }

  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const provider = body.provider === 'horde' ? 'horde' : 'nanobanana';
  const style = STYLE_MODIFIERS[body.style] ? body.style : 'photorealistic';

  if (!prompt) {
    return res.status(400).json({ error: 'الرجاء إدخال وصف للصورة' });
  }
  if (prompt.length > 800) {
    return res.status(400).json({ error: 'الوصف طويل جداً — اختصره قليلاً' });
  }

  const width = clamp(body.width, 1024);
  const height = clamp(body.height, 1024);
  const seed = Math.floor(Math.random() * 10_000_000);
  const enhancedPrompt = `${prompt}, ${STYLE_MODIFIERS[style]}`;
  const encodedPrompt = encodeURIComponent(enhancedPrompt);

  try {
    const result = provider === 'horde'
      ? await generateHorde({ prompt: enhancedPrompt, width, height })
      : await generateNanobanana({ encodedPrompt, width, height, seed });

    return res.status(200).json({ success: true, seed, width, height, ...result });
  } catch (err) {
    console.error(`[kivora/generate] provider=${provider}`, err);
    return res.status(err.status || 500).json({ error: err.message || 'صار خطأ غير متوقع.' });
  }
}
