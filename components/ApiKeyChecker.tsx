
import React, { useEffect, useState } from 'react';

interface ApiKeyCheckerProps {
  onKeySelected: () => void;
}

export const ApiKeyChecker: React.FC<ApiKeyCheckerProps> = ({ onKeySelected }) => {
  const [checking, setChecking] = useState(true);
  const [needsKey, setNeedsKey] = useState(false);

  const checkKey = async () => {
    // AI Studio外（Vercelデプロイ後など）では window.aistudio が存在しないため、
    // 特殊なキー選択フローをスキップし、環境変数 process.env.API_KEY を使用するようにします。
    if (!window.aistudio) {
      setChecking(false);
      setNeedsKey(false);
      onKeySelected();
      return;
    }

    setChecking(true);
    try {
      // AI Studio環境内では、Nano Banana Pro（Gemini 3 Pro Image）利用のためにキー選択状態を確認
      if (await window.aistudio.hasSelectedApiKey()) {
        setNeedsKey(false);
        onKeySelected();
      } else {
        setNeedsKey(true);
      }
    } catch (e) {
      console.error("Error checking API key status", e);
      setNeedsKey(true);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        // モーダルが閉じられた後は成功したと見なして進行
        setNeedsKey(false);
        onKeySelected();
      } catch (e) {
        console.error("Key selection failed", e);
      }
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#06C755]"></div>
      </div>
    );
  }

  // AI Studio環境かつキー未選択の場合のみモーダルを表示
  if (needsKey && window.aistudio) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center font-sans">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">API Key Required</h2>
          <p className="text-gray-600 mb-6">
            To generate high-quality stamps with <b>Nano Banana Pro</b>, please select a valid API key with billing enabled.
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 px-6 rounded-xl transition-all transform hover:scale-105 shadow-lg"
          >
            Select API Key
          </button>
           <p className="mt-4 text-xs text-gray-400">
            Check <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-green-500">billing documentation</a> for more info.
          </p>
        </div>
      </div>
    );
  }

  return null;
};
