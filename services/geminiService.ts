
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `LINEスタンプのメッセージ案を${count}個考えてください。文脈・設定: ${context || "日常で使いやすいもの"}`,
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

  const rawText = response.text || "[]";
  return JSON.parse(rawText);
};

/**
 * スタンプ画像を生成する (Gemini 3 Pro Image 使用)
 */
export const generateStampImage = async (
  referenceImages: ReferenceImageData[],
  style: StampStyle,
  text: string,
  additionalPrompt: string
): Promise<string> => {
  // 常に最新のAPIキーを使用するため、呼び出し直前にインスタンス化
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
    Technical: SOLID PURE WHITE (#FFFFFF) BACKGROUND. Die-cut white border. High quality illustration.
  `;

  const parts: any[] = [{ text: prompt }];
  if (referenceImages && referenceImages.length > 0) {
    referenceImages.forEach((img) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: parts },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K"
      },
    },
  });

  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error("No candidates returned from AI.");

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  
  throw new Error("No image data found in AI response.");
};
