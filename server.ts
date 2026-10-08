import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limits for base64 images upload
  app.use(express.json({ limit: "60mb" }));
  app.use(express.urlencoded({ limit: "60mb", extended: true }));

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

  // API endpoint to generate manga recap scripts
  app.post("/api/recap", async (req, res) => {
    try {
      const { 
        images, 
        model = "gemini-2.0-flash",
        googleApiKey = "",
        kieApiKey = "",
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

      // Determine model type and select correct key
      const isKieAi = model.startsWith("gemini-3") && (model.includes("-5-") || model.includes("-6-") || model.includes("-7-") || model.includes("-8-"));
      
      const userKey = isKieAi ? kieApiKey.trim() : googleApiKey.trim();
      const apiKey = userKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        throw new Error(`API Key untuk ${isKieAi ? "Kie.ai" : "Google Gemini"} tidak dikonfigurasi. Silakan isi di menu Setelan.`);
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
        - Alur penceritaan harus mengalir, satu paragraf bisa mencakup 1-2 gambar sekaligus agar tidak terputus-putus.
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
Ternyata si Aoi ini mengajak Mondo untuk minum di sebuah bar. Dikarenakan Mondo yang enggak pernah minum ngebuat dia ini mabuk brutal. Si Mondo benar-benar syok dan panik karena ia enggak membayangkan kalau sifat dari Aoi itu seseram ini cuy.
      `;

      // Map video lengths
      const languageLabel = language === "id" ? "Bahasa Indonesia" : "Bahasa Inggris";
      const langInstruction = language === "id" 
        ? "Tulis seluruh naskah dalam Bahasa Indonesia yang ekspresif, asik, tidak kaku, menggunakan gaya bercerita sudut pandang orang ketiga (third-person storyteller) yang mengalir lancar seperti spoiler anime/film di YouTube." 
        : "Tulis seluruh naskah dalam Bahasa Inggris yang murni bergaya spoiler recap cerita orang ketiga (third-person storytelling).";

      const expectedHeaders = sortedImages.map((img, idx) => `[GAMBAR ${img.globalIndex !== undefined ? img.globalIndex : (idx + 1)}]`);
      const headersListString = expectedHeaders.join(", ");

      // Dynamic example format based on actual image count
      const formatExample = sortedImages.map((img, idx) => {
        const labelIndex = img.globalIndex !== undefined ? img.globalIndex : (idx + 1);
        return `[GAMBAR ${labelIndex}]\n[Tulis narasi spoiler yang sangat padat, seru, dan langsung ke inti adegan untuk GAMBAR ${labelIndex} (${img.name}) di sini...]`;
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
Berikut adalah 2 PARAGRAF TERAKRAF (Terakhir) dari naskah batch sebelumnya sebagai referensi Anda agar ceritanya tersambung secara mulus dan berurutan:
---
${previousParagraphs.map((p, idx) => `[Paragraf Sebelumnya #${idx + 1}]:\n${p}`).join("\n\n")}
---
TUGAS ANDA:
Lanjutkan alur cerita di atas secara berkesinambungan dan mulus mulai dari Gambar pertama pada batch ini.
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

      // Generate dynamically tailored example starting phrase
      const exampleStartPhrase = isFirstScript
        ? (requiredPrefix === "The story continues" ? "The story continues when" 
           : requiredPrefix === "The story begins" ? "The story begins when"
           : requiredPrefix === "Cerita berlanjut" ? "Cerita berlanjut saat"
           : "Cerita dimulai saat")
        : (language === "en" ? "Meanwhile," : "Di sisi lain,");

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
        : "MODE DETAIL: Narasikan setiap kejadian secara mendalam, ekspresif, dan emosional. Ceritakan detail aksi, dialog penting (dalam bentuk narasi), dan perubahan suasana di setiap panel. DILARANG KERAS melompati adegan atau gambar. Pastikan naskah terasa lengkap dan mencakup seluruh alur cerita yang terlihat.";

      const promptText = `
Anda adalah seorang Script Writer profesional dan spesialis pembuat naskah recap manga (spoiler alur cerita) terbaik di YouTube yang berspesialisasi dalam gaya penceritaan yang "Direct, Fast-Paced, and Narrative-Focused".

TUGAS UTAMA:
Buat naskah voice over (VO) murni (storytelling) yang fokus murni pada PLOT UTAMA. Naskah harus terasa seperti cerita yang mengalir, bukan sekadar deskripsi gambar.

${brevityInstruction}

${continuityPrompt}

SISTEM DAN ALUR GENERASI NASKAH (WAJIB DIPATUHI):

1. IDENTIFIKASI KARAKTER (MANDATORY):
   - Gunakan "REFERENSI DETAIL KARAKTER" di bawah untuk mengidentifikasi siapa saja yang ada di gambar.
   - JANGAN PERNAH menggunakan deskripsi fisik (misal: "pria berambut kuning") jika karakter tersebut sudah ada di referensi. Gunakan NAMA mereka.
   - Jika ada karakter baru yang tidak ada di referensi, beri nama deskriptif sementara yang konsisten (misal: "Bos Mafia" atau "Gadis Misterius").

2. ATURAN EMAS "ANTI-BERTELE-TELE":
   - DILARANG KERAS melompati gambar. Setiap gambar yang dikirimkan HARUS memiliki narasi ceritanya masing-masing.
   - DILARANG KERAS menggunakan frasa pengantar visual seperti: "Dalam gambar ini...", "Terlihat...", "Panel ini menunjukkan...", "Kamera menyorot...", "Suasana menjadi...".
   - LANGSUNG ke inti aksi/kejadian. 
   - Contoh Salah: "Terlihat Takemichi sedang panik melihat Hina menangis."
   - Contoh Benar: "Takemichi seketika panik dan berusaha menenangkan Hina yang mulai menangis tersedu-sedu."

3. GAYA BAHASA (NARRATIVE FLOW):
   - Gunakan kata kerja aktif.
   - Pastikan antar paragraf memiliki kesinambungan alur agar tidak terasa terputus-putus.
   - Fokus pada: Aksi -> Reaksi -> Emosi -> Konsekuensi Plot.

4. DILARANG KERAS:
   - DILARANG menulis kata/frasa penutup, kesimpulan, atau kalimat yang mengakhiri cerita (seperti "Kisah ini ditutup...").
   - DILARANG menggunakan tanda baca khusus seperti (*), ("), (_), (~), atau backtick. Cukup huruf, angka, titik, dan koma.
   - DILARANG menyapa penonton ("halo guys", "simak terus").

CONTOH FORMAT DAN GAYA YANG DIHARAPKAN (IKUTI GAYA INI):
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

      // Format content parts for standard Google GenAI SDK (multimodal)
      const contentParts: any[] = [
        { text: promptText }
      ];

      sortedImages.forEach((img, idx) => {
        let base64Data = img.base64;
        if (base64Data.includes(";base64,")) {
          base64Data = base64Data.split(";base64,").pop() || "";
        }
        
        // Sequence labeling to guarantee Gemini knows exactly which image is which
        const labelIndex = img.globalIndex !== undefined ? img.globalIndex : (idx + 1);
        contentParts.push({
          text: `[BERIKUT ADALAH GAMBAR PANEL UNTUK DIANALISIS: GAMBAR ${labelIndex} (Nama file: ${img.name})]`
        });

        contentParts.push({
          inlineData: {
            data: base64Data,
            mimeType: img.mimeType || "image/jpeg"
          }
        });
      });

      console.log(`Processing recap request for model: ${model}`);

      // Determine endpoint and headers
      let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      
      let actualModel = model;

      if (isKieAi) {
        endpoint = `https://api.kie.ai/gemini/v1/models/${actualModel}:streamGenerateContent`;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Authentication logic: check if key is OAuth token (ya29.) or standard API key
      if (apiKey.startsWith("ya29.")) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else {
        // For Google REST API, key is usually a query parameter
        if (!isKieAi) {
          endpoint += `?key=${encodeURIComponent(apiKey)}`;
          headers["x-goog-api-key"] = apiKey;
        } else {
          // For Kie AI proxy, try both common patterns
          headers["Authorization"] = `Bearer ${apiKey}`;
          headers["x-goog-api-key"] = apiKey;
        }
      }

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: contentParts
          }
        ],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 8192
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      };

      console.log(`Sending request to endpoint: ${endpoint} (Model: ${model})`);

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error (${response.status}) for ${model}:`, errorText);
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      let scriptText = "";
      const rawResponseText = await response.text();

      if (isKieAi) {
        // Log a bit of the response for debugging if it fails
        console.log(`Raw Kie AI response snippet: ${rawResponseText.substring(0, 200)}...`);
        
        // Try parsing as a pure JSON object/array first
        try {
          const json = JSON.parse(rawResponseText);
          if (Array.isArray(json)) {
            json.forEach(chunk => {
              scriptText += chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
            });
          } else {
            scriptText = json.candidates?.[0]?.content?.parts?.[0]?.text || json.text || "";
          }
        } catch (e) {
          // If JSON parse fails, it's likely SSE or a series of JSON objects
          // Split by "data:" if it exists, or just by lines
          const hasSsePrefix = rawResponseText.includes("data:");
          const chunks = hasSsePrefix 
            ? rawResponseText.split("data:").filter(c => c.trim() !== "")
            : rawResponseText.split("\n").filter(c => c.trim() !== "");

          chunks.forEach(chunk => {
            let cleanChunk = chunk.trim();
            if (cleanChunk === "[DONE]") return;
            
            // Remove array wrappers if they exist in the chunk
            if (cleanChunk.startsWith("[")) cleanChunk = cleanChunk.substring(1).trim();
            if (cleanChunk.startsWith(",")) cleanChunk = cleanChunk.substring(1).trim();
            if (cleanChunk.endsWith("]")) cleanChunk = cleanChunk.substring(0, cleanChunk.length - 1).trim();
            if (!cleanChunk) return;
            
            try {
              const json = JSON.parse(cleanChunk);
              const partText = json.candidates?.[0]?.content?.parts?.[0]?.text || json.text || "";
              scriptText += partText;
            } catch (err) {
              // Silently ignore individual chunk parse errors
            }
          });
        }
      } else {
        // Standard Unary Response
        try {
          const data = JSON.parse(rawResponseText);
          if (data.candidates?.[0]?.finishReason === "SAFETY") {
            throw new Error("Gagal menghasilkan naskah: Konten diblokir oleh filter keamanan AI. Coba ubah instruksi atau gunakan gambar lain.");
          }
          scriptText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        } catch (e) {
          if (e instanceof Error && e.message.includes("filter keamanan")) throw e;
          scriptText = ""; 
        }
      }

      if (!scriptText || scriptText.trim() === "") {
        console.error(`Empty script text for ${model}. Raw response:`, rawResponseText.substring(0, 1000));
        throw new Error(`Gagal menghasilkan naskah dari model ${model}: Respons kosong atau tidak valid. Pastikan API Key benar dan model didukung.`);
      }

      // Post-processing: clean up any special characters or markdown from narrative lines
      const cleanLines = scriptText.split("\n").map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          return trimmed;
        }
        if (!trimmed) {
          return line;
        }
        // Remove markdown, formatting, and quotation characters
        let cleaned = line
          .replace(/[\*\_\~\`\"\'\“\”\‘\’\:\;\#\%\@]/g, "") // remove stars, underscores, tildes, backticks, quotes, colons, semicolons, etc.
          .replace(/\s+/g, " "); // normalize spaces

        // Ban the word "syok" and replace it with "kaget"
        cleaned = cleaned
          .replace(/syok\s+berat/g, "sangat kaget")
          .replace(/Syok\s+berat/g, "Sangat kaget")
          .replace(/SYOK\s+BERAT/g, "SANGAT KAGET")
          .replace(/syok/g, "kaget")
          .replace(/Syok/g, "Kaget")
          .replace(/SYOK/g, "KAGET");

        return cleaned;
      });
      scriptText = cleanLines.join("\n");

      // Fallback post-processing: enforce "Cerita dimulai" or "Cerita berlanjut" at the very beginning of the first script
      if (isFirstScript && requiredPrefix) {
        const lines = scriptText.split("\n");
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
          const lowerOriginal = originalLine.toLowerCase();
          const lowerPrefix = requiredPrefix.toLowerCase();
          
          const cleanOriginal = lowerOriginal.replace(/[^a-z0-9]/g, "");
          const cleanPrefix = lowerPrefix.replace(/[^a-z0-9]/g, "");
          
          if (!cleanOriginal.startsWith(cleanPrefix)) {
            const lowerFirst = originalLine.charAt(0).toLowerCase() + originalLine.slice(1);
            const firstCharIsUpper = originalLine.charAt(0) === originalLine.charAt(0).toUpperCase() && originalLine.charAt(0) !== originalLine.charAt(0).toLowerCase();
            const textToAppend = firstCharIsUpper ? originalLine : lowerFirst;
            
            lines[firstNarrativeLineIdx] = `${requiredPrefix}, ${textToAppend}`;
            scriptText = lines.join("\n");
          }
        }
      }

      // Verify that all expected headers are present in the script
      if (isSuperConcise) {
        // In Super Concise Mode, we just check that we have at least one valid [GAMBAR ...] tag
        const regex = /\[?\s*GAMBAR\s+[\d,\s\-dan]+\s*\]?/i;
        if (!regex.test(scriptText)) {
          throw new Error("Hasil naskah dari AI tidak menyertakan penanda [GAMBAR] yang valid. Sistem akan melakukan percobaan ulang otomatis.");
        }
      } else {
        const missingHeaders = [];
        for (const header of expectedHeaders) {
          const cleanNum = header.replace(/[\[\]]/g, "").trim(); // e.g. "GAMBAR 78"
          const escaped = cleanNum.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\[?\\s*${escaped}\\s*\\]?`, 'i');
          if (!regex.test(scriptText)) {
            missingHeaders.push(header);
          }
        }

        if (missingHeaders.length > 0) {
          console.warn(`[API WARNING] Naskah tidak lengkap, beberapa gambar terlewat atau terpotong: ${missingHeaders.join(", ")}`);
          throw new Error(`Hasil naskah dari AI tidak lengkap. Gambar berikut terlewat atau terpotong: ${missingHeaders.join(", ")}. Sistem akan melakukan percobaan ulang otomatis.`);
        }
      }

      return res.json({ script: scriptText });
    } catch (error: any) {
      console.error("AI Generation Error:", error);
      res.status(500).json({ error: error.message || "Gagal memproses request AI. Pastikan API Key di panel Secrets sudah valid." });
    }
  });

  // Serve public assets (PWA icons, manifest, etc.)
  app.use(express.static(path.join(process.cwd(), "public")));

  // Serve static files and integrate Vite in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
