export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { prompt, width = 1024, height = 1024 } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'الرجاء إدخال الوصف' });
    }

    try {
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true`;

        return res.status(200).json({
            success: true,
            provider: 'Kivora Core Engine v1',
            image_url: imageUrl
        });
    } catch (error) {
        return res.status(500).json({ error: 'حدث خطأ في معالجة النموذج' });
    }
}
