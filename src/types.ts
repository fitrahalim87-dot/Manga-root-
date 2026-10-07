export interface MangaImage {
  id: string;
  name: string;
  base64: string;
  url: string;
  mimeType: string;
  globalIndex?: number;
}

export interface Project {
  id: string;
  name: string;
  format: "manga" | "manhwa";
  createdAt: string;
  updatedAt: string;
}

export interface RecapScript {
  id: string;
  projectId?: string;
  title: string;
  date: string;
  script: string;
  model: string;
  tone: string;
  language: string;
  targetLength: string;
  customInstructions: string;
  images: { name: string; base64: string; mimeType: string; globalIndex?: number }[];
  isSuperConcise?: boolean;
  characterDetails?: string;
  seriesName?: string;
}

export type ToneType = "aniki" | "formal" | "humorous" | "custom" | "dramatic" | "casual" | "excited" | "epic";
export type LanguageType = "id" | "en";
export type LengthType = "short" | "medium" | "long";

export interface ActiveSession {
  id: string;
  projectId?: string;
  images: MangaImage[];
  useBatchMode: boolean;
  batchSize: number;
  resumeBatchIndex: number;
  failedBatchIndex: number | null;
  resumeAccumulatedScript: string;
  tone: ToneType;
  language: LanguageType;
  customInstructions: string;
  customStyleRef?: string;
  currentScriptTitle: string;
  isSuperConcise?: boolean;
  characterDetails?: string;
  seriesName?: string;
  model?: string;
  googleApiKey?: string;
  kieApiKey?: string;
}
