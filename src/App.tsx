import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  FileImage,
  Upload, 
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
  BookOpen,
  Smartphone,
  Wifi,
  Signal,
  Battery,
  ArrowLeft,
  AlertCircle,
  X,
  FolderOpen,
  HelpCircle,
  CheckCircle2,
  Undo2,
  Settings,
  ChevronDown
} from "lucide-react";
import { PWAInstallButton } from "./components/PWAInstallButton";
import JSZip from "jszip";
import { motion, AnimatePresence } from "motion/react";
import { MangaImage, RecapScript, ToneType, LanguageType, LengthType, ActiveSession } from "./types";
import { saveRecapScript, getAllRecapScripts, deleteRecapScript, saveActiveSession, getActiveSession, clearActiveSession } from "./lib/db";

// Helper to convert base64 back to an active Blob URL for fast previewing in the current session
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
    return base64; // Fallback to base64 if anything fails
  }
}

// Helper to dynamically apply watermark label text to base64 images
async function watermarkBase64Image(base64: string, label: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      try {
        // Resize image to max 1200px to ensure ultra-fast upload, API stability, and zero timeouts/truncations
        const maxDim = 1200;
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
        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);

        // Scale badge elements based on image size to look extremely crisp and readable
        const scale = Math.max(1, Math.min(width, height) / 1000);
        const paddingX = 24 * scale;
        const paddingY = 16 * scale;
        const fontSize = Math.max(20, Math.round(32 * scale));

        ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textWidth = ctx.measureText(label).width;

        // Rose colored dot indicator
        const dotRadius = 6 * scale;
        const gap = 12 * scale;
        const badgeWidth = textWidth + paddingX * 2 + dotRadius * 2 + gap;
        const badgeHeight = fontSize + paddingY * 2;

        // Top-left position
        const x = 32 * scale;
        const y = 32 * scale;
        const radius = 12 * scale;

        // Draw subtle dark backing drop shadow
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 15 * scale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6 * scale;

        // Draw dark semi-transparent glass badge background
        ctx.fillStyle = "rgba(9, 9, 11, 0.95)";
        ctx.beginPath();
        // Fallback for roundRect if not supported by browser
        if (ctx.roundRect) {
          ctx.roundRect(x, y, badgeWidth, badgeHeight, radius);
        } else {
          ctx.rect(x, y, badgeWidth, badgeHeight);
        }
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw elegant border outline
        ctx.strokeStyle = "rgba(79, 70, 229, 0.85)"; // Indigo-600
        ctx.lineWidth = Math.max(2, 3 * scale);
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, badgeWidth, badgeHeight, radius);
        } else {
          ctx.rect(x, y, badgeWidth, badgeHeight);
        }
        ctx.stroke();

        // Draw active indicator dot (Cyan)
        const dotX = x + paddingX + dotRadius;
        const dotY = y + badgeHeight / 2;
        ctx.fillStyle = "#22d3ee"; // Cyan-400
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        // Draw bright white label text
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, dotX + dotRadius + gap, dotY);

        resolve(canvas.toDataURL("image/jpeg", 0.8));
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

// Parses the script block using [GAMBAR X] format or falls back to double newline splits
function parseRecapScript(text: string): ParsedParagraph[] {
  if (!text) return [];
  
  // Match headers like: [GAMBAR 1, 2, 3] or GAMBAR 4, 5: or [GAMBAR 6-8]
  const regex = /\[?GAMBAR\s+([0-9\s,\\\-\&dan]+)\]?:?/gi;
  
  const paragraphs: ParsedParagraph[] = [];
  const matches: { header: string; rawRange: string; index: number; nextIndex: number }[] = [];
  let match;
  const activeRegex = new RegExp(regex);
  while ((match = activeRegex.exec(text)) !== null) {
    matches.push({
      header: match[0],
      rawRange: match[1],
      index: match.index,
      nextIndex: activeRegex.lastIndex
    });
  }
  
  if (matches.length === 0) {
    // Fallback split by double newlines
    return text.split(/\n\s*\n/).map((p, idx) => ({
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
    const contentEnd = nextMatch ? nextMatch.index : text.length;
    const pText = text.substring(contentStart, contentEnd).trim();
    
    if (pText) {
      const indices: number[] = [];
      const cleanRange = currentMatch.rawRange.toLowerCase();
      
      const rangeRegex = /(\d+)\s*(?:-|dan|\s+sampai\s+)\s*(\d+)/i;
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
            if (!isNaN(n)) {
              indices.push(n);
            }
          });
        }
      }
      
      const primaryIndex = indices.length > 0 ? indices[0] : (i + 1);
      
      paragraphs.push({
        index: primaryIndex,
        indices: indices,
        label: `Gambar ${indices.length > 0 ? indices.join(", ") : primaryIndex}`,
        text: pText
      });
    }
  }
  
  return paragraphs;
}

// Helper to get file extension from mimeType or filename
function getFileExtension(mimeType: string, filename: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  if (extMatch) return extMatch[1];
  return "jpg";
}

