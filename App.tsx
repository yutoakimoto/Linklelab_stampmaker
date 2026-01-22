
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ApiKeyChecker } from './components/ApiKeyChecker';
import { generateStampImage, fileToBase64, suggestMessages, ReferenceImageData, StampConfig } from './services/geminiService';
import { StampStyle, GeneratedStamp } from './types';
import { v4 as uuidv4 } from 'uuid';

const STYLE_LABELS: Record<StampStyle, string> = {
  [StampStyle.Anime]: "アニメ風",
  [StampStyle.Chibi]: "ミニキャラ",
  [StampStyle.Sketch]: "手書き風",
  [StampStyle.AmericanCartoon]: "ポップアート",
  [StampStyle.ThreeD]: "3Dフィギュア",
  [StampStyle.Pixel]: "ドット絵",
  [StampStyle.RetroPop]: "レトロモダン"
};

const MAX_IMAGES = 3;
const APP_PASSWORD = "linklelab";

// 個別の入力欄コンポーネント（ローカルステートで入力を安定化）
const BatchItemRow = memo(({ 
  index, 
  initialItem, 
  activeTab, 
  onUpdate 
}: { 
  index: number, 
  initialItem: StampConfig, 
  activeTab: 'auto' | 'semi',
  onUpdate: (index: number, field: keyof StampConfig, value: string) => void 
}) => {
  const [localText, setLocalText] = useState(initialItem.text);
  const [localPrompt, setLocalPrompt] = useState(initialItem.additionalPrompt);

  // AI提案などで外部から値が変わった時だけ同期
  useEffect(() => {
    setLocalText(initialItem.text);
    setLocalPrompt(initialItem.additionalPrompt);
  }, [initialItem.text, initialItem.additionalPrompt]);

  const handleChangeText = (val: string) => {
    setLocalText(val);
    onUpdate(index, 'text', val);
  };

  const handleChangePrompt = (val: string) => {
    setLocalPrompt(val);
    onUpdate(index, 'additionalPrompt', val);
  };

  return (
    <div className="flex flex-col p-4 bg-[#F9F9F9] rounded-2xl border border-[#F0EDE8] hover:border-[#E2B13C] transition-colors shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] text-[#E2B13C] font-bold w-6">#{index + 1}</span>
        <input 
          type="text" 
          value={localText} 
          onChange={e => handleChangeText(e.target.value)} 
          placeholder="スタンプの文字（例：了解！）" 
          className="flex-1 p-0 bg-transparent border-none text-sm font-bold text-[#112D42] placeholder-[#C0B7A9] focus:ring-0 outline-none"
        />
      </div>
      {activeTab === 'semi' && (
        <input 
          type="text" 
          value={localPrompt} 
          onChange={e => handleChangePrompt(e.target.value)} 
          placeholder="表情やポーズの指定（例：笑顔で手を振る）" 
          className="p-0 bg-transparent border-none text-[10px] text-[#6b7280] placeholder-[#D1D5DB] focus:ring-0 outline-none border-t border-[#F0EDE8] pt-2 mt-1"
        />
      )}
    </div>
  );
});

