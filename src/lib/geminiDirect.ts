// Shared provider engine for Express (server.ts) AND Vercel Serverless Functions (/api/test-key.ts, /api/recap.ts)

export interface MangaImagePayload {
  name: string;
  base64: string;
  mimeType: string;
  globalIndex?: number;
}

export interface RecapPayload {
  images: MangaImagePayload[];
  provider?: "google" | "kie" | "openrouter" | string;
  model?: string;
  googleApiKey?: string;
  kieApiKey?: string;
  openrouterApiKey?: string;
  tone?: string;
  language?: string;
  customInstructions?: string;
  customStyleRef?: string;
  previousParagraphs?: string[];
  previousStoryContext?: string;
  initialContext?: string;
  isSuperConcise?: boolean;
  characterDetails?: string;
  seriesName?: string;
}

export interface TestKeyPayload {
  provider?: string;
  apiKey?: string;
  model?: string;
}

export interface EngineResponse<T> {
  status: number;
  body: T;
}

function extractPartsText(parts: any): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p: any) => p && !p.thought && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("");
}

export function cleanApiKey(rawKey: unknown): string {
  if (typeof rawKey !== "string") return "";
  return rawKey.trim().replace(/^["']|["']$/g, "");
}

export async function testProviderKey(
  payload: TestKeyPayload
): Promise<EngineResponse<{ ok: boolean; message?: string; availableModels?: string[]; error?: string }>> {
  try {
    const { provider = "google", apiKey: rawKey = "", model = "" } = payload || {};
    const apiKey = cleanApiKey(rawKey);

    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MY_KIE_AI_API_KEY") {
      return {
        status: 400,
        body: {
          ok: false,
          error: "API Key masih kosong. Silakan masukkan API Key terlebih dahulu."
        }
      };
    }

    if (provider === "google") {
      if (apiKey.startsWith("sk-or-")) {
        return {
          status: 400,
          body: {
            ok: false,
            error: "Key yang dimasukkan terlihat seperti OpenRouter API Key (sk-or-...), bukan Google AI Studio Key (AIzaSy...)."
          }
        };
      }
      if (apiKey.startsWith("kie-")) {
        return {
          status: 400,
          body: {
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Kie.ai API Key (kie-...), bukan Google AI Studio Key (AIzaSy...)."
          }
        };
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
          return {
            status: 400,
            body: {
              ok: false,
              error: `API Key Google AI Studio tidak valid (${resp.status}): ${msg}`
            }
          };
        }
        return {
          status: resp.status,
          body: {
            ok: false,
            error: `Google AI Studio error (${resp.status}): ${msg}`
          }
        };
      }

      const modelsList: string[] = Array.isArray(data?.models)
        ? data.models.map((m: any) => String(m.name || "").replace(/^models\//, ""))
        : [];

      return {
        status: 200,
        body: {
          ok: true,
          message: `Koneksi Google AI Studio berhasil! Key aktif (${modelsList.length} model tersedia).`,
          availableModels: modelsList.slice(0, 25)
        }
      };
    }

    if (provider === "kie") {
      if (apiKey.startsWith("AIzaSy")) {
        return {
          status: 400,
          body: {
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Google AI Studio Key (AIzaSy...), bukan Kie.ai API Key."
          }
        };
      }
      if (apiKey.startsWith("sk-or-")) {
        return {
          status: 400,
          body: {
            ok: false,
            error: "Key yang dimasukkan terlihat seperti OpenRouter API Key (sk-or-...), bukan Kie.ai API Key."
          }
        };
      }

      // Primary check via official Kie.ai Common API credit endpoint (fast, zero-cost, model-independent)
      const creditResp = await fetch("https://api.kie.ai/api/v1/chat/credit", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      const creditRaw = await creditResp.text();
      let creditJson: any = null;
      try {
        creditJson = JSON.parse(creditRaw);
      } catch (_) {}

      if (creditResp.ok && creditJson && Number(creditJson.code) === 200) {
        const balance = typeof creditJson.data === "number" ? creditJson.data : Number(creditJson.data);
        const creditInfo = !isNaN(balance) ? ` (Sisa kredit: ${balance})` : "";
        return {
          status: 200,
          body: {
            ok: true,
            message: `Koneksi Kie.ai berhasil! API Key aktif dan terverifikasi${creditInfo}.`
          }
        };
      }

      if ((creditJson && Number(creditJson.code) === 401) || creditResp.status === 401) {
        return {
          status: 401,
          body: {
            ok: false,
            error: `API Key Kie.ai tidak valid (401): ${creditJson?.msg || "Unauthorized"}`
          }
        };
      }

      if ((creditJson && Number(creditJson.code) === 402) || creditResp.status === 402) {
        return {
          status: 402,
          body: {
            ok: false,
            error: `Kredit Kie.ai habis (402): ${creditJson?.msg || "Insufficient credits"}. Silakan isi ulang di kie.ai.`
          }
        };
      }

      // Fallback chat check if credit endpoint returned temporary error
      const testModel = typeof model === "string" && model.trim() ? model.trim() : "gemini-4-hydrogen";
      const nativeTestModel = testModel.replace(/-openai$/i, "");
      const openAiTestSlug = testModel.endsWith("-openai") ? testModel : `${testModel}-openai`;
      const streamTestRoute = {
        url: `https://api.kie.ai/gemini/v1/models/${encodeURIComponent(nativeTestModel)}:streamGenerateContent`,
        body: {
          stream: true,
          contents: [{ role: "user", parts: [{ text: "Balas OK" }] }]
        }
      };
      const openAiTestRoute = {
        url: `https://api.kie.ai/${encodeURIComponent(openAiTestSlug)}/v1/chat/completions`,
        body: {
          model: nativeTestModel,
          messages: [{ role: "user", content: "Balas OK" }],
          stream: false
        }
      };
      const testRoutes = testModel.endsWith("-openai")
        ? [openAiTestRoute, streamTestRoute]
        : [
            streamTestRoute,
            openAiTestRoute,
            ...(nativeTestModel !== "gemini-4-hydrogen"
              ? [
                  {
                    url: "https://api.kie.ai/gemini/v1/models/gemini-4-hydrogen:streamGenerateContent",
                    body: {
                      stream: true,
                      contents: [{ role: "user", parts: [{ text: "Balas OK" }] }]
                    }
                  }
                ]
              : [])
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
            "Authorization": `Bearer ${apiKey}`
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
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        break;
      }

      if (!resp!.ok) {
        const msg = json?.msg || json?.message || json?.error?.message || rawText.substring(0, 200);
        return {
          status: resp!.status,
          body: {
            ok: false,
            error: `Koneksi Kie.ai gagal (${resp!.status}): ${msg}`
          }
        };
      }

      if (json && !Array.isArray(json) && json.code && json.code !== 200) {
        const kieCode = Number(json.code);
        const kieMsg = json.msg || json.message || "Autentikasi gagal";
        const httpStatus = kieCode >= 500 ? 503 : kieCode === 429 ? 429 : 400;
        return {
          status: httpStatus,
          body: {
            ok: false,
            error:
              kieCode >= 500
                ? `Server Kie.ai sedang sibuk/gangguan (${kieCode}): ${kieMsg}. Coba lagi beberapa saat atau gunakan Google AI Studio / OpenRouter.`
                : `Kie.ai error (${kieCode}): ${kieMsg}`
          }
        };
      }

      return {
        status: 200,
        body: {
          ok: true,
          message: `Koneksi Kie.ai berhasil! API Key aktif dan terverifikasi (${testModel}).`
        }
      };
    }

    if (provider === "openrouter") {
      if (apiKey.startsWith("AIzaSy")) {
        return {
          status: 400,
          body: {
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Google AI Studio Key (AIzaSy...), bukan OpenRouter API Key (sk-or-...)."
          }
        };
      }
      if (apiKey.startsWith("kie-")) {
        return {
          status: 400,
          body: {
            ok: false,
            error: "Key yang dimasukkan terlihat seperti Kie.ai Key (kie-...), bukan OpenRouter API Key (sk-or-...)."
          }
        };
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
        return {
          status: resp.status,
          body: {
            ok: false,
            error: `API Key OpenRouter tidak valid (${resp.status}): ${msg}`
          }
        };
      }

      const keyInfo = json?.data;
      const limitText =
        typeof keyInfo?.limit_remaining === "number"
          ? ` (Sisa kredit: $${keyInfo.limit_remaining.toFixed(2)})`
          : "";

      return {
        status: 200,
        body: {
          ok: true,
          message: `Koneksi OpenRouter berhasil! API Key aktif${limitText}.`
        }
      };
    }

    return {
      status: 400,
      body: { ok: false, error: `Provider tidak dikenal: ${provider}` }
    };
  } catch (err: any) {
    return {
      status: 500,
      body: {
        ok: false,
        error: err?.message || "Gagal menguji koneksi API Key."
      }
    };
  }
}

export async function generateRecapWithProviders(
  payload: RecapPayload,
  envFallbackGeminiKey = ""
): Promise<EngineResponse<{ script?: string; error?: string }>> {
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
      previousStoryContext = "",
      initialContext = "",
      isSuperConcise = true,
      characterDetails = "",
      seriesName = ""
    } = payload || {};

    if (!images || !Array.isArray(images) || images.length === 0) {
      return {
        status: 400,
        body: { error: "No manga images uploaded or images array is empty." }
      };
    }

    // Determine provider explicitly first, with safe fallback inference
    let resolvedProvider: "google" | "kie" | "openrouter";
    if (provider === "google" || provider === "kie" || provider === "openrouter") {
      resolvedProvider = provider;
    } else if (
      typeof model === "string" &&
      (model.includes("/") ||
        model.startsWith("openai/") ||
        model.startsWith("anthropic/") ||
        model.startsWith("google/") ||
        model.startsWith("deepseek/"))
    ) {
      resolvedProvider = "openrouter";
    } else if (
      typeof model === "string" &&
      (model.endsWith("-openai") ||
        model === "gemini-4-argon" ||
        (model.startsWith("gemini-3") &&
          (model.includes("-6-") || model.includes("-7-") || model.includes("-8-"))))
    ) {
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
      if (
        !actualModel ||
        actualModel === "custom" ||
        actualModel === "gemini-1.5-flash" ||
        actualModel === "gemini-2.0-flash" ||
        actualModel === "gemini-3-flash"
      ) {
        actualModel = "gemini-4-hydrogen";
      }
    } else if (isOpenRouter) {
      if (
        !actualModel ||
        actualModel === "custom" ||
        actualModel === "google/gemini-3-flash" ||
        actualModel === "gemini-3-flash"
      ) {
        actualModel = "google/gemini-4-hydrogen";
      } else if (!actualModel.includes("/")) {
        actualModel = `google/${actualModel}`;
      }
    } else if (isKieAi) {
      const urlModelMatch = actualModel.match(/\/models\/([^/:?#]+)(?::[a-zA-Z]+)?/i);
      if (urlModelMatch && urlModelMatch[1]) {
        actualModel = urlModelMatch[1].trim();
      }
      if (!actualModel || actualModel === "custom") {
        actualModel = "gemini-4-hydrogen";
      }
    }

    // Select correct key according to active provider
    const rawUserKey = isOpenRouter ? openrouterApiKey : isKieAi ? kieApiKey : googleApiKey;
    const userKey = cleanApiKey(rawUserKey);

    const rawEnvKey = cleanApiKey(envFallbackGeminiKey);
    const effectiveEnvKey =
      rawEnvKey && rawEnvKey !== "MY_GEMINI_API_KEY" && rawEnvKey !== "MY_KIE_AI_API_KEY"
        ? rawEnvKey
        : "";

    const apiKey = userKey || (isGoogleAI ? effectiveEnvKey : "");
    const providerName = isOpenRouter ? "OpenRouter" : isKieAi ? "Kie.ai" : "Google AI Studio";

    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "MY_KIE_AI_API_KEY") {
      return {
        status: 400,
        body: {
          error: `API Key untuk ${providerName} belum diisi. Silakan klik tombol Pengaturan (Setting) di pojok kanan atas dan masukkan API Key Anda.`
        }
      };
    }

    if (isGoogleAI && (apiKey.startsWith("kie-") || apiKey.startsWith("sk-or-"))) {
      return {
        status: 400,
        body: {
          error: `API Key yang tersimpan di Google AI Studio bukan key Google (terdeteksi key ${
            apiKey.startsWith("sk-or-") ? "OpenRouter" : "Kie.ai"
          }). Periksa kembali pengaturan API Key Anda.`
        }
      };
    }

    // Sort images by globalIndex or filename
    const sortedImages = [...images].sort((a, b) => {
      if (a.globalIndex !== undefined && b.globalIndex !== undefined) {
        return a.globalIndex - b.globalIndex;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });

    const toneDescriptions: Record<string, string> = {
      aniki: `Gaya penceritaan "AniKi.ID" (Storytelling Voice Over Mengalir):
        - Bahasa Indonesia santai yang enak didengar telinga, mengalir halus seperti teman yang lagi asyik mendongengkan alur cerita anime/manga secara runtut.
        - Gunakan penyebutan karakter dengan awalan "si" secara natural (contoh: "si Izumi", "si Amane", "si Hakua") dan pilihan kata kasual yang ringan ("gak", "cuma", "malah", "mendadak", "seketika", "sukses membuat", "bikin").
        - Gunakan kata sambung transisi cerita yang luwes di awal paragraf agar antar bagian terasa menyatu dalam satu tarikan napas cerita, seperti: "Ya, di awal cerita...", "Nah di sini...", "Dan ya...", "Nah tak lama setelah itu...", "Dan ternyata...", "Namun saat...", "Begitu...", "Suasana kemudian berpindah ke...", "Melihat hal itu...", "Tanpa ragu...".
        - HINDARI bahasa kasar/lebay yang merusak alur VO (JANGAN pakai "anjir", "cuy", "gua/lu", atau candaan membandingkan penonton seperti "jomblo kayak kalian").
        - Susun kalimat yang ringkas, jelas sebab-akibatnya, menonjolkan emosi & interaksi karakter, dan langsung masuk ke poin cerita.`,
      formal:
        "Bahasa Indonesia yang baik dan benar, formal, sopan, deskriptif secara elegan, dan menggunakan kosakata yang baku namun tetap menarik untuk narasi dokumenter.",
      humorous:
        "Sangat lucu, penuh candaan, menyisipkan punchline jenaka terhadap tingkah konyol karakter, tetap mengalir halus dan enak didengar sebagai VO.",
      dramatic:
        "Penuh drama, menegangkan, emosional, misterius, dan membuat penonton penasaran di setiap kelanjutan adegannya.",
      casual:
        "Santai, ramah, seperti mengobrol asik dengan teman sebaya, bahasa kasual ringan yang mengalir mulus dari satu kejadian ke kejadian berikutnya.",
      excited:
        "Sangat bersemangat, berapi-api, penuh energi di momen-momen penting, tetap terstruktur dan enak didengar.",
      epic: "Sangat epik, luar biasa keren, deskripsi aksi yang megah, tajam, dan membangun ketegangan cerita.",
      custom: `Ikuti gaya penulisan secara KETAT berdasarkan "REFERENSI GAYA NASKAH" yang diberikan oleh pengguna. Tiru pilihan kata, struktur kalimat, transisi, dan nada bicaranya secara presisi.`
    };

    const anikiExample = `
[GAMBAR 1]
Ya, di awal cerita kita dilihatin teman-teman sekelas Izumi yang ngajak dia ikut karaoke bareng cewek-cewek dari sekolah.

[GAMBAR 2]
Nah di sini si Izumi malah dengan percaya dirinya menyombongkan diri bakal disukai semua cewek yang justru bikin teman-temannya cuma bisa terdiam garing.

[GAMBAR 3]
Dan ya, rasa malu si Izumi makin jadi saat teman-temannya malah menganggap kepribadiannya yang pemalu itu cuma bakal merusak suasana.

[GAMBAR 4]
Nah tak lama setelah itu, muncul cewek populer bernama Amane Amasaki yang langsung diserbu teman-temannya karena pekerjaan model dan aktivitasnya.

[GAMBAR 5]
Dan ternyata si Amane ini punya reputasi sempurna di sekolah sebagai model aktif sekaligus murid peringkat satu yang sangat pintar bergaul.

[GAMBAR 6]
Namun saat seorang teman mengajak si Amane pulang bareng, dia terkejut melihat Amane ternyata sedang asyik belajar berdua saja dengan si Izumi.
      `;

    const langInstruction =
      language === "id"
        ? "Tulis seluruh naskah dalam Bahasa Indonesia yang ekspresif, asik, tidak kaku, menggunakan gaya bercerita sudut pandang orang ketiga (third-person storyteller) yang mengalir lancar seperti spoiler anime/film di YouTube."
        : "Tulis seluruh naskah dalam Bahasa Inggris yang murni bergaya spoiler recap cerita orang ketiga (third-person storytelling).";

    const expectedIndices = sortedImages.map((img, idx) =>
      img.globalIndex !== undefined ? img.globalIndex : idx + 1
    );
    const expectedHeaders = expectedIndices.map((num) => `[GAMBAR ${num}]`);
    const headersListString = expectedHeaders.join(", ");

    const formatExample = sortedImages
      .map((_, idx) => {
        const labelIndex = expectedIndices[idx];
        return `[GAMBAR ${labelIndex}]\nTulis narasi spoiler untuk gambar ${labelIndex} di sini...`;
      })
      .join("\n\n");

    let continuityPrompt = "";
    const isFirstScript = !(
      previousParagraphs &&
      Array.isArray(previousParagraphs) &&
      previousParagraphs.length > 0
    );
    const hasContext = Boolean(
      initialContext && typeof initialContext === "string" && initialContext.trim() !== ""
    );
    const requiredPrefix = isFirstScript
      ? hasContext
        ? language === "en"
          ? "The story continues"
          : "Cerita berlanjut"
        : language === "en"
        ? "The story begins"
        : "Cerita dimulai"
      : "";

    if (!isFirstScript) {
      continuityPrompt = `
=========================================
PENTING - KESINAMBUNGAN ALUR CERITA DARI BATCH SEBELUMNYA:
Cerita yang akan Anda buat di bawah ini adalah kelanjutan langsung dari halaman manga sebelumnya. 
Berikut adalah 2-3 PARAGRAF TERAKHIR dari naskah batch sebelumnya sebagai referensi Anda agar ceritanya tersambung secara mulus dan berurutan:
---
${previousParagraphs
  .map((p: string, idx: number) => `[Paragraf Sebelumnya #${idx + 1}]:\n${p}`)
  .join("\n\n")}
---
TUGAS ANDA:
Lanjutkan alur cerita di atas secara berkesinambungan dan mulus mulai dari bagian pertama batch ini (${expectedHeaders[0]}).
- Hubungkan kalimat pembuka naskah batch ini secara mulus langsung dari akhir cerita di atas.
- JANGAN mengulangi cerita, dialog, atau aksi yang sudah diceritakan pada referensi paragraf sebelumnya di atas.
- JANGAN menambahkan kalimat/frasa pembuka seperti "Cerita dimulai" atau "Cerita berlanjut" karena ini adalah kelanjutan di tengah-tengah naskah, bukan awal naskah.
- JANGAN menyebut kata "panel", "gambar", atau urutan angka di dalam isi narasi.
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
- JANGAN menceritakan ulang kejadian yang sudah diringkas dalam konteks di atas. Langsung lanjutkan petualangan/kejadian berikutnya.
- WAJIB AWALI kalimat pertama pada bagian ${expectedHeaders[0]} dengan tepat menggunakan kata pembuka: "${requiredPrefix}" lalu langsung masuk ke kejadian cerita (misal: "${requiredPrefix} saat sekelompok..." atau "${requiredPrefix} ketika..."). JANGAN selipkan frasa seperti "di panel pertama" setelah "${requiredPrefix}".
- JANGAN menggunakan dialog langsung maupun efek suara/tanda kutip ganda ("").
=========================================\n`;
    } else {
      const openingGuide =
        tone === "aniki" && language === "id"
          ? `AWALI kalimat pertama pada bagian ${expectedHeaders[0]} dengan gaya pembuka alami seperti "Ya, di awal cerita kita dilihatin..." atau "${requiredPrefix} saat..."`
          : `WAJIB AWALI kalimat pertama pada bagian ${expectedHeaders[0]} dengan tepat menggunakan kata pembuka: "${requiredPrefix}" lalu langsung masuk ke kejadian cerita (misal: "${requiredPrefix} saat sekelompok..." atau "${requiredPrefix} ketika...")`;
      continuityPrompt = `
=========================================
PENTING - AWAL NASKAH TANPA KONTEKS SEBELUMNYA:
Ini adalah awal dari seluruh naskah cerita dan tidak memiliki konteks atau ringkasan cerita dari bagian sebelumnya.
TUGAS ANDA (MANDATORY):
- ${openingGuide}. JANGAN selipkan frasa seperti "di panel pertama" setelah pembuka.
- Tetap patuhi aturan TIDAK menggunakan dialog langsung maupun efek suara/tanda kutip ganda ("").
=========================================\n`;
    }

    const exampleText =
      language === "en"
        ? `[GAMBAR 1]
The story begins with Takemichi riding Chifuyu on a bicycle leisurely along the city streets.

[GAMBAR 2]
Suddenly Takemichi reveals his desire to time leap again, which Chifuyu initially mistakes for a return to the distant future.

[GAMBAR 3]
To Chifuyu's confusion, Takemichi admits he only wants to go back three days to give Hina a White Day gift he forgot.

[GAMBAR 4]
Takemichi panics imagining Hina's anger, while Chifuyu watches in annoyance, thinking there was a life-or-death emergency.`
        : `[GAMBAR 1]
Cerita dimulai dengan Takemichi yang sedang membonceng Chifuyu menggunakan sepeda santai di sepanjang jalan kota.

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

    const cleanSeriesName = typeof seriesName === "string" ? seriesName.trim() : "";
    const cleanCharacterDetails = typeof characterDetails === "string" ? characterDetails.trim() : "";
    const cleanPrevStory = typeof previousStoryContext === "string" ? previousStoryContext.trim() : "";

    const extractKnownCharacters = (): string[] => {
      const found = new Set<string>();
      const stopWords = new Set([
        "Ini", "Itu", "Dia", "Mereka", "Kita", "Kami", "Anda", "Yang", "Dan", "Atau", "Tapi", "Namun",
        "Karena", "Sebab", "Saat", "Ketika", "Begitu", "Setelah", "Sebelum", "Meski", "Walaupun",
        "Tanpa", "Dengan", "Untuk", "Dari", "Pada", "Dalam", "Di", "Ke", "Si", "Sang", "Para",
        "Gambar", "Panel", "Halaman", "Bagian", "Cerita", "Bab", "Chapter", "Main", "Character",
        "Supporting", "Antagonist", "Detail", "Fisik", "Visual", "Rambut", "Mata", "Ekspresi",
        "Pakaian", "Seragam", "Ciri", "Unik", "Khusus", "Kekuatan", "Bakat", "Sifat", "Karakteristik",
        "Hubungan", "Kunci", "Peran", "Contoh", "Bos", "Mafia", "Gadis", "Ketua", "Sekolah",
        "Teman", "Kakak", "Adik", "Ibu", "Ayah", "Guru", "Murid", "Siswa", "Siswi", "Cewek", "Cowok",
        "Heroine", "Sini", "Sana", "Situ", "Sekarang", "Nanti", "Tadi", "Tiba", "Lalu", "Malah",
        "Juga", "Pula", "Pun", "Lagi", "Sudah", "Belum", "Akan", "Bisa", "Harus", "Wajib", "Jangan"
      ]);

      // 1. Names from structured characterDetails headers/bullets
      if (cleanCharacterDetails) {
        const headerMatches = cleanCharacterDetails.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*|\d+\.\s*|\-\s*\*\*?)([A-Z][a-zA-Z0-9'’\-]+(?:\s+[A-Z][a-zA-Z0-9'’\-]+){0,2})/g);
        for (const m of headerMatches) {
          const candidate = m[1].trim();
          if (candidate.length >= 2 && !stopWords.has(candidate.split(/\s+/)[0])) {
            found.add(candidate);
          }
        }
      }

      // 2. Names preceded by "si <Nama>" across previous script and context
      const combinedHistory = [cleanPrevStory, ...(Array.isArray(previousParagraphs) ? previousParagraphs : []), initialContext || ""]
        .filter(Boolean)
        .join("\n");
      const siMatches = combinedHistory.matchAll(/\bsi\s+([A-Z][a-zA-Z0-9'’\-]+(?:\s+[A-Z][a-zA-Z0-9'’\-]+)?)/g);
      for (const m of siMatches) {
        const name = m[1].trim();
        if (name.length >= 2 && !stopWords.has(name.split(/\s+/)[0])) {
          found.add(name);
        }
      }

      // 3. Repeated capitalized proper names in history (>= 2 mentions)
      const capCounts = new Map<string, number>();
      const capMatches = combinedHistory.matchAll(/\b([A-Z][a-z]{2,18})\b/g);
      for (const m of capMatches) {
        const w = m[1];
        if (!stopWords.has(w)) {
          capCounts.set(w, (capCounts.get(w) || 0) + 1);
        }
      }
      for (const [w, count] of capCounts.entries()) {
        if (count >= 2) found.add(w);
      }

      return Array.from(found).slice(0, 25);
    };

    const lockedCharacterNames = extractKnownCharacters();

    const characterIdentityBlock = `
=========================================
KUNCI IDENTITAS & NAMA KARAKTER (PRIORITAS TERTINGGI - ANTI TERTUKAR):
${cleanSeriesName ? `- JUDUL SERI MANGA: "${cleanSeriesName}". Gunakan pengetahuan kanon seri ini HANYA untuk memastikan ejaan nama resmi dan relasi karakter yang benar-benar cocok secara visual di gambar.` : "- JUDUL SERI: Tidak dicantumkan (identifikasi nama secara ketat dari gambar dan referensi di bawah)."}
${lockedCharacterNames.length > 0 ? `- DAFTAR NAMA KARAKTER TERKUNCI (WAJIB DIPERTAHANKAN KONSISTEN): ${lockedCharacterNames.join(", ")}` : ""}
${cleanCharacterDetails ? `- PROFIL VISUAL & DETAIL KARAKTER (COCOKKAN RAMBUT/MATA/SERAGAM/AKSESORI DENGAN GAMBAR):\n---\n${cleanCharacterDetails}\n---` : ""}
${cleanPrevStory && !isFirstScript ? `- RINGKASAN ALUR SEBELUMNYA (UNTUK MENJAGA KONTEKS TOKOH DARI AWAL BAB):\n---\n${cleanPrevStory}\n---` : ""}
ATURAN WAJIB PENGENALAN KARAKTER:
1. BACA SEMUA TEKS & GELEMBUNG DIALOG DI DALAM GAMBAR TERLEBIH DAHULU: Cek setiap panggilan nama, kotak nama, atau narasi di komik untuk mendapatkan ejaan nama yang persis.
2. COCOKKAN VISUAL SEBELUM MENYEBUT NAMA: Perhatikan gaya rambut, warna/arsiran rambut, bentuk mata, pakaian/seragam, aksesori, dan arah ekor balon bicara sebelum menuliskan siapa yang berbicara atau bertindak. JANGAN PERNAH menukar nama antara dua karakter!
3. WAJIB SEBUTKAN NAMA RESMI: Jika nama karakter sudah tertera di Profil Karakter, Judul Seri, balon dialog di gambar, atau sudah muncul di bagian sebelumnya, WAJIB sebutkan namanya (jangan dihilangkan menjadi "cewek itu"/"karakter tersebut" saja).
4. DILARANG KERAS MENGARANG NAMA SENDIRI: Jika seorang tokoh benar-benar baru dan namanya BELUM tertulis di gambar maupun di referensi, JANGAN mengarang nama fiktif sendiri. Gunakan sebutan peran visual yang jelas dan konsisten (misal: "ketua kelas", "gadis berkacamata", "adik kelas berambut pendek") sampai namanya muncul resmi di dialog.
=========================================\n`;

    const brevityInstruction = isSuperConcise
      ? "WAJIB SANGAT RINGKAS: Maksimal 1-2 kalimat pendek per bagian. Fokus hanya pada 'Plot Beat' utama. Jangan deskripsikan visual latar belakang jika tidak ada aksi penting."
      : "MODE DETAIL: Narasikan setiap kejadian di SETIAP bagian secara mendalam, ekspresif, dan emosional (2-4 kalimat per bagian). Ceritakan detail aksi, dialog penting (dalam bentuk narasi tidak langsung), dan perubahan alur cerita secara menyeluruh. DILARANG KERAS melompati atau menggabungkan gambar.";

    const promptText = `
Anda adalah seorang Script Writer profesional dan spesialis pembuat naskah recap manga (spoiler alur cerita) terbaik di YouTube yang berspesialisasi dalam gaya penceritaan yang "Direct, Fast-Paced, and Narrative-Focused".

TUGAS UTAMA:
Buat naskah voice over (VO) murni (storytelling alur cerita) yang fokus murni pada PLOT UTAMA. Naskah harus terasa seperti satu cerita utuh yang mengalir terus-menerus, BUKAN penjelasan gambar atau pembahasan panel demi panel.

${characterIdentityBlock}

${brevityInstruction}

${continuityPrompt}

DAFTAR TAG PEMISAH WAJIB UNTUK BATCH INI (${sortedImages.length} BAGIAN):
Anda HARUS menghasilkan tepat ${sortedImages.length} bagian secara berurutan dengan tag persis berikut:
${headersListString}

STRUKTUR OUTPUT WAJIB:
${formatExample}

SISTEM DAN ALUR GENERASI NASKAH (WAJIB DIPATUHI):

1. IDENTIFIKASI & KONSISTENSI KARAKTER (MANDATORY):
   - Prioritaskan pencocokan visual tiap tokoh (rambut, pakaian, ciri khas, arah balon bicara) dengan Profil Karakter & Judul Seri di atas.
   - Sebutkan NAMA karakter secara konsisten dan tepat tanpa tertukar antar tokoh dan tanpa mengarang nama baru yang tidak ada di gambar/referensi.

2. ATURAN EMAS "NARASI ALUR MURNI" (DILARANG MENYEBUT PANEL/URUTAN):
   - Tag [GAMBAR X] HANYA berfungsi sebagai penanda pemisah di baris terpisah. Di dalam isi paragraf narasinya, DILARANG KERAS menyebut kata "panel", "gambar", "halaman", atau urutan angka!
   - DILARANG KERAS menulis pembuka transisi berbasis panel seperti: "Di panel pertama...", "Masuk ke panel kedua...", "Lanjut ke panel kelima...", "Menuju panel ketujuh...", "Panel keempat memperlihatkan...", "Di panel terakhir...", "Gambar pertama menunjukkan...", "Dalam gambar ini...", "Terlihat...", "Kamera menyorot...", "Sebagai penutup di panel...", atau "Adegan ini ditutup...".
   - Pendengar voice over tidak melihat komik/panelnya, jadi ceritakan LANGSUNG alur kejadian, aksi, reaksi, dan emosi karakter secara menyambung dari paragraf ke paragraf.
   - WAJIB menuliskan setiap tag dari daftar ini satu per satu tanpa ada yang terlewat atau digabung: ${headersListString}.

3. GAYA BAHASA & RASA KALIMAT VOICE OVER (NARRATIVE FLOW):
   - Pastikan setiap paragraf menyambung mulus dengan paragraf sebelumnya seperti satu alur cerita utuh yang dibacakan oleh storyteller, BUKAN kalimat-kalimat terpisah yang kaku.
   - Gunakan transisi cerita yang natural dan enak diucapkan ("Nah di sini...", "Dan ya...", "Dan ternyata...", "Namun saat...", "Begitu...", "Melihat hal itu...", "Tanpa ragu...", "Suasana kemudian berpindah ke..."), JANGAN memakai kata sambung yang berulang-ulang dan monoton di setiap paragraf.
   - Jaga susunan kalimat tetap rapi secara tata bahasa (subjek-predikat-objek jelas), tidak terpotong di tengah kalimat, dan enak didengar saat dibaca keras (Voice Over).
   - Fokus pada: Aksi/Situasi -> Reaksi/Emosi Karakter -> Konsekuensi ke adegan berikutnya.

4. DILARANG KERAS:
   - DILARANG menulis komentar meta tentang recap atau penonton (seperti "penonton pun...", "bahan meme", "recap kali ini").
   - DILARANG menulis kata/frasa penutup, kesimpulan, atau kalimat yang mengakhiri cerita (seperti "Kisah ini ditutup...", "Sebagai penutup...", "Itulah akhir...").
   - DILARANG menggunakan tanda baca khusus seperti (*), ("), (_), (~), atau backtick. Cukup huruf, angka, titik, dan koma.
   - DILARANG menyapa penonton ("halo guys", "simak terus").

CONTOH GAYA NARASI YANG DIHARAPKAN (IKUTI GAYA INI):
${effectiveExample}

Berikut adalah parameter konten tambahan:
1. Nada Bicara (Tone): ${toneDescriptions[tone] || "dramatic"}
2. Bahasa: ${langInstruction}
${customInstructions ? `3. Instruksi Tambahan Khusus dari Pengguna (Prioritas Tinggi): "${customInstructions}"` : ""}
${tone === "custom" && customStyleRef ? `4. REFERENSI GAYA NASKAH (WAJIB DIIKUTI):\n---\n${customStyleRef}\n---` : ""}
${cleanCharacterDetails ? `5. PENGINGAT PROFIL KARAKTER WAJIB:\n---\n${cleanCharacterDetails}\n---` : ""}
`;

    const buildImageParts = (targetImages: MangaImagePayload[]) => {
      const parts: any[] = [];
      targetImages.forEach((img, idx) => {
        let base64Data = img.base64 || "";
        let detectedMimeFromDataUri = "";
        const dataUriMatch = base64Data.match(/^data:([^;]+);base64,([\s\S]+)$/i);
        if (dataUriMatch) {
          detectedMimeFromDataUri = dataUriMatch[1].toLowerCase().trim();
          base64Data = dataUriMatch[2];
        } else if (base64Data.includes(";base64,")) {
          base64Data = base64Data.split(";base64,").pop() || "";
        }
        base64Data = base64Data.replace(/\s+/g, "").trim();
        if (!base64Data) return;

        const labelIndex = img.globalIndex !== undefined ? img.globalIndex : idx + 1;
        parts.push({
          text: `[Referensi Urutan #${labelIndex} | File: ${img.name} — Pakai tag pemisah [GAMBAR ${labelIndex}], lalu tulis narasi alur cerita langsung tanpa menyebut kata panel/gambar]`
        });

        let cleanMime = (detectedMimeFromDataUri || img.mimeType || "image/jpeg").toLowerCase().trim();
        if (cleanMime === "image/jpg") cleanMime = "image/jpeg";
        if (base64Data.startsWith("/9j/")) cleanMime = "image/jpeg";
        else if (base64Data.startsWith("iVBORw0KGgo")) cleanMime = "image/png";
        else if (base64Data.startsWith("UklGR")) cleanMime = "image/webp";
        else if (base64Data.startsWith("R0lGOD")) cleanMime = "image/gif";
        if (!cleanMime.startsWith("image/")) cleanMime = "image/jpeg";

        parts.push({
          inlineData: {
            mimeType: cleanMime,
            data: base64Data
          }
        });
      });
      return parts;
    };

    let endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(actualModel)}:generateContent`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
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

    const invokeProvider = async (
      partsToSend: any[]
    ): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> => {
      const isGemini4 = actualModel.startsWith("gemini-4");

      // Upload images to Kie.ai temporary CDN on demand for OpenAI/fileData routes
      let cachedUploadedUrls: Map<number, string> | null = null;
      const ensureKieUploadedUrls = async (): Promise<Map<number, string>> => {
        if (cachedUploadedUrls) return cachedUploadedUrls;
        const urlMap = new Map<number, string>();
        const uploadTasks = partsToSend.map(async (part, idx) => {
          if (!part?.inlineData?.data) return;
          const mime = part.inlineData.mimeType || "image/jpeg";
          const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const upResp = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                base64Data: `data:${mime};base64,${part.inlineData.data}`,
                uploadPath: "mangaroot/panels",
                fileName: `panel_${idx}_${Date.now()}.${ext}`
              }),
              signal: controller.signal
            });
            const upText = await upResp.text();
            const upJson = JSON.parse(upText);
            const downloadUrl =
              upJson?.data?.downloadUrl || upJson?.data?.fileUrl || upJson?.data?.url || "";
            if (upResp.ok && typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
              urlMap.set(idx, downloadUrl);
            }
          } catch (_) {
            // Fallback gracefully to inline Data URI
          } finally {
            clearTimeout(timer);
          }
        });
        await Promise.all(uploadTasks);
        cachedUploadedUrls = urlMap;
        return urlMap;
      };

      const buildOpenAIMessages = (parts: any[], uploadedUrls?: Map<number, string>) => [
        {
          role: "user",
          content: parts.map((part, idx) => {
            if (part.text) {
              return { type: "text", text: part.text };
            }
            if (part.inlineData) {
              const hostedUrl = uploadedUrls?.get(idx);
              return {
                type: "image_url",
                image_url: {
                  url: hostedUrl || `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                }
              };
            }
            return { type: "text", text: "" };
          })
        }
      ];

      const buildFileDataParts = (parts: any[], uploadedUrls: Map<number, string>) =>
        parts.map((part, idx) => {
          if (part.inlineData) {
            const hostedUrl = uploadedUrls.get(idx);
            if (hostedUrl) {
              return {
                fileData: {
                  mimeType: part.inlineData.mimeType || "image/jpeg",
                  fileUri: hostedUrl
                }
              };
            }
          }
          return part;
        });

      const mapKieError = (
        kieCodeRaw: unknown,
        kieMsgRaw: unknown
      ): { ok: false; status: number; error: string; transient: boolean } => {
        const kieCode = Number(kieCodeRaw) || 500;
        const kieMsg =
          typeof kieMsgRaw === "string" && kieMsgRaw.trim()
            ? kieMsgRaw.trim()
            : "Terjadi kesalahan pada server Kie.ai";

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
      const openAiKieSlug = actualModel.endsWith("-openai")
        ? actualModel
        : `${actualModel}-openai`;

      interface KieRouteDef {
        label: string;
        url: string;
        buildBody: () => Promise<any>;
      }

      const kieStreamRoute: KieRouteDef = {
        label: "kie-stream",
        url: `https://api.kie.ai/gemini/v1/models/${encodeURIComponent(nativeKieModel)}:streamGenerateContent`,
        buildBody: async () => ({
          stream: true,
          contents: [{ role: "user", parts: partsToSend }],
          generationConfig: {
            maxOutputTokens: 8192,
            ...(isGemini4 ? { thinkingConfig: { thinkingLevel: "LOW" } } : {})
          }
        })
      };
      const kieStreamFileDataRoute: KieRouteDef = {
        label: "kie-stream-filedata",
        url: `https://api.kie.ai/gemini/v1/models/${encodeURIComponent(nativeKieModel)}:streamGenerateContent`,
        buildBody: async () => {
          const urls = await ensureKieUploadedUrls();
          return {
            stream: true,
            contents: [{ role: "user", parts: buildFileDataParts(partsToSend, urls) }],
            generationConfig: {
              maxOutputTokens: 8192
            }
          };
        }
      };
      const kieOpenAiRoute: KieRouteDef = {
        label: "kie-openai",
        url: `https://api.kie.ai/${encodeURIComponent(openAiKieSlug)}/v1/chat/completions`,
        buildBody: async () => {
          const urls = await ensureKieUploadedUrls();
          return {
            model: nativeKieModel,
            messages: buildOpenAIMessages(partsToSend, urls),
            max_tokens: 8192,
            ...(isGemini4 ? { reasoning_effort: "low" } : {}),
            stream: false
          };
        }
      };
      const kieDirectOpenAiRoute: KieRouteDef = {
        label: "kie-direct-openai",
        url: `https://api.kie.ai/${encodeURIComponent(nativeKieModel)}/v1/chat/completions`,
        buildBody: async () => {
          const urls = await ensureKieUploadedUrls();
          return {
            model: nativeKieModel,
            messages: buildOpenAIMessages(partsToSend, urls),
            max_tokens: 8192,
            ...(isGemini4 ? { reasoning_effort: "low" } : {}),
            stream: false
          };
        }
      };
      const kieV1BetaRoute: KieRouteDef = {
        label: "kie-v1beta",
        url: `https://api.kie.ai/gemini/v1beta/models/${encodeURIComponent(nativeKieModel)}:generateContent`,
        buildBody: async () => ({
          contents: [{ role: "user", parts: partsToSend }],
          generationConfig: {
            maxOutputTokens: 8192
          }
        })
      };

      const kieRoutes: KieRouteDef[] = isKieAi
        ? actualModel.endsWith("-openai")
          ? [kieOpenAiRoute, kieStreamRoute, kieStreamFileDataRoute, kieDirectOpenAiRoute, kieV1BetaRoute]
          : [kieStreamRoute, kieOpenAiRoute, kieStreamFileDataRoute, kieV1BetaRoute, kieDirectOpenAiRoute]
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
        const targetBody = activeRoute ? await activeRoute.buildBody() : defaultRequestBody;

        if (
          activeRoute?.label === "kie-stream-filedata" &&
          serverAttempt < maxServerAttempts &&
          (!Array.isArray(targetBody?.contents?.[0]?.parts) ||
            !targetBody.contents[0].parts.some((p: any) => Boolean(p?.fileData)))
        ) {
          continue;
        }

        console.log(
          `Sending request to ${providerName} (Model: ${actualModel}${
            activeRoute ? `, Route: ${activeRoute.label}` : ""
          }, Attempt ${serverAttempt}/${maxServerAttempts})`
        );

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

          const isKieSchemaMismatch =
            isKieAi &&
            response.status === 400 &&
            /thinking|generationConfig|reasoning|unknown|unsupported|invalid/i.test(
              userFriendlyMsg || errorText
            );
          const isTransientStatus =
            [429, 500, 502, 503, 504].includes(response.status) ||
            (isKieAi && [404, 422].includes(response.status)) ||
            isKieSchemaMismatch;
          if (isTransientStatus && serverAttempt < maxServerAttempts) {
            if ([429, 500, 502, 503, 504].includes(response.status)) {
              recordFailure({
                ok: false,
                status: response.status >= 500 ? 503 : response.status,
                error: userFriendlyMsg
                  ? `${providerName} Error (${response.status}): ${userFriendlyMsg}`
                  : `Server ${providerName} sedang gangguan (${response.status}).`
              });
            }
            console.log(
              `Switching from ${activeRoute?.label || providerName} (HTTP ${response.status}) to next route in 800ms...`
            );
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          if (isKieAi && [404, 422].includes(response.status) && preferredFailure) {
            return preferredFailure;
          }

          if (
            isGoogleAI &&
            response.status === 400 &&
            (errorText.includes("API_KEY_INVALID") || errorText.includes("API key not valid"))
          ) {
            return {
              ok: false,
              status: 400,
              error:
                "API Key Google AI Studio tidak valid atau belum diaktifkan. Silakan cek & tes ulang key Anda di menu Pengaturan."
            };
          }
          if (response.status === 401) {
            return {
              ok: false,
              status: 401,
              error: `Autentikasi ${providerName} gagal (401): ${
                userFriendlyMsg || "API Key tidak valid atau kadaluarsa."
              }`
            };
          }
          if (response.status === 402) {
            return {
              ok: false,
              status: 402,
              error: `Saldo/Kredit ${providerName} habis (402): ${
                userFriendlyMsg || "Silakan periksa saldo/kuota akun Anda."
              }`
            };
          }
          if (response.status === 403) {
            return {
              ok: false,
              status: 403,
              error: `Akses ${providerName} ditolak (403): ${
                userFriendlyMsg || "Permission Denied"
              }. Pastikan API Key memiliki izin untuk model ${actualModel}.`
            };
          }
          if (response.status === 404) {
            return {
              ok: false,
              status: 404,
              error: `Model "${actualModel}" tidak ditemukan di ${providerName} (404). ${
                userFriendlyMsg ? `Detail: ${userFriendlyMsg}. ` : ""
              }Coba pilih model lain di menu Engine atau ketik nama model yang sesuai.`
            };
          }
          return {
            ok: false,
            status: response.status,
            error: userFriendlyMsg
              ? `${providerName} Error: ${userFriendlyMsg}`
              : `${providerName} Error (${response.status}): ${errorText.substring(0, 200)}`
          };
        }

        let extractedText = "";
        let sawThoughtOnly = false;
        let lastFinishReason = "";
        const rawResponseText = await response.text();

        const trackChunkDiagnostics = (obj: any) => {
          const fr = obj?.candidates?.[0]?.finishReason || obj?.choices?.[0]?.finish_reason;
          if (typeof fr === "string" && fr) lastFinishReason = fr;
          const parts = obj?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts) && parts.some((p: any) => p?.thought)) {
            sawThoughtOnly = true;
          }
        };

        if (isOpenRouter) {
          try {
            const json = JSON.parse(rawResponseText);
            if (json?.error?.message) {
              const errCode = Number(json.error.code) || 400;
              if ([429, 500, 502, 503, 504].includes(errCode) && serverAttempt < maxServerAttempts) {
                await new Promise((r) => setTimeout(r, serverAttempt * 1200));
                continue;
              }
              return {
                ok: false,
                status: errCode,
                error: `OpenRouter Error: ${json.error.message}`
              };
            }
            extractedText = extractAnyChunkText(json);
          } catch (_) {
            extractedText = "";
          }
        } else if (isKieAi) {
          let kieEmbeddedError: { ok: false; status: number; error: string; transient: boolean } | null =
            null;
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
                trackChunkDiagnostics(chunk);
                extractedText += extractAnyChunkText(chunk);
              }
            } else {
              trackChunkDiagnostics(json);
              extractedText = extractAnyChunkText(json);
            }
          } catch (_) {
            const lines = rawResponseText.split(/\r?\n/);
            let jsonBuffer = "";
            const processParsedJson = (json: any) => {
              if (json && !Array.isArray(json) && json.code && json.code !== 200) {
                kieEmbeddedError = mapKieError(json.code, json.msg || json.message);
                return false;
              }
              if (json && !Array.isArray(json) && json?.error?.message) {
                kieEmbeddedError = mapKieError(json.error.code || 500, json.error.message);
                return false;
              }
              if (Array.isArray(json)) {
                for (const c of json) {
                  if (c?.code && c.code !== 200) {
                    kieEmbeddedError = mapKieError(c.code, c.msg || c.message);
                    return false;
                  }
                  trackChunkDiagnostics(c);
                  extractedText += extractAnyChunkText(c);
                }
              } else {
                trackChunkDiagnostics(json);
                extractedText += extractAnyChunkText(json);
              }
              return true;
            };

            for (const rawLine of lines) {
              let line = rawLine.trim();
              if (!line) {
                jsonBuffer = "";
                continue;
              }
              if (
                line.startsWith("event:") ||
                line.startsWith("id:") ||
                line.startsWith("retry:") ||
                line.startsWith(":")
              ) {
                jsonBuffer = "";
                continue;
              }
              if (line.startsWith("data:")) {
                line = line.slice(5).trim();
              }
              if (!line || line === "[DONE]" || line === "[" || line === "]") {
                jsonBuffer = "";
                continue;
              }
              if (line.startsWith(",")) line = line.slice(1).trim();
              if (line.endsWith(",")) line = line.slice(0, -1).trim();

              const candidateStr = jsonBuffer ? `${jsonBuffer}\n${line}` : line;
              try {
                const json = JSON.parse(candidateStr);
                jsonBuffer = "";
                if (!processParsedJson(json)) break;
              } catch {
                // If line itself is valid standalone JSON, don't let stale buffer poison the stream
                if (jsonBuffer) {
                  try {
                    const standaloneJson = JSON.parse(line);
                    jsonBuffer = "";
                    if (!processParsedJson(standaloneJson)) break;
                    continue;
                  } catch {}
                }
                jsonBuffer = candidateStr.length < 32768 ? candidateStr : "";
              }
            }
          }

          if (kieEmbeddedError) {
            recordFailure({
              ok: false,
              status: kieEmbeddedError.status,
              error: kieEmbeddedError.error
            });
            if (kieEmbeddedError.transient && serverAttempt < maxServerAttempts) {
              console.log(
                `Kie.ai route ${activeRoute?.label} unavailable (${kieEmbeddedError.status}), trying fallback route (${
                  serverAttempt + 1
                }/${maxServerAttempts})...`
              );
              await new Promise((r) => setTimeout(r, 800));
              continue;
            }
            if ([404, 422].includes(kieEmbeddedError.status) && preferredFailure) {
              return preferredFailure;
            }
            return lastFailure;
          }
        } else {
          try {
            const data = JSON.parse(rawResponseText);
            if (data.candidates?.[0]?.finishReason === "SAFETY") {
              return {
                ok: false,
                status: 400,
                error:
                  "Gagal menghasilkan naskah: Konten diblokir oleh filter keamanan AI. Coba ubah instruksi atau gunakan gambar lain."
              };
            }
            extractedText = extractPartsText(data?.candidates?.[0]?.content?.parts);
          } catch (_) {
            extractedText = "";
          }
        }

        // Detect when Kie.ai native proxy dropped/failed to open images and model reported unreadable images
        const imageDecodeRefusalRegex =
          /(file\s+gambarnya\s+(?:gak|tidak)\s+bisa\s+(?:kebuka|dibuka)|gambar\s+(?:tidak|gak)\s+bisa\s+(?:dibuka|kebuka|terbaca|dilihat)|layarnya\s+kosong\s+melompong|tidak\s+ada\s+gambar\s+yang\s+(?:terlihat|masuk|terkirim)|cannot\s+(?:open|read|see)\s+the\s+image)/i;
        if (isKieAi && extractedText && imageDecodeRefusalRegex.test(extractedText) && serverAttempt < maxServerAttempts) {
          console.log(
            `Kie.ai route ${activeRoute?.label} reported unreadable image payload; failing over to next route with CDN upload (${
              serverAttempt + 1
            }/${maxServerAttempts})...`
          );
          recordFailure({
            ok: false,
            status: 502,
            error: `Rute ${activeRoute?.label} gagal membaca file gambar. Mencoba rute alternatif.`
          });
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        if (!extractedText || extractedText.trim() === "") {
          console.log(
            `[EMPTY RESPONSE] Provider=${providerName} Model=${actualModel} Route=${
              activeRoute?.label || "default"
            } FinishReason=${lastFinishReason || "none"} ThoughtOnly=${sawThoughtOnly} Snippet=${rawResponseText
              .replace(/\s+/g, " ")
              .slice(0, 220)}`
          );
          const detailReason = sawThoughtOnly
            ? "Model hanya menghasilkan proses berpikir internal tanpa teks output (coba ulang atau gunakan rute OpenAI)."
            : lastFinishReason
            ? `Status selesai: ${lastFinishReason}.`
            : "Respons kosong atau tidak valid.";
          const hint = `Pastikan gambar manga terbaca dengan jelas, model "${actualModel}" tersedia di ${providerName}, dan API Key aktif.`;
          recordFailure({
            ok: false,
            status: 500,
            error: `Gagal menghasilkan naskah dari model ${actualModel} (${providerName}): ${detailReason} ${hint}`
          });
          if (serverAttempt < maxServerAttempts) {
            await new Promise((r) => setTimeout(r, serverAttempt * 1000));
            continue;
          }
          return lastFailure;
        }

        return { ok: true, text: extractedText };
      }

      return preferredFailure || lastFailure;
    };

    const normalizeAndCleanScript = (rawText: string): string => {
      const normalized = rawText
        .replace(
          /\*\*\s*(\[\s*(?:GAMBAR|PANEL|HALAMAN|IMAGE)\s+[0-9\s,\-&dansampai\/]+\s*\])\s*\*\*[:]?/gi,
          "$1"
        )
        .replace(
          /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:GAMBAR|PANEL|HALAMAN|IMAGE)\s+([0-9]+(?:\s*(?:-|dan|sampai|s\/d|&|,)\s*[0-9]+)*)\s*(?:\*\*)?\s*[:]?/gi,
          "\n[GAMBAR $1]\n"
        )
        .replace(
          /\[\s*(?:GAMBAR|PANEL|HALAMAN|IMAGE)\s+([0-9]+(?:\s*(?:-|dan|sampai|s\/d|&|,)\s*[0-9]+)*)\s*\]\s*[:]?/gi,
          "\n[GAMBAR $1]\n"
        );

      const stripMetaPanelOpeners = (lineText: string): string => {
        let out = lineText.trim();
        const ordinalOrNum =
          "(?:ke-?\\s*\\d+|\\d+|pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kedelapan|kesembilan|kesepuluh|terakhir|berikutnya|selanjutnya|ini|tersebut)";
        const openerPatterns = [
          new RegExp(
            `^(?:sebagai\\s+penutup(?:\\s+(?:di|pada)\\s+(?:panel|gambar|halaman|adegan)\\s+${ordinalOrNum}(?:\\s+ini|\\s+tersebut)?)?|di\\s+akhir(?:\\s+(?:panel|gambar|halaman|adegan)\\s+${ordinalOrNum})?)\\s*,?\\s*`,
            "i"
          ),
          new RegExp(
            `^(?:masuk\\s+ke|lanjut\\s+ke|menuju\\s+ke|menuju|berlanjut\\s+ke|beralih\\s+ke|berpindah\\s+ke|sampai\\s+di|tiba\\s+di)\\s+(?:panel|gambar|halaman)\\s+${ordinalOrNum}(?:\\s+(?:ini|tersebut))?\\s*,?\\s*`,
            "i"
          ),
          new RegExp(
            `^(?:di|pada|dalam)\\s+(?:panel|gambar|halaman)\\s+${ordinalOrNum}(?:\\s+(?:ini|tersebut))?\\s*,?\\s*`,
            "i"
          ),
          new RegExp(
            `^(?:panel|gambar|halaman)\\s+${ordinalOrNum}(?:\\s+(?:ini|tersebut))?\\s+(?:memperlihatkan|menunjukkan|menampilkan|menggambarkan|menyorot|dibuka\\s+dengan|ditutup\\s+dengan)\\s+(?:momen\\s+(?:ketika|saat)\\s+|adegan\\s+(?:ketika|saat)\\s+|bagaimana\\s+)?`,
            "i"
          ),
          /^(?:adegan\s+ini\s+(?:dibuka|ditutup)\s+dengan|dalam\s+gambar\s+ini|di\s+sini\s+terlihat|panel\s+ini\s+(?:menunjukkan|memperlihatkan))\s*,?\s*/i,
          /^(?:in|on|at)\s+the\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|next|final|last|\d+(?:st|nd|rd|th)?)\s+(?:panel|image|page)\s*,?\s*/i,
          /^(?:moving\s+on\s+to|continuing\s+to|next\s+in)\s+(?:the\s+)?(?:next\s+|final\s+)?(?:panel|image|page)(?:\s+\d+)?\s*,?\s*/i
        ];

        for (let pass = 0; pass < 3; pass++) {
          let changed = false;
          for (const pat of openerPatterns) {
            const next = out.replace(pat, "").trim();
            if (next && next !== out) {
              out = next;
              changed = true;
            }
          }
          if (!changed) break;
        }

        // Also handle cases where "Cerita dimulai, di panel pertama ini, ..." slipped through
        out = out.replace(
          new RegExp(
            `^((?:cerita\\s+dimulai|cerita\\s+berlanjut|the\\s+story\\s+begins|the\\s+story\\s+continues))\\s*,?\\s*(?:(?:di|pada|dalam)\\s+(?:panel|gambar|halaman)\\s+${ordinalOrNum}(?:\\s+(?:ini|tersebut))?|(?:panel|gambar)\\s+${ordinalOrNum})\\s*,?\\s*`,
            "i"
          ),
          "$1, "
        );

        if (out.length > 0) {
          out = out.charAt(0).toUpperCase() + out.slice(1);
        }
        return out;
      };

      const cleanLines = normalized.split("\n").map((line) => {
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

        cleaned = stripMetaPanelOpeners(cleaned);

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
        matches.push({
          header: m[1].toUpperCase(),
          rawRange: m[2],
          index: m.index,
          nextIndex: headerRegex.lastIndex
        });
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
            nums.forEach((s) => {
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

        const alreadyHasNaturalAnikiOpening =
          tone === "aniki" &&
          !hasContext &&
          /^(?:ya,?\s*)?di awal cerita\b/i.test(originalLine);

        if (!cleanOriginal.startsWith(cleanPrefix) && !alreadyHasNaturalAnikiOpening) {
          const commonStarters =
            /^(di|pada|dalam|saat|ketika|tiba-tiba|tiba|suasana|karakter|dia|mereka|ia|sang|sebuah|seekor|muncul|terlihat|langkah|ekspresi|realitas|momen|sementara|ya|nah|dan|namun|begitu|setelah|sebelum|meski|walaupun|tanpa|melihat|setibanya|the|when|suddenly|as|at|in|on)\b/i;
          const shouldLowerFirst = commonStarters.test(originalLine);
          const textToAppend = shouldLowerFirst
            ? originalLine.charAt(0).toLowerCase() + originalLine.slice(1)
            : originalLine;
          lines[firstNarrativeLineIdx] = `${requiredPrefix}, ${textToAppend}`;
          return lines.join("\n");
        }
      }
      return textToFix;
    };

    const primaryResult = await invokeProvider([
      { text: promptText },
      ...buildImageParts(sortedImages)
    ]);

    if ("error" in primaryResult) {
      return {
        status: primaryResult.status,
        body: { error: primaryResult.error }
      };
    }

    let scriptText = enforceRequiredPrefix(normalizeAndCleanScript(primaryResult.text));
    let { coveredSet, matchCount } = extractSectionsByIndex(scriptText);
    let missingIndices = expectedIndices.filter((num) => !coveredSet.has(num));

    const needsRepair = isSuperConcise ? matchCount === 0 : missingIndices.length > 0;
    if (needsRepair) {
      const targetIndicesToRepair = missingIndices.length > 0 ? missingIndices : expectedIndices;
      const missingImages = sortedImages.filter((img, idx) => {
        const num = img.globalIndex !== undefined ? img.globalIndex : idx + 1;
        return targetIndicesToRepair.includes(num);
      });
      const missingTagsList = targetIndicesToRepair.map((n) => `[GAMBAR ${n}]`).join(", ");

      console.log(`[API REPAIR] Menjalankan pelengkapan otomatis untuk panel yang terlewat: ${missingTagsList}`);

      const repairPrompt = `
Anda sebelumnya telah menulis sebagian naskah recap manga berikut:
---
${scriptText}
---
NAMUN beberapa bagian belum dituliskan tag pemisahnya atau terpotong, yaitu:
${missingTagsList}

TUGAS ANDA SEKARANG (WAJIB):
Tuliskan narasi lanjutan HANYA untuk bagian yang terlewat di bawah ini secara berurutan dengan gaya bahasa (${
        toneDescriptions[tone] || tone
      }) dan ${langInstruction}.
- Wajib sertakan SEMUA tag berikut: ${missingTagsList}
- Setiap tag harus berada di baris sendiri diikuti narasinya pada baris baru (${
        isSuperConcise ? "1-2 kalimat ringkas per bagian" : "2-4 kalimat detail per bagian"
      }).
- DILARANG KERAS menyebut kata "panel", "gambar", atau urutan angka ("di panel keempat", "masuk ke panel", "sebagai penutup") di dalam isi narasi; langsung lanjutkan alur cerita murni.
- WAJIB sebutkan nama karakter secara akurat sesuai gambar, naskah di atas, dan referensi di bawah (JANGAN mengarang atau menukar nama).
- JANGAN mengulang bagian cerita yang sudah ada di atas.
- DILARANG menggunakan tanda baca (*), ("), (_), (~), atau backtick.
${cleanSeriesName ? `Judul Seri: ${cleanSeriesName}` : ""}
${lockedCharacterNames.length > 0 ? `Nama karakter terkunci: ${lockedCharacterNames.join(", ")}` : ""}
${cleanCharacterDetails ? `Referensi karakter:\n${cleanCharacterDetails}` : ""}
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
          const hasNewIndex = repBlock.indices.some((n) => !seenIndices.has(n));
          if (hasNewIndex) {
            mergedBlocks.push(repBlock);
            repBlock.indices.forEach((n) => seenIndices.add(n));
          }
        }

        if (mergedBlocks.length > 0) {
          mergedBlocks.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
          scriptText = enforceRequiredPrefix(
            mergedBlocks.map((b) => `${b.header}\n${b.body}`).join("\n\n")
          );
        } else {
          scriptText = enforceRequiredPrefix(`${scriptText}\n\n${repairedClean}`.trim());
        }

        const rechecked = extractSectionsByIndex(scriptText);
        coveredSet = rechecked.coveredSet;
        matchCount = rechecked.matchCount;
        missingIndices = expectedIndices.filter((num) => !coveredSet.has(num));
      }
    }

    if (isSuperConcise) {
      const regex = /\[?\s*GAMBAR\s+[\d,\s\-dan&]+\s*\]?/i;
      if (!regex.test(scriptText)) {
        return {
          status: 500,
          body: { error: "Hasil naskah dari AI tidak menyertakan penanda [GAMBAR] yang valid." }
        };
      }
    } else if (missingIndices.length > 0) {
      const missingHeaders = missingIndices.map((n) => `[GAMBAR ${n}]`);
      return {
        status: 500,
        body: {
          error: `Hasil naskah dari AI tidak lengkap. Gambar berikut terlewat atau terpotong: ${missingHeaders.join(", ")}.`
        }
      };
    }

    return {
      status: 200,
      body: { script: scriptText }
    };
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    return {
      status: 500,
      body: { error: error?.message || "Gagal memproses request AI. Pastikan API Key sudah valid." }
    };
  }
}

export async function generateRecapDirect(payload: RecapPayload): Promise<{ script: string }> {
  const result = await generateRecapWithProviders(payload);
  if (result.status >= 400 || !result.body.script) {
    throw new Error(result.body.error || "Gagal memproses naskah manga.");
  }
  return { script: result.body.script };
}
