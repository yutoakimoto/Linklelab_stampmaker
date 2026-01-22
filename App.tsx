
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
  const [text, setText] = useState(initialItem.text);
  const [prompt, setPrompt] = useState(initialItem.additionalPrompt);

  useEffect(() => {
    setText(initialItem.text);
    setPrompt(initialItem.additionalPrompt);
  }, [initialItem.text, initialItem.additionalPrompt]);

  const handleBlurText = () => onUpdate(index, 'text', text);
  const handleBlurPrompt = () => onUpdate(index, 'additionalPrompt', prompt);

  return (
    <div className="flex flex-col p-4 bg-[#F9F9F9] rounded-2xl border border-[#F0EDE8] hover:border-[#E2B13C] transition-colors shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] text-[#E2B13C] font-bold w-6">#{index + 1}</span>
        <input 
          type="text" 
          value={text} 
          onChange={e => setText(e.target.value)} 
          onBlur={handleBlurText}
          placeholder="スタンプの文字（例：了解！）" 
          className="flex-1 p-0 bg-transparent border-none text-sm font-bold text-[#112D42] placeholder-[#C0B7A9] focus:ring-0 outline-none"
        />
      </div>
      {activeTab === 'semi' && (
        <input 
          type="text" 
          value={prompt} 
          onChange={e => setPrompt(e.target.value)} 
          onBlur={handleBlurPrompt}
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

  // process.env の中身をより確実にチェックする
  const getEnvKey = () => {
    return process.env.API_KEY || (window as any).process?.env?.API_KEY;
  };

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
      setError("アクセス認証（パスワード入力）を済ませてください。");
      return;
    }
    setIsSuggesting(true);
    setError(null);
    try {
      const count = activeTab === 'auto' ? 8 : 16;
      const suggestions = await suggestMessages(count, basePrompt || "日常で使いやすいスタンプセット");
      setBatchItems(suggestions.map(s => ({ text: s, additionalPrompt: "" })));
    } catch (e) {
      setError("AI案の取得に失敗しました。APIキーが正しく読み込めていない可能性があります。");
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
      setError("パスワードが正しくありません。");
      return;
    }

    const envKey = getEnvKey();
    if (!envKey && !window.aistudio) {
      setError("【APIキーが未設定です】\nVercelの『Environment Variables』の設定を確認してください。\n・Name: API_KEY (Linklelab ではなく API_KEY に変更)\n・Value: あなたのAPIキー\n設定変更後、必ず『Redeploy』を実行してください。");
      return;
    }

    const activeItems = batchItems.filter(item => item && item.text.trim() !== "");
    if (activeItems.length === 0) {
      setError("スタンプの文字を最低1つは入力してください。");
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
          setError(`「${item.text}」の作成中にエラー: ${e.message}\nAPIキーが有効（Paid Projectなど）か確認してください。`);
          break; 
        }
      }
    } catch (err: any) {
      setError("予期せぬエラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const isPasswordCorrect = inputPassword === APP_PASSWORD;
  const isEnvKeyAvailable = !!getEnvKey() || !!window.aistudio;

  return (
    <div className="min-h-screen bg-[#F8F5F0] pb-40 font-sans text-[#112D42]">
      <ApiKeyChecker onKeyStatusChange={setIsKeyReady} />

      <header className="bg-white border-b border-[#E5E0D8] p-4 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#112D42] rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg">L</div>
            <h1 className="text-xl font-bold text-[#112D42] tracking-tight">Linklelab_stampmaker</h1>
          </div>
          <div className="flex bg-[#F0EDE8] rounded-full p-1 border border-[#E5E0D8]">
            <button onClick={() => setActiveTab('auto')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'auto' ? 'bg-[#112D42] text-white shadow-md' : 'text-[#6b7280]'}`}>8枚</button>
            <button onClick={() => setActiveTab('semi')} className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'semi' ? 'bg-[#112D42] text-white shadow-md' : 'text-[#6b7280]'}`}>16枚</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8] hover:border-[#E2B13C]/30 transition-colors">
            <h3 className="text-xs font-bold mb-4 text-[#E2B13C] uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-[#E2B13C] rounded-full"></span>
              Character Settings
            </h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {previewUrls.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-[#F0EDE8] group">
                  <img src={url} className="w-full h-full object-cover" />
                  <button onClick={() => removeFile(i)} className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-bold">削除</button>
                </div>
              ))}
              {selectedFiles.length < MAX_IMAGES && (
                <button onClick={() => fileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-[#E5E0D8] rounded-xl flex flex-col items-center justify-center text-[#6b7280] hover:bg-[#F9F9F9] transition-all">
                  <span className="text-xl mb-1">+</span>
                  <span className="text-[9px] font-bold">参考画像</span>
                </button>
              )}
            </div>
            <textarea 
              value={basePrompt} 
              onChange={e => setBasePrompt(e.target.value)} 
              placeholder="キャラクターの特徴（例：赤い帽子、銀髪の少女、元気な表情）" 
              className="w-full p-4 border border-[#F0EDE8] bg-[#F9F9F9] rounded-2xl text-sm h-28 focus:ring-1 focus:ring-[#112D42] outline-none transition-all resize-none" 
            />
            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
          </section>

          <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
            <h3 className="text-xs font-bold mb-4 text-[#E2B13C] uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-[#E2B13C] rounded-full"></span>
              Art Style
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(StampStyle).map(([key, value]) => (
                <button key={key} onClick={() => setStyle(value)} className={`p-3 text-[10px] font-bold rounded-xl border transition-all ${style === value ? 'bg-[#112D42] text-white border-[#112D42] shadow-md' : 'border-[#F0EDE8] text-[#112D42] hover:bg-[#F9F9F9]'}`}>
                  {STYLE_LABELS[value as StampStyle]}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
            <h3 className="text-xs font-bold mb-4 text-[#E2B13C] uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-[#E2B13C] rounded-full"></span>
              Authentication
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[#6b7280] ml-1">アプリパスワード</label>
                <input 
                  type="password" 
                  value={inputPassword} 
                  onChange={e => setInputPassword(e.target.value)} 
                  placeholder="linklelab" 
                  className={`w-full p-4 border rounded-2xl text-sm outline-none transition-all ${isPasswordCorrect ? 'bg-green-50 border-green-200 focus:ring-green-500' : 'bg-[#F9F9F9] border-[#F0EDE8] focus:ring-[#112D42]'}`}
                />
              </div>

              <div className="p-3 rounded-xl bg-[#F0EDE8]/50 border border-[#E5E0D8]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#6b7280]">APIキー接続</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isEnvKeyAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isEnvKeyAvailable ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                {!isEnvKeyAvailable && (
                  <div className="mt-3 p-2 bg-white/50 rounded-lg border border-red-100">
                    <p className="text-[9px] text-red-600 leading-relaxed font-bold">
                      Vercel環境変数名が間違っています！<br/>
                      × Name: Linklelab<br/>
                      ○ Name: API_KEY
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <section className="bg-white rounded-3xl p-6 md:p-8 card-shadow border border-[#E5E0D8]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <div>
                <h3 className="font-bold text-[#112D42] text-lg">メッセージの入力</h3>
                <p className="text-[10px] text-[#6b7280]">スタンプに描画される文字を設定してください。</p>
              </div>
              <button 
                onClick={handleSuggest} 
                disabled={isSuggesting || !isPasswordCorrect} 
                className="w-full sm:w-auto text-xs bg-[#112D42] text-white px-6 py-3 rounded-full font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              >
                {isSuggesting ? "案を考え中..." : "✨ AIに案をまかせる"}
              </button>
            </div>
            
            <div className={`grid gap-4 max-h-[550px] overflow-y-auto pr-2 custom-scroll ${activeTab === 'semi' ? 'md:grid-cols-2' : ''}`}>
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
            <div className="bg-[#112D42] text-white rounded-3xl p-8 text-center shadow-2xl animate-pulse relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-white/10">
                <div className="h-full bg-[#E2B13C] transition-all duration-500" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              <p className="text-base font-bold mb-2">高品質なスタンプを生成中...</p>
              <p className="text-[11px] opacity-70">Nano Banana Pro が丁寧に描画しています ({progress.current}/{progress.total})</p>
            </div>
          )}

          {error && (
            <div className="p-5 bg-red-50 text-red-700 rounded-3xl text-xs font-bold border border-red-200 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">⚠️</span>
                <span>ご確認ください</span>
              </div>
              <p className="ml-6 opacity-80 whitespace-pre-wrap">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {generatedStamps.map(stamp => (
              <div key={stamp.id} className="bg-white p-3 rounded-2xl border border-[#F0EDE8] shadow-sm group relative hover:shadow-md transition-all animate-in zoom-in-95">
                <div className="aspect-square bg-[#F9F9F9] rounded-xl overflow-hidden mb-3 border border-[#F0EDE8]">
                  <img src={stamp.url} className="w-full h-full object-contain" />
                </div>
                <p className="text-[10px] font-bold text-center text-[#112D42] truncate px-1">{stamp.prompt}</p>
                <button 
                  onClick={() => { const a = document.createElement('a'); a.href = stamp.url; a.download = `stamp-${stamp.id}.png`; a.click(); }} 
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 bg-white/90 shadow-xl rounded-full p-2 hover:bg-[#E2B13C] hover:text-white transition-all transform hover:scale-110"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-xl border-t border-[#E5E0D8] z-30 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6">
          <div className="hidden md:block">
            <p className="text-[10px] font-bold text-[#E2B13C] uppercase tracking-widest">Selected Style</p>
            <p className="text-sm font-bold text-[#112D42]">{STYLE_LABELS[style]} / {activeTab === 'auto' ? '8枚' : '16枚'}</p>
          </div>
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating || !isPasswordCorrect}
            className={`flex-1 md:flex-none md:min-w-[400px] py-4 rounded-2xl font-bold text-lg shadow-xl text-white transition-all premium-gradient flex items-center justify-center gap-3 ${(!isPasswordCorrect || isGenerating) ? 'opacity-40 cursor-not-allowed grayscale' : 'hover:scale-[1.01] hover:shadow-2xl active:scale-[0.99]'}`}
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                生成中 ({progress.current}/{progress.total})
              </>
            ) : !isPasswordCorrect ? (
              "パスワードでロックを解除"
            ) : (
              "スタンプをまとめて作成する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
