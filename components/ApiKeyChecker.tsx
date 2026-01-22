
import React, { useEffect, useState } from 'react';

interface ApiKeyCheckerProps {
  onKeyStatusChange: (isReady: boolean) => void;
}

export const ApiKeyChecker: React.FC<ApiKeyCheckerProps> = ({ onKeyStatusChange }) => {
  const [checking, setChecking] = useState(true);
  const [needsKey, setNeedsKey] = useState(false);

  const checkKey = async () => {
    // 複数の場所からキーを探す
    const getEnvKey = () => {
      return process.env.API_KEY || (window as any).process?.env?.API_KEY;
    };

    if (!window.aistudio) {
      const hasEnvKey = !!getEnvKey();
      setChecking(false);
      setNeedsKey(false);
      onKeyStatusChange(hasEnvKey);
      return;
    }

    setChecking(true);
    try {
      if (await window.aistudio.hasSelectedApiKey()) {
        setNeedsKey(false);
        onKeyStatusChange(true);
      } else {
        setNeedsKey(true);
        onKeyStatusChange(false);
      }
    } catch (e) {
      console.error("Error checking API key status", e);
      setNeedsKey(true);
      onKeyStatusChange(false);
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
        onKeyStatusChange(true);
        setNeedsKey(false);
      } catch (e) {
        console.error("Key selection failed", e);
      }
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#112D42]"></div>
      </div>
    );
  }

  if (needsKey && window.aistudio) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center font-sans">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">APIキーを選択してください</h2>
          <p className="text-gray-600 mb-6">スタンプ生成にはNano Banana Proが利用可能なAPIキーが必要です。</p>
          <button
            onClick={handleSelectKey}
            className="w-full bg-[#112D42] hover:bg-[#1e3a5f] text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg"
          >
            APIキーを選択
          </button>
        </div>
      </div>
    );
  }

  return null;
};
