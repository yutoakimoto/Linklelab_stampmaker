
import { GoogleGenAI } from "@google/genai";
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `LINEスタンプのメッセージ案を${count}個考えてください。
  文脈・設定: ${context || "日常で使いやすいもの"}
  条件:
  - 10文字以内の短いフレーズ
  - 敬語、タメ口、感情表現をバランスよく
  - JSON配列形式で出力してください。例: ["ありがとう", "了解", "おつかれさま"]
  - 余計な説明は不要です。`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Suggestion Error:", error);
    return ["ありがとう", "了解", "おやすみ", "OK", "おつかれ", "よろしく", "ぺこり", "！！"].slice(0, count);
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // キャラクターの「同一性」と「画風の継続性」を定義する指示
  // 単なる顔の固定ではなく、アイデンティティとなる要素（髪型、特徴的なパーツ）を捉えつつ
  // シリーズ物としての「タッチの統一」を強く意識させる
  const characterConsistencyInstruction = referenceImages.length > 0 
    ? `
    **CHARACTER IDENTITY & CONTINUITY**
    - The provided reference image defines the character's "Anchor Features": specific hair flow/volume, eye shape characteristics, and overall facial structure.
    - You MUST treat this character as the recurring protagonist of a professional sticker series.
    - Maintain the character's core identity (same person) while allowing dynamic changes in facial expressions (laughing, crying, apologizing) and varied body poses.
    - **Crucial**: The artistic medium, brush stroke quality, and lighting style must be identical to the reference image to ensure "Visual Cohesion" across the entire set.
    `
    : `
    **CHARACTER CONSISTENCY**
    - Create a distinct, memorable character design.
    - Use this same character design consistently for every sticker in the set, ensuring they all feel like they belong to the same visual brand.
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
    - The text should feel like a natural part of the sticker composition (e.g., using speech bubbles or decorative lettering).

    **Technical Specs**
    - Background: SOLID PURE WHITE (#FFFFFF) ONLY. 
    - No background elements, no floor shadows, no scenery.
    - Die-cut: Add a crisp, thick white border around the character silhouette for a "sticker" look.
    - Composition: Centered, full or upper-body as appropriate for the emotion.
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
