
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { referenceImages, style, text, additionalPrompt } = req.body;
    if (!process.env.API_KEY) {
      return res.status(500).json({ error: 'API_KEY is not configured on the server.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const characterConsistencyInstruction = referenceImages && referenceImages.length > 0 
      ? `Maintain the character from the images. Artistic medium/brush stroke must be identical to the references.`
      : `Create a distinct, consistent character design.`;

    const prompt = `
      Task: Design a professional LINE Messenger Sticker (Stamp).
      Message: "${text}"
      Pose/Action: ${additionalPrompt || "Expressing the emotion naturally"}.
      ${characterConsistencyInstruction}
      Style: ${style}
      Graphic: Include the text "${text}" in stylized, readable Japanese typography.
      Technical: SOLID PURE WHITE (#FFFFFF) BACKGROUND. Die-cut white border.
    `;

    const parts: any[] = [{ text: prompt }];
    if (referenceImages && referenceImages.length > 0) {
      referenceImages.forEach((img: any) => {
        parts.push({
          inlineData: { data: img.base64, mimeType: img.mimeType },
        });
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: parts },
      config: {
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned from AI.");

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return res.status(200).json({ image: `data:image/png;base64,${part.inlineData.data}` });
      }
    }
    
    throw new Error("No image data found in AI response.");
  } catch (error: any) {
    console.error("API Generate Error:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
