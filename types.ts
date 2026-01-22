export enum StampStyle {
  Anime = "Modern Japanese Anime style, cel-shaded, vibrant colors, clean lines, high quality illustration, anime character",
  Chibi = "Super Deformed (SD) Chibi style, big head small body, kawaii, cute, thick outlines, sticker art, mascot",
  Sketch = "Hand-drawn colored sketch style, pencil texture, warm atmosphere, artistic, loose lines, rough touch",
  AmericanCartoon = "Western Cartoon style, bold thick black outlines, flat pop colors, exaggerated expressions, comic book style",
  ThreeD = "3D Render style, clay material, plasticky, soft lighting, toy-like, isometric view, 3d character",
  Pixel = "Pixel Art style, 16-bit retro game aesthetic, dot art, limited color palette, retro game",
  RetroPop = "Retro Pop Art, 80s city pop vibe, pastel neon colors, stylish, lo-fi aesthetic, fashionable"
}

export interface GeneratedStamp {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

// Window interface augmentation for the AI Studio key selection
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}