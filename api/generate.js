export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, width = 1024, height = 1024, style = 'photorealistic' } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'الرجاء إدخال الوصف' });
    }

    // التحقق من وجود المفتاح بالاسم الصحيح
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        return res.status(500).json({ 
            error: 'لم يتم العثور على المفتاح REPLICATE_API_TOKEN. تأكد من تسمية المتغير بهذا الاسم بالضبط في Vercel وتأكيد Redeploy.' 
        });
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

        // إرسال الطلب إلى نموذج FLUX.1 عبر Replicate API
        const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token.trim()}`,
                "Content-Type": "application/json",
                "Prefer": "wait=10"
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

        if (!response.ok || data.error) {
            const errorDetails = data.error || data.detail || JSON.stringify(data);
            return res.status(response.status || 500).json({ error: `Replicate Error (${response.status}): ${errorDetails}` });
        }

        let outputUrl = null;

        if (data.status === "succeeded") {
            outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        } else if (data.urls && data.urls.get) {
            // انتظار وتتبع اكتمال الصورة خلال 8 ثوانٍ
            for (let i = 0; i < 8; i++) {
                await new Promise(r => setTimeout(r, 1000));
                const checkRes = await fetch(data.urls.get, {
                    headers: { "Authorization": `Bearer ${token.trim()}` }
                });
                const checkData = await checkRes.json();
                if (checkData.status === "succeeded") {
                    outputUrl = Array.isArray(checkData.output) ? checkData.output[0] : checkData.output;
                    break;
                } else if (checkData.status === "failed") {
                    return res.status(500).json({ error: "فشلت معالجة الصورة: " + (checkData.error || "خطأ غير معروف") });
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
            return res.status(500).json({ error: "استغرق التوليد وقتاً أطول من المتوقع، يرجى المحاولة مرة أخرى." });
        }

    } catch (error) {
        return res.status(500).json({ error: "حدث خطأ في الخادم: " + error.message });
    }
}
