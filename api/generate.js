// Kivora — Image Generation Endpoint
// Talks to the open-source FLUX.1 [schnell] model via Pollinations' free inference API.
//
// The previous version pointed at `https://pollinations.ai/p/...`, which is not a real
// endpoint — it returned nothing, so the browser sat on "generating" forever with no
// error. The correct host is `image.pollinations.ai`. See STYLE_GUIDE.md for the full
// list of fixes made in this pass.

const STYLE_MODIFIERS = {
  'photorealistic': 'hyperrealistic photograph, natural light, 35mm film, fine detail',
  'anime': 'anime illustration, clean line art, cel shading, vibrant palette',
  'digital-art': 'digital painting, concept art, confident brushwork, dramatic lighting',
  'cyberpunk': 'cyberpunk city at night, neon signage, wet asphalt reflections, atmospheric haze',
};

const MAX_DIMENSION = 1440;
const MIN_DIMENSION = 256;

function clamp(value, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, n));
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

  // image.pollinations.ai/prompt/... is the real, current FLUX.1 [schnell] endpoint.
  const imageUrl =
    `https://image.pollinations.ai/prompt/${encodedPrompt}` +
    `?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true&referrer=kivora`;

  return res.status(200).json({
    success: true,
    provider: 'Kivora Engine · FLUX.1 [schnell] (Apache 2.0)',
    seed,
    width,
    height,
    image_url: imageUrl,
  });
}
