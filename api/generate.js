export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, width = 1024, height = 1024, style = 'photorealistic' } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'الرجاء إدخال الوصف' });
    }

    try {
        // 1. نظام Kivora Magic Prompt لتعزيز التفاصيل تلقائياً
        const styleModifiers = {
            'photorealistic': 'hyperrealistic 8k photo, cinematic lighting, highly detailed, masterfully shot',
            'anime': 'vibrant anime style, studio ghibli inspired, clean line art, high quality',
            'digital-art': 'trending on artstation, detailed digital painting, vibrant colors, expressive concept art',
            'cyberpunk': 'cyberpunk aesthetics, neon glow, futuristic city atmosphere, highly detailed'
        };

        const enhancedPrompt = `${prompt}, ${styleModifiers[style] || styleModifiers['photorealistic']}`;

        // تحديد الأبعاد
        let aspectRatio = "1:1";
        if (width > height) aspectRatio = "16:9";
        else if (height > width) aspectRatio = "9:16";

        // 2. إرسال الطلب لنموذج FLUX.1 المطور على Replicate
        const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
                "Content-Type": "application/json",
                "Prefer": "wait"
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

        if (data.error || response.status >= 400) {
            return res.status(500).json({ error: data.error || data.detail || "خطأ في استجابة النموذج" });
        }

        let prediction = data;
        
        // انتظام المعالجة في حال احتاج النموذج إلى وقت إضافي
        while (prediction.status !== "succeeded" && prediction.status !== "failed") {
            await new Promise(resolve => setTimeout(resolve, 800));
            const checkRes = await fetch(prediction.urls.get, {
                headers: { "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}` }
            });
            prediction = await checkRes.json();
        }

        if (prediction.status === "succeeded") {
            const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
            return res.status(200).json({
                success: true,
                provider: 'Kivora Core FLUX Engine',
                image_url: outputUrl
            });
        } else {
            return res.status(500).json({ error: prediction.error || "فشل توليد الصورة بواسطة النموذج" });
        }

    } catch (error) {
        return res.status(500).json({ error: "حدث خطأ في الاتصال بالمحرك الخلفي: " + error.message });
    }
}
