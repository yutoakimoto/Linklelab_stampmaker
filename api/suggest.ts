
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { count, context } = req.body;
    if (!process.env.API_KEY) {
      return res.status(500).json({ error: 'API_KEY is not configured on the server.' });
    }

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
        systemInstruction: "あなたは人気LINEスタンプの企画担当者です。ユーザーの要望に合わせて、短くて使いやすいスタンプの文言をJSON形式の配列で提案してください。余計な解説は含めずJSONのみを出力してください。"
      }
    });

    const rawText = response.text || "[]";
    // マークダウン等の余計な装飾を削除してクリーンなJSONにする
    const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(cleanJson);

    res.status(200).json(data);
  } catch (error: any) {
    console.error("API Suggest Error:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
