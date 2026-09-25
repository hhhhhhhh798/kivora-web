export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, width = 1024, height = 1024, style = 'photorealistic' } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'الرجاء إدخال الوصف' });
    }

    try {
        // تحسين النص عبر نظام Kivora Prompt Enhancer
        const styleModifiers = {
            'photorealistic': 'hyperrealistic 8k photo, highly detailed, masterfully shot, 35mm film',
            'anime': 'vibrant anime style, clean line art, studio ghibli aesthetic, high quality',
            'digital-art': 'detailed digital painting, concept art, trending on artstation',
            'cyberpunk': 'cyberpunk aesthetics, neon glow, futuristic city atmosphere, highly detailed'
        };

        const enhancedPrompt = `${prompt}, ${styleModifiers[style] || styleModifiers['photorealistic']}`;

        // تحديد البذور والتكوين لمحرك FLUX 1 Schnell المفتوح المصدر
        const seed = Math.floor(Math.random() * 10000000);
        const encodedPrompt = encodeURIComponent(enhancedPrompt);

        // رابط توليد مباشر عبر محرك FLUX.1 (Schnell) المجاني بأسلوب Serverless
        const fluxImageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=flux&nologo=true`;

        return res.status(200).json({
            success: true,
            provider: 'Kivora FLUX Engine (Open Source Apache 2.0)',
            image_url: fluxImageUrl
        });

    } catch (error) {
        return res.status(500).json({ error: "حدث خطأ أثناء الاتصال بالمحرك: " + error.message });
    }
}
