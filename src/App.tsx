import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  FileImage,
  UploadCloud,
  Trash2,
  Copy,
  Check,
  Download,
  Sparkles,
  History,
  Search,
  RefreshCw,
  Clock,
  ChevronRight,
  FileEdit,
  Save,
  Play,
  AlertCircle,
  X,
  FolderOpen,
  Settings,
  ChevronDown,
  Database,
  Globe,
  Bot,
  Key,
  Home,
  Wrench,
  Menu
} from "lucide-react";
import JSZip from "jszip";
import { MangaImage, RecapScript, ToneType, LanguageType, LengthType, ActiveSession, ProviderType } from "./types";
import { saveRecapScript, getAllRecapScripts, deleteRecapScript, saveActiveSession, getActiveSession, clearActiveSession } from "./lib/db";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { DatabaseModal } from "./components/DatabaseModal";
import { SettingsModal } from "./components/SettingsModal";
import { ApiKeyGate } from "./components/ApiKeyGate";
import mangaBannerThumb from "./assets/images/manga_banner_thumb_1795555618423.jpg";

type SidebarTab = "dashboard" | "tools" | "assets" | "riwayat";

const GOOGLE_MODELS = [
  { value: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen (Default)" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
] as const;

const OPENROUTER_MODELS = [
  { value: "google/gemini-4-hydrogen", label: "Gemini 4 Hydrogen (Default)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash" },
] as const;

const KIE_MODELS = [
  { value: "gemini-3-8-flash", label: "Kie.ai 3.8 Flash (Default)" },
  { value: "gemini-3-7-flash", label: "Kie.ai 3.7 Flash" },
  { value: "gemini-3-6-flash", label: "Kie.ai 3.6 Flash" },
] as const;

function getDefaultModelForProvider(p: ProviderType): string {
  if (p === "openrouter") return "google/gemini-4-hydrogen";
  if (p === "kie") return "gemini-3-8-flash";
  return "gemini-4-hydrogen";
}

function getPresetModelsForProvider(p: ProviderType) {
  if (p === "openrouter") return OPENROUTER_MODELS;
  if (p === "kie") return KIE_MODELS;
  return GOOGLE_MODELS;
}

function inferProviderFromModel(modelName: string): ProviderType {
  const m = (modelName || "").trim();
  if (m.includes("/")) return "openrouter";
  if (m === "gemini-3-6-flash" || m === "gemini-3-7-flash" || m === "gemini-3-8-flash") return "kie";
  return "google";
}

function base64ToBlobUrl(base64: string): string {
  try {
    if (!base64 || !base64.includes(",")) return base64;
    const parts = base64.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const byteString = atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([uint8Array], { type: mime });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Error converting base64 to blob URL:", e);
    return base64;
  }
}

async function watermarkBase64Image(base64: string, label: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      try {
        const maxDim = 1024;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const scale = Math.max(1, Math.min(width, height) / 1000);
        const paddingX = 24 * scale;
        const paddingY = 16 * scale;
        const fontSize = Math.max(20, Math.round(32 * scale));

        ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textWidth = ctx.measureText(label).width;

        const dotRadius = 6 * scale;
        const gap = 12 * scale;
        const badgeWidth = textWidth + paddingX * 2 + dotRadius * 2 + gap;
        const badgeHeight = fontSize + paddingY * 2;

        const x = 32 * scale;
        const y = 32 * scale;
        const radius = 12 * scale;

        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 15 * scale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6 * scale;

        ctx.fillStyle = "rgba(9, 9, 11, 0.95)";
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, badgeWidth, badgeHeight, radius);
        } else {
          ctx.rect(x, y, badgeWidth, badgeHeight);
        }
        ctx.fill();

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = "rgba(0, 102, 255, 0.9)";
        ctx.lineWidth = Math.max(2, 3 * scale);
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, badgeWidth, badgeHeight, radius);
        } else {
          ctx.rect(x, y, badgeWidth, badgeHeight);
        }
        ctx.stroke();

        const dotX = x + paddingX + dotRadius;
        const dotY = y + badgeHeight / 2;
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, dotX + dotRadius + gap, dotY);

        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } catch (err) {
        console.error("Error watermarking canvas:", err);
        resolve(base64);
      }
    };
    img.onerror = () => {
      resolve(base64);
    };
  });
}

export interface ParsedParagraph {
  index: number;
  indices?: number[];
  label: string;
  text: string;
}

function stripCitationMarkers(text: string): string {
  if (!text) return "";
  return text
    .replace(/\s*\[\s*(?:cite|citation|ref|source|sumber|referensi)\b[^\]]*\]/gi, "")
    .replace(/\s*\[\s*\d+(?:\s*[-,]\s*\d+)*\s*\]/g, "")
    .replace(/\s*【[^】]*】/g, "")
    .replace(/ +([.,!?])/g, "$1");
}

function parseRecapScript(text: string): ParsedParagraph[] {
  if (!text) return [];
  const cleanInput = stripCitationMarkers(text);
  const regex = /\[?GAMBAR\s+([0-9\s,\\\-\&dansampai\/]+)\]?:?/gi;
  const paragraphs: ParsedParagraph[] = [];
  const matches: { header: string; rawRange: string; index: number; nextIndex: number }[] = [];
  let match;
  const activeRegex = new RegExp(regex);
  while ((match = activeRegex.exec(cleanInput)) !== null) {
    matches.push({
      header: match[0],
      rawRange: match[1],
      index: match.index,
      nextIndex: activeRegex.lastIndex
    });
  }

  if (matches.length === 0) {
    return cleanInput.split(/\n\s*\n/).map((p, idx) => ({
      index: idx + 1,
      indices: [idx + 1],
      label: `Gambar ${idx + 1}`,
      text: p.trim()
    })).filter(p => p.text.length > 0);
  }

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    const contentStart = currentMatch.nextIndex;
    const contentEnd = nextMatch ? nextMatch.index : cleanInput.length;
    const pText = cleanInput.substring(contentStart, contentEnd).trim();

    if (pText) {
      const indices: number[] = [];
      const cleanRange = currentMatch.rawRange.toLowerCase();
      const rangeRegex = /(\d+)\s*(?:-|dan|sampai|s\/d)\s*(\d+)/i;
      const rangeMatch = cleanRange.match(rangeRegex);

      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let j = start; j <= end; j++) {
            indices.push(j);
          }
        }
      } else {
        const numMatches = cleanRange.match(/\d+/g);
        if (numMatches) {
          numMatches.forEach(numStr => {
            const n = parseInt(numStr);
            if (!isNaN(n)) indices.push(n);
          });
        }
      }

      const primaryIndex = indices.length > 0 ? indices[0] : (i + 1);
      paragraphs.push({
        index: primaryIndex,
        indices,
        label: `Gambar ${indices.length > 0 ? indices.join(", ") : primaryIndex}`,
        text: pText
      });
    }
  }

  return paragraphs;
}

function getFileExtension(mimeType: string, filename: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  if (extMatch) return extMatch[1];
  return "jpg";
}

async function convertImageToFormat(base64: string, mimeType: string, targetFormat: "jpeg" | "png"): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ base64, mimeType });
          return;
        }
        ctx.drawImage(img, 0, 0);
        const outputMime = targetFormat === "png" ? "image/png" : "image/jpeg";
        const convertedBase64 = canvas.toDataURL(outputMime, 0.95);
        resolve({ base64: convertedBase64, mimeType: outputMime });
      } catch (err) {
        console.error("Gagal melakukan konversi format gambar:", err);
        resolve({ base64, mimeType });
      }
    };
    img.onerror = () => {
      resolve({ base64, mimeType });
    };
  });
}

