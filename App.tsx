
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

// 個別の入力欄コンポーネント（再描画を抑えて入力の不具合を防ぐ）
const BatchItemRow = memo(({ 
  index, 
  item, 
  activeTab, 
  onUpdate 
}: { 
  index: number, 
  item: StampConfig, 
  activeTab: 'auto' | 'semi',
  onUpdate: (index: number, field: keyof StampConfig, value: string) => void 
}) => {
  return (
    <div className="flex flex-col p-4 bg-[#F9F9F9] rounded-2xl border border-[#F0EDE8] hover:border-[#E2B13C] transition-colors shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] text-[#E2B13C] font-bold w-6">#{index + 1}</span>
        <input 
          type="text" 
          value={item.text} 
          onChange={e => onUpdate(index, 'text', e.target.value)} 
          placeholder="スタンプの文字（例：了解！）" 
          className="flex-1 p-0 bg-transparent border-none text-sm font-bold text-[#112D42] placeholder-[#C0B7A9] focus:ring-0 outline-none"
        />
      </div>
      {activeTab === 'semi' && (
        <input 
          type="text" 
          value={item.additionalPrompt} 
          onChange={e => onUpdate(index, 'additionalPrompt', e.target.value)} 
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

  // 初期化
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
      setError("パスワードを入力してから「AI案」を実行してください。");
      return;
    }
    setIsSuggesting(true);
    setError(null);
    try {
      const count = activeTab === 'auto' ? 8 : 16;
      const suggestions = await suggestMessages(count, basePrompt || "日常で使いやすいスタンプセット");
      setBatchItems(suggestions.map(s => ({ text: s, additionalPrompt: "" })));
    } catch (e) {
      setError("提案の取得に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsSuggesting(false);
    }
  };

  const updateBatchItem = useCallback((index: number, field: keyof StampConfig, value: string) => {
    setBatchItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const handleGenerateAll = async () => {
    setError(null);

    // バリデーションチェック
    if (inputPassword !== APP_PASSWORD) {
      setError("認証パスワードが正しくありません。");
      return;
    }

    if (!isKeyReady) {
      setError("APIキーの準備ができていません。環境変数またはAPIキーの選択を確認してください。");
      return;
    }

    const activeItems = batchItems.filter(item => item.text.trim() !== "");
    if (activeItems.length === 0) {
      setError("スタンプの文字を1つ以上入力してください。");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: activeItems.length });

    try {
      const refImgs: ReferenceImageData[] = [];
      for (const file of selectedFiles) {
        refImgs.push({ base64: await fileToBase64(file), mimeType: file.type });
      }

      const newStamps: GeneratedStamp[] = [];

      for (let i = 0; i < activeItems.length; i++) {
        const item = activeItems[i];
        try {
          const url = await generateStampImage(refImgs, style, item.text, `${basePrompt} ${item.additionalPrompt}`);
          const stamp = { id: uuidv4(), url, prompt: item.text, timestamp: Date.now() };
          newStamps.push(stamp);
          setGeneratedStamps(prev => [stamp, ...prev]); // 1枚ずつ表示
          setProgress(prev => ({ ...prev, current: i + 1 }));
        } catch (e: any) {
          console.error(`Failed at item ${i}`, e);
          setError(`「${item.text}」の生成に失敗しました: ${e.message || "エラー"}`);
        }
      }
    } catch (err: any) {
      setError("予期せぬエラーが発生しました。");
    } finally {
      setIsGenerating(false);
    }
  };

  const isPasswordCorrect = inputPassword === APP_PASSWORD;

  return (
    <div className="min-h-screen bg-[#F8F5F0] pb-40 font-sans text-[#112D42]">
      <ApiKeyChecker onKeySelected={() => setIsKeyReady(true)} />

      <header className="bg-white border-b border-[#E5E0D8] p-4 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#112D42] rounded-full flex items-center justify-center text-white font-bold text-xl">L</div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-[#112D42]">Linklelab_stampmaker</h1>
          </div>
          
          <div className="flex bg-[#F0EDE8] rounded-full p-1 border border-[#E5E0D8]">
            <button 
              onClick={() => setActiveTab('auto')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'auto' ? 'bg-[#112D42] text-white shadow-md' : 'text-[#6b7280]'}`}
            >
              8枚セット
            </button>
            <button 
              onClick={() => setActiveTab('semi')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'semi' ? 'bg-[#112D42] text-white shadow-md' : 'text-[#6b7280]'}`}
            >
              16枚セット
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#E2B13C]">
                <span className="w-1 h-3 bg-[#E2B13C] rounded-full"></span>
                キャラクター設定
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {previewUrls.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-[#F0EDE8] group">
                      <img src={url} className="w-full h-full object-cover" />
                      <button onClick={() => removeFile(i)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L10 8.586 4.293 4.293a1 1 0 010-1.414z"/></svg>
                      </button>
                    </div>
                  ))}
                  {selectedFiles.length < MAX_IMAGES && (
                    <button onClick={() => fileInputRef.current?.click()} className="aspect-square border-2 border-dashed border-[#E5E0D8] rounded-2xl flex flex-col items-center justify-center text-[#6b7280] hover:bg-[#F9F9F9] transition-colors">
                      <svg className="w-6 h-6 mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                      <span className="text-[10px] font-bold text-center px-1">参考写真<br/>を追加</span>
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#6b7280] ml-1">全体の特徴（任意）</label>
                  <textarea 
                    rows={3}
                    value={basePrompt} 
                    onChange={e => setBasePrompt(e.target.value)} 
                    placeholder="例：茶髪のショートヘア、眼鏡をかけた優しい雰囲気の男の子" 
                    className="w-full p-4 border border-[#F0EDE8] bg-[#F9F9F9] rounded-2xl text-sm focus:ring-1 focus:ring-[#112D42] outline-none transition-all resize-none" 
                  />
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
              </div>
            </section>

            <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#E2B13C]">
                <span className="w-1 h-3 bg-[#E2B13C] rounded-full"></span>
                デザインの雰囲気
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(StampStyle).map(([key, value]) => (
                  <button 
                    key={key} 
                    onClick={() => setStyle(value)} 
                    className={`p-3 text-xs rounded-xl border transition-all text-center ${style === value ? 'border-[#112D42] bg-[#112D42] text-white font-bold shadow-md' : 'border-[#F0EDE8] text-[#112D42] hover:bg-[#F9F9F9]'}`}
                  >
                    {STYLE_LABELS[value as StampStyle]}
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-3xl p-6 card-shadow border border-[#E5E0D8]">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-[#E2B13C]">
                <span className="w-1 h-3 bg-[#E2B13C] rounded-full"></span>
                アクセス認証
              </h3>
              <div className="space-y-2">
                <input 
                  type="password"
                  value={inputPassword}
                  onChange={e => setInputPassword(e.target.value)}
                  placeholder="パスワードを入力"
                  className={`w-full p-4 border rounded-2xl text-sm focus:ring-1 outline-none transition-all ${isPasswordCorrect ? 'border-green-200 bg-green-50 focus:ring-green-500' : 'border-[#F0EDE8] bg-[#F9F9F9] focus:ring-[#112D42]'}`}
                />
                {!isPasswordCorrect && inputPassword.length > 0 && (
                  <p className="text-[10px] text-red-500 font-bold ml-1">パスワードが正しくありません</p>
                )}
                {isPasswordCorrect && (
                  <p className="text-[10px] text-green-600 font-bold ml-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    認証済み
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <section className="bg-white rounded-3xl p-6 md:p-8 card-shadow border border-[#E5E0D8]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#F0EDE8] pb-4 mb-6">
                <div>
                  <h3 className="text-base font-bold text-[#112D42]">メッセージの入力</h3>
                  <p className="text-[10px] text-[#6b7280]">スタンプに入れる文字と言葉を設定します。</p>
                </div>
                <button 
                  onClick={handleSuggest} 
                  disabled={isSuggesting || !isPasswordCorrect}
                  className="w-full sm:w-auto text-xs bg-[#112D42] text-white px-8 py-3 rounded-full hover:bg-black flex items-center justify-center gap-2 transition-all disabled:opacity-30 font-bold shadow-md"
                >
                  {isSuggesting ? <span className="animate-spin text-sm">⏳</span> : "✨"}
                  AIにメッセージ案をまかせる
                </button>
              </div>

              <div className={`grid gap-3 max-h-[600px] overflow-y-auto p-1 custom-scroll ${activeTab === 'semi' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {batchItems.map((item, index) => (
                  <BatchItemRow 
                    key={`${activeTab}-${index}`} 
                    index={index} 
                    item={item} 
                    activeTab={activeTab} 
                    onUpdate={updateBatchItem} 
                  />
                ))}
              </div>
            </section>

            {isGenerating && (
              <div className="bg-[#112D42] text-white rounded-3xl p-6 shadow-xl space-y-4 animate-pulse">
                <div className="flex justify-between items-center text-xs font-bold tracking-wider">
                  <span>スタンプを1枚ずつ丁寧に生成中...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                  <div className="bg-[#E2B13C] h-full transition-all duration-500" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
                <p className="text-center text-[10px] opacity-70">Nano Banana Proがあなたのスタンプを描いています。少々お待ちください。</p>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs text-center border border-red-100 font-bold shadow-sm animate-bounce">
                ⚠️ {error}
              </div>
            )}

            {generatedStamps.length > 0 && (
              <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[#112D42]">生成されたスタンプ ({generatedStamps.length}枚)</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {generatedStamps.map(stamp => (
                    <div key={stamp.id} className="bg-white p-2 rounded-2xl shadow-sm border border-[#E5E0D8] group relative hover:shadow-md transition-all animate-in zoom-in-95 duration-300">
                      <div className="aspect-square bg-[#F9F9F9] rounded-xl overflow-hidden mb-2">
                        <img src={stamp.url} alt={stamp.prompt} className="w-full h-full object-contain" />
                      </div>
                      <p className="text-center text-[10px] font-bold text-[#112D42] truncate px-1">{stamp.prompt}</p>
                      <button 
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = stamp.url;
                          link.download = `stamp-${stamp.id}.png`;
                          link.click();
                        }}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-[#E2B13C] text-white p-2 rounded-full shadow-lg transition-all transform hover:scale-110"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#E5E0D8] z-30 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="hidden sm:block border-l-2 border-[#E2B13C] pl-4">
            <p className="text-[10px] font-bold text-[#E2B13C] uppercase tracking-wider">選択中</p>
            <p className="text-sm font-bold text-[#112D42]">
              {activeTab === 'auto' ? '8枚セット' : '16枚セット'} × {STYLE_LABELS[style]}
            </p>
          </div>
          <button
            onClick={handleGenerateAll}
            disabled={isGenerating}
            className={`flex-1 sm:flex-none sm:min-w-[320px] py-4 rounded-2xl font-bold text-lg shadow-xl flex items-center justify-center gap-3 transition-all premium-gradient text-white ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.98]'}`}
          >
            {isGenerating ? (
              <>
                <span className="animate-spin text-xl">⏳</span>
                生成中 ({progress.current}/{progress.total})
              </>
            ) : !isPasswordCorrect ? (
              "パスワードが必要です"
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
