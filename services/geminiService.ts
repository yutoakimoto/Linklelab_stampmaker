
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

/**
 * 呼び出しの直前に最新のAPIキーを使用してインスタンスを生成する
 */
const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'undefined') {
    throw new Error("APIキーが設定されていません。AI Studioでキーを選択してください。");
  }
  return new GoogleGenAI({ apiKey });
};

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
  const ai = getAiClient();
  
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
      systemInstruction: "あなたは人気LINEスタンプの企画担当者です。ユーザーの要望に合わせて、短くて使いやすいスタンプの文言をJSON形式の配列で提案してください。出力はJSONのみにしてください。"
    }
  });

  const rawText = response.text || "[]";
  // 余計な装飾（マークダウン等）があれば除去してパース
  const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanJson);
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
  const ai = getAiClient();

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
  if (!candidate) throw new Error("AIから応答がありませんでした。");

  for (const part of candidate.content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  
  throw new Error("画像データが応答に含まれていません。");
};
