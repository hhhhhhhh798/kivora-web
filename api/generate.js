export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, width = 1024, height = 1024, style = 'photorealistic' } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'الرجاء إدخال الوصف' });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'لم يتم العثور على REPLICATE_API_TOKEN. يرجى عمل Redeploy على Vercel.' });
    }

    try {
        const styleModifiers = {
            'photorealistic': 'hyperrealistic 8k photo, cinematic lighting, highly detailed',
            'anime': 'vibrant anime style, clean line art, high quality',
            'digital-art': 'detailed digital painting, vibrant colors',
            'cyberpunk': 'cyberpunk aesthetics, neon glow, futuristic city atmosphere'
        };

        const enhancedPrompt = `${prompt}, ${styleModifiers[style] || styleModifiers['photorealistic']}`;

        let aspectRatio = "1:1";
        if (width > height) aspectRatio = "16:9";
        else if (height > width) aspectRatio = "9:16";

        const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
            method: "POST",
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json",
                "Prefer": "wait=8"
            },
            body: JSON.stringify({
                input: {
                    prompt: enhancedPrompt,
                    aspect_ratio: aspectRatio,
                    output_format: "webp",
                    output_quality: 90
                }
            })
        });

        const data = await response.json();

        if (response.status >= 400 || data.error) {
            return res.status(response.status).json({ error: data.error || data.detail || "خطأ في المفتاح أو الخدمة" });
        }

        let outputUrl = null;

        if (data.status === "succeeded") {
            outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        } else if (data.urls && data.urls.get) {
            for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const checkRes = await fetch(data.urls.get, {
                    headers: { "Authorization": `Token ${token}` }
                });
                const checkData = await checkRes.json();
                if (checkData.status === "succeeded") {
                    outputUrl = Array.isArray(checkData.output) ? checkData.output[0] : checkData.output;
                    break;
                }
            }
        }

        if (outputUrl) {
            return res.status(200).json({
                success: true,
                provider: 'Kivora Core FLUX Engine',
                image_url: outputUrl
            });
        } else {
            return res.status(500).json({ error: "تأخر المحرك في الاستجابة، يرجى المحاولة مرة أخرى" });
        }

    } catch (error) {
        return res.status(500).json({ error: "حدث خطأ: " + error.message });
    }
}