// Helper to convert base64 image of any type to target format
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
  // Mobile Android Specific States
  const [currentTime, setCurrentTime] = useState("");
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(null);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(true);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);
  const [googleApiKey, setGoogleApiKey] = useState<string>("");
  const [kieApiKey, setKieApiKey] = useState<string>("");
  const [model, setModel] = useState<string>("gemini-1.5-flash");

  // Live Android Clock tick
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Settings
  const [tone, setTone] = useState<ToneType>("dramatic");
  const [language, setLanguage] = useState<LanguageType>("id");
  const [targetLength, setTargetLength] = useState<LengthType>("medium");
  const [customInstructions, setCustomInstructions] = useState<string>("");
  const [customStyleRef, setCustomStyleRef] = useState<string>("");
  const [characterDetails, setCharacterDetails] = useState<string>("");
  const [seriesName, setSeriesName] = useState<string>("Munou na Nana (Talentless Nana)");

  // Batch Mode Settings
  const [useBatchMode, setUseBatchMode] = useState<boolean>(false);
  const [batchSize, setBatchSize] = useState<number>(5);
  const cancelGenerationRef = useRef<boolean>(false);

  // Script Context Settings
  const [scriptType, setScriptType] = useState<"first" | "continued">("first");
  const [initialContextText, setInitialContextText] = useState<string>("");
  const [isSuperConcise, setIsSuperConcise] = useState<boolean>(false);

  // Batch Resume State
  const [resumeBatchIndex, setResumeBatchIndex] = useState<number>(0);
  const [failedBatchIndex, setFailedBatchIndex] = useState<number | null>(null);
  const [resumeAccumulatedScript, setResumeAccumulatedScript] = useState<string>("");
  const [currentRetryCount, setCurrentRetryCount] = useState<number>(0);

  // Manga Images
  const [images, setImages] = useState<MangaImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showCharDetails, setShowCharDetails] = useState<boolean>(true);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Output Script
  const [currentScriptText, setCurrentScriptText] = useState<string>(" ");
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
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  
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

  // Load History on Mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await getAllRecapScripts();
      setHistoryScripts(data);
      setIsHistoryLoaded(true);
    } catch (err) {
      console.error("Gagal memuat riwayat:", err);
    }
  };

  const [isSessionRestored, setIsSessionRestored] = useState(false);

  // Load Active Session on Mount
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
          setUseBatchMode(session.useBatchMode);
          setBatchSize(session.batchSize);
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
          setModel(session.model || "gemini-1.5-flash");
          setGoogleApiKey(session.googleApiKey || "");
          setKieApiKey(session.kieApiKey || "");
          setIsSuperConcise(true);
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

  // Auto-save session state
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
        model,
        googleApiKey,
        kieApiKey
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
    model,
    googleApiKey,
    kieApiKey
  ]);

  // Drag and Drop
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

  const generateRecap = async (isResume: boolean = false) => {
    if (images.length === 0) {
      setError("Silakan upload minimal satu gambar manga terlebih dahulu.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setIsSettingsExpanded(false);
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
        let startIndex = isResume ? resumeBatchIndex : 0;

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
            setCurrentRetryCount(attempt - 1);

            try {
              const previousParagraphs = getLastThreeParagraphs(accumulatedScript);
              const isFirstBatch = i === 0;
              const sendInitialContext = (isFirstBatch && scriptType === "continued") ? initialContextText : "";

              const response = await fetch("/api/recap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  images: chunkImages,
                  model,
                  googleApiKey,
                  kieApiKey,
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
                } catch (e) {
                  errMsg = `Server Error (${response.status})`;
                }
                throw new Error(errMsg);
              }

              const data = await response.json();
              batchScript = data.script.trim();
              success = true;
              break;
            } catch (err: any) {
              console.warn(`Percobaan ${attempt} gagal untuk Batch ${i + 1}:`, err);
              if (attempt === maxRetries) {
                setResumeBatchIndex(i);
                setFailedBatchIndex(i);
                setResumeAccumulatedScript(accumulatedScript);
                finishedAll = false;
                throw new Error(`Gagal memproses Batch ${i + 1} setelah 3 percobaan otomatis.\nDetail: ${err.message || err}`);
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
            if (accumulatedScript) {
              accumulatedScript += "\n\n" + batchScript;
            } else {
              accumulatedScript = batchScript;
            }
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
            model,
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
            model,
            googleApiKey,
            kieApiKey,
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
          } catch (e) {
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
          model,
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
      const generatedTitle = currentScriptTitle;
      const updatedRecap: RecapScript = {
        id: Math.random().toString(36).substring(2, 9),
        title: generatedTitle,
        date: new Date().toISOString(),
        script: workspaceEditText,
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
    return rawText
      .split(/\n/)
      .filter(line => {
        const trimmed = line.trim();
        return !/^(?:\[?\s*(?:GAMBAR|IMAGE|HALAMAN|PAGE)\s+[0-9\s,\\\-\&dan]+\s*\]?:?)$/i.test(trimmed);
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const copyToClipboard = (cleanOnly: boolean) => {
    const textToCopy = cleanOnly ? getCleanStoryText(currentScriptText) : currentScriptText;
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
      alert("Gagal membuat file ZIP.");
    } finally {
      setIsZipping(false);
    }
  };

  const loadScriptFromHistory = (item: RecapScript) => {
    setCurrentScriptTitle(item.title);
    setCurrentScriptText(item.script);
    setModel(item.model);
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
    setIsSettingsExpanded(false);
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

  // Mobile Bottom Navigation Tabs configuration
  const navTabs = [
    { id: "manga", label: "Manga", icon: FolderOpen },
    { id: "naskah", label: "Naskah", icon: FileText },
    { id: "setelan", label: "Setelan", icon: Settings },
    { id: "riwayat", label: "Riwayat", icon: History }
  ] as const;

  return (
    <div className="min-h-screen w-full bg-[#030712] flex items-center justify-center p-0 md:p-6 select-none overflow-hidden font-sans">
      
      {/* simulated Android smartphone container */}
      <div className="relative w-full h-screen md:max-w-[430px] md:h-[880px] md:rounded-[54px] md:border-[12px] md:border-slate-900 md:shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] bg-slate-950 flex flex-col overflow-hidden ring-1 ring-slate-800/50">
        
        {/* Notch / Dynamic Island on desktop only */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-full z-40 hidden md:flex items-center justify-center border border-white/5 shadow-2xl">
          <div className="w-3 h-3 bg-slate-900 rounded-full border border-slate-800/80 mr-2 flex items-center justify-center">
            <div className="w-1 h-1 bg-indigo-500/50 rounded-full"></div>
          </div>
          <div className="w-1.5 h-1.5 bg-indigo-950/40 rounded-full"></div>
        </div>

        {/* Realistic Android Status Bar - Desktop Mockup Only */}
        <div className="h-7 px-5 pt-1.5 hidden md:flex items-center justify-between text-[11px] font-semibold text-slate-400 select-none bg-slate-950 z-30 shrink-0">
          <div className="flex items-center gap-1 font-mono tracking-wider">
            <span>{currentTime || "12:30"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Signal className="w-3.5 h-3.5 text-slate-400" />
            <Wifi className="w-3.5 h-3.5 text-slate-400" />
            <div className="flex items-center gap-1">
              {isGenerating ? (
                <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider animate-pulse font-mono">CHARGING</span>
              ) : (
                <span className="text-[9px] font-mono leading-none">88%</span>
              )}
              <Battery className={`w-4 h-4 ${isGenerating ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
            </div>
          </div>
        </div>

        {/* Native Android Header / Appbar */}
        <header className="h-16 px-5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between shrink-0 select-none z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-950/40">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-white leading-none tracking-tight">Mangaroot</h1>
              <p className="text-[10px] text-slate-400 mt-1 font-bold font-mono uppercase tracking-[0.1em]">Creator Studio</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {images.length > 0 && (
              <button
                onClick={clearAllImages}
                className="p-2 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-rose-500/10 transition-all active:scale-90 cursor-pointer"
                title="Hapus semua gambar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <div className="px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] font-bold text-indigo-400 uppercase tracking-[0.15em] font-mono select-none">
                v1.5
              </div>
            </div>
          </div>
        </header>

        {/* MAIN BODY AREA / ACTIVE CONTENT (SINGLE TAB UNIFIED DASHBOARD) */}
        <div 
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden bg-slate-950"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          
          {/* SECTION 1: MANGA UPLOAD & HORIZONTAL PREVIEW */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2rem] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-[0.1em] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                Manga Assets ({images.length})
              </span>
              {images.length > 0 && (
                <button
                  onClick={clearAllImages}
                  className="text-[10px] text-slate-400 hover:text-rose-400 font-mono font-bold uppercase transition flex items-center gap-1 px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800/80 cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {images.length === 0 ? (
              /* Drag Zone */
              <div 
                onClick={triggerFileInput}
                className={`w-full py-14 px-6 border-2 border-dashed rounded-3xl cursor-pointer flex flex-col items-center justify-center transition-all duration-300 active:scale-[0.97] ${
                  isDragging 
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" 
                    : "border-slate-800/80 bg-slate-900/20 text-slate-400 hover:border-indigo-500/50 hover:bg-indigo-500/5"
                }`}
              >
                <div className="p-4 bg-slate-950 rounded-2xl text-indigo-400 mb-4 border border-slate-800 shadow-xl group-hover:scale-110 transition-transform">
                  <Upload className="w-7 h-7" />
                </div>
                <h3 className="font-extrabold text-white text-sm mb-1.5">Import Manga Pages</h3>
                <p className="text-[11px] text-slate-500 max-w-[240px] leading-relaxed text-center mb-5 font-medium">
                  Select or drag images here. Numerical ordering applied automatically.
                </p>
                <span className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl shadow-lg shadow-indigo-950/40 transition-colors uppercase tracking-wider">
                  Browse Files
                </span>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            ) : (
              /* Swipeable Horizontal Scroller of manga page previews */
              <div className="flex items-center gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0 select-none">
                {images.map((img, index) => (
                  <div key={img.id} className="relative w-20 h-28 rounded-xl border border-slate-850 bg-slate-950 overflow-hidden shadow-md shrink-0 active:scale-95 transition-transform group">
                    <img 
                      src={img.url || img.base64} 
                      alt={img.name} 
                      className="w-full h-full object-cover pointer-events-none" 
                      loading="lazy"
                    />
                    
                    {/* Page Index badge */}
                    <div className="absolute bottom-1 left-1 bg-slate-950/90 text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-850">
                      #{index + 1}
                    </div>

                    {/* Circular close button */}
                    <button
                      onClick={(e) => removeImage(img.id, e)}
                      className="absolute top-1 right-1 p-1 bg-slate-950/90 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-full border border-slate-850 backdrop-blur-xs transition cursor-pointer active:scale-90"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}

                {/* Inline "Tambah" upload square */}
                <button
                  onClick={triggerFileInput}
                  className="w-20 h-28 rounded-xl border-2 border-dashed border-slate-800 bg-slate-900/10 hover:bg-slate-900/20 hover:border-slate-700 flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0 transition active:scale-95"
                >
                  <Upload className="w-5 h-5 text-slate-500" />
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Tambah</span>
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  multiple 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            )}
          </div>

          {/* SECTION 2: COLLAPSIBLE SETTINGS & PARAMS ACCORDION */}
          <div className="bg-slate-900/25 border border-slate-850/60 rounded-3xl overflow-hidden shadow-sm">
            {/* Header row */}
            <div 
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-900/30 select-none transition-colors border-b border-slate-800/40"
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-[0.1em]">Engine Config & Params</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isSettingsExpanded ? "rotate-180" : ""}`} />
            </div>

            {/* Accordion panel content */}
            {isSettingsExpanded && (
              <div className="p-5 space-y-5 animate-fadeIn border-t border-slate-800/20 bg-slate-900/10">
                {/* Judul Seri Manga */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider">Series Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Talentless Nana"
                    value={seriesName}
                    onChange={(e) => setSeriesName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl focus:border-indigo-500 transition-all outline-none font-sans shadow-inner"
                  />
                </div>

                {/* API Keys Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider">AI Studio Project Key</label>
                      <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[9px] text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-1 transition-colors"
                      >
                        <HelpCircle className="w-2.5 h-2.5" />
                        Get Key
                      </a>
                    </div>
                    <input
                      type="password"
                      placeholder="Optional (System Connected)"
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl focus:border-indigo-500 transition-all outline-none font-sans"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider">Kie.ai Project Key</label>
                      <a 
                        href="https://kie.ai/id/api-key" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[9px] text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-1 transition-colors"
                      >
                        <HelpCircle className="w-2.5 h-2.5" />
                        Get Key
                      </a>
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={kieApiKey}
                      onChange={(e) => setKieApiKey(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl focus:border-indigo-500 transition-all outline-none font-sans"
                    />
                  </div>
                </div>

                {/* Model Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider">Engine Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl focus:border-indigo-500 transition-all cursor-pointer outline-none font-sans"
                  >
                    <option value="gemini-1.5-flash">Google AI Studio (Default)</option>
                    <optgroup label="Kie.ai Project Models">
                      <option value="gemini-3-5-flash">3.5 Flash</option>
                      <option value="gemini-3-6-flash">3.6 Flash</option>
                      <option value="gemini-3-7-flash">3.7 Flash</option>
                      <option value="gemini-3-8-flash">3.8 Flash</option>
                    </optgroup>
                  </select>
                </div>

                {/* Profil Detail Karakter & AI Helper */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Profil Detail Karakter</label>
                    <button
                      onClick={handleCopyPromptHelper}
                      className="text-[9px] text-rose-400 font-bold hover:text-rose-300 flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      {copiedPrompt ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      <span>Prompt Helper</span>
                    </button>
                  </div>
                  <textarea
                    placeholder="Contoh:&#10;1. Hiiragi, Nana (Rambut twintail pink, baju pelaut, pura-pura ceria)&#10;2. Onodera, Kyouya (Rambut putih berantakan, detektif)"
                    value={characterDetails}
                    onChange={(e) => setCharacterDetails(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 text-xs rounded-xl transition focus:outline-none focus:border-rose-500 min-h-[80px] max-h-[120px] resize-y font-sans leading-relaxed"
                  />
                </div>

                {/* Tone and Language Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Tone</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as ToneType)}
                      className="w-full px-2.5 py-2.5 bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded-xl focus:border-rose-500 cursor-pointer outline-none font-sans capitalize"
                    >
                      <option value="aniki">AniKi.ID (Storyteller) 🎤</option>
                      <option value="humorous">Humoris (Funny) 😂</option>
                      <option value="formal">Formal 👔</option>
                      <option value="dramatic">Drama 🎭</option>
                      <option value="casual">Casual ☕</option>
                      <option value="epic">Epic ⚔️</option>
                      <option value="custom">Custom (Gaya Sendiri) 🛠️</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Bahasa</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as LanguageType)}
                      className="w-full px-2.5 py-2.5 bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded-xl focus:border-rose-500 cursor-pointer outline-none font-sans"
                    >
                      <option value="id">Indonesia 🇮🇩</option>
                      <option value="en">English 🇬🇧</option>
                    </select>
                  </div>
                </div>

                {tone === "custom" && (
                  <div className="flex flex-col gap-1.5 mt-2 bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/10 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-indigo-400 font-mono uppercase tracking-wider">Referensi Gaya Naskah</label>
                      <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                    </div>
                    <textarea
                      placeholder="Tempelkan contoh naskah di sini. AI akan meniru gaya bahasa, kata sapaan, dan cara penyampaiannya..."
                      value={customStyleRef}
                      onChange={(e) => setCustomStyleRef(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-600 text-xs rounded-xl transition focus:outline-none focus:border-indigo-500 min-h-[120px] max-h-[200px] resize-y font-sans leading-relaxed shadow-inner"
                    />
                  </div>
                )}

                {/* Script Density Toggle */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Kepadatan Naskah</label>
                  <div className="flex p-1 bg-slate-950 border border-slate-850 rounded-2xl">
                    <button
                      onClick={() => setIsSuperConcise(true)}
                      className={`flex-1 py-2 text-[10px] font-bold rounded-xl transition-all ${
                        isSuperConcise 
                          ? "bg-rose-500 text-white shadow-lg shadow-rose-950/40" 
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Ringkas ⚡
                    </button>
                    <button
                      onClick={() => setIsSuperConcise(false)}
                      className={`flex-1 py-2 text-[10px] font-bold rounded-xl transition-all ${
                        !isSuperConcise 
                          ? "bg-rose-500 text-white shadow-lg shadow-rose-950/40" 
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Detail 📖
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500 font-medium px-1">
                    {isSuperConcise 
                      ? "Fokus pada inti plot utama. Cocok untuk video cepat." 
                      : "Cerita lebih mendalam dan emosional. Cocok untuk video panjang."}
                  </p>
                </div>

                {/* Story flow setting */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Alur Cerita</label>
                  <select
                    value={scriptType}
                    onChange={(e) => setScriptType(e.target.value as "first" | "continued")}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded-xl focus:border-rose-500 transition duration-150 cursor-pointer outline-none font-sans"
                  >
                    <option value="first">Mulai Bab Baru (Awal Naskah)</option>
                    <option value="continued">Naskah Lanjutan (Konteks Bab Sebelumnya)</option>
                  </select>

                  {scriptType === "continued" && (
                    <div className="flex flex-col gap-1 mt-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 animate-fadeIn">
                      <label className="text-[9px] font-bold text-rose-400 font-mono uppercase tracking-wider">Ringkasan Bab Sebelumnya</label>
                      <textarea
                        placeholder="Tulis spoiler ringkas dari video part sebelumnya disini agar kelanjutan cerita batch ini menyambung mulus..."
                        value={initialContextText}
                        onChange={(e) => setInitialContextText(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 text-xs rounded-lg transition focus:outline-none focus:border-rose-500 min-h-[50px] max-h-[80px] resize-y font-sans leading-relaxed"
                      />
                    </div>
                  )}
                </div>

                {/* Generation Mode Select (Batch Mode) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Mode Generasi</label>
                  <select
                    value={useBatchMode ? "batch" : "single"}
                    onChange={(e) => setUseBatchMode(e.target.value === "batch")}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded-xl focus:border-rose-500 transition duration-150 cursor-pointer outline-none font-sans"
                  >
                    <option value="single">Satu Batch Sekaligus (Semua Gambar)</option>
                    <option value="batch">Bertahap Per Batch (Rekomendasi YouTube)</option>
                  </select>

                  {useBatchMode && (
                    <div className="flex flex-col gap-1 bg-slate-950/60 p-3 rounded-xl border border-slate-850 animate-fadeIn mt-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 font-mono uppercase">
                        <span>Halaman per Batch</span>
                        <span className="text-rose-400 font-bold font-mono text-sm">{batchSize} Hlm</span>
                      </div>
                      
                      {/* Tactile Adjuster */}
                      <div className="flex items-center gap-3 my-2">
                        <button
                          type="button"
                          onClick={() => setBatchSize(prev => Math.max(1, prev - 1))}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-bold text-lg active:scale-90 transition-transform cursor-pointer"
                        >
                          -
                        </button>
                        
                        <div className="flex-1 text-center font-mono font-bold text-xs text-slate-200 py-2 bg-slate-950 border border-slate-800 rounded-xl">
                          {batchSize} Halaman
                        </div>

                        <button
                          type="button"
                          onClick={() => setBatchSize(prev => Math.min(20, prev + 1))}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-bold text-lg active:scale-90 transition-transform cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={batchSize}
                        onChange={(e) => setBatchSize(parseInt(e.target.value) || 5)}
                        className="w-full accent-rose-500 cursor-pointer h-1.5 rounded bg-slate-800"
                      />
                    </div>
                  )}
                </div>

                {/* Instruksi Tambahan (Custom Prompt) */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Instruksi Tambahan (Custom Prompt)</label>
                  <textarea
                    placeholder="Masukkan instruksi khusus, misal: 'Jangan ceritakan bagian X', 'Fokus pada pertarungan'..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 text-slate-200 placeholder-slate-500 text-xs rounded-xl focus:outline-none focus:border-rose-500 min-h-[50px] max-h-[100px] resize-y font-sans leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>

          {/* MAIN CORE TRIGGER TRIGGER AND GENERATE PANEL */}
          <div className="space-y-3 shrink-0">
            {isGenerating ? (
              /* PROGRESS LOADER BOX */
              <div className="p-5 bg-slate-900/35 border border-slate-850/80 rounded-3xl flex flex-col items-center justify-center text-center animate-fadeIn space-y-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-rose-500 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-rose-500">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-xs text-slate-100">AI Sedang Menyusun Naskah</h3>
                  <p className="text-[11px] text-slate-400 max-w-[260px] leading-relaxed">{generationProgress}</p>
                </div>
                
                {useBatchMode && (
                  <button
                    onClick={() => {
                      cancelGenerationRef.current = true;
                      setGenerationProgress("Membatalkan...");
                    }}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold rounded-xl transition cursor-pointer active:scale-95"
                  >
                    Batalkan Proses
                  </button>
                )}
              </div>
            ) : (
              /* PRIMARY TRIGGER ACTION BUTTON */
              images.length > 0 && (
                <div className="animate-fadeIn">
                  {failedBatchIndex !== null && useBatchMode ? (
                    <button
                      onClick={() => generateRecap(true)}
                      className="w-full py-4.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-950/20 hover:scale-[1.01] active:scale-[0.98] cursor-pointer transition flex items-center justify-center gap-2"
                    >
                      <Play className="w-5 h-5 text-white" />
                      <span>Lanjutkan Pembuatan Batch #{failedBatchIndex + 1}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => generateRecap(false)}
                      className="w-full py-4.5 bg-gradient-to-tr from-rose-500 to-amber-500 hover:opacity-95 text-white rounded-2xl font-bold text-sm shadow-2xl shadow-rose-950/30 hover:scale-[1.01] active:scale-[0.98] cursor-pointer transition flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-5 h-5 text-white animate-pulse" />
                      <span>Buat Naskah Video ({images.length} Halaman)</span>
                    </button>
                  )}
                </div>
              )
            )}

            {/* ERROR DISPLAY */}
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex flex-col gap-3 animate-fadeIn">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold">Terhenti:</span>
                    <p className="mt-1 leading-relaxed text-[11px] whitespace-pre-line">{error}</p>
                  </div>
                </div>
                {failedBatchIndex !== null && (
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => generateRecap(true)}
                      className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold rounded-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>Lanjutkan (Resume)</span>
                    </button>
                    <button
                      onClick={() => generateRecap(false)}
                      className="py-2 px-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 text-[10px] rounded-lg transition font-medium cursor-pointer"
                    >
                      Ulangi Awal
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 4: SCRIPT WORKSPACE VIEW */}
          {currentScriptText && currentScriptText.trim() !== "" && (
            <div className="bg-slate-900/20 border border-slate-850/60 rounded-3xl overflow-hidden shadow-md flex flex-col animate-fadeIn">
              
              {/* Header Actions row */}
              <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-850/40 flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-200 truncate">{currentScriptTitle}</span>
                  </div>
                  {!isEditingWorkspace && (
                    <div className="flex items-center bg-slate-950/80 border border-slate-850 p-0.5 rounded-lg">
                      <button
                        onClick={() => setScriptViewMode("segmented")}
                        className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer ${
                          scriptViewMode === "segmented"
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/40"
                            : "text-slate-500 hover:text-slate-200"
                        }`}
                      >
                        Segmented
                      </button>
                      <button
                        onClick={() => setScriptViewMode("full")}
                        className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer ${
                          scriptViewMode === "full"
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/40"
                            : "text-slate-500 hover:text-slate-200"
                        }`}
                      >
                        Full Prose
                      </button>
                    </div>
                  )}
                </div>

                {/* Touch buttons line */}
                <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0 py-0.5">
                  {isEditingWorkspace ? (
                    <>
                      <button
                        onClick={() => setIsEditingWorkspace(false)}
                        className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-[10px] transition font-bold cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        onClick={saveEditedScript}
                        className="flex items-center gap-1 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-indigo-950/20"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save Changes</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setWorkspaceEditText(currentScriptText);
                          setIsEditingWorkspace(true);
                        }}
                        disabled={isGenerating}
                        className={`flex items-center gap-1 px-4 py-2 bg-slate-900 border border-slate-800 text-slate-200 rounded-xl text-[10px] font-bold transition-all ${
                          isGenerating ? "opacity-30" : "active:scale-95 cursor-pointer hover:bg-slate-800"
                        }`}
                      >
                        <FileEdit className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => copyToClipboard(true)}
                        className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold transition-all active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/20"
                      >
                        {copiedClean ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-white" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy VO</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => copyToClipboard(false)}
                        className="flex items-center gap-1 px-4 py-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                        title="Copy with [GAMBAR] labels"
                      >
                        {copiedRaw ? "Copied Raw!" : "Copy Raw"}
                      </button>

                      <button
                        onClick={() => setShowZipModal(true)}
                        className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-bold transition-all active:scale-95 cursor-pointer shadow-lg shadow-indigo-950/30"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export ZIP</span>
                      </button>

                      {scriptViewMode === "full" && (
                        <button
                          onClick={() => setShowLabelsInFullView(!showLabelsInFullView)}
                          className="px-2 py-1 bg-slate-850 text-slate-300 rounded-lg text-[9px] font-mono shrink-0 cursor-pointer"
                        >
                          {showLabelsInFullView ? "Label: On" : "Label: Off"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Text / Segment View content container */}
              <div className="p-4 bg-slate-950/20 max-h-[420px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b border-slate-850/40">
                {isEditingWorkspace ? (
                  <textarea
                    value={workspaceEditText}
                    onChange={(e) => setWorkspaceEditText(e.target.value)}
                    className="w-full min-h-[250px] bg-slate-950 border border-slate-800 rounded-2xl p-4 text-slate-200 font-mono text-sm leading-relaxed focus:outline-none focus:border-indigo-500 resize-y shadow-inner"
                  />
                ) : scriptViewMode === "segmented" ? (
                  <div className="flex flex-col gap-4 select-text">
                    {parseRecapScript(currentScriptText).map((p) => {
                      const correspondingImg = images[p.index - 1];
                      return (
                        <div key={p.index} className="bg-slate-900/40 border border-slate-800/60 rounded-[1.5rem] p-4 flex gap-4 relative hover:border-indigo-500/30 transition-all group">
                          <div className="shrink-0 flex flex-col gap-2 items-center">
                            {correspondingImg ? (
                              <div 
                                onClick={() => setFullscreenImageUrl(correspondingImg.url || correspondingImg.base64)}
                                className="w-16 h-24 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 relative shadow-xl cursor-zoom-in active:scale-95 transition-all group-hover:border-indigo-500/50"
                                title="Expand image"
                              >
                                <img 
                                  src={correspondingImg.url || correspondingImg.base64} 
                                  alt={correspondingImg.name}
                                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-indigo-950/10 flex items-end">
                                  <span className="w-full text-center py-1 bg-slate-950/90 text-[8px] font-black font-mono text-indigo-400 uppercase tracking-widest">
                                    PG #{p.index}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="w-14 h-20 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 flex items-center justify-center">
                                <span className="text-[8px] font-mono text-slate-600">No Img</span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between border-b border-slate-800/40 pb-1 shrink-0">
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider font-mono">
                                {p.label}
                              </span>
                              <button
                                onClick={() => navigator.clipboard.writeText(p.text)}
                                className="text-[9px] text-rose-400 font-bold hover:text-rose-300 active:scale-95 cursor-pointer flex items-center gap-0.5"
                                title="Salin segmen ini saja"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                <span>Salin</span>
                              </button>
                            </div>
                            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap select-text">
                              {p.text}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-900/40 border border-slate-850/60 rounded-2xl p-4 text-slate-200 leading-relaxed text-sm select-text whitespace-pre-wrap select-text min-h-[150px]">
                    {showLabelsInFullView ? currentScriptText : getCleanStoryText(currentScriptText)}
                  </div>
                )}
              </div>

              {/* Metrics row */}
              {(() => {
                const activeText = isEditingWorkspace ? workspaceEditText : currentScriptText;
                const statsParagraphs = parseRecapScript(activeText).length;
                const statsWords = activeText ? activeText.trim().split(/\s+/).filter(Boolean).length : 0;
                const statsChars = activeText ? activeText.length : 0;
                return (
                  <div className="px-4 py-2 bg-slate-900/60 flex items-center justify-between text-slate-400 text-[10px] shrink-0 font-mono">
                    <div className="flex items-center gap-3">
                      <span>Paragraf: <strong className="text-slate-200 font-bold">{statsParagraphs}</strong></span>
                      <span>Kata: <strong className="text-slate-200 font-bold">{statsWords}</strong></span>
                      <span>Karakter: <strong className="text-slate-200 font-bold">{statsChars}</strong></span>
                    </div>
                    <span className="text-slate-500 uppercase tracking-wider text-[8px] font-bold">Metrics</span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* SECTION 5: COLLAPSIBLE RIWAYAT NASKAH LOKAL */}
          <div className="bg-slate-900/25 border border-slate-850/60 rounded-3xl overflow-hidden shadow-sm">
            {/* Header row */}
            <div 
              onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
              className="px-4 py-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-900/10 select-none transition-colors border-b border-slate-850/20"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider">Riwayat Naskah Lokal ({historyScripts.length})</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isHistoryExpanded ? "rotate-180" : ""}`} />
            </div>

            {/* History panel content */}
            {isHistoryExpanded && (
              <div className="p-4 space-y-3.5 animate-fadeIn bg-slate-900/5">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Cari naskah, tone, judul..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-850 text-xs rounded-xl text-slate-300 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
                  />
                </div>

                {/* History draft cards */}
                {filteredHistory.length === 0 ? (
                  <div className="py-6 flex flex-col items-center justify-center text-center">
                    <History className="w-6 h-6 mb-2 text-slate-600" />
                    <h4 className="text-[11px] font-bold text-slate-400">Tidak ada naskah ditemukan</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 max-w-[180px] leading-normal">
                      {searchQuery ? "Ubah kata kunci pencarian." : "Naskah yang di-generate otomatis tersimpan di sini."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5 max-h-[350px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-1">
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
                          className="p-3 bg-slate-950 border border-slate-850 hover:border-slate-800 rounded-2xl transition duration-150 cursor-pointer flex justify-between gap-3 group active:scale-[0.99]"
                        >
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <h4 className="font-bold text-xs text-slate-200 group-hover:text-rose-400 transition truncate">
                              {item.title}
                            </h4>
                            
                            {/* Metadata labels */}
                            <div className="flex items-center gap-1.5 flex-wrap text-[9px] text-slate-500 font-mono uppercase">
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {dateFormatted}
                              </span>
                              <span>&bull;</span>
                              <span className="text-rose-500/90 font-bold">{item.tone}</span>
                              <span>&bull;</span>
                              <span className="text-slate-300 bg-slate-900 border border-slate-800 px-1 py-0.2 rounded font-bold">{item.language}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 select-none">
                            <button
                              onClick={(e) => handleDeleteHistory(item.id, e)}
                              className="p-2.5 text-slate-600 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition active:scale-90 cursor-pointer"
                              title="Hapus naskah"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] text-rose-400 font-bold group-hover:translate-x-0.5 transition duration-150 flex items-center shrink-0">
                              Buka
                              <ChevronRight className="w-3 h-3 shrink-0" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Dynamic Database Footer Status bar - Desktop Mockup Only */}
        <footer className="h-5 px-5 border-t border-slate-900/60 bg-slate-950 text-[8px] font-mono font-bold tracking-wider text-slate-500 hidden md:flex items-center justify-between shrink-0 select-none">
          <span>SYSTEM: INDEXEDDB ONLINE</span>
          <span>MODEL: {model.toUpperCase()}</span>
        </footer>

      </div>

      {/* ANDROID BOTTOM SHEET STYLE ZIP DOWNLOAD MODAL */}
      {showZipModal && (
        <div 
          id="zip-download-modal" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowZipModal(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-xs transition duration-350 p-0 md:p-6 select-none"
        >
          <div className="bg-slate-900 border-t border-slate-800 md:border md:rounded-3xl w-full max-w-[430px] overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            {/* Handle Bar on top of the sheet */}
            <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto my-3 shrink-0"></div>

            {/* Header */}
            <div className="px-5 pb-4 border-b border-slate-800 flex items-center gap-3 shrink-0">
              <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-2xl">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Download Paket ZIP</h3>
                <p className="text-[10px] text-slate-400 font-medium font-sans">Atur format naskah & nama file gambar ekspor</p>
              </div>
            </div>

            {/* Scrolling Settings Area */}
            <div className="p-5 overflow-y-auto flex flex-col gap-4 max-h-[50vh] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Prefix Nama Gambar</label>
                <input
                  type="text"
                  value={zipPrefix}
                  onChange={(e) => setZipPrefix(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700/80 focus:border-rose-500 text-slate-100 rounded-xl text-xs font-mono transition outline-none"
                  placeholder="misal: image, gambar"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Pemisah</label>
                  <select
                    value={zipSeparator}
                    onChange={(e) => setZipSeparator(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700/80 focus:border-rose-500 text-slate-100 rounded-xl text-xs font-mono transition outline-none cursor-pointer"
                  >
                    <option value="_">_ (Garis Bawah)</option>
                    <option value="-">- (Strip)</option>
                    <option value="">(Tanpa Pemisah)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Digit Penomoran</label>
                  <select
                    value={zipDigits}
                    onChange={(e) => setZipDigits(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700/80 focus:border-rose-500 text-slate-100 rounded-xl text-xs font-mono transition outline-none cursor-pointer"
                  >
                    <option value={3}>001 (3 Digit)</option>
                    <option value={2}>01 (2 Digit)</option>
                    <option value={1}>1 (Tanpa Nol)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Konversi Format Gambar</label>
                <select
                  value={zipImgFormat}
                  onChange={(e) => setZipImgFormat(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700/80 focus:border-rose-500 text-slate-100 rounded-xl text-xs font-mono transition outline-none cursor-pointer"
                >
                  <option value="jpg">JPG (.jpg) - Konversi Otomatis</option>
                  <option value="png">PNG (.png) - Konversi Otomatis</option>
                  <option value="original">Format Asli Komik (Tanpa Ubah)</option>
                </select>
              </div>

              {/* Struct tree preview inside modal */}
              <div className="bg-slate-950/60 border border-slate-850 p-3.5 rounded-2xl flex flex-col gap-2.5 font-mono text-[10px] text-slate-300">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Preview Isi File ZIP:</span>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{currentScriptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "script"}.md</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <FileImage className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{zipPrefix}{zipSeparator}{String(1).padStart(zipDigits, "0")}.{zipImgFormat === "original" ? "jpg" : zipImgFormat}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <FileImage className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{zipPrefix}{zipSeparator}{String(2).padStart(zipDigits, "0")}.{zipImgFormat === "original" ? "jpg" : zipImgFormat}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-5 bg-slate-950/60 border-t border-slate-800 flex gap-3 shrink-0">
              <button
                onClick={() => setShowZipModal(false)}
                className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-extrabold uppercase tracking-widest rounded-2xl transition-all cursor-pointer"
                disabled={isZipping}
              >
                Cancel
              </button>
              <button
                onClick={downloadZip}
                disabled={isZipping}
                className="flex-[1.5] py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-extrabold uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-950/40 transition-all active:scale-95 flex items-center justify-center gap-2"
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
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 cursor-pointer animate-fadeIn"
        >
          {/* Top header action bar */}
          <div className="absolute top-4 left-0 right-0 px-6 flex items-center justify-between text-white z-50">
            <span className="text-xs font-mono font-black tracking-[0.2em] text-indigo-400">ASSET INSPECTION</span>
            <button 
              onClick={() => setFullscreenImageUrl(null)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-900/80 border border-slate-800 text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <img 
            src={fullscreenImageUrl} 
            alt="Manga Preview" 
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-slate-800"
            referrerPolicy="no-referrer"
          />
          
          <span className="absolute bottom-6 text-slate-500 text-[10px] font-mono font-bold uppercase tracking-widest">Tap anywhere to dismiss</span>
        </div>
      )}

    </div>
  );
}
