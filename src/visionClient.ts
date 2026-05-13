/**
 * Client Vision — analyse d'une image accessoire pour produire un brief textuel
 * exploitable par gpt-image lors de l'ajout sur l'avatar.
 *
 * Deux providers supportés en miroir des clients d'image gen :
 *  - Azure OpenAI Chat Completions (déploiement `gpt-5-2`)
 *  - Gemini 2.5 Flash (`gemini-2.5-flash:generateContent`)
 *
 * Le déploiement / modèle utilisé pour la Vision est dérivé automatiquement
 * de l'endpoint d'image gen configuré par l'utilisateur (même host, même clé).
 */

import { buildAccessoryAnalysisPrompt, type AccessoryDef } from './brands';

const AZURE_VISION_DEPLOYMENT = 'gpt-5-2';
const AZURE_VISION_API_VERSION = '2024-12-01-preview';
const GEMINI_VISION_MODEL = 'gemini-2.5-flash';

const FETCH_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 500;

async function fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const elapsed = Math.round(performance.now() - startedAt);
    console.log(`[Vision ${label}] ${res.status} en ${elapsed}ms`);
    return res;
  } catch (err) {
    const elapsed = Math.round(performance.now() - startedAt);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Vision (${label}) : timeout après ${FETCH_TIMEOUT_MS / 1000}s (elapsed=${elapsed}ms).`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extrait l'host Azure (https://xxx.cognitiveservices.azure.com) de l'endpoint
 * d'image gen, qui contient typiquement /openai/deployments/gpt-image-2/...
 */
function extractAzureHost(rawEndpoint: string): string {
  const match = rawEndpoint.match(/^(https?:\/\/[^/]+)/i);
  return match ? match[1] : '';
}

/**
 * Dérive l'URL Gemini Vision (text+image) à partir de l'endpoint d'image gen
 * (qui pointe vers gemini-2.5-flash-image). On ne change que le nom du modèle.
 */
function deriveGeminiVisionUrl(rawEndpoint: string): string {
  if (!rawEndpoint) return '';
  return rawEndpoint.replace(
    /models\/[\w.-]+:generateContent/,
    `models/${GEMINI_VISION_MODEL}:generateContent`
  );
}

/**
 * Analyse une image d'accessoire via Azure OpenAI Chat Completions (déploiement
 * gpt-5-2). Retourne le brief textuel attendu par buildAccessoryPrompt.
 */
export async function analyzeAccessoryWithAzure(
  imageDataUrl: string,
  accessory: AccessoryDef,
  rawEndpoint: string,
  apiKey: string
): Promise<string> {
  const host = extractAzureHost(rawEndpoint);
  if (!host) throw new Error(`Vision Azure : impossible d'extraire l'host de l'endpoint "${rawEndpoint}".`);
  if (!apiKey) throw new Error('Vision Azure : clé API non configurée.');

  const url = `${host}/openai/deployments/${AZURE_VISION_DEPLOYMENT}/chat/completions?api-version=${AZURE_VISION_API_VERSION}`;
  const body = JSON.stringify({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildAccessoryAnalysisPrompt(accessory) },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_completion_tokens: MAX_OUTPUT_TOKENS,
  });

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body,
    },
    `azure ${accessory.label}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vision Azure HTTP ${res.status} : ${text.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (json.error) {
    throw new Error(`Vision Azure : ${json.error.message || 'erreur inconnue'}`);
  }
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error('[Vision Azure] body inattendu :', json);
    throw new Error('Vision Azure : réponse vide (pas de choices[0].message.content).');
  }
  return content;
}

/**
 * Analyse une image d'accessoire via Gemini 2.5 Flash (multimodal text+vision).
 * Retourne le brief textuel attendu par buildAccessoryPrompt.
 */
export async function analyzeAccessoryWithGemini(
  imageDataUrl: string,
  accessory: AccessoryDef,
  rawEndpoint: string,
  apiKey: string
): Promise<string> {
  const url = deriveGeminiVisionUrl(rawEndpoint);
  if (!url) throw new Error('Vision Gemini : endpoint non configuré.');
  if (!apiKey) throw new Error('Vision Gemini : clé API non configurée.');

  const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error('Vision Gemini : data URL invalide.');
  const mimeType = match[1];
  const data = match[2];

  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}key=${apiKey}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: buildAccessoryAnalysisPrompt(accessory) },
          { inlineData: { mimeType, data } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'text/plain',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  });

  const res = await fetchWithTimeout(
    fullUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
    `gemini ${accessory.label}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vision Gemini HTTP ${res.status} : ${text.slice(0, 400)}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const candidates = json.candidates ?? [];
  for (const c of candidates) {
    const parts = c.content?.parts ?? [];
    for (const p of parts) {
      if (typeof p.text === 'string' && p.text.trim()) {
        return p.text.trim();
      }
    }
  }
  console.error('[Vision Gemini] body inattendu :', json);
  throw new Error('Vision Gemini : réponse sans texte.');
}

/**
 * Dispatcher selon le provider sélectionné. Encapsule les erreurs pour ne
 * jamais faire crasher la pipeline d'ajout d'accessoire : si l'analyse Vision
 * échoue, on renvoie une chaîne vide et le prompt fallback (sans brief) est
 * utilisé. L'utilisateur garde le résultat usuel + un warning console.
 */
export async function analyzeAccessorySafe(
  provider: 'azure' | 'gemini',
  imageDataUrl: string,
  accessory: AccessoryDef,
  config: { azureEndpoint: string; azureKey: string; geminiEndpoint: string; geminiKey: string }
): Promise<string> {
  try {
    if (provider === 'azure') {
      return await analyzeAccessoryWithAzure(
        imageDataUrl,
        accessory,
        config.azureEndpoint,
        config.azureKey
      );
    }
    return await analyzeAccessoryWithGemini(
      imageDataUrl,
      accessory,
      config.geminiEndpoint,
      config.geminiKey
    );
  } catch (err) {
    console.warn(
      `[Vision ${provider} ${accessory.label}] analyse échouée — fallback sans brief visuel :`,
      err
    );
    return '';
  }
}
