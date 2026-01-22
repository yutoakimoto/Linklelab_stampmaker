
import { GoogleGenAI, Type } from "@google/genai";
import { StampStyle } from "../types";

export interface ReferenceImageData {
  base64: string;
  mimeType: string;
}

export interface StampConfig {
  text: string;
  additionalPrompt: string;
}

// Helper to convert Blob/File to Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * AIにメッセージ案を提案してもらう機能
 */
export const suggestMessages = async (count: number, context: string): Promise<string[]> => {
  // デフォルトの提案（エラー時のバックアップ）
  const fallback = ["ありがとう", "了解", "おやすみ", "OK", "おつかれ", "よろしく", "ぺこり", "！！", "まかせて", "ぴえん", "わーい", "おめでとう", "すごい！", "それな", "おはよ", "またね"].slice(0, count);

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY is not defined. Using fallback suggestions.");
    return fallback;
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `LINEスタンプのメッセージ案を${count}個考えてください。
  文脈・設定: ${context || "日常で使いやすいもの"}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: "スタンプに使用する短いフレーズ（10文字以内）"
          }
        },
        systemInstruction: "あなたは人気LINEスタンプの企画担当者です。ユーザーの要望に合わせて、短くて使いやすいスタンプの文言をJSON形式の配列で提案してください。"
      }
    });

    const text = response.text;
    if (!text) return fallback;

    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.error("Suggestion Error:", error);
    return fallback;
  }
};

/**
 * スタンプ画像を生成する
 */
export const generateStampImage = async (
  referenceImages: ReferenceImageData[],
  style: StampStyle,
  text: string,
  additionalPrompt: string
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("APIキーが設定されていません。Vercelの環境変数を確認してください。");
  }
  
  const ai = new GoogleGenAI({ apiKey });

  // キャラクターの「同一性」と「画風の継続性」を定義する指示
  const characterConsistencyInstruction = referenceImages.length > 0 
    ? `
    **CHARACTER IDENTITY & CONTINUITY**
    - The provided reference image defines the character's "Anchor Features": specific hair flow/volume, eye shape characteristics, and overall facial structure.
    - You MUST treat this character as the recurring protagonist of a professional sticker series.
    - Maintain the character's core identity (same person) while allowing dynamic changes in facial expressions (laughing, crying, apologizing) and varied body poses.
    - **Crucial**: The artistic medium, brush stroke quality, and lighting style must be identical to the reference image.
    `
    : `
    **CHARACTER CONSISTENCY**
    - Create a distinct, memorable character design.
    - Use this same character design consistently for every sticker in the set.
    `;

  const prompt = `
    Task: Design a professional LINE Messenger Sticker (Stamp).

    **Character Performance**
    - Message: "${text}"
    - Pose/Action: ${additionalPrompt || "Expressing the emotion naturally"}.
    - Ensure the character's expression is vivid, emotive, and matches the message "${text}".

    ${characterConsistencyInstruction}

    **Style Specification**
    - Art Style: ${style}
    - Aesthetic: High-end sticker illustration. Clean, professional, and visually appealing.
    
    **Graphic Integration**
    - Effectively include the text "${text}" within the image using stylized, readable Japanese typography.
    - The text should feel like a natural part of the sticker composition.

    **Technical Specs**
    - Background: SOLID PURE WHITE (#FFFFFF) ONLY. 
    - No background elements, no floor shadows, no scenery.
    - Die-cut: Add a crisp, thick white border around the character silhouette for a "sticker" look.
    - Composition: Centered.
  `;

  const parts: any[] = [{ text: prompt }];

  if (referenceImages.length > 0) {
    referenceImages.forEach((img) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: parts },
      config: {
        imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