const App: React.FC = () => {
  const [isKeyReady, setIsKeyReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'auto' | 'semi'>('auto');
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [style, setStyle] = useState<StampStyle>(StampStyle.Chibi);
  const [basePrompt, setBasePrompt] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  
  const [batchItems, setBatchItems] = useState<StampConfig[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{current: number, total: number}>({current: 0, total: 0});
  
  const [generatedStamps, setGeneratedStamps] = useState<GeneratedStamp[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const count = activeTab === 'auto' ? 8 : 16;
    setBatchItems(Array(count).fill(null).map((_, i) => ({
      text: i === 0 ? "ありがとう" : "",
      additionalPrompt: ""
    })));
  }, [activeTab]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const combinedFiles = [...selectedFiles, ...newFiles].slice(0, MAX_IMAGES);
      setSelectedFiles(combinedFiles);
      setPreviewUrls(combinedFiles.map(file => URL.createObjectURL(file)));
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSuggest = async () => {
    if (inputPassword !== APP_PASSWORD) {
      setError("アクセス認証を済ませてください。");
      return;
    }
    setIsSuggesting(true);
    setError(null);
    try {
      const count = activeTab === 'auto' ? 8 : 16;
      const suggestions = await suggestMessages(count, basePrompt || "日常で使いやすいスタンプセット");
      setBatchItems(suggestions.map(s => ({ text: s, additionalPrompt: "" })));
    } catch (e) {
      setError("AI案の取得に失敗しました。");
    } finally {
      setIsSuggesting(false);
    }
  };

  const updateBatchItem = useCallback((index: number, field: keyof StampConfig, value: string) => {
    setBatchItems(prev => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });
  }, []);

  const handleGenerateAll = async () => {
    setError(null);

    if (inputPassword !== APP_PASSWORD) {
      setError("認証パスワードが正しくありません。");
      return;
    }

    if (!isKeyReady) {
      setError("APIキーがVercelで設定されていないようです。Vercelのプロジェクト設定 > Environment Variables で API_KEY を追加し、Redeployしてください。");
      return;
    }

    const activeItems = batchItems.filter(item => item && item.text.trim() !== "");
    if (activeItems.length === 0) {
      setError("スタンプの文字を入力してください。");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: activeItems.length });

    try {
      const refImgs: ReferenceImageData[] = [];
      for (const file of selectedFiles) {
        refImgs.push({ base64: await fileToBase64(file), mimeType: file.type });
      }

      for (let i = 0; i < activeItems.length; i++) {
        const item = activeItems[i];
        try {
          const url = await generateStampImage(refImgs, style, item.text, `${basePrompt} ${item.additionalPrompt}`);
          const stamp = { id: uuidv4(), url, prompt: item.text, timestamp: Date.now() };
          setGeneratedStamps(prev => [stamp, ...prev]);
          setProgress(prev => ({ ...prev, current: i + 1 }));
        } catch (e: any) {
          setError(`「${item.text}」の作成に失敗: ${e.message}`);
          break; // エラー時は停止
        }
      }
    } catch (err: any) {
      setError("エラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const isPasswordCorrect = inputPassword === APP_PASSWORD;

  return (
    <div className="min-h-screen bg-[#F8F5F0] pb-40 font-sans text-[#112D42]">
      <ApiKeyChecker onKeyStatusChange={setIsKeyReady} />

      <header className="bg-white border-b border-[#E5E0D8] p-4 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#112D42] rounded-full flex items-center justify-center text-white font-bold text-xl">L</div>
            <h1 className="text-xl font-bold text-[#112D42]">Linklelab_stampmaker</h1>
          </div>
          <div className="flex bg-[#F0EDE8] rounded-full p-1">
            <button onClick={() => setActiveTab('auto')} className={`px-4 py-2 rounded-full text-xs font-bold ${activeTab === 'auto' ? 'bg-[#112D42] text-white shadow-md' : 'text-[#6b7280]'}`}>8枚</button>
            <button onClick={() => setActiveTab('semi')} className={`px-4 py-2 rounded-full text-xs font-bold ${activeTab === 'semi' ? 'bg-[#112D42] text-white shadow-md' : 'text-[#6b7280]'}`}>16枚</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
            <h3 className="text-sm font-bold mb-4 text-[#E2B13C]">キャラクター設定</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {previewUrls.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border">
                  <img src={url} className="w-full h-full object-cover" />
                  <button onClick={() => removeFile(i)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5">×</button>
                </div>
              ))}
              {selectedFiles.length < MAX_IMAGES && (
                <button onClick={() => fileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-[#E5E0D8] rounded-xl flex items-center justify-center text-[#6b7280] hover:bg-gray-50">＋</button>
              )}
            </div>
            <textarea value={basePrompt} onChange={e => setBasePrompt(e.target.value)} placeholder="全体の特徴（例：眼鏡、青い服）" className="w-full p-3 border rounded-xl text-sm h-24 resize-none" />
            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
          </section>

          <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
            <h3 className="text-sm font-bold mb-4 text-[#E2B13C]">デザインの雰囲気</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(StampStyle).map(([key, value]) => (
                <button key={key} onClick={() => setStyle(value)} className={`p-2 text-xs rounded-lg border transition-all ${style === value ? 'bg-[#112D42] text-white' : 'hover:bg-gray-50'}`}>
                  {STYLE_LABELS[value as StampStyle]}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
            <h3 className="text-sm font-bold mb-4 text-[#E2B13C]">アクセス認証</h3>
            <input 
              type="password" 
              value={inputPassword} 
              onChange={e => setInputPassword(e.target.value)} 
              placeholder="パスワード" 
              className={`w-full p-3 border rounded-xl text-sm ${isPasswordCorrect ? 'bg-green-50 border-green-200' : ''}`}
            />
          </section>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white rounded-3xl p-6 md:p-8 card-shadow border border-[#E5E0D8]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold">メッセージの入力</h3>
              <button onClick={handleSuggest} disabled={isSuggesting || !isPasswordCorrect} className="text-xs bg-[#112D42] text-white px-4 py-2 rounded-full disabled:opacity-30">AIに案をまかせる</button>
            </div>
            <div className={`grid gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scroll ${activeTab === 'semi' ? 'md:grid-cols-2' : ''}`}>
              {batchItems.map((item, index) => (
                <BatchItemRow 
                  key={`${activeTab}-${index}`} 
                  index={index} 
                  initialItem={item} 
                  activeTab={activeTab} 
                  onUpdate={updateBatchItem} 
                />
              ))}
            </div>
          </section>

          {isGenerating && (
            <div className="bg-[#112D42] text-white rounded-3xl p-6 text-center animate-pulse">
              <p className="text-sm font-bold">スタンプを生成中... ({progress.current}/{progress.total})</p>
              <div className="w-full bg-white/10 h-1 rounded-full mt-3 overflow-hidden">
                <div className="bg-[#E2B13C] h-full" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100">⚠️ {error}</div>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {generatedStamps.map(stamp => (
              <div key={stamp.id} className="bg-white p-2 rounded-2xl border shadow-sm group relative">
                <img src={stamp.url} className="w-full aspect-square object-contain bg-gray-50 rounded-xl mb-1" />
                <p className="text-[10px] font-bold text-center truncate">{stamp.prompt}</p>
                <button onClick={() => { const a = document.createElement('a'); a.href = stamp.url; a.download = 'stamp.png'; a.click(); }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-white shadow rounded-full p-1">⬇️</button>
              </div>
            ))}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t z-30 shadow-2xl">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating || !isPasswordCorrect || !isKeyReady}
            className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl text-white transition-all premium-gradient ${(!isPasswordCorrect || !isKeyReady || isGenerating) ? 'opacity-50 grayscale' : 'hover:scale-[1.01]'}`}
          >
            {!isPasswordCorrect ? "パスワードを入力してください" : !isKeyReady ? "APIキーが設定されていません" : isGenerating ? `生成中 (${progress.current}/${progress.total})` : "スタンプをまとめて作成する"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
