// Kivora — Image Generation Endpoint
//
// Two tiers, same contract to the front-end (always returns { success, image_url, provider }):
//
// 1) No setup (default): anonymous FLUX.1 [schnell] via image.pollinations.ai.
//    Free, no signup — but this is the *distilled, speed-optimized* FLUX variant, so short
//    prompts ("Cat") can come out soft/generic. It also carries a pollinations.ai watermark
//    on anonymous requests (nologo requires a verified domain — see STYLE_GUIDE.md).
//
// 2) With a free key (recommended): once POLLINATIONS_API_KEY is set as an environment
//    variable on Vercel, this switches to `nanobanana` (Gemini 3.1 Flash Image) on
//    Pollinations' "seed" tier — still $0, but noticeably sharper and no watermark.
//    Get a free key at https://enter.pollinations.ai — a "publishable" key is enough,
//    since this call happens server-side in this function either way.
//
// The image is fetched here (server-side) and returned as a data URL, so the front-end
// never needs to know which tier served it. Vercel's default function timeout (300s on
// Hobby) comfortably covers generation time, so there's no risk of the request being cut
// off mid-render.

const STYLE_MODIFIERS = {
  'photorealistic': 'hyperrealistic photograph, natural light, 35mm film, fine detail',
  'anime': 'anime illustration, clean line art, cel shading, vibrant palette',
  'digital-art': 'digital painting, concept art, confident brushwork, dramatic lighting',
  'cyberpunk': 'cyberpunk city at night, neon signage, wet asphalt reflections, atmospheric haze',
};

const MAX_DIMENSION = 1440;
const MIN_DIMENSION = 256;
const FETCH_TIMEOUT_MS = 55_000;

function clamp(value, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, n));
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function toDataUrl(response) {
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'الرجاء إرسال الطلب عبر POST' });
  }

  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
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
  const apiKey = process.env.POLLINATIONS_API_KEY;

  // Tier 1: Nanobanana (Gemini 3.1 Flash Image) — only if a free key is configured.
  if (apiKey) {
    try {
      const url =
        `https://gen.pollinations.ai/image/${encodedPrompt}` +
        `?key=${encodeURIComponent(apiKey)}&model=nanobanana&width=${width}&height=${height}&seed=${seed}`;
      const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
      if (response.ok) {
        const image_url = await toDataUrl(response);
        return res.status(200).json({
          success: true,
          provider: 'Kivora Engine · Nanobanana (Gemini 3.1 Flash Image)',
          seed, width, height,
          image_url,
        });
      }
      // fall through to the anonymous tier below on any non-OK response
    } catch (err) {
      // fall through to the anonymous tier below on timeout/network error
    }
  }

  // Tier 2 (default / fallback): anonymous FLUX.1 [schnell], enhance=true asks
  // Pollinations' own AI to flesh out short prompts before generating.
  try {
    const url =
      `https://image.pollinations.ai/prompt/${encodedPrompt}` +
      `?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true&enhance=true&referrer=kivora`;
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!response.ok) {
      return res.status(502).json({ error: 'محرك التوليد ما رجّع صورة. حاول مرة ثانية.' });
    }
    const image_url = await toDataUrl(response);
    return res.status(200).json({
      success: true,
      provider: 'Kivora Engine · FLUX.1 [schnell] (Apache 2.0)',
      seed, width, height,
      image_url,
    });
  } catch (err) {
    return res.status(504).json({ error: 'المحرك طوّل بالرد أكثر من اللازم. حاول مرة ثانية.' });
  }
}
