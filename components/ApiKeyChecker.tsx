
import React, { useEffect, useState } from 'react';

interface ApiKeyCheckerProps {
  onKeyStatusChange: (isReady: boolean) => void;
}

export const ApiKeyChecker: React.FC<ApiKeyCheckerProps> = ({ onKeyStatusChange }) => {
  const [checking, setChecking] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [isAiStudio, setIsAiStudio] = useState(false);

  const checkStatus = async () => {
    setChecking(true);
    
    const envKey = process.env.API_KEY;
    if (envKey && envKey !== 'undefined' && envKey !== '') {
      setHasKey(true);
      onKeyStatusChange(true);
      setChecking(false);
      return;
    }

    if (window.aistudio) {
      setIsAiStudio(true);
      try {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
        onKeyStatusChange(selected);
      } catch (e) {
        console.error("設定確認中にエラーが発生しました", e);
        setHasKey(true);
        onKeyStatusChange(true);
      }
    } else {
      setHasKey(true);
      onKeyStatusChange(true);
    }
    setChecking(false);
  };

  const handleOpenSelectKey = () => {
    if (window.aistudio) {
      window.aistudio.openSelectKey();
      setHasKey(true);
      onKeyStatusChange(true);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#F8F5F0] z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#112D42]"></div>
          <p className="text-xs font-bold text-[#112D42] animate-pulse tracking-widest uppercase">準備中...</p>
        </div>
      </div>
    );
  }

  if (isAiStudio && !hasKey) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 backdrop-blur-md p-4">
        <div className="bg-white rounded-[2rem] p-10 max-w-md w-full shadow-2xl text-center border border-white/20">
          <div className="w-20 h-20 bg-[#F8F5F0] rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <span className="text-3xl">🔑</span>
          </div>
          <h2 className="text-2xl font-bold text-[#112D42] mb-4">高品質生成を有効化</h2>
          <p className="text-sm text-gray-500 mb-8 leading-relaxed">
            このアプリで高品質な画像生成を利用するには、Google AI Studio でAPIキーを選択する必要があります。
          </p>
          
          <button
            onClick={handleOpenSelectKey}
            className="w-full bg-[#112D42] hover:bg-[#1e3a5f] text-white font-bold py-5 px-6 rounded-2xl transition-all shadow-xl active:scale-95 mb-6 text-lg"
          >
            APIキーを選択する
          </button>

          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[11px] text-[#E2B13C] font-bold hover:underline"
          >
            支払い設定とAPIキーについて詳しく見る
          </a>
        </div>
      </div>
    );
  }

  return null;
};