export default function App() {
  const [activeNav, setActiveNav] = useState<SidebarTab>("dashboard");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);
  const [isEngineExpanded, setIsEngineExpanded] = useState<boolean>(true);
  const [showAdvancedEngine, setShowAdvancedEngine] = useState<boolean>(true);
  const [isDetailExpanded, setIsDetailExpanded] = useState<boolean>(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);

  const [googleApiKey, setGoogleApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("mangaroot_gemini_api_key") || "";
    } catch (_) {
      return "";
    }
  });
  const [kieApiKey, setKieApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("mangaroot_kie_api_key") || "";
    } catch (_) {
      return "";
    }
  });
  const [openrouterApiKey, setOpenrouterApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("mangaroot_openrouter_api_key") || "";
    } catch (_) {
      return "";
    }
  });

  const [hasEnteredStudio, setHasEnteredStudio] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showDatabaseModal, setShowDatabaseModal] = useState<boolean>(false);

  const [provider, setProvider] = useState<ProviderType>(() => {
    try {
      const g = localStorage.getItem("mangaroot_gemini_api_key") || "";
      const or = localStorage.getItem("mangaroot_openrouter_api_key") || "";
      const k = localStorage.getItem("mangaroot_kie_api_key") || "";
      if (g.trim()) return "google";
      if (or.trim()) return "openrouter";
      if (k.trim()) return "kie";
    } catch (_) {}
    return "google";
  });

  const [model, setModel] = useState<string>(() => {
    try {
      const g = localStorage.getItem("mangaroot_gemini_api_key") || "";
      const or = localStorage.getItem("mangaroot_openrouter_api_key") || "";
      const k = localStorage.getItem("mangaroot_kie_api_key") || "";
      if (g.trim()) return "gemini-4-hydrogen";
      if (or.trim()) return "google/gemini-4-hydrogen";
      if (k.trim()) return "gemini-3-8-flash";
    } catch (_) {}
    return "gemini-4-hydrogen";
  });
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);

  // Settings
  const [tone, setTone] = useState<ToneType>("dramatic");
  const [language, setLanguage] = useState<LanguageType>("id");
  const [targetLength, setTargetLength] = useState<LengthType>("medium");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [customStyleRef, setCustomStyleRef] = useState<string>("");
  const [characterDetails, setCharacterDetails] = useState<string>("");
  const [seriesName, setSeriesName] = useState<string>("Munou na Nana (Talentless Nana)");

  // Batch Mode Settings (Default: Batch Mode ON, 8 panels per batch)
  const [useBatchMode, setUseBatchMode] = useState<boolean>(true);
  const [batchSize, setBatchSize] = useState<number>(8);
  const cancelGenerationRef = useRef<boolean>(false);

  // Script Context Settings
  const [scriptType, setScriptType] = useState<"first" | "continued">("first");
  const [initialContextText, setInitialContextText] = useState<string>("");
  const [isSuperConcise, setIsSuperConcise] = useState<boolean>(true);

  // Batch Resume State
  const [resumeBatchIndex, setResumeBatchIndex] = useState<number>(0);
  const [failedBatchIndex, setFailedBatchIndex] = useState<number | null>(null);
  const [resumeAccumulatedScript, setResumeAccumulatedScript] = useState<string>("");

  // Manga Images
  const [images, setImages] = useState<MangaImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Output Script
  const [currentScriptText, setCurrentScriptText] = useState<string>("");
  const [currentScriptTitle, setCurrentScriptTitle] = useState<string>("Naskah Baru");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Workspace editing mode
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [workspaceEditText, setWorkspaceEditText] = useState("");
  const [scriptViewMode, setScriptViewMode] = useState<"segmented" | "full">("segmented");
  const [showLabelsInFullView, setShowLabelsInFullView] = useState<boolean>(false);

  // History State
  const [historyScripts, setHistoryScripts] = useState<RecapScript[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Feedback
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedClean, setCopiedClean] = useState(false);

  // ZIP Download Configuration
  const [showZipModal, setShowZipModal] = useState(false);
  const [zipPrefix, setZipPrefix] = useState("image");
  const [zipSeparator, setZipSeparator] = useState("_");
  const [zipDigits, setZipDigits] = useState(3);
  const [isZipping, setIsZipping] = useState(false);
  const [zipImgFormat, setZipImgFormat] = useState<"jpg" | "png" | "original">("jpg");

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await getAllRecapScripts();
      setHistoryScripts(data);
    } catch (err) {
      console.error("Gagal memuat riwayat:", err);
    }
  };

  const [isSessionRestored, setIsSessionRestored] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await getActiveSession();
        if (session) {
          const restoredImages = session.images.map((img) => ({
            ...img,
            url: img.base64 ? base64ToBlobUrl(img.base64) : img.url
          }));
          setImages(restoredImages);
          setUseBatchMode(session.useBatchMode ?? true);
          setBatchSize(session.batchSize || 8);
          setResumeBatchIndex(session.resumeBatchIndex);
          setFailedBatchIndex(session.failedBatchIndex);
          setResumeAccumulatedScript(session.resumeAccumulatedScript);
          setTone(session.tone);
          setLanguage(session.language);
          setCustomInstructions(session.customInstructions);
          setCustomStyleRef(session.customStyleRef || "");
          setCharacterDetails(session.characterDetails || "");
          setSeriesName(session.seriesName || "Munou na Nana (Talentless Nana)");
          setCurrentScriptTitle(session.currentScriptTitle);
          setCurrentScriptText(session.resumeAccumulatedScript);

          const rawSessionModel = session.model || "";
          const restoredProvider: ProviderType = session.provider || inferProviderFromModel(rawSessionModel);
          let restoredModel = rawSessionModel;
          if (!restoredModel || restoredModel === "gemini-1.5-flash" || restoredModel === "gemini-2.0-flash" || restoredModel === "custom") {
            restoredModel = getDefaultModelForProvider(restoredProvider);
          }
          setProvider(restoredProvider);
          setModel(restoredModel);
          const presets = getPresetModelsForProvider(restoredProvider);
          setIsCustomModel(!presets.some((m) => m.value === restoredModel));

          setIsSuperConcise(session.isSuperConcise ?? true);
          if (session.failedBatchIndex !== null) {
            setError(`Pembuatan naskah terhenti di Batch ke-${session.failedBatchIndex + 1}.`);
          }
        }
      } catch (err) {
        console.error("Gagal memuat session aktif:", err);
      } finally {
        setIsSessionRestored(true);
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    if (!isSessionRestored) return;

    if (images.length > 0) {
      const activeSession: ActiveSession = {
        id: "active_draft",
        images,
        useBatchMode,
        batchSize,
        resumeBatchIndex,
        failedBatchIndex,
        resumeAccumulatedScript,
        tone,
        language,
        customInstructions,
        customStyleRef,
        currentScriptTitle,
        isSuperConcise,
        characterDetails,
        seriesName,
        provider,
        model
      };
      saveActiveSession(activeSession).catch(err => {
        console.error("Gagal menyimpan session otomatis:", err);
      });
    } else {
      clearActiveSession().catch(err => {
        console.error("Gagal membersihkan session otomatis:", err);
      });
    }
  }, [
    isSessionRestored,
    images,
    useBatchMode,
    batchSize,
    resumeBatchIndex,
    failedBatchIndex,
    resumeAccumulatedScript,
    tone,
    language,
    customInstructions,
    customStyleRef,
    currentScriptTitle,
    isSuperConcise,
    characterDetails,
    seriesName,
    provider,
    model
  ]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFiles = (files: FileList) => {
    const validImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const fileArray = Array.from(files);

    const imagePromises = fileArray
      .filter(file => validImageTypes.includes(file.type))
      .map((file) => {
        return new Promise<MangaImage>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: Math.random().toString(36).substring(2, 9),
              name: file.name,
              base64: reader.result as string,
              url: URL.createObjectURL(file),
              mimeType: file.type
            });
          };
          reader.onerror = () => reject(new Error("Gagal membaca file: " + file.name));
          reader.readAsDataURL(file);
        });
      });

    Promise.all(imagePromises)
      .then((newImages) => {
        setImages((prev) => {
          const combined = [...prev, ...newImages];
          const uniqueMap = new Map();
          combined.forEach(img => uniqueMap.set(img.name, img));
          const uniqueList = Array.from(uniqueMap.values());
          return uniqueList.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
          );
        });
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const clearAllImages = () => {
    setImages([]);
    setFailedBatchIndex(null);
    setResumeBatchIndex(0);
    setResumeAccumulatedScript("");
    setCurrentScriptText("");
  };

  const getLastThreeParagraphs = (fullText: string): string[] => {
    if (!fullText) return [];
    const paragraphs = fullText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    return paragraphs.slice(-3);
  };

  const getActiveProviderKey = (targetProvider: ProviderType = provider): string => {
    if (targetProvider === "kie") return kieApiKey.trim();
    if (targetProvider === "openrouter") return openrouterApiKey.trim();
    return googleApiKey.trim();
  };

  const getProviderDisplayName = (targetProvider: ProviderType): string => {
    if (targetProvider === "kie") return "Kie.ai";
    if (targetProvider === "openrouter") return "OpenRouter";
    return "Google AI Studio";
  };

  const handleSelectProvider = (nextProvider: ProviderType) => {
    setProvider(nextProvider);
    setModel(getDefaultModelForProvider(nextProvider));
    setIsCustomModel(false);
    setError(null);
  };

  const generateRecap = async (isResume: boolean = false) => {
    if (images.length === 0) {
      setError("Silakan upload minimal satu gambar manga terlebih dahulu.");
      return;
    }

    const activeKey = getActiveProviderKey(provider);
    if (!activeKey) {
      setError(`API Key untuk ${getProviderDisplayName(provider)} belum diisi. Silakan masukkan API Key di menu Pengaturan terlebih dahulu.`);
      setShowSettingsModal(true);
      return;
    }

    const effectiveModel = model.trim() || getDefaultModelForProvider(provider);

    setIsGenerating(true);
    setError(null);
    cancelGenerationRef.current = false;
    setGenerationProgress("Menandai panel gambar...");

    let imagesPayload: { name: string; base64: string; mimeType: string; globalIndex?: number }[] = [];
    try {
      imagesPayload = await Promise.all(
        images.map(async (img, idx) => {
          const label = `GAMBAR ${idx + 1}`;
          const watermarkedBase64 = await watermarkBase64Image(img.base64, label);
          return {
            name: img.name,
            base64: watermarkedBase64,
            mimeType: img.mimeType,
            globalIndex: idx + 1
          };
        })
      );
    } catch (e) {
      console.error("Gagal watermarking, menggunakan gambar asli:", e);
      imagesPayload = images.map((img, idx) => ({
        name: img.name,
        base64: img.base64,
        mimeType: img.mimeType,
        globalIndex: idx + 1
      }));
    }

    try {
      if (useBatchMode) {
        const chunks: typeof imagesPayload[] = [];
        const currentBatchSize = Math.max(1, batchSize);
        for (let i = 0; i < imagesPayload.length; i += currentBatchSize) {
          chunks.push(imagesPayload.slice(i, i + currentBatchSize));
        }

        let accumulatedScript = isResume ? resumeAccumulatedScript : "";
        const startIndex = isResume ? resumeBatchIndex : 0;

        if (!isResume) {
          setCurrentScriptText("");
          setResumeAccumulatedScript("");
          setResumeBatchIndex(0);
          setFailedBatchIndex(null);
          accumulatedScript = "";
        }

        let finishedAll = true;

        for (let i = startIndex; i < chunks.length; i++) {
          if (cancelGenerationRef.current) {
            setGenerationProgress("Pembuatan naskah dibatalkan.");
            setResumeBatchIndex(i);
            setResumeAccumulatedScript(accumulatedScript);
            finishedAll = false;
            break;
          }

          const chunkImages = chunks[i];
          const startImgIdx = i * currentBatchSize + 1;
          const endImgIdx = Math.min((i + 1) * currentBatchSize, imagesPayload.length);

          let success = false;
          let batchScript = "";
          const maxRetries = 3;

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (cancelGenerationRef.current) break;

            const progressMsg = `Memproses Batch ${i + 1}/${chunks.length} (#${startImgIdx}-#${endImgIdx})` +
              (attempt > 1 ? ` (Ulang ${attempt - 1}/${maxRetries - 1}...)` : "");

            setGenerationProgress(progressMsg);

            try {
              const previousParagraphs = getLastThreeParagraphs(accumulatedScript);
              const isFirstBatch = i === 0;
              const sendInitialContext = (isFirstBatch && scriptType === "continued") ? initialContextText : "";

              const response = await fetch("/api/recap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  images: chunkImages,
                  provider,
                  model: effectiveModel,
                  googleApiKey,
                  kieApiKey,
                  openrouterApiKey,
                  tone,
                  language,
                  customInstructions,
                  customStyleRef,
                  previousParagraphs,
                  initialContext: sendInitialContext,
                  isSuperConcise,
                  characterDetails
                })
              });

              if (!response.ok) {
                let errMsg = "Gagal melakukan generate naskah.";
                try {
                  const contentType = response.headers.get("content-type");
                  if (contentType && contentType.includes("application/json")) {
                    const errData = await response.json();
                    errMsg = errData.error || errMsg;
                  } else {
                    const textErr = await response.text();
                    errMsg = `Server Error (${response.status}): ${textErr.substring(0, 150)}`;
                  }
                } catch (_) {
                  errMsg = `Server Error (${response.status})`;
                }
                const err: any = new Error(errMsg);
                err.nonRetryable = [400, 401, 402, 403, 404, 422].includes(response.status);
                throw err;
              }

              const data = await response.json();
              batchScript = data.script.trim();
              success = true;
              break;
            } catch (err: any) {
              console.log(`Percobaan ${attempt} gagal untuk Batch ${i + 1}:`, err?.message || err);
              if (err?.nonRetryable || attempt === maxRetries) {
                setResumeBatchIndex(i);
                setFailedBatchIndex(i);
                setResumeAccumulatedScript(accumulatedScript);
                finishedAll = false;
                throw new Error(
                  err?.nonRetryable
                    ? `Batch ${i + 1} dihentikan: ${err.message || err}`
                    : `Gagal memproses Batch ${i + 1} setelah 3 percobaan otomatis.\nDetail: ${err.message || err}`
                );
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }

          if (cancelGenerationRef.current) {
            setResumeBatchIndex(i);
            setResumeAccumulatedScript(accumulatedScript);
            finishedAll = false;
            break;
          }

          if (success) {
            accumulatedScript = accumulatedScript ? `${accumulatedScript}\n\n${batchScript}` : batchScript;
            setCurrentScriptText(accumulatedScript);
            setResumeAccumulatedScript(accumulatedScript);
            setResumeBatchIndex(i + 1);
            setFailedBatchIndex(null);
          }
        }

        if (finishedAll && !cancelGenerationRef.current) {
          setFailedBatchIndex(null);
          setResumeBatchIndex(0);
          setResumeAccumulatedScript("");

          const firstImgName = images[0]?.name.replace(/\.[^/.]+$/, "") || "Manga";
          const generatedTitle = `Recap ${firstImgName} (${images.length} Hlm - Bertahap)`;
          setCurrentScriptTitle(generatedTitle);

          const cleanHistoryImages = images.map((img, idx) => ({
            name: img.name,
            base64: img.base64,
            mimeType: img.mimeType,
            globalIndex: idx + 1
          }));

          const newRecap: RecapScript = {
            id: Math.random().toString(36).substring(2, 9),
            title: generatedTitle,
            date: new Date().toISOString(),
            script: accumulatedScript,
            provider,
            model: effectiveModel,
            tone,
            language,
            targetLength,
            customInstructions,
            images: cleanHistoryImages,
            isSuperConcise,
            characterDetails
          };

          setGenerationProgress("Menyimpan ke riwayat...");
          await saveRecapScript(newRecap);
          await loadHistory();
        }
      } else {
        setFailedBatchIndex(null);
        setResumeBatchIndex(0);
        setResumeAccumulatedScript("");

        setGenerationProgress("Menganalisis panel...");
        const response = await fetch("/api/recap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: imagesPayload,
            provider,
            model: effectiveModel,
            googleApiKey,
            kieApiKey,
            openrouterApiKey,
            tone,
            language,
            customInstructions,
            customStyleRef,
            initialContext: scriptType === "continued" ? initialContextText : "",
            isSuperConcise,
            characterDetails
          })
        });

        if (!response.ok) {
          let errMsg = "Gagal melakukan generate naskah.";
          try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errData = await response.json();
              errMsg = errData.error || errMsg;
            } else {
              const textErr = await response.text();
              errMsg = `Server Error (${response.status}): ${textErr.substring(0, 150)}`;
            }
          } catch (_) {
            errMsg = `Server Error (${response.status})`;
          }
          throw new Error(errMsg);
        }

        const data = await response.json();
        setCurrentScriptText(data.script);

        const firstImgName = images[0]?.name.replace(/\.[^/.]+$/, "") || "Manga";
        const generatedTitle = `Recap ${firstImgName} (${images.length} Hlm)`;
        setCurrentScriptTitle(generatedTitle);

        const cleanHistoryImages = images.map((img, idx) => ({
          name: img.name,
          base64: img.base64,
          mimeType: img.mimeType,
          globalIndex: idx + 1
        }));

        const newRecap: RecapScript = {
          id: Math.random().toString(36).substring(2, 9),
          title: generatedTitle,
          date: new Date().toISOString(),
          script: data.script,
          provider,
          model: effectiveModel,
          tone,
          language,
          targetLength,
          customInstructions,
          images: cleanHistoryImages,
          isSuperConcise,
          characterDetails
        };

        setGenerationProgress("Menyimpan ke riwayat...");
        await saveRecapScript(newRecap);
        await loadHistory();
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan server.");
    } finally {
      setIsGenerating(false);
      setGenerationProgress("");
    }
  };

  const saveEditedScript = async () => {
    setCurrentScriptText(workspaceEditText);
    setIsEditingWorkspace(false);

    try {
      const updatedRecap: RecapScript = {
        id: Math.random().toString(36).substring(2, 9),
        title: currentScriptTitle,
        date: new Date().toISOString(),
        script: workspaceEditText,
        provider,
        model,
        tone,
        language,
        targetLength,
        customInstructions,
        images: images.map(img => ({ name: img.name, base64: img.base64, mimeType: img.mimeType }))
      };

      await saveRecapScript(updatedRecap);
      await loadHistory();
    } catch (err) {
      console.error("Gagal menyimpan naskah:", err);
    }
  };

  const getCleanStoryText = (rawText: string): string => {
    if (!rawText) return "";
    return stripCitationMarkers(rawText)
      .split(/\n/)
      .filter(line => {
        const trimmed = line.trim();
        return !/^(?:\[?\s*(?:GAMBAR|IMAGE|HALAMAN|PAGE)\s+[0-9\s,\\\-\&dansampai\/]+\s*\]?:?)$/i.test(trimmed);
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const copyToClipboard = (cleanOnly: boolean) => {
    const textToCopy = cleanOnly
      ? getCleanStoryText(currentScriptText)
      : stripCitationMarkers(currentScriptText);
    navigator.clipboard.writeText(textToCopy);
    if (cleanOnly) {
      setCopiedClean(true);
      setTimeout(() => setCopiedClean(false), 2000);
    } else {
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    }
  };

  const handleCopyPromptHelper = () => {
    const activeSeries = seriesName.trim() || "Munou na Nana (Talentless Nana)";
    const promptText = `Anda adalah seorang Ahli Analisis Manga/Anime dan Prompt Engineer untuk AI Vision. Tugas Anda adalah membuat profil detail karakter dari seri ${activeSeries} yang dioptimalkan khusus agar AI Vision (seperti Gemini) dapat mengenali karakter tersebut dengan akurat dari gambar komik/manga, serta tidak salah menyebutkan nama dalam narasi cerita.

Tolong buatkan profil karakter dengan struktur ketat seperti di bawah ini untuk semua karakter utama dan pendukung yang penting dalam cerita tersebut.

Gunakan format Markdown berikut untuk setiap karakter:

---

### [Nama Karakter] (Nama Resmi, Format: Margatama, Nama Depan)
- **Peran:** (Main Character / Supporting Character / Antagonist)

1. **Detail Fisik & Visual (SANGAT KRUSIAL UNTUK AI VISION):**
   - **Rambut:** (Gaya rambut: twintails/ponytail/jabrik/rapuh, panjang rambut, warna rambut, arah belahan)
   - **Mata & Ekspresi:** (Bentuk mata: sayu/tajam/bulat, ekspresi khas yang paling sering ditunjukkan)
   - **Pakaian/Seragam:** (Pakaian khas atau seragam sekolah yang biasa dikenakan)
   - **Ciri Unik Khusus:** (Aksesoris seperti kacamata, anting, tindik, luka bekas jahitan, tato, tahi lalat, atau postur tubuh tertentu)

2. **Ciri Khas & Kemampuan:**
   - **Kekuatan/Bakat:** (Penjelasan singkat kekuatan mereka dan bagaimana visual kekuatannya digambarkan saat digunakan di komik, contoh: mengeluarkan petir biru, lingkaran sihir di tangan, dll)
   - **Sifat & Karakteristik:** (Sifat menonjol, misalnya: dingin, sangat ceria secara palsu, canggung secara sosial, pemalu)

3. **Hubungan Kunci (Hubungan Antar Karakter):**
   - **[Nama Karakter Lain 1]:** (Hubungan mereka)
   - **[Nama Karakter Lain 2]:** (Hubungan mereka)

Buatlah detailnya sejelas dan seakurat mungkin sesuai dengan kanon asli ceritanya!`;
    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const downloadZip = async () => {
    if (!currentScriptText) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const cleanScript = getCleanStoryText(currentScriptText);
      const safeTitle = currentScriptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "manga_recap_script";
      zip.file(`${safeTitle}.md`, cleanScript);

      const paragraphs = parseRecapScript(currentScriptText);
      let imgCounter = 1;

      for (const p of paragraphs) {
        const img = images[p.index - 1] || (p.indices && p.indices.length > 0 ? images[p.indices[0] - 1] : null);
        if (img && img.base64) {
          const padNum = String(imgCounter).padStart(zipDigits, "0");
          let finalBase64 = img.base64;
          let ext = getFileExtension(img.mimeType, img.name);

          if (zipImgFormat === "jpg" || zipImgFormat === "png") {
            const targetMime = zipImgFormat === "png" ? "png" : "jpeg";
            const converted = await convertImageToFormat(img.base64, img.mimeType, targetMime);
            finalBase64 = converted.base64;
            ext = zipImgFormat === "png" ? "png" : "jpg";
          }

          const imgFileName = `${zipPrefix}${zipSeparator}${padNum}.${ext}`;
          const rawBase64 = finalBase64.split(",")[1] || finalBase64;
          zip.file(imgFileName, rawBase64, { base64: true });
          imgCounter++;
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const element = document.createElement("a");
      element.href = URL.createObjectURL(content);
      element.download = `${safeTitle}.zip`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      setShowZipModal(false);
    } catch (err) {
      console.error("Gagal membuat file ZIP:", err);
      setError("Gagal membuat file ZIP. Pastikan gambar tidak rusak dan coba lagi.");
    } finally {
      setIsZipping(false);
    }
  };

  const loadScriptFromHistory = (item: RecapScript) => {
    setCurrentScriptTitle(item.title);
    setCurrentScriptText(stripCitationMarkers(item.script));
    const restoredProvider: ProviderType = item.provider || inferProviderFromModel(item.model);
    const restoredHistoryModel = (item.model === "gemini-1.5-flash" || item.model === "gemini-2.0-flash" || !item.model)
      ? getDefaultModelForProvider(restoredProvider)
      : item.model;
    setProvider(restoredProvider);
    setModel(restoredHistoryModel);
    const presets = getPresetModelsForProvider(restoredProvider);
    setIsCustomModel(!presets.some((m) => m.value === restoredHistoryModel));
    setTone(item.tone as ToneType);
    setLanguage(item.language as LanguageType);
    setTargetLength(item.targetLength as LengthType);
    setCustomInstructions(item.customInstructions);

    if (item.images && item.images.length > 0) {
      const mappedImages = item.images.map((img) => ({
        id: Math.random().toString(36).substring(2, 9),
        name: img.name,
        base64: img.base64,
        url: img.base64 ? base64ToBlobUrl(img.base64) : img.base64,
        mimeType: img.mimeType
      }));
      setImages(mappedImages);
    }
    setActiveNav("dashboard");
    setIsHistoryExpanded(false);
  };

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteRecapScript(id);
      await loadHistory();
    } catch (err) {
      console.error("Gagal menghapus:", err);
    }
  };

  const filteredHistory = historyScripts.filter((item) => {
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.script.toLowerCase().includes(query) ||
      item.customInstructions.toLowerCase().includes(query) ||
      item.tone.toLowerCase().includes(query)
    );
  });

  if (!hasEnteredStudio) {
    return (
      <ApiKeyGate
        googleApiKey={googleApiKey}
        kieApiKey={kieApiKey}
        openrouterApiKey={openrouterApiKey}
        onEnterStudio={({ googleApiKey: g, kieApiKey: k, openrouterApiKey: o, preferredProvider }) => {
          setGoogleApiKey(g);
          setKieApiKey(k);
          setOpenrouterApiKey(o);
          if (preferredProvider) {
            setProvider(preferredProvider);
            setModel(getDefaultModelForProvider(preferredProvider));
            setIsCustomModel(false);
          }
          setHasEnteredStudio(true);
        }}
      />
    );
  }

  const navItems = [
    { id: "dashboard" as const, label: "Dashboard", icon: Home },
    { id: "tools" as const, label: "Tools", icon: Wrench },
    { id: "assets" as const, label: "Assets", icon: FileImage },
    { id: "riwayat" as const, label: "Riwayat", icon: History },
  ];

  const handleNavClick = (id: SidebarTab | "pengaturan") => {
    setIsMobileSidebarOpen(false);
    if (id === "pengaturan") {
      setShowSettingsModal(true);
      return;
    }
    setActiveNav(id);
  };

  const renderHistoryCards = () => {
    if (filteredHistory.length === 0) {
      return (
        <div className="py-8 flex flex-col items-center justify-center text-center">
          <History className="w-7 h-7 mb-2 text-slate-300" />
          <h4 className="text-xs font-bold text-slate-600">Tidak ada naskah ditemukan</h4>
          <p className="text-xs text-slate-400 mt-0.5 max-w-[240px]">
            {searchQuery ? "Ubah kata kunci pencarian Anda." : "Naskah yang dibuat otomatis tersimpan di riwayat lokal."}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
        {filteredHistory.map((item) => {
          const dateFormatted = new Date(item.date).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          });

          return (
            <div
              key={item.id}
              onClick={() => loadScriptFromHistory(item)}
              className="p-3.5 bg-[#F8FAFC] hover:bg-blue-50/60 border border-slate-600/75 hover:border-[#0066FF] rounded-xl shadow-sm shadow-slate-900/10 transition cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 group-hover:text-[#0066FF] transition truncate">
                  {item.title}
                </h4>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock className="w-3 h-3" />
                    {dateFormatted}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize font-medium text-slate-700">{item.tone}</span>
                  <span aria-hidden="true">·</span>
                  <span className="uppercase font-medium text-slate-600">{item.language}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleDeleteHistory(item.id, e)}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                  title="Hapus naskah"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <span className="text-xs text-[#0066FF] font-semibold flex items-center gap-0.5">
                  Buka
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F7FB] text-slate-900 flex font-sans">
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex w-[224px] shrink-0 bg-white border-r-[1.5px] border-slate-700/75 shadow-[4px_0_24px_-6px_rgba(15,23,42,0.16)] flex-col justify-between sticky top-0 h-screen">
        <div>
          {/* Solid Blue Brand Header */}
          <div className="bg-[#0066FF] px-5 py-6 text-white">
            <h1 className="text-xl font-extrabold tracking-tight leading-none">MangaRoot</h1>
            <p className="text-xs text-blue-100 mt-1.5 font-medium">Creator Studio</p>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-[#0066FF] text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-500"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => handleNavClick("pengaturan")}
              className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Settings className="w-4 h-4 shrink-0 text-slate-500" />
              <span>Pengaturan</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-100 text-center space-y-1">
          <p className="text-xs font-semibold text-slate-500 tabular-nums">v.1.6</p>
          <p className="text-[11px] text-slate-400">© MangaRoot</p>
        </div>
      </aside>

      {/* MOBILE DRAWER SIDEBAR */}
      {isMobileSidebarOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMobileSidebarOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs md:hidden flex"
        >
          <div className="w-[240px] bg-white h-full shadow-2xl flex flex-col justify-between animate-fadeIn">
            <div>
              <div className="bg-[#0066FF] px-5 py-5 text-white flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight leading-none">MangaRoot</h2>
                  <p className="text-xs text-blue-100 mt-1">Creator Studio</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="p-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                        isActive
                          ? "bg-[#0066FF] text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => handleNavClick("pengaturan")}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Pengaturan API Key</span>
                </button>
              </nav>
            </div>
            <div className="p-4 border-t border-slate-100 text-center text-xs text-slate-400">
              v.1.6 · © MangaRoot
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* TOP HEADER BAR */}
        <header className="bg-white md:bg-[#F4F7FB] border-b border-slate-600/70 md:border-b-0 px-4 md:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          {/* Mobile Left: Hamburger + Brand */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-slate-600/75 bg-white text-slate-700 hover:bg-slate-50 shadow-sm shadow-slate-900/10 cursor-pointer"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <span className="text-base font-extrabold text-slate-900 leading-none block">MangaRoot</span>
              <span className="text-[11px] text-slate-500 font-medium block mt-0.5">Creator Studio</span>
            </div>
          </div>

          {/* Desktop Left: Active View Breadcrumb */}
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-800 capitalize">{activeNav}</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-500 truncate max-w-[260px]">{seriesName || "Manga Recap Studio"}</span>
          </div>

          {/* Right Controls: Quick Tone Pill Selector + Setting Button */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header" />

            <div className="relative">
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as ToneType)}
                aria-label="Pilih Tone Cepat"
                className="min-h-[38px] pl-3.5 pr-8 py-1.5 bg-white border border-slate-600/75 hover:border-slate-800 rounded-full text-xs font-bold text-slate-800 outline-none focus:border-[#0066FF] cursor-pointer appearance-none shadow-sm shadow-slate-900/10"
              >
                <option value="aniki">Aniki</option>
                <option value="dramatic">Drama</option>
                <option value="humorous">Humoris</option>
                <option value="formal">Formal</option>
                <option value="casual">Casual</option>
                <option value="epic">Epic</option>
                <option value="custom">Custom</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-blue-50 border border-slate-600/75 hover:border-[#0066FF] rounded-full text-xs font-semibold text-slate-700 hover:text-[#0066FF] transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm shadow-slate-900/10"
              title="Pengaturan & Tes API Key"
            >
              <Key className="w-3.5 h-3.5 text-[#0066FF]" />
              <span className="hidden sm:inline">Setting</span>
            </button>
          </div>
        </header>

        {/* WORKSPACE VIEWS */}
        <main
          className="flex-1 px-4 md:px-6 pb-8 pt-2 max-w-[1320px] w-full mx-auto space-y-4"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept="image/*"
            className="hidden"
          />

          {/* VIEW 1: DASHBOARD (EXACT REFERENCE MOCKUP LAYOUT) */}
          {activeNav === "dashboard" && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* LEFT COLUMN */}
                <div className="lg:col-span-7 xl:col-span-8 space-y-4">
                  {/* Hero Banner Card: Import Manga Pages */}
                  <div className="bg-gradient-to-r from-[#EBF2FF] to-[#F7FAFF] border-[1.5px] border-slate-700/80 rounded-2xl p-4 flex items-center gap-4 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)]">
                    <div className="w-24 sm:w-32 h-20 rounded-xl overflow-hidden border border-slate-600/80 bg-white shrink-0 shadow-sm shadow-slate-900/15">
                      <img
                        src={mangaBannerThumb}
                        alt="Ilustrasi panel manga"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-xl font-extrabold text-[#0B2240] tracking-tight">
                        Import Manga Pages
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                        Pilih atau seret gambar manga, dan biarkan AI mengolahnya secara otomatis.
                      </p>
                    </div>
                  </div>

                  {/* Drag & Drop Upload Card */}
                  <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] space-y-4">
                    <div
                      onClick={triggerFileInput}
                      className={`w-full rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center ${
                        images.length === 0 ? "py-10 px-5" : "py-5 px-4"
                      } ${
                        isDragging
                          ? "border-[#0066FF] bg-blue-50/70"
                          : "border-slate-300 bg-[#FAFCFF] hover:border-[#0066FF]/60 hover:bg-blue-50/30"
                      }`}
                    >
                      <UploadCloud className="w-10 h-10 text-[#0066FF] mb-2.5" strokeWidth={1.75} />
                      <h3 className="text-sm sm:text-base font-bold text-slate-900">
                        Seret gambar manga ke sini
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        atau klik untuk memilih file
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2">
                        Format: JPG, PNG, WEBP · Tanpa batas payload
                      </p>
                      <span className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition">
                        <FolderOpen className="w-4 h-4" />
                        <span>Pilih File</span>
                      </span>
                    </div>

                    {images.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 tabular-nums">
                            Panel Terunggah ({images.length} Halaman)
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={triggerFileInput}
                              className="text-xs font-semibold text-[#0066FF] hover:underline cursor-pointer"
                            >
                              + Tambah Halaman
                            </button>
                            <button
                              type="button"
                              onClick={clearAllImages}
                              className="text-xs font-semibold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus Semua</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                          {images.map((img, index) => (
                            <div
                              key={img.id}
                              onClick={() => setFullscreenImageUrl(img.url || img.base64)}
                              className="relative w-16 h-24 rounded-xl border border-slate-600/80 bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in group shadow-sm shadow-slate-900/15"
                            >
                              <img
                                src={img.url || img.base64}
                                alt={img.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              <div className="absolute bottom-1 left-1 bg-slate-900/85 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                                #{index + 1}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => removeImage(img.id, e)}
                                className="absolute top-1 right-1 p-1 bg-white/95 hover:bg-rose-500 text-slate-600 hover:text-white rounded-full border border-slate-200 transition cursor-pointer"
                                aria-label={`Hapus halaman ${index + 1}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pengaturan Engine & Parameter Card */}
                  <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-600/40 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setIsEngineExpanded(!isEngineExpanded)}
                        className="flex items-center gap-2 text-left cursor-pointer"
                      >
                        <Settings className="w-4 h-4 text-[#0066FF] shrink-0" />
                        <span className="text-sm font-bold text-slate-900">
                          Pengaturan Engine & Parameter
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!isEngineExpanded) setIsEngineExpanded(true);
                          else setShowAdvancedEngine(!showAdvancedEngine);
                        }}
                        className="text-xs font-semibold text-[#0066FF] hover:text-[#0052CC] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <span>Pengaturan Lanjutan</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedEngine && isEngineExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>

                    {isEngineExpanded && (
                      <div className="p-5 space-y-4">
                        {/* Judul Seri */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">Judul Seri</label>
                          <input
                            type="text"
                            placeholder="Contoh: Munou na Nana (Talentless Nana)"
                            value={seriesName}
                            onChange={(e) => setSeriesName(e.target.value)}
                            className="w-full min-h-[42px] px-3.5 py-2 bg-white border border-slate-300 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-sm rounded-xl outline-none transition"
                          />
                        </div>

                        {/* Pilih Engine AI */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-700">Pilih Engine AI</label>
                            <button
                              type="button"
                              onClick={() => setShowSettingsModal(true)}
                              className="text-xs font-semibold text-[#0066FF] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Key className="w-3 h-3" />
                              <span>Atur / Tes API Key</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                            <button
                              type="button"
                              onClick={() => handleSelectProvider("google")}
                              className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                provider === "google"
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-700 hover:bg-white/80"
                              }`}
                            >
                              <span>AI Studio</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectProvider("kie")}
                              className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                provider === "kie"
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-700 hover:bg-white/80"
                              }`}
                            >
                              <span>Kie.ai</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectProvider("openrouter")}
                              className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                                provider === "openrouter"
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-700 hover:bg-white/80"
                              }`}
                            >
                              <span>OpenRouter</span>
                            </button>
                          </div>

                          {!getActiveProviderKey(provider) && (
                            <button
                              type="button"
                              onClick={() => setShowSettingsModal(true)}
                              className="w-full text-left text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl hover:bg-amber-100/70 transition cursor-pointer flex items-center justify-between gap-2"
                            >
                              <span>API Key untuk <strong>{getProviderDisplayName(provider)}</strong> belum diisi.</span>
                              <span className="font-bold underline shrink-0">Buka Setting</span>
                            </button>
                          )}
                        </div>

                        {/* Model Selection */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">
                            Model ({getProviderDisplayName(provider)})
                          </label>
                          <div className="relative">
                            <select
                              value={isCustomModel ? "custom" : model}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "custom") {
                                  setIsCustomModel(true);
                                } else {
                                  setIsCustomModel(false);
                                  setModel(val);
                                }
                              }}
                              className="w-full min-h-[42px] pl-3.5 pr-9 py-2 bg-white border border-slate-300 focus:border-[#0066FF] focus:ring-2 focus:ring-blue-500/15 text-slate-900 text-sm rounded-xl outline-none cursor-pointer appearance-none"
                            >
                              {getPresetModelsForProvider(provider).map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                              <option value="custom">Ketik Manual Nama Model...</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>

                          {isCustomModel && (
                            <div className="space-y-1 pt-1">
                              <input
                                type="text"
                                placeholder={
                                  provider === "openrouter"
                                    ? "Contoh: google/gemini-4-hydrogen atau anthropic/claude-3.5-sonnet"
                                    : provider === "kie"
                                    ? "Contoh: gemini-3-8-flash"
                                    : "Contoh: gemini-4-hydrogen atau gemini-2.5-flash"
                                }
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full min-h-[40px] px-3.5 py-2 bg-[#F8FAFC] border border-slate-300 focus:border-[#0066FF] text-slate-900 font-mono text-xs rounded-xl outline-none"
                              />
                              <p className="text-[11px] text-slate-500">
                                Masukkan ID model persis sesuai endpoint {getProviderDisplayName(provider)}.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Profil Detail Karakter (Advanced toggleable) */}
                        {showAdvancedEngine && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold text-slate-700">Profil Detail Karakter</label>
                              <button
                                type="button"
                                onClick={handleCopyPromptHelper}
                                className="text-xs text-[#0066FF] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{copiedPrompt ? "Tersalin!" : "Prompt Helper"}</span>
                              </button>
                            </div>
                            <textarea
                              placeholder={"Contoh:\n1. Hiiragi, Nana (Rambut twintail pink, baju pelaut, pura-pura ceria)\n2. Onodera, Kyouya (Rambut putih berantakan, detektif)"}
                              value={characterDetails}
                              onChange={(e) => setCharacterDetails(e.target.value)}
                              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-slate-300 focus:border-[#0066FF] focus:bg-white text-slate-900 placeholder-slate-400 text-xs rounded-xl outline-none min-h-[84px] max-h-[160px] resize-y leading-relaxed transition"
                            />
                          </div>
                        )}

                        {/* Tone & Bahasa Grid */}
                        <div className="grid grid-cols-2 gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700">Tone</label>
                            <div className="relative">
                              <select
                                value={tone}
                                onChange={(e) => setTone(e.target.value as ToneType)}
                                className="w-full min-h-[42px] pl-3.5 pr-8 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 text-xs sm:text-sm rounded-xl cursor-pointer outline-none appearance-none"
                              >
                                <option value="aniki">AniKi.ID (Storyteller)</option>
                                <option value="humorous">Humoris (Funny)</option>
                                <option value="formal">Formal</option>
                                <option value="dramatic">Drama</option>
                                <option value="casual">Casual</option>
                                <option value="epic">Epic</option>
                                <option value="custom">Custom (Gaya Sendiri)</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700">Bahasa</label>
                            <div className="relative">
                              <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value as LanguageType)}
                                className="w-full min-h-[42px] pl-3.5 pr-8 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 text-xs sm:text-sm rounded-xl cursor-pointer outline-none appearance-none"
                              >
                                <option value="id">Indonesia</option>
                                <option value="en">English</option>
                              </select>
                              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        {tone === "custom" && (
                          <div className="space-y-1.5 pt-1">
                            <label className="text-xs font-semibold text-[#0066FF]">Referensi Gaya Naskah</label>
                            <textarea
                              placeholder="Tempelkan contoh naskah di sini. AI akan meniru gaya bahasa dan penyampaiannya..."
                              value={customStyleRef}
                              onChange={(e) => setCustomStyleRef(e.target.value)}
                              className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-slate-300 focus:border-[#0066FF] text-slate-900 placeholder-slate-400 text-xs rounded-xl outline-none min-h-[100px] resize-y"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN: DETAIL NASKAH CARD */}
                <div className="lg:col-span-5 xl:col-span-4 space-y-4">
                  <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] overflow-hidden">
                    {/* Solid Blue Detail Naskah Header */}
                    <div
                      onClick={() => setIsDetailExpanded(!isDetailExpanded)}
                      className="bg-[#0066FF] px-5 py-3.5 text-white flex items-center justify-between cursor-pointer lg:cursor-default"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-white shrink-0" />
                        <span className="text-sm font-bold">Detail Naskah</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-white lg:hidden transition-transform ${isDetailExpanded ? "rotate-180" : ""}`} />
                    </div>

                    {isDetailExpanded && (
                      <div className="p-5 space-y-4">
                        {/* Kepadatan Naskah */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">Kepadatan Naskah</label>
                          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setIsSuperConcise(true)}
                              className={`min-h-[38px] py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                                isSuperConcise
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Ringkas
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsSuperConcise(false)}
                              className={`min-h-[38px] py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                                !isSuperConcise
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Detail
                            </button>
                          </div>
                        </div>

                        {/* Alur Cerita */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">Alur Cerita</label>
                          <div className="relative">
                            <select
                              value={scriptType}
                              onChange={(e) => setScriptType(e.target.value as "first" | "continued")}
                              className="w-full min-h-[42px] pl-3.5 pr-8 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 text-xs sm:text-sm rounded-xl cursor-pointer outline-none appearance-none"
                            >
                              <option value="first">Mulai Bab Baru (Awal Naskah)</option>
                              <option value="continued">Naskah Lanjutan (Konteks Bab Sebelumnya)</option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>

                          {scriptType === "continued" && (
                            <div className="pt-1">
                              <textarea
                                placeholder="Tulis ringkasan singkat dari part sebelumnya agar cerita menyambung mulus..."
                                value={initialContextText}
                                onChange={(e) => setInitialContextText(e.target.value)}
                                className="w-full px-3 py-2 bg-[#F8FAFC] border border-slate-300 focus:border-[#0066FF] text-slate-900 placeholder-slate-400 text-xs rounded-xl outline-none min-h-[68px] resize-y"
                              />
                            </div>
                          )}
                        </div>

                        {/* Mode Generasi (Batch Default: 8 panels) */}
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-700">Mode Generasi</label>
                          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setUseBatchMode(true)}
                              className={`min-h-[38px] py-1.5 px-2 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                                useBatchMode
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Per Batch ({batchSize} Panel)
                            </button>
                            <button
                              type="button"
                              onClick={() => setUseBatchMode(false)}
                              className={`min-h-[38px] py-1.5 px-2 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                                !useBatchMode
                                  ? "bg-[#0066FF] text-white shadow-xs"
                                  : "text-slate-600 hover:text-slate-900"
                              }`}
                            >
                              Satu Batch Sekaligus
                            </button>
                          </div>

                          {useBatchMode && (
                            <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-600">Halaman per Batch</span>
                                <span className="font-bold text-[#0066FF] tabular-nums">{batchSize} Panel</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setBatchSize(prev => Math.max(1, prev - 1))}
                                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="range"
                                  min="1"
                                  max="20"
                                  value={batchSize}
                                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 8)}
                                  className="flex-1 accent-[#0066FF] cursor-pointer h-1.5 rounded bg-slate-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => setBatchSize(prev => Math.min(20, prev + 1))}
                                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Instruksi Tambahan (Opsional) */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-slate-700">Instruksi Tambahan (Opsional)</label>
                          <textarea
                            placeholder='Masukkan instruksi khusus, misal: "Jangan ceritakan bagian X", "Fokus pada pertarungan"...'
                            value={customInstructions}
                            onChange={(e) => setCustomInstructions(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-[#F8FAFC] border border-slate-300 focus:border-[#0066FF] focus:bg-white text-slate-900 placeholder-slate-400 text-xs rounded-xl outline-none min-h-[78px] max-h-[140px] resize-y leading-relaxed transition"
                          />
                        </div>

                        {/* Database IndexedDB Lokal Box */}
                        <button
                          type="button"
                          onClick={() => setShowDatabaseModal(true)}
                          className="w-full text-left p-3.5 bg-[#F8FAFC] hover:bg-blue-50/60 border border-slate-600/75 hover:border-[#0066FF] rounded-xl shadow-sm shadow-slate-900/10 flex items-center gap-3 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#0066FF] flex items-center justify-center shrink-0">
                            <Database className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900">Database IndexedDB Lokal</p>
                            <p className="text-[11px] text-slate-500 truncate">Kelola Riwayat, Draft & Backup JSON</p>
                          </div>
                        </button>

                        {/* Primary CTA: Generate Naskah */}
                        {isGenerating ? (
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center space-y-2.5">
                            <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#0066FF]">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Menyusun Naskah...</span>
                            </div>
                            <p className="text-xs text-slate-600">{generationProgress}</p>
                            {useBatchMode && (
                              <button
                                type="button"
                                onClick={() => {
                                  cancelGenerationRef.current = true;
                                  setGenerationProgress("Membatalkan...");
                                }}
                                className="px-4 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-lg transition cursor-pointer"
                              >
                                Batalkan Proses
                              </button>
                            )}
                          </div>
                        ) : failedBatchIndex !== null && useBatchMode ? (
                          <button
                            type="button"
                            onClick={() => generateRecap(true)}
                            className="w-full min-h-[46px] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Play className="w-4 h-4 fill-white" />
                            <span>Lanjutkan Batch #{failedBatchIndex + 1}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => generateRecap(false)}
                            className="w-full min-h-[46px] py-3 px-4 bg-[#0066FF] hover:bg-[#0052CC] text-white rounded-xl font-bold text-sm shadow-sm transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                          >
                            <Play className="w-4 h-4 fill-white" />
                            <span>
                              Generate Naskah{images.length > 0 ? ` (${images.length} Hlm)` : ""}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ERROR DISPLAY */}
              {error && (
                <div className="p-4 bg-rose-50 border-[1.5px] border-rose-700/75 rounded-2xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18)] text-rose-800 text-xs flex flex-col gap-3 animate-fadeIn">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm block">Terhenti</span>
                      <p className="mt-1 leading-relaxed text-xs whitespace-pre-line">{error}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSettingsModal(true)}
                      className="min-h-[38px] py-2 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5 text-[#0066FF]" />
                      <span>Cek / Tes API Key</span>
                    </button>

                    {provider !== "google" && googleApiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => handleSelectProvider("google")}
                        className="min-h-[38px] py-2 px-3.5 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Pakai AI Studio</span>
                      </button>
                    )}

                    {provider !== "openrouter" && openrouterApiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => handleSelectProvider("openrouter")}
                        className="min-h-[38px] py-2 px-3.5 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Pakai OpenRouter</span>
                      </button>
                    )}

                    {provider !== "kie" && kieApiKey.trim() && (
                      <button
                        type="button"
                        onClick={() => handleSelectProvider("kie")}
                        className="min-h-[38px] py-2 px-3.5 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Pakai Kie.ai</span>
                      </button>
                    )}

                    {failedBatchIndex !== null && (
                      <>
                        <button
                          type="button"
                          onClick={() => generateRecap(true)}
                          className="min-h-[38px] py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Lanjutkan (Resume)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => generateRecap(false)}
                          className="min-h-[38px] py-2 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                        >
                          Ulangi Awal
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* GENERATED SCRIPT WORKSPACE */}
              {currentScriptText && currentScriptText.trim() !== "" && (
                <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] overflow-hidden animate-fadeIn">
                  <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-slate-600/40 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-[#0066FF] shrink-0" />
                      <span className="text-sm font-bold text-slate-900 truncate">{currentScriptTitle}</span>
                    </div>

                    {!isEditingWorkspace && (
                      <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setScriptViewMode("segmented")}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                            scriptViewMode === "segmented"
                              ? "bg-[#0066FF] text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Segmented
                        </button>
                        <button
                          type="button"
                          onClick={() => setScriptViewMode("full")}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                            scriptViewMode === "full"
                              ? "bg-[#0066FF] text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Full Prose
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-2">
                    {isEditingWorkspace ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setIsEditingWorkspace(false)}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={saveEditedScript}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Simpan Perubahan</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setWorkspaceEditText(currentScriptText);
                            setIsEditingWorkspace(true);
                          }}
                          disabled={isGenerating}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40"
                        >
                          <FileEdit className="w-3.5 h-3.5 text-[#0066FF]" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(true)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          {copiedClean ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedClean ? "Tersalin!" : "Copy VO"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(false)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          <span>{copiedRaw ? "Copied Raw!" : "Copy Raw"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowZipModal(true)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white rounded-xl text-xs font-semibold cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export ZIP</span>
                        </button>

                        {scriptViewMode === "full" && (
                          <button
                            type="button"
                            onClick={() => setShowLabelsInFullView(!showLabelsInFullView)}
                            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-mono cursor-pointer"
                          >
                            {showLabelsInFullView ? "Label: On" : "Label: Off"}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="p-5 max-h-[500px] overflow-y-auto bg-[#FAFCFF]">
                    {isEditingWorkspace ? (
                      <textarea
                        value={workspaceEditText}
                        onChange={(e) => setWorkspaceEditText(e.target.value)}
                        className="w-full min-h-[260px] bg-white border border-slate-300 rounded-xl p-4 text-slate-900 font-mono text-sm leading-relaxed focus:outline-none focus:border-[#0066FF] resize-y"
                      />
                    ) : scriptViewMode === "segmented" ? (
                      <div className="space-y-3">
                        {parseRecapScript(currentScriptText).map((p) => {
                          const correspondingImg = images[p.index - 1];
                          return (
                            <div
                              key={p.index}
                              className="bg-white border border-slate-600/75 rounded-xl p-4 shadow-sm shadow-slate-900/10 flex gap-4 items-start"
                            >
                              {correspondingImg ? (
                                <div
                                  onClick={() => setFullscreenImageUrl(correspondingImg.url || correspondingImg.base64)}
                                  className="w-16 h-24 rounded-lg overflow-hidden border border-slate-600/70 bg-slate-100 relative shrink-0 cursor-zoom-in shadow-2xs"
                                  title="Perbesar gambar"
                                >
                                  <img
                                    src={correspondingImg.url || correspondingImg.base64}
                                    alt={correspondingImg.name}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="absolute bottom-0 inset-x-0 text-center py-0.5 bg-slate-900/85 text-[10px] font-mono font-bold text-white">
                                    #{p.index}
                                  </span>
                                </div>
                              ) : (
                                <div className="w-14 h-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-mono text-slate-400">#{p.index}</span>
                                </div>
                              )}

                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="text-xs font-bold text-[#0066FF] font-mono">
                                    {p.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(p.text)}
                                    className="text-xs text-slate-500 hover:text-[#0066FF] font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Copy className="w-3 h-3" />
                                    <span>Salin</span>
                                  </button>
                                </div>
                                <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap select-text">
                                  {p.text}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-600/75 rounded-xl p-5 shadow-sm shadow-slate-900/10 text-slate-800 leading-relaxed text-sm whitespace-pre-wrap select-text min-h-[160px]">
                        {showLabelsInFullView ? currentScriptText : getCleanStoryText(currentScriptText)}
                      </div>
                    )}
                  </div>

                  {(() => {
                    const activeText = isEditingWorkspace ? workspaceEditText : currentScriptText;
                    const statsParagraphs = parseRecapScript(activeText).length;
                    const statsWords = activeText ? activeText.trim().split(/\s+/).filter(Boolean).length : 0;
                    const statsChars = activeText ? activeText.length : 0;
                    return (
                      <div className="px-5 py-2.5 bg-[#F8FAFC] border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                        <div className="flex items-center gap-4">
                          <span>Paragraf: <strong className="text-slate-900">{statsParagraphs}</strong></span>
                          <span>Kata: <strong className="text-slate-900">{statsWords}</strong></span>
                          <span>Karakter: <strong className="text-slate-900">{statsChars}</strong></span>
                        </div>
                        <span className="text-slate-400">Metrics</span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* BOTTOM RIWAYAT NASKAH LOKAL BAR */}
              <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] overflow-hidden">
                <div
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  className="px-5 py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <History className="w-4 h-4 text-slate-700" />
                    <span className="text-sm font-bold text-slate-900 tabular-nums">
                      Riwayat Naskah Lokal ({historyScripts.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDatabaseModal(true);
                      }}
                      className="px-3 py-1.5 bg-[#F8FAFC] hover:bg-blue-50 border border-slate-200 hover:border-[#0066FF]/40 rounded-lg text-xs font-semibold text-slate-700 hover:text-[#0066FF] flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <span>Kelola DB</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isHistoryExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Cari naskah, tone, judul..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full min-h-[40px] pl-10 pr-4 py-2 bg-[#F8FAFC] border border-slate-200 text-xs sm:text-sm rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0066FF]"
                      />
                    </div>
                    {renderHistoryCards()}
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW 2: TOOLS */}
          {activeNav === "tools" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0066FF] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Character Prompt Helper</h2>
                    <p className="text-xs text-slate-500">Buat prompt profil karakter akurat untuk AI Vision</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Nama Seri Target</label>
                  <input
                    type="text"
                    value={seriesName}
                    onChange={(e) => setSeriesName(e.target.value)}
                    placeholder="Contoh: Munou na Nana"
                    className="w-full min-h-[42px] px-3.5 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 text-sm rounded-xl outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCopyPromptHelper}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs sm:text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {copiedPrompt ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedPrompt ? "Prompt Helper Disalin!" : "Salin Prompt Profil Karakter"}</span>
                </button>
              </div>

              <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0066FF] flex items-center justify-center">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Export Paket ZIP & Backup</h2>
                    <p className="text-xs text-slate-500">Unduh naskah beserta gambar terurut atau backup database</p>
                  </div>
                </div>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setShowZipModal(true)}
                    disabled={!currentScriptText.trim()}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-[#0066FF] hover:bg-[#0052CC] disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs sm:text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>{currentScriptText.trim() ? "Buka Pengaturan Export ZIP" : "Generate naskah dahulu untuk Export ZIP"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDatabaseModal(true)}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-[#F8FAFC] hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs sm:text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Database className="w-4 h-4 text-[#0066FF]" />
                    <span>Buka Pengelola Database IndexedDB</span>
                  </button>
                  <PWAInstallButton variant="settings" />
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: ASSETS */}
          {activeNav === "assets" && (
            <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tabular-nums">
                    Galeri Manga Assets ({images.length})
                  </h2>
                  <p className="text-xs text-slate-500">Kelola urutan halaman komik sebelum diproses AI</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerFileInput}
                    className="px-4 py-2 bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Tambah Gambar</span>
                  </button>
                  {images.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllImages}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Semua</span>
                    </button>
                  )}
                </div>
              </div>

              {images.length === 0 ? (
                <div
                  onClick={triggerFileInput}
                  className="py-16 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#0066FF]/60 hover:bg-blue-50/30 transition"
                >
                  <FileImage className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-700">Belum ada gambar manga diunggah</p>
                  <p className="text-xs text-slate-500 mt-1">Klik di sini untuk memilih gambar dari perangkat Anda.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3.5">
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      onClick={() => setFullscreenImageUrl(img.url || img.base64)}
                      className="relative aspect-[3/4] rounded-xl border border-slate-600/80 bg-slate-100 overflow-hidden cursor-zoom-in group shadow-md shadow-slate-900/15"
                    >
                      <img
                        src={img.url || img.base64}
                        alt={img.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute bottom-2 left-2 bg-slate-900/85 text-white text-xs font-mono font-bold px-2 py-0.5 rounded-md">
                        #{index + 1}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => removeImage(img.id, e)}
                        className="absolute top-2 right-2 p-1.5 bg-white/95 hover:bg-rose-600 text-slate-700 hover:text-white rounded-full border border-slate-200 transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: RIWAYAT */}
          {activeNav === "riwayat" && (
            <div className="bg-white border-[1.5px] border-slate-700/80 rounded-2xl p-5 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.2),0_2px_8px_-2px_rgba(15,23,42,0.1)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tabular-nums">
                    Riwayat Naskah Lokal ({historyScripts.length})
                  </h2>
                  <p className="text-xs text-slate-500">Klik naskah untuk memuat kembali ke Dashboard</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatabaseModal(true)}
                  className="px-3.5 py-2 bg-[#F8FAFC] hover:bg-blue-50 border border-slate-200 hover:border-[#0066FF]/40 rounded-xl text-xs font-semibold text-slate-700 hover:text-[#0066FF] flex items-center gap-1.5 cursor-pointer"
                >
                  <Database className="w-4 h-4 text-[#0066FF]" />
                  <span>Kelola DB IndexedDB</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari judul naskah, tone, atau isi teks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-[#F8FAFC] border border-slate-200 text-sm rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#0066FF]"
                />
              </div>

              {renderHistoryCards()}
            </div>
          )}
        </main>
      </div>

      {/* ZIP DOWNLOAD MODAL */}
      {showZipModal && (
        <div
          id="zip-download-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowZipModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white border-[1.5px] border-slate-700/85 rounded-2xl w-full max-w-md overflow-hidden shadow-[0_18px_40px_-8px_rgba(15,23,42,0.32)] flex flex-col max-h-[88vh] animate-fadeIn">
            <div className="bg-[#0066FF] px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Download className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-sm">Download Paket ZIP</h3>
                  <p className="text-[11px] text-blue-100">Atur format naskah & nama file gambar ekspor</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowZipModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/15 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Prefix Nama Gambar</label>
                <input
                  type="text"
                  value={zipPrefix}
                  onChange={(e) => setZipPrefix(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                  className="w-full min-h-[40px] px-3 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 rounded-xl text-xs font-mono outline-none"
                  placeholder="misal: image, gambar"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Pemisah</label>
                  <select
                    value={zipSeparator}
                    onChange={(e) => setZipSeparator(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 rounded-xl text-xs font-mono outline-none cursor-pointer"
                  >
                    <option value="_">_ (Garis Bawah)</option>
                    <option value="-">- (Strip)</option>
                    <option value="">(Tanpa Pemisah)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Digit Penomoran</label>
                  <select
                    value={zipDigits}
                    onChange={(e) => setZipDigits(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 rounded-xl text-xs font-mono outline-none cursor-pointer"
                  >
                    <option value={3}>001 (3 Digit)</option>
                    <option value={2}>01 (2 Digit)</option>
                    <option value={1}>1 (Tanpa Nol)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Konversi Format Gambar</label>
                <select
                  value={zipImgFormat}
                  onChange={(e) => setZipImgFormat(e.target.value as any)}
                  className="w-full min-h-[40px] px-3 py-2 bg-white border border-slate-300 focus:border-[#0066FF] text-slate-900 rounded-xl text-xs font-mono outline-none cursor-pointer"
                >
                  <option value="jpg">JPG (.jpg) - Konversi Otomatis</option>
                  <option value="png">PNG (.png) - Konversi Otomatis</option>
                  <option value="original">Format Asli Komik (Tanpa Ubah)</option>
                </select>
              </div>

              <div className="bg-[#F8FAFC] border border-slate-200 p-3.5 rounded-xl space-y-2 font-mono text-xs text-slate-700">
                <span className="text-[11px] font-bold text-slate-500">Preview Isi File ZIP:</span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[#0066FF] font-semibold">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{currentScriptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "script"}.md</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <FileImage className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{zipPrefix}{zipSeparator}{String(1).padStart(zipDigits, "0")}.{zipImgFormat === "original" ? "jpg" : zipImgFormat}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <FileImage className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{zipPrefix}{zipSeparator}{String(2).padStart(zipDigits, "0")}.{zipImgFormat === "original" ? "jpg" : zipImgFormat}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 bg-[#F8FAFC] border-t border-slate-200 flex gap-3">
              <button
                type="button"
                onClick={() => setShowZipModal(false)}
                className="flex-1 min-h-[42px] bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                disabled={isZipping}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={downloadZip}
                disabled={isZipping}
                className="flex-[1.5] min-h-[42px] bg-[#0066FF] hover:bg-[#0052CC] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isZipping ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Packing...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Bundle</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN IMAGE PREVIEW MODAL */}
      {fullscreenImageUrl && (
        <div
          onClick={() => setFullscreenImageUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex flex-col items-center justify-center p-4 cursor-pointer animate-fadeIn"
        >
          <div className="absolute top-4 left-0 right-0 px-6 flex items-center justify-between text-white z-50">
            <span className="text-xs font-mono font-bold tracking-wider text-blue-300">ASSET PREVIEW</span>
            <button
              type="button"
              onClick={() => setFullscreenImageUrl(null)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={fullscreenImageUrl}
            alt="Manga Preview"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-white/10"
            referrerPolicy="no-referrer"
          />
          <span className="absolute bottom-6 text-slate-300 text-xs font-medium">Klik di mana saja untuk menutup</span>
        </div>
      )}

      {/* OFFLINE CONNECTIVITY INDICATOR */}
      <OfflineIndicator />

      {/* DATABASE INDEXEDDB MANAGER MODAL */}
      <DatabaseModal
        isOpen={showDatabaseModal}
        onClose={() => setShowDatabaseModal(false)}
        onDataChanged={loadHistory}
      />

      {/* API KEY SETTINGS & CONNECTION TEST MODAL */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        initialTab={provider}
        googleApiKey={googleApiKey}
        setGoogleApiKey={setGoogleApiKey}
        kieApiKey={kieApiKey}
        setKieApiKey={setKieApiKey}
        openrouterApiKey={openrouterApiKey}
        setOpenrouterApiKey={setOpenrouterApiKey}
      />
    </div>
  );
}
