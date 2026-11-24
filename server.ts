import express from "express";
import http from "http";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Disable HMR in AI Studio environment to prevent WebSocket closed without opened errors
process.env.DISABLE_HMR = "true";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  // Remove payload limits for base64 manga images upload
  app.use(express.json({ limit: Infinity }));
  app.use(express.urlencoded({ limit: Infinity, extended: true }));

  // Lazy initialize Gemini Client to avoid module load time crash if key is missing
  let aiInstance: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiInstance) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured. Please add it under Settings > Secrets in AI Studio.");
      }
      aiInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiInstance;
  }

  // Helper to safely extract non-thought text from Gemini/Kie parts arrays
  function extractPartsText(parts: any): string {
    if (!Array.isArray(parts)) return "";
    return parts
      .filter((p: any) => p && !p.thought && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("");
  }

  // Helper to sanitize user-provided API key
  function cleanApiKey(rawKey: unknown): string {
    if (typeof rawKey !== "string") return "";
    return rawKey.trim().replace(/^["']|["']$/g, "");
  }

  // API endpoint to test API Key connection for Google AI Studio, Kie.ai, and OpenRouter
  app.post("/api/test-key", async (req, res) => {
    try {
      const { provider = "google", apiKey: rawKey = "", model = "" } = req.body || {};
      const apiKey = cleanApiKey(rawKey);

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MY_KIE_AI_API_KEY") {
        return res.status(400).json({
          ok: false,
          error: "API Key masih kosong. Silakan masukkan API Key terlebih dahulu."
        });
      }

      if (provider === "google") {
        if (apiKey.startsWith("sk-or-")) {
          return res.status(400).json({
            ok: false,
            error: "Key yang dimasukkan terlihat seperti OpenRouter API Key (sk-or-...), bukan Google AI Studio Key (AIzaSy...)."
          });
        }
        if (apiKey.startsWith("kie-")) {
          return res.status(400).json({
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Kie.ai API Key (kie-...), bukan Google AI Studio Key (AIzaSy...)."
          });
        }

        const headers: Record<string, string> = {};
        let url = "https://generativelanguage.googleapis.com/v1beta/models";
        if (apiKey.startsWith("ya29.")) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        } else {
          url += `?key=${encodeURIComponent(apiKey)}`;
        }

        const resp = await fetch(url, { method: "GET", headers });
        const text = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch (_) {}

        if (!resp.ok) {
          const msg = data?.error?.message || text.substring(0, 200);
          if (resp.status === 400 || msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
            return res.status(400).json({
              ok: false,
              error: `API Key Google AI Studio tidak valid (${resp.status}): ${msg}`
            });
          }
          return res.status(resp.status).json({
            ok: false,
            error: `Google AI Studio error (${resp.status}): ${msg}`
          });
        }

        const modelsList: string[] = Array.isArray(data?.models)
          ? data.models.map((m: any) => String(m.name || "").replace(/^models\//, ""))
          : [];

        return res.json({
          ok: true,
          message: `Koneksi Google AI Studio berhasil! Key aktif (${modelsList.length} model tersedia).`,
          availableModels: modelsList.slice(0, 25)
        });
      }

      if (provider === "kie") {
        if (apiKey.startsWith("AIzaSy")) {
          return res.status(400).json({
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Google AI Studio Key (AIzaSy...), bukan Kie.ai API Key."
          });
        }
        if (apiKey.startsWith("sk-or-")) {
          return res.status(400).json({
            ok: false,
            error: "Key yang dimasukkan terlihat seperti OpenRouter API Key (sk-or-...), bukan Kie.ai API Key."
          });
        }

        const testModel = (typeof model === "string" && model.trim()) ? model.trim() : "gemini-3-8-flash";
        const nativeTestModel = testModel.replace(/-openai$/i, "");
        const openAiTestSlug = testModel.endsWith("-openai") ? testModel : `${testModel}-openai`;
        const testRoutes = [
          {
            url: `https://api.kie.ai/${encodeURIComponent(openAiTestSlug)}/v1/chat/completions`,
            body: {
              messages: [{ role: "user", content: "Balas OK" }],
              stream: false
            }
          },
          {
            url: `https://api.kie.ai/gemini/v1/models/${encodeURIComponent(nativeTestModel)}:streamGenerateContent`,
            body: {
              stream: true,
              contents: [{ role: "user", parts: [{ text: "Balas OK" }] }]
            }
          },
          {
            url: `https://api.kie.ai/${encodeURIComponent(nativeTestModel)}/v1/chat/completions`,
            body: {
              messages: [{ role: "user", content: "Balas OK" }],
              stream: false
            }
          }
        ];

        let resp: globalThis.Response | null = null;
        let rawText = "";
        let json: any = null;

        for (let attempt = 0; attempt < testRoutes.length; attempt++) {
          const route = testRoutes[attempt];
          resp = await fetch(route.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify(route.body)
          });

          rawText = await resp.text();
          json = null;
          try {
            json = JSON.parse(rawText);
          } catch (_) {}

          const isTransientKie =
            [404, 422, 429, 500, 502, 503, 504].includes(resp.status) ||
            (json && !Array.isArray(json) && [404, 422, 429, 500, 502, 503, 504].includes(Number(json.code)));

          if (isTransientKie && attempt < testRoutes.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          break;
        }

        if (!resp!.ok) {
          const msg = json?.msg || json?.message || json?.error?.message || rawText.substring(0, 200);
          return res.status(resp!.status).json({
            ok: false,
            error: `Koneksi Kie.ai gagal (${resp!.status}): ${msg}`
          });
        }

        if (json && !Array.isArray(json) && json.code && json.code !== 200) {
          const kieCode = Number(json.code);
          const kieMsg = json.msg || json.message || "Autentikasi gagal";
          const httpStatus = kieCode >= 500 ? 503 : kieCode === 429 ? 429 : 400;
          return res.status(httpStatus).json({
            ok: false,
            error: kieCode >= 500
              ? `Server Kie.ai sedang sibuk/gangguan (${kieCode}): ${kieMsg}. Coba lagi beberapa saat atau gunakan Google AI Studio / OpenRouter.`
              : `Kie.ai error (${kieCode}): ${kieMsg}`
          });
        }

        return res.json({
          ok: true,
          message: `Koneksi Kie.ai berhasil! API Key aktif dan terverifikasi (${testModel}).`
        });
      }

      if (provider === "openrouter") {
        if (apiKey.startsWith("AIzaSy")) {
          return res.status(400).json({
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Google AI Studio Key (AIzaSy...), bukan OpenRouter API Key (sk-or-...)."
          });
        }
        if (apiKey.startsWith("kie-")) {
          return res.status(400).json({
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Kie.ai Key (kie-...), bukan OpenRouter API Key (sk-or-...)."
          });
        }

        const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://aistudio.google.com",
            "X-Title": "Mangaroot Creator Studio"
          }
        });

        const rawText = await resp.text();
        let json: any = null;
        try {
          json = JSON.parse(rawText);
        } catch (_) {}

        if (!resp.ok) {
          const msg = json?.error?.message || json?.message || rawText.substring(0, 200);
          return res.status(resp.status).json({
            ok: false,
            error: `API Key OpenRouter tidak valid (${resp.status}): ${msg}`
          });
        }

        const keyInfo = json?.data;
        const limitText = typeof keyInfo?.limit_remaining === "number"
          ? ` (Sisa kredit: $${keyInfo.limit_remaining.toFixed(2)})`
          : "";

        return res.json({
          ok: true,
          message: `Koneksi OpenRouter berhasil! API Key aktif${limitText}.`
        });
      }

      return res.status(400).json({ ok: false, error: `Provider tidak dikenal: ${provider}` });
    } catch (err: any) {
      console.error("Test API Key Error:", err);
      return res.status(500).json({
        ok: false,
        error: err?.message || "Gagal menguji koneksi API Key."
      });
    }
  });

  // API endpoint to generate manga recap scripts
  app.post("/api/recap", async (req, res) => {
    try {
      const { 
        images, 
        provider,
        model = "gemini-4-hydrogen",
        googleApiKey = "",
        kieApiKey = "",
        openrouterApiKey = "",
        tone = "dramatic", 
        language = "id", 
        customInstructions = "",
        customStyleRef = "",
        previousParagraphs = [],
        initialContext = "",
        isSuperConcise = true,
        characterDetails = ""
      } = req.body;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "No manga images uploaded or images array is empty." });
      }

      // Determine provider explicitly first, with safe fallback inference
      let resolvedProvider: "google" | "kie" | "openrouter";
      if (provider === "google" || provider === "kie" || provider === "openrouter") {
        resolvedProvider = provider;
      } else if (typeof model === "string" && (model.includes("/") || model.startsWith("openai/") || model.startsWith("anthropic/") || model.startsWith("google/") || model.startsWith("deepseek/"))) {
        resolvedProvider = "openrouter";
      } else if (typeof model === "string" && model.startsWith("gemini-3") && (model.includes("-6-") || model.includes("-7-") || model.includes("-8-"))) {
        resolvedProvider = "kie";
      } else {
        resolvedProvider = "google";
      }

      const isOpenRouter = resolvedProvider === "openrouter";
      const isKieAi = resolvedProvider === "kie";
      const isGoogleAI = resolvedProvider === "google";

      let actualModel = typeof model === "string" ? model.trim() : "";
      if (isGoogleAI) {
        actualModel = actualModel.replace(/^models\//i, "").replace(/^google\//i, "");
        if (!actualModel || actualModel === "custom" || actualModel === "gemini-1.5-flash" || actualModel === "gemini-2.0-flash" || actualModel === "gemini-3-flash") {
          actualModel = "gemini-4-hydrogen";
        }
      } else if (isOpenRouter) {
        if (!actualModel || actualModel === "custom" || actualModel === "google/gemini-3-flash" || actualModel === "gemini-3-flash") {
          actualModel = "google/gemini-4-hydrogen";
        } else if (!actualModel.includes("/")) {
          actualModel = `google/${actualModel}`;
        }
      } else if (isKieAi) {
        if (!actualModel || actualModel === "custom") {
          actualModel = "gemini-3-8-flash";
        }
      }

      // Select correct key according to active provider
      const rawUserKey = isOpenRouter ? openrouterApiKey : (isKieAi ? kieApiKey : googleApiKey);
      const userKey = cleanApiKey(rawUserKey);
      
      const rawEnvKey = cleanApiKey(process.env.GEMINI_API_KEY);
      const effectiveEnvKey = (rawEnvKey && rawEnvKey !== "MY_GEMINI_API_KEY" && rawEnvKey !== "MY_KIE_AI_API_KEY") ? rawEnvKey : "";
      
      const apiKey = userKey || (isGoogleAI ? effectiveEnvKey : "");

      const providerName = isOpenRouter ? "OpenRouter" : (isKieAi ? "Kie.ai" : "Google AI Studio");

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MY_KIE_AI_API_KEY") {
        return res.status(400).json({
          error: `API Key untuk ${providerName} belum diisi. Silakan klik tombol Pengaturan (Setting) di pojok kanan atas dan masukkan API Key Anda.`
        });
      }

      if (isGoogleAI && (apiKey.startsWith("kie-") || apiKey.startsWith("sk-or-"))) {
        return res.status(400).json({
          error: `API Key yang tersimpan di Google AI Studio bukan key Google (terdeteksi key ${apiKey.startsWith("sk-or-") ? "OpenRouter" : "Kie.ai"}). Periksa kembali pengaturan API Key Anda.`
        });
      }

      // Sort images by filename or globalIndex if available
      const sortedImages = [...images].sort((a, b) => {
        if (a.globalIndex !== undefined && b.globalIndex !== undefined) {
          return a.globalIndex - b.globalIndex;
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      });

      // Map tones to descriptive guidelines for the AI
      const toneDescriptions: Record<string, string> = {
        aniki: `Gaya penceritaan "AniKi.ID": Sangat santai, gaul, dan berlagak seperti seorang YouTuber storyteller yang sedang membawakan rangkuman cerita (recap) kepada penonton.
        - Gunakan kata sapaan "gua", "lu", "kita", "anjir", "gitu".
        - Gunakan kata "cuy" secara ALAMI dan JARANG (hanya sebagai penekanan di akhir poin penting, jangan di setiap kalimat).
        - Sering membandingkan karakter dengan penonton (misal: "MC yang jomblo kayak kalian ini").
        - Alur penceritaan antar tag [GAMBAR X] harus mengalir nyambung seperti satu cerita utuh tanpa terasa terputus-putus, namun setiap gambar tetap wajib memiliki tag [GAMBAR X] masing-masing.
        - Fokus pada penyampaian yang ekspresif namun tetap efisien.`,
        formal: "Bahasa Indonesia yang baik dan benar, formal, sopan, deskriptif secara elegan, dan menggunakan kosakata yang baku namun tetap menarik untuk narasi dokumenter.",
        humorous: "Sangat lucu, penuh candaan, menyisipkan punchline gokil, sindiran jenaka terhadap kebodohan karakter, dan menggunakan diksi yang memancing tawa.",
        dramatic: "Penuh drama, menegangkan, emosional, misterius, dan membuat penonton penasaran di setiap adegannya.",
        casual: "Santai, ramah, seperti mengobrol asik dengan teman sebaya, penuh bahasa gaul ringan, langsung ke inti cerita secara kasual.",
        excited: "Sangat bersemangat, berapi-api, penuh energi, histeris di momen-momen gila, menaikkan tensi penonton.",
        epic: "Sangat epik, luar biasa keren, deskripsi aksi yang megah, puitis, mengagungkan aksi karakter secara tajam.",
        custom: `Ikuti gaya penulisan secara KETAT berdasarkan "REFERENSI GAYA NASKAH" yang diberikan oleh pengguna. Tiru pilihan kata, struktur kalimat, dan nada bicaranya secara presisi.`,
      };

      // Specific example for AniKi.ID tone (Refined to be more natural)
      const anikiExample = `
[GAMBAR 1]
Di awal cerita kita dilihatin MC kita yang bernama Mondo. Dia ini berada di pesta makan-makan dengan teman universitasnya dan di sini kelihatan banget banyak gadis. Si Mondo yang jomblo kayak kalian ini mencoba buat memberanikan diri buat mencari pacar cuy.

[GAMBAR 2]
Setelah itu datanglah Tatsumi Aoi yang dia ini cewek paling cantik di universitasnya dan tiba-tiba duduk di dekat Mondo gitu. Ya karena si Mondo ini persis kayak kalian banget dia ini gak bisa nahan pandangannya kalau ada boba besar di depannya cuy.

[GAMBAR 3]
Singkat cerita si Mondo ini diminta tolong sama si Aoi dan Aoi ini mengajaknya untuk pergi bersamanya sebentar. Karena terlalu polosnya si Mondo ini mengiyakan saja.

[GAMBAR 4]
Ternyata si Aoi ini mengajak Mondo untuk minum di sebuah bar. Dikarenakan Mondo yang enggak pernah minum ngebuat dia ini mabuk brutal. Si Mondo benar-benar kaget dan panik karena ia enggak membayangkan kalau sifat dari Aoi itu seseram ini cuy.
      `;

      // Map video lengths
      const langInstruction = language === "id" 
        ? "Tulis seluruh naskah dalam Bahasa Indonesia yang ekspresif, asik, tidak kaku, menggunakan gaya bercerita sudut pandang orang ketiga (third-person storyteller) yang mengalir lancar seperti spoiler anime/film di YouTube." 
        : "Tulis seluruh naskah dalam Bahasa Inggris yang murni bergaya spoiler recap cerita orang ketiga (third-person storytelling).";

      const expectedIndices = sortedImages.map((img, idx) => (img.globalIndex !== undefined ? img.globalIndex : (idx + 1)));
      const expectedHeaders = expectedIndices.map((num) => `[GAMBAR ${num}]`);
      const headersListString = expectedHeaders.join(", ");

      // Dynamic example format based on actual image count
      const formatExample = sortedImages.map((img, idx) => {
        const labelIndex = expectedIndices[idx];
        return `[GAMBAR ${labelIndex}]\nTulis narasi spoiler untuk gambar ${labelIndex} di sini...`;
      }).join("\n\n");

      let continuityPrompt = "";
      const isFirstScript = !(previousParagraphs && Array.isArray(previousParagraphs) && previousParagraphs.length > 0);
      const hasContext = (initialContext && typeof initialContext === "string" && initialContext.trim() !== "");
      const requiredPrefix = isFirstScript 
        ? (hasContext 
            ? (language === "en" ? "The story continues" : "Cerita berlanjut") 
            : (language === "en" ? "The story begins" : "Cerita dimulai")
          )
        : "";

      if (!isFirstScript) {
        continuityPrompt = `
=========================================
PENTING - KESINAMBUNGAN ALUR CERITA DARI BATCH SEBELUMNYA:
Cerita yang akan Anda buat di bawah ini adalah kelanjutan langsung dari halaman manga sebelumnya. 
Berikut adalah 2-3 PARAGRAF TERAKHIR dari naskah batch sebelumnya sebagai referensi Anda agar ceritanya tersambung secara mulus dan berurutan:
---
${previousParagraphs.map((p: string, idx: number) => `[Paragraf Sebelumnya #${idx + 1}]:\n${p}`).join("\n\n")}
---
TUGAS ANDA:
Lanjutkan alur cerita di atas secara berkesinambungan dan mulus mulai dari Gambar pertama pada batch ini (${expectedHeaders[0]}).
- Hubungkan kalimat pembuka naskah batch ini secara mulus dari akhir cerita di atas.
- JANGAN mengulangi cerita, dialog, atau aksi yang sudah diceritakan pada referensi paragraf sebelumnya di atas.
- JANGAN menambahkan kalimat/frasa pembuka seperti "Cerita dimulai" atau "Cerita berlanjut" karena ini adalah kelanjutan halaman di tengah-tengah naskah, bukan awal naskah.
- Tetap patuhi aturan TIDAK menggunakan dialog langsung maupun efek suara/tanda kutip ganda ("").
=========================================\n`;
      } else if (hasContext) {
        continuityPrompt = `
=========================================
PENTING - KESINAMBUNGAN DENGAN KONTEKS CERITA SEBELUMNYA (AWAL NASKAH DENGAN KONTEKS):
Manga yang sedang dibahas ini melanjutkan alur cerita dari bagian/chapter sebelumnya. 
Berikut adalah KONTEKS CERITA SEBELUMNYA yang wajib Anda jadikan referensi agar cerita di bagian pertama ini tersambung secara mulus dan berkesinambungan dengan video part atau chapter sebelumnya:
---
${initialContext.trim()}
---
TUGAS ANDA (MANDATORY):
Mulai naskah ini dengan menyambungkan cerita secara mulus dari konteks cerita sebelumnya di atas.
- JANGAN menceritakan ulang kejadian yang sudah diringkas dalam konteks di atas. Langsung lanjutkan petualangan/kejadian berikutnya dari gambar pertama pada batch ini.
- WAJIB AWALI kalimat pertama pada gambar pertama Anda dengan tepat menggunakan kata pembuka: "${requiredPrefix}" (misal: "${requiredPrefix} saat sekelompok..." atau "${requiredPrefix} ketika...").
- JANGAN menggunakan dialog langsung maupun efek suara/tanda kutip ganda ("").
=========================================\n`;
      } else {
        continuityPrompt = `
=========================================
PENTING - AWAL NASKAH TANPA KONTEKS SEBELUMNYA:
Ini adalah awal dari seluruh naskah cerita dan tidak memiliki konteks atau ringkasan cerita dari bagian sebelumnya.
TUGAS ANDA (MANDATORY):
- WAJIB AWALI kalimat pertama pada gambar pertama Anda dengan tepat menggunakan kata pembuka: "${requiredPrefix}" (misal: "${requiredPrefix} saat sekelompok..." atau "${requiredPrefix} ketika...").
- Tetap patuhi aturan TIDAK menggunakan dialog langsung maupun efek suara/tanda kutip ganda ("").
=========================================\n`;
      }

      const exampleText = language === "en" 
        ? `[GAMBAR 1]
The story begins with Takemichi riding Chifuyu on a bicycle leisurely along the city streets.

[GAMBAR 2]
Suddenly Takemichi reveals his desire to time leap again, which Chifuyu initially mistakes for a return to the distant future.

[GAMBAR 3]
To Chifuyu's confusion, Takemichi admits he only wants to go back three days to give Hina a White Day gift he forgot.

[GAMBAR 4]
Takemichi panics imagining Hina's anger, while Chifuyu watches in annoyance, thinking there was a life-or-death emergency.`
        : `[GAMBAR 1]
Cerita dimulai dengan memperlihatkan Takemichi yang sedang membonceng Chifuyu menggunakan sepeda santai di sepanjang jalan kota.

[GAMBAR 2]
Tiba-tiba Takemichi mengungkapkan keinginannya untuk melakukan lompatan waktu kembali, yang sempat dikira Chifuyu sebagai kepulangan ke masa depan.

[GAMBAR 3]
Secara mengejutkan Takemichi mengaku hanya ingin kembali ke tiga hari lalu karena lupa memberikan hadiah White Day untuk Hina, membuat Chifuyu kebingungan.

[GAMBAR 4]
Takemichi mulai panik membayangkan kemarahan Hina, sementara Chifuyu hanya menatap kesal karena mengira ada masalah hidup mati yang benar-benar serius.`;

      let effectiveExample = exampleText;
      if (tone === "aniki") {
        effectiveExample = anikiExample;
      } else if (tone === "custom" && customStyleRef) {
        effectiveExample = `[CONTOH GAYA DARI PENGGUNA]:\n${customStyleRef}\n\n[TUGAS]: Gunakan gaya di atas untuk menulis naskah untuk gambar-gambar berikut.`;
      }

      // Detailed prompt for generating a top-tier manga recap script
      const brevityInstruction = isSuperConcise 
        ? "WAJIB SANGAT RINGKAS: Maksimal 1-2 kalimat pendek per gambar. Fokus hanya pada 'Plot Beat' utama. Jangan deskripsikan visual latar belakang jika tidak ada aksi penting."
        : "MODE DETAIL: Narasikan setiap kejadian di SETIAP gambar secara mendalam, ekspresif, dan emosional (2-4 kalimat per gambar). Ceritakan detail aksi, dialog penting (dalam bentuk narasi tidak langsung), dan perubahan suasana di setiap panel. DILARANG KERAS melompati atau menggabungkan gambar.";

      const promptText = `
Anda adalah seorang Script Writer profesional dan spesialis pembuat naskah recap manga (spoiler alur cerita) terbaik di YouTube yang berspesialisasi dalam gaya penceritaan yang "Direct, Fast-Paced, and Narrative-Focused".

TUGAS UTAMA:
Buat naskah voice over (VO) murni (storytelling) yang fokus murni pada PLOT UTAMA. Naskah harus terasa seperti cerita yang mengalir, bukan sekadar deskripsi gambar.

${brevityInstruction}

${continuityPrompt}

DAFTAR TAG GAMBAR WAJIB UNTUK BATCH INI (${sortedImages.length} PANEL):
Anda HARUS menghasilkan tepat ${sortedImages.length} bagian secara berurutan dengan tag persis berikut:
${headersListString}

STRUKTUR OUTPUT WAJIB:
${formatExample}

SISTEM DAN ALUR GENERASI NASKAH (WAJIB DIPATUHI):

1. IDENTIFIKASI KARAKTER (MANDATORY):
   - Gunakan "REFERENSI DETAIL KARAKTER" di bawah untuk mengidentifikasi siapa saja yang ada di gambar.
   - JANGAN PERNAH menggunakan deskripsi fisik (misal: "pria berambut kuning") jika karakter tersebut sudah ada di referensi. Gunakan NAMA mereka.
   - Jika ada karakter baru yang tidak ada di referensi, beri nama deskriptif sementara yang konsisten (misal: "Bos Mafia" atau "Gadis Misterius").

2. ATURAN EMAS KELENGKAPAN & ANTI-TERPOTONG (KRUSIAL):
   - WAJIB menyertakan SEMUA ${sortedImages.length} tag dari ${expectedHeaders[0]} sampai ${expectedHeaders[expectedHeaders.length - 1]} tanpa terkecuali.
   - DILARANG menggabungkan beberapa gambar ke dalam satu tag (contoh terlarang: [GAMBAR 1-3] atau [GAMBAR 2, 3]). Tulis satu blok terpisah untuk setiap tag [GAMBAR X].
   - Meskipun sebuah gambar hanya berupa transisi singkat atau ekspresi wajah, tetap tulis minimal 1 kalimat narasi yang menyambung alur untuk tag [GAMBAR X] tersebut.
   - DILARANG KERAS menggunakan frasa pengantar visual seperti: "Dalam gambar ini...", "Terlihat...", "Panel ini menunjukkan...".
   - LANGSUNG ke inti aksi/kejadian.

3. GAYA BAHASA (NARRATIVE FLOW):
   - Gunakan kata kerja aktif.
   - Pastikan antar paragraf memiliki kesinambungan alur agar tidak terasa terputus-putus.
   - Fokus pada: Aksi -> Reaksi -> Emosi -> Konsekuensi Plot.

4. DILARANG KERAS:
   - DILARANG menulis kata/frasa penutup, kesimpulan, atau kalimat yang mengakhiri cerita (seperti "Kisah ini ditutup...").
   - DILARANG menggunakan tanda baca khusus seperti (*), ("), (_), (~), atau backtick. Cukup huruf, angka, titik, dan koma.
   - DILARANG menyapa penonton ("halo guys", "simak terus").

CONTOH GAYA NARASI YANG DIHARAPKAN (IKUTI GAYA INI):
${effectiveExample}

Berikut adalah parameter konten tambahan:
1. Nada Bicara (Tone): ${toneDescriptions[tone] || "dramatic"}
2. Bahasa: ${langInstruction}
${customInstructions ? `3. Instruksi Tambahan Khusus dari Pengguna (Prioritas Tinggi): "${customInstructions}"` : ""}
${tone === "custom" && customStyleRef ? `4. REFERENSI GAYA NASKAH (WAJIB DIIKUTI):
---
${customStyleRef}
---` : ""}
${characterDetails ? `5. REFERENSI DETAIL & HUBUNGAN KARAKTER (WAJIB DIIKUTI UNTUK IDENTIFIKASI):
---
${characterDetails}
---` : ""}
`;

      const buildImageParts = (targetImages: typeof sortedImages) => {
        const parts: any[] = [];
        targetImages.forEach((img, idx) => {
          let base64Data = img.base64 || "";
          if (base64Data.includes(";base64,")) {
            base64Data = base64Data.split(";base64,").pop() || "";
          }
          base64Data = base64Data.trim();
          if (!base64Data) {
            console.warn(`Peringatan: Gambar ${img.name} tidak memiliki data base64 yang valid, dilewati.`);
            return;
          }

          const labelIndex = img.globalIndex !== undefined ? img.globalIndex : (idx + 1);
          parts.push({
            text: `[GAMBAR PANEL #${labelIndex} | File: ${img.name} — Wajib buat narasi dengan tag [GAMBAR ${labelIndex}]]`
          });

          let cleanMime = (img.mimeType || "image/jpeg").toLowerCase().trim();
          if (cleanMime === "image/jpg") cleanMime = "image/jpeg";
          if (!cleanMime.startsWith("image/")) cleanMime = "image/jpeg";

          parts.push({
            inlineData: {
              data: base64Data,
              mimeType: cleanMime
            }
          });
        });
        return parts;
      };

      console.log(`Processing recap request via ${providerName} for model: ${actualModel} (requested: ${model})`);

      // Determine endpoint and headers
      let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(actualModel)}:generateContent`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (isOpenRouter) {
        endpoint = "https://openrouter.ai/api/v1/chat/completions";
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["HTTP-Referer"] = "https://aistudio.google.com";
        headers["X-Title"] = "Mangaroot Creator Studio";
      } else if (isKieAi) {
        endpoint = `https://api.kie.ai/gemini/v1/models/${encodeURIComponent(actualModel)}:streamGenerateContent`;
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["x-goog-api-key"] = apiKey;
      } else {
        if (apiKey.startsWith("ya29.")) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        } else {
          endpoint += `?key=${encodeURIComponent(apiKey)}`;
        }
      }

      const invokeProvider = async (partsToSend: any[]): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> => {
        const isGemini4 = actualModel.startsWith("gemini-4");

        const buildOpenAIMessages = (parts: any[]) => [
          {
            role: "user",
            content: parts.map(part => {
              if (part.text) {
                return { type: "text", text: part.text };
              }
              if (part.inlineData) {
                return {
                  type: "image_url",
                  image_url: {
                    url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                  }
                };
              }
              return { type: "text", text: "" };
            })
          }
        ];

        const mapKieError = (kieCodeRaw: unknown, kieMsgRaw: unknown): { ok: false; status: number; error: string; transient: boolean } => {
          const kieCode = Number(kieCodeRaw) || 500;
          const kieMsg = typeof kieMsgRaw === "string" && kieMsgRaw.trim() ? kieMsgRaw.trim() : "Terjadi kesalahan pada server Kie.ai";

          if (kieCode === 401) {
            return {
              ok: false,
              status: 401,
              transient: false,
              error: `Autentikasi Kie.ai Gagal (401): ${kieMsg}. API Key Kie.ai Anda tidak valid. Periksa di menu Pengaturan atau ganti provider ke Google AI Studio / OpenRouter.`
            };
          }
          if (kieCode === 402) {
            return {
              ok: false,
              status: 402,
              transient: false,
              error: `Kredit Kie.ai Habis (402): ${kieMsg}. Silakan isi ulang di portal https://kie.ai atau ganti provider ke Google AI Studio / OpenRouter.`
            };
          }
          if (kieCode === 404 || kieCode === 422) {
            return {
              ok: false,
              status: kieCode,
              transient: true,
              error: `Model ${actualModel} tidak didukung pada rute Kie.ai ini (${kieCode}): ${kieMsg}. Silakan pilih model lain atau ganti provider.`
            };
          }
          if (kieCode === 429) {
            return {
              ok: false,
              status: 429,
              transient: true,
              error: `Batas antrean Kie.ai tercapai (429): ${kieMsg}. Coba beberapa detik lagi atau beralih ke Google AI Studio / OpenRouter.`
            };
          }
          if (kieCode >= 500) {
            return {
              ok: false,
              status: 503,
              transient: true,
              error: `Server Kie.ai sedang mengalami gangguan sementara (${kieCode}: ${kieMsg}). Silakan klik Lanjutkan atau coba beralih sementara ke Google AI Studio / OpenRouter.`
            };
          }
          return {
            ok: false,
            status: 400,
            transient: false,
            error: `Error dari Kie.ai (${kieCode}): ${kieMsg}`
          };
        };

        const extractAnyChunkText = (obj: any): string => {
          if (!obj || typeof obj !== "object") return "";
          const geminiText = extractPartsText(obj?.candidates?.[0]?.content?.parts);
          if (geminiText) return geminiText;
          const openAiMsg = obj?.choices?.[0]?.message?.content;
          if (typeof openAiMsg === "string") return openAiMsg;
          if (Array.isArray(openAiMsg)) {
            return openAiMsg
              .filter((c: any) => c && typeof c.text === "string")
              .map((c: any) => c.text)
              .join("");
          }
          const deltaText = obj?.choices?.[0]?.delta?.content;
          if (typeof deltaText === "string") return deltaText;
          if (typeof obj?.text === "string") return obj.text;
          return "";
        };

        const nativeKieModel = actualModel.replace(/-openai$/i, "");
        const openAiKieSlug = actualModel.endsWith("-openai") ? actualModel : `${actualModel}-openai`;

        const kieRoutes = isKieAi
          ? [
              {
                label: "kie-openai",
                url: `https://api.kie.ai/${encodeURIComponent(openAiKieSlug)}/v1/chat/completions`,
                body: {
                  messages: buildOpenAIMessages(partsToSend),
                  stream: false
                }
              },
              {
                label: "kie-stream",
                url: `https://api.kie.ai/gemini/v1/models/${encodeURIComponent(nativeKieModel)}:streamGenerateContent`,
                body: {
                  stream: true,
                  contents: [{ role: "user", parts: partsToSend }]
                }
              },
              {
                label: "kie-direct-openai",
                url: `https://api.kie.ai/${encodeURIComponent(nativeKieModel)}/v1/chat/completions`,
                body: {
                  messages: buildOpenAIMessages(partsToSend),
                  stream: false
                }
              },
              {
                label: "kie-v1beta",
                url: `https://api.kie.ai/gemini/v1beta/models/${encodeURIComponent(nativeKieModel)}:generateContent`,
                body: {
                  contents: [{ role: "user", parts: partsToSend }]
                }
              }
            ]
          : [];

        let defaultRequestBody: any = null;
        if (isOpenRouter) {
          defaultRequestBody = {
            model: actualModel,
            messages: buildOpenAIMessages(partsToSend),
            temperature: 0.85,
            max_tokens: 16384
          };
        } else if (!isKieAi) {
          // Google AI Studio: avoid deprecated sampling parameters on gemini-4-* and omit restrictive maxOutputTokens so thinking tokens never truncate output
          const genConfig: Record<string, any> = {};
          if (!isGemini4) {
            genConfig.temperature = 0.85;
          }
          defaultRequestBody = {
            contents: [{ role: "user", parts: partsToSend }],
            ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {})
          };
        }

        const maxServerAttempts = isKieAi ? kieRoutes.length : 3;
        let lastFailure: { ok: false; status: number; error: string } = {
          ok: false,
          status: 503,
          error: `Gagal terhubung ke ${providerName}. Silakan coba lagi.`
        };
        let preferredFailure: { ok: false; status: number; error: string } | null = null;
        const recordFailure = (f: { ok: false; status: number; error: string }) => {
          lastFailure = f;
          if ([429, 500, 502, 503, 504].includes(f.status) && !preferredFailure) {
            preferredFailure = f;
          }
        };

        for (let serverAttempt = 1; serverAttempt <= maxServerAttempts; serverAttempt++) {
          const activeRoute = isKieAi ? kieRoutes[serverAttempt - 1] : null;
          const targetEndpoint = activeRoute ? activeRoute.url : endpoint;
          const targetBody = activeRoute ? activeRoute.body : defaultRequestBody;

          console.log(`Sending request to ${providerName} (Model: ${actualModel}${activeRoute ? `, Route: ${activeRoute.label}` : ""}, Attempt ${serverAttempt}/${maxServerAttempts})`);

          const response = await fetch(targetEndpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(targetBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            let userFriendlyMsg = "";
            try {
              const errObj = JSON.parse(errorText);
              if (errObj.error?.message) {
                userFriendlyMsg = errObj.error.message;
              } else if (errObj.message || errObj.msg) {
                userFriendlyMsg = errObj.message || errObj.msg;
              }
            } catch (_) {}

            const isTransientStatus = [429, 500, 502, 503, 504].includes(response.status) || (isKieAi && [404, 422].includes(response.status));
            if (isTransientStatus && serverAttempt < maxServerAttempts) {
              if ([429, 500, 502, 503, 504].includes(response.status)) {
                recordFailure({
                  ok: false,
                  status: response.status >= 500 ? 503 : response.status,
                  error: userFriendlyMsg ? `${providerName} Error (${response.status}): ${userFriendlyMsg}` : `Server ${providerName} sedang gangguan (${response.status}).`
                });
              }
              console.log(`Switching from ${activeRoute?.label || providerName} (HTTP ${response.status}) to next route in 1000ms...`);
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            if (isKieAi && [404, 422].includes(response.status) && preferredFailure) {
              return preferredFailure;
            }

            if (isGoogleAI && response.status === 400 && (errorText.includes("API_KEY_INVALID") || errorText.includes("API key not valid"))) {
              return {
                ok: false,
                status: 400,
                error: "API Key Google AI Studio tidak valid atau belum diaktifkan. Silakan cek & tes ulang key Anda di menu Pengaturan."
              };
            }
            if (response.status === 401) {
              return {
                ok: false,
                status: 401,
                error: `Autentikasi ${providerName} gagal (401): ${userFriendlyMsg || "API Key tidak valid atau kadaluarsa."}`
              };
            }
            if (response.status === 402) {
              return {
                ok: false,
                status: 402,
                error: `Saldo/Kredit ${providerName} habis (402): ${userFriendlyMsg || "Silakan periksa saldo/kuota akun Anda."}`
              };
            }
            if (response.status === 403) {
              return {
                ok: false,
                status: 403,
                error: `Akses ${providerName} ditolak (403): ${userFriendlyMsg || "Permission Denied"}. Pastikan API Key memiliki izin untuk model ${actualModel}.`
              };
            }
            if (response.status === 404) {
              return {
                ok: false,
                status: 404,
                error: `Model "${actualModel}" tidak ditemukan di ${providerName} (404). ${userFriendlyMsg ? `Detail: ${userFriendlyMsg}. ` : ""}Coba pilih model lain di menu Engine atau ketik nama model yang sesuai.`
              };
            }
            return {
              ok: false,
              status: response.status,
              error: userFriendlyMsg ? `${providerName} Error: ${userFriendlyMsg}` : `${providerName} Error (${response.status}): ${errorText.substring(0, 200)}`
            };
          }

          let extractedText = "";
          const rawResponseText = await response.text();

          if (isOpenRouter) {
            try {
              const json = JSON.parse(rawResponseText);
              if (json?.error?.message) {
                const errCode = Number(json.error.code) || 400;
                if ([429, 500, 502, 503, 504].includes(errCode) && serverAttempt < maxServerAttempts) {
                  await new Promise(r => setTimeout(r, serverAttempt * 1200));
                  continue;
                }
                return {
                  ok: false,
                  status: errCode,
                  error: `OpenRouter Error: ${json.error.message}`
                };
              }
              extractedText = extractAnyChunkText(json);
            } catch (e) {
              console.log("OpenRouter JSON parse failed, retrying if attempts remain");
              extractedText = "";
            }
          } else if (isKieAi) {
            let kieEmbeddedError: { ok: false; status: number; error: string; transient: boolean } | null = null;
            try {
              const json = JSON.parse(rawResponseText);

              if (json && !Array.isArray(json) && json.code && json.code !== 200) {
                kieEmbeddedError = mapKieError(json.code, json.msg || json.message);
              } else if (json && !Array.isArray(json) && json?.error?.message) {
                kieEmbeddedError = mapKieError(json.error.code || 500, json.error.message);
              } else if (Array.isArray(json)) {
                for (const chunk of json) {
                  if (chunk?.code && chunk.code !== 200) {
                    kieEmbeddedError = mapKieError(chunk.code, chunk.msg || chunk.message);
                    break;
                  }
                  extractedText += extractAnyChunkText(chunk);
                }
              } else {
                extractedText = extractAnyChunkText(json);
              }
            } catch (_) {
              // Line-by-line SSE / NDJSON parser so `event:` or `id:` lines never corrupt JSON chunks
              const lines = rawResponseText.split(/\r?\n/);
              let jsonBuffer = "";
              for (const rawLine of lines) {
                let line = rawLine.trim();
                if (!line || line.startsWith("event:") || line.startsWith("id:") || line.startsWith("retry:") || line.startsWith(":")) {
                  continue;
                }
                if (line.startsWith("data:")) {
                  line = line.slice(5).trim();
                }
                if (!line || line === "[DONE]" || line === "[" || line === "]") {
                  continue;
                }
                if (line.startsWith(",")) line = line.slice(1).trim();
                if (line.endsWith(",")) line = line.slice(0, -1).trim();

                const candidateStr = jsonBuffer ? `${jsonBuffer}\n${line}` : line;
                try {
                  const json = JSON.parse(candidateStr);
                  jsonBuffer = "";
                  if (json && !Array.isArray(json) && json.code && json.code !== 200) {
                    kieEmbeddedError = mapKieError(json.code, json.msg || json.message);
                    break;
                  }
                  if (Array.isArray(json)) {
                    for (const c of json) {
                      if (c?.code && c.code !== 200) {
                        kieEmbeddedError = mapKieError(c.code, c.msg || c.message);
                        break;
                      }
                      extractedText += extractAnyChunkText(c);
                    }
                    if (kieEmbeddedError) break;
                  } else {
                    extractedText += extractAnyChunkText(json);
                  }
                } catch {
                  jsonBuffer = candidateStr.length < 32768 ? candidateStr : "";
                }
              }
            }

            if (kieEmbeddedError) {
              recordFailure({ ok: false, status: kieEmbeddedError.status, error: kieEmbeddedError.error });
              if (kieEmbeddedError.transient && serverAttempt < maxServerAttempts) {
                console.log(`Kie.ai route ${activeRoute?.label} unavailable (${kieEmbeddedError.status}), trying fallback route (${serverAttempt + 1}/${maxServerAttempts})...`);
                await new Promise(r => setTimeout(r, 1000));
                continue;
              }
              if ([404, 422].includes(kieEmbeddedError.status) && preferredFailure) {
                return preferredFailure;
              }
              return lastFailure;
            }
          } else {
            // Standard Google AI Studio Unary Response
            try {
              const data = JSON.parse(rawResponseText);
              if (data.candidates?.[0]?.finishReason === "SAFETY") {
                return {
                  ok: false,
                  status: 400,
                  error: "Gagal menghasilkan naskah: Konten diblokir oleh filter keamanan AI. Coba ubah instruksi atau gunakan gambar lain."
                };
              }
              extractedText = extractPartsText(data?.candidates?.[0]?.content?.parts);
            } catch (_) {
              extractedText = "";
            }
          }

          if (!extractedText || extractedText.trim() === "") {
            console.log(`Empty script text for ${actualModel} via ${providerName} (attempt ${serverAttempt}/${maxServerAttempts}).`);
            const hint = `Pastikan gambar manga terbaca dengan jelas, model "${actualModel}" tersedia di ${providerName}, dan API Key aktif.`;
            lastFailure = {
              ok: false,
              status: 500,
              error: `Gagal menghasilkan naskah dari model ${actualModel} (${providerName}): Respons kosong atau tidak valid. ${hint}`
            };
            if (serverAttempt < maxServerAttempts) {
              await new Promise(r => setTimeout(r, serverAttempt * 1200));
              continue;
            }
            return lastFailure;
          }

          return { ok: true, text: extractedText };
        }

        return lastFailure;
      };

      const normalizeAndCleanScript = (rawText: string): string => {
        // Normalize bracketed tags anywhere and unbracketed tags only at start of lines so narrative prose isn't split
        let normalized = rawText
          .replace(/\*\*\s*(\[\s*(?:GAMBAR|PANEL|HALAMAN|IMAGE)\s+[0-9\s,\-&dansampai\/]+\s*\])\s*\*\*[:]?/gi, "$1")
          .replace(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:GAMBAR|PANEL|HALAMAN|IMAGE)\s+([0-9]+(?:\s*(?:-|dan|sampai|s\/d|&|,)\s*[0-9]+)*)\s*(?:\*\*)?\s*[:]?/gi, "\n[GAMBAR $1]\n")
          .replace(/\[\s*(?:GAMBAR|PANEL|HALAMAN|IMAGE)\s+([0-9]+(?:\s*(?:-|dan|sampai|s\/d|&|,)\s*[0-9]+)*)\s*\]\s*[:]?/gi, "\n[GAMBAR $1]\n");

        const cleanLines = normalized.split("\n").map(line => {
          const trimmed = line.trim();
          if (/^\[GAMBAR\s+[0-9\s,\-&dansampai\/]+\]$/i.test(trimmed)) {
            return trimmed.toUpperCase();
          }
          if (!trimmed) {
            return "";
          }
          let cleaned = trimmed
            .replace(/[\*\_\~\`\"\'\“\”\‘\’\:\;\#\%\@]/g, "")
            .replace(/\s+/g, " ")
            .trim();

          cleaned = cleaned
            .replace(/syok\s+berat/g, "sangat kaget")
            .replace(/Syok\s+berat/g, "Sangat kaget")
            .replace(/SYOK\s+BERAT/g, "SANGAT KAGET")
            .replace(/syok/g, "kaget")
            .replace(/Syok/g, "Kaget")
            .replace(/SYOK/g, "KAGET");

          return cleaned;
        });

        return cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      };

      const extractSectionsByIndex = (cleanedText: string) => {
        const headerRegex = /^(\[GAMBAR\s+([0-9\s,\-&dansampai\/]+)\])$/gim;
        const matches: { header: string; rawRange: string; index: number; nextIndex: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = headerRegex.exec(cleanedText)) !== null) {
          matches.push({ header: m[1].toUpperCase(), rawRange: m[2], index: m.index, nextIndex: headerRegex.lastIndex });
        }

        const coveredSet = new Set<number>();
        const blocks: { header: string; indices: number[]; body: string }[] = [];

        for (let idx = 0; idx < matches.length; idx++) {
          const cur = matches[idx];
          const next = matches[idx + 1];
          const body = cleanedText.substring(cur.nextIndex, next ? next.index : cleanedText.length).trim();
          if (!body) continue;

          const indices: number[] = [];
          const cleanRange = cur.rawRange.toLowerCase();
          const rangeMatch = cleanRange.match(/(\d+)\s*(?:-|dan|sampai|s\/d)\s*(\d+)/i);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1], 10);
            const end = parseInt(rangeMatch[2], 10);
            if (!isNaN(start) && !isNaN(end) && start <= end && end - start <= 50) {
              for (let n = start; n <= end; n++) indices.push(n);
            }
          } else {
            const nums = cleanRange.match(/\d+/g);
            if (nums) {
              nums.forEach(s => {
                const n = parseInt(s, 10);
                if (!isNaN(n)) indices.push(n);
              });
            }
          }

          if (indices.length > 0) {
            indices.forEach((n) => coveredSet.add(n));
            blocks.push({ header: cur.header, indices, body });
          }
        }

        return { coveredSet, blocks, matchCount: matches.length };
      };

      const enforceRequiredPrefix = (textToFix: string): string => {
        if (!isFirstScript || !requiredPrefix) return textToFix;
        const lines = textToFix.split("\n");
        let firstNarrativeLineIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (trimmed && !trimmed.startsWith("[") && !trimmed.startsWith("#")) {
            firstNarrativeLineIdx = i;
            break;
          }
        }

        if (firstNarrativeLineIdx !== -1) {
          const originalLine = lines[firstNarrativeLineIdx].trim();
          const cleanOriginal = originalLine.toLowerCase().replace(/[^a-z0-9]/g, "");
          const cleanPrefix = requiredPrefix.toLowerCase().replace(/[^a-z0-9]/g, "");

          if (!cleanOriginal.startsWith(cleanPrefix)) {
            const lowerFirst = originalLine.charAt(0).toLowerCase() + originalLine.slice(1);
            const firstCharIsUpper = originalLine.charAt(0) === originalLine.charAt(0).toUpperCase() && originalLine.charAt(0) !== originalLine.charAt(0).toLowerCase();
            const textToAppend = firstCharIsUpper ? originalLine : lowerFirst;
            lines[firstNarrativeLineIdx] = `${requiredPrefix}, ${textToAppend}`;
            return lines.join("\n");
          }
        }
        return textToFix;
      };

      // Primary generation call
      const primaryResult = await invokeProvider([
        { text: promptText },
        ...buildImageParts(sortedImages)
      ]);

      if ("error" in primaryResult) {
        return res.status(primaryResult.status).json({ error: primaryResult.error });
      }

      let scriptText = enforceRequiredPrefix(normalizeAndCleanScript(primaryResult.text));
      let { coveredSet, matchCount } = extractSectionsByIndex(scriptText);
      let missingIndices = expectedIndices.filter(num => !coveredSet.has(num));

      // Automatic server-side completion pass if any panels were skipped or truncated
      const needsRepair = isSuperConcise ? matchCount === 0 : missingIndices.length > 0;
      if (needsRepair) {
        const targetIndicesToRepair = missingIndices.length > 0 ? missingIndices : expectedIndices;
        const missingImages = sortedImages.filter((img, idx) => {
          const num = img.globalIndex !== undefined ? img.globalIndex : (idx + 1);
          return targetIndicesToRepair.includes(num);
        });
        const missingTagsList = targetIndicesToRepair.map(n => `[GAMBAR ${n}]`).join(", ");

        console.log(`[API REPAIR] Menjalankan pelengkapan otomatis untuk panel yang terlewat: ${missingTagsList}`);

        const repairPrompt = `
Anda sebelumnya telah menulis sebagian naskah recap manga berikut:
---
${scriptText}
---
NAMUN beberapa panel gambar belum dituliskan tag-nya atau terpotong, yaitu:
${missingTagsList}

TUGAS ANDA SEKARANG (WAJIB):
Tuliskan narasi lanjutan HANYA untuk panel-panel yang terlewat di bawah ini secara berurutan dengan gaya bahasa (${toneDescriptions[tone] || tone}) dan ${langInstruction}.
- Wajib sertakan SEMUA tag berikut: ${missingTagsList}
- Setiap tag harus berada di baris sendiri diikuti narasinya pada baris baru (${isSuperConcise ? "1-2 kalimat ringkas per gambar" : "2-4 kalimat detail per gambar"}).
- JANGAN mengulang panel yang sudah ada di atas.
- DILARANG menggunakan tanda baca (*), ("), (_), (~), atau backtick.
${characterDetails ? `Referensi karakter:\n${characterDetails}` : ""}
`;

        const repairResult = await invokeProvider([
          { text: repairPrompt },
          ...buildImageParts(missingImages)
        ]);

        if (repairResult.ok) {
          const repairedClean = normalizeAndCleanScript(repairResult.text);
          const origParsed = extractSectionsByIndex(scriptText);
          const repairedParsed = extractSectionsByIndex(repairedClean);

          const mergedBlocks = [...origParsed.blocks];
          const seenIndices = new Set<number>(origParsed.coveredSet);

          for (const repBlock of repairedParsed.blocks) {
            const hasNewIndex = repBlock.indices.some(n => !seenIndices.has(n));
            if (hasNewIndex) {
              mergedBlocks.push(repBlock);
              repBlock.indices.forEach(n => seenIndices.add(n));
            }
          }

          if (mergedBlocks.length > 0) {
            mergedBlocks.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
            scriptText = enforceRequiredPrefix(mergedBlocks.map(b => `${b.header}\n${b.body}`).join("\n\n"));
          } else {
            scriptText = enforceRequiredPrefix(`${scriptText}\n\n${repairedClean}`.trim());
          }

          const rechecked = extractSectionsByIndex(scriptText);
          coveredSet = rechecked.coveredSet;
          matchCount = rechecked.matchCount;
          missingIndices = expectedIndices.filter(num => !coveredSet.has(num));
        }
      }

      // Final validation
      if (isSuperConcise) {
        const regex = /\[?\s*GAMBAR\s+[\d,\s\-dan&]+\s*\]?/i;
        if (!regex.test(scriptText)) {
          throw new Error("Hasil naskah dari AI tidak menyertakan penanda [GAMBAR] yang valid.");
        }
      } else if (missingIndices.length > 0) {
        const missingHeaders = missingIndices.map(n => `[GAMBAR ${n}]`);
        console.warn(`[API WARNING] Naskah masih tidak lengkap setelah pelengkapan otomatis: ${missingHeaders.join(", ")}`);
        throw new Error(`Hasil naskah dari AI tidak lengkap. Gambar berikut terlewat atau terpotong: ${missingHeaders.join(", ")}.`);
      }

      return res.json({ script: scriptText });
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ error: error.message || "Gagal memproses request AI. Pastikan API Key sudah valid." });
    }
  });

  // Serve static files and integrate Vite in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });

    // Prevent Vite's default client from attempting a WebSocket connection when HMR is disabled
    app.get("/@vite/client", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.send(`
        import "/node_modules/vite/dist/client/env.mjs";
        const sheetsMap = new Map();
        const cspNonce = "document" in globalThis ? document.querySelector("meta[property=csp-nonce]")?.nonce : undefined;
        let lastInsertedStyle;
        export function updateStyle(id, content) {
          let style = sheetsMap.get(id);
          if (!style) {
            style = document.createElement("style");
            style.setAttribute("type", "text/css");
            style.setAttribute("data-vite-dev-id", id);
            style.textContent = content;
            if (cspNonce) style.setAttribute("nonce", cspNonce);
            if (!lastInsertedStyle) {
              document.head.appendChild(style);
              setTimeout(() => { lastInsertedStyle = undefined; }, 0);
            } else {
              lastInsertedStyle.insertAdjacentElement("afterend", style);
            }
            lastInsertedStyle = style;
          } else {
            style.textContent = content;
          }
          sheetsMap.set(id, style);
        }
        export function removeStyle(id) {
          const style = sheetsMap.get(id);
          if (style) {
            document.head.removeChild(style);
            sheetsMap.delete(id);
          }
        }
        const noop = () => {};
        const dataMap = new Map();
        export function createHotContext(ownerPath) {
          if (!dataMap.has(ownerPath)) dataMap.set(ownerPath, {});
          return {
            get data() { return dataMap.get(ownerPath); },
            accept: noop,
            acceptExports: noop,
            dispose: noop,
            prune: noop,
            decline: noop,
            invalidate: noop,
            on: noop,
            off: noop,
            send: noop,
          };
        }
        export function injectQuery(url, queryToInject) {
          if (url[0] !== "." && url[0] !== "/") return url;
          const pathname = url.replace(/[?#].*$/, "");
          const { search, hash } = new URL(url, "http://vite.dev");
          return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
        }
        export class ErrorOverlay { constructor() {} }
      `);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
