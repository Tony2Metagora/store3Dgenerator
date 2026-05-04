/**
 * Client Azure OpenAI — gpt-image-2 (compatible gpt-image-1).
 *
 * Couvre les 5 flux de l'app :
 *   - callAzureOpenAI            : modèle 3D + photo marque + prompt → 1 image (POST /images/edits, 2 images en input)
 *   - callAzureOpenAIBatch       : N variantes en parallèle (idem mais N appels)
 *   - generateMouleFromAzure     : prompt texte seul → 1 image moule (POST /images/generations, sans image en input)
 *   - editImageWithAzureOpenAI   : 1 image + prompt → 1 image (POST /images/edits)
 *   - refineImageWithAzureOpenAI : 1 image + REFINE_PROMPT → 1 image (POST /images/edits)
 *
 * Auth : header `Authorization: Bearer <KEY>` (cf. portail Azure → Get Started → curl).
 *
 * URL pastée par l'utilisateur : peu importe que ce soit /images/generations ou
 * /images/edits, on bascule sur le bon endpoint en interne via normalizeAzureUrl.
 */

import { fit16x9AndCompress, REFINE_PROMPT } from './nanoBananaClient';

let runtimeAzureEndpoint = '';
let runtimeAzureApiKey = '';

export function setAzureConfig(endpoint: string, apiKey: string) {
  runtimeAzureEndpoint = endpoint;
  runtimeAzureApiKey = apiKey;
}

function getEndpoint() { return runtimeAzureEndpoint || ''; }
function getApiKey() { return runtimeAzureApiKey || ''; }

const FETCH_TIMEOUT_MS = 120_000; // 2 min — gpt-image-2 quality=high prend 30-90s typique

/**
 * Wrap fetch avec un AbortController qui kill la requête après FETCH_TIMEOUT_MS.
 * Évite le "load infini" si CORS bloque ou si le réseau pend.
 * Convertit aussi les erreurs CORS/network en message lisible.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Timeout après ${FETCH_TIMEOUT_MS / 1000}s — l'API Azure n'a pas répondu.`);
    }
    if (err instanceof TypeError && /fetch/i.test(err.message)) {
      throw new Error(
        `Échec réseau (${err.message}). Cause probable : CORS bloqué par Azure depuis le navigateur. ` +
        `Vérifiez la console F12 (onglet Network) pour confirmer. Solution : configurer CORS sur la ressource Azure ` +
        `OU passer par un proxy Cloudflare Worker.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error("Format d'image invalide.");
  const mime = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  const ext = mime.split('/')[1] || 'png';
  return { blob: new Blob([buffer], { type: mime }), ext };
}

/**
 * Normalise l'URL collée par l'utilisateur vers /images/edits OU /images/generations.
 *
 * Le portail Azure affiche par défaut /images/generations. Pour les flux avec
 * input image on a besoin de /images/edits. Cette fonction accepte les 2 formes
 * (et même une URL sans /images/...) et retourne l'opération demandée.
 */
function normalizeAzureUrl(rawUrl: string, operation: 'edits' | 'generations'): string {
  const url = rawUrl.trim();
  if (!url) return url;
  if (/\/images\/(generations|edits|variations)\b/i.test(url)) {
    return url.replace(/\/images\/(generations|edits|variations)\b/i, `/images/${operation}`);
  }
  const [base, query] = url.split('?');
  const cleanBase = base.replace(/\/+$/, '');
  return query ? `${cleanBase}/images/${operation}?${query}` : `${cleanBase}/images/${operation}`;
}

/** Force une api-version donnée sur une URL Azure. Crée le param s'il manque. */
function swapApiVersion(url: string, version: string): string {
  if (/api-version=/i.test(url)) {
    return url.replace(/api-version=[^&]+/i, `api-version=${version}`);
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}api-version=${version}`;
}

/** Api-version preview connue pour supporter /images/edits sur gpt-image-1/2. */
const FALLBACK_API_VERSION = '2025-04-01-preview';

interface AzureImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string; code?: string };
}

function ensureCreds(): { rawEndpoint: string; apiKey: string } {
  const rawEndpoint = getEndpoint();
  const apiKey = getApiKey();
  if (!rawEndpoint) throw new Error("Endpoint Azure non configuré. Renseignez-le dans les paramètres API.");
  if (!apiKey) throw new Error("Clé Azure non configurée. Renseignez-la dans les paramètres API.");
  return { rawEndpoint, apiKey };
}

async function parseImageResponse(response: Response, urlForErr: string): Promise<string> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur Azure OpenAI (${response.status}) : ${text || response.statusText} — URL appelée : ${urlForErr}`);
  }
  const json = await response.json() as AzureImageResponse;
  if (json.error) {
    throw new Error(`Erreur Azure OpenAI : ${json.error.message || json.error.code || 'inconnue'} — URL appelée : ${urlForErr}`);
  }
  const item = json.data?.[0];
  if (!item?.b64_json) {
    throw new Error("Aucune image dans la réponse Azure OpenAI.");
  }
  return `data:image/png;base64,${item.b64_json}`;
}

/**
 * POST /images/edits — accepte 1 ou plusieurs images en input.
 * Format target : 16:9 paysage (1536x1024) puis fit16x9 final côté front.
 */
async function callImagesEdits(images: string[], prompt: string): Promise<string> {
  const { rawEndpoint, apiKey } = ensureCreds();
  const primaryUrl = normalizeAzureUrl(rawEndpoint, 'edits');

  // FormData factory : doit être recréée pour chaque tentative (le body est consommé par fetch).
  const buildFormData = () => {
    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('n', '1');
    fd.append('size', '1536x1024');
    fd.append('quality', 'high');
    images.forEach((dataUrl, idx) => {
      const { blob, ext } = dataUrlToBlob(dataUrl);
      fd.append('image', blob, `input-${idx}.${ext}`);
    });
    return fd;
  };

  let response = await fetchWithTimeout(primaryUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: buildFormData(),
  });

  let urlUsed = primaryUrl;

  // Retry avec api-version preview si 404 — gpt-image-2 ne supporte pas
  // toujours /edits avec l'api-version 2024-02-01 que le portail propose par défaut.
  if (response.status === 404 && !primaryUrl.includes(FALLBACK_API_VERSION)) {
    const fallbackUrl = swapApiVersion(primaryUrl, FALLBACK_API_VERSION);
    console.warn(
      `[Azure /edits] 404 avec api-version utilisateur, retry avec ${FALLBACK_API_VERSION}`,
      { primaryUrl, fallbackUrl }
    );
    response = await fetchWithTimeout(fallbackUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: buildFormData(),
    });
    urlUsed = fallbackUrl;
  }

  const rawDataUrl = await parseImageResponse(response, urlUsed);
  return fit16x9AndCompress(rawDataUrl);
}

/**
 * POST /images/generations — text-to-image pur (pas d'image en input).
 */
async function callImagesGenerations(prompt: string): Promise<string> {
  const { rawEndpoint, apiKey } = ensureCreds();
  const primaryUrl = normalizeAzureUrl(rawEndpoint, 'generations');

  const body = JSON.stringify({
    prompt,
    n: 1,
    size: '1536x1024',
    quality: 'high',
    output_format: 'png',
  });
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  let response = await fetchWithTimeout(primaryUrl, { method: 'POST', headers, body });
  let urlUsed = primaryUrl;

  // Même retry preview pour /generations au cas où.
  if (response.status === 404 && !primaryUrl.includes(FALLBACK_API_VERSION)) {
    const fallbackUrl = swapApiVersion(primaryUrl, FALLBACK_API_VERSION);
    console.warn(
      `[Azure /generations] 404 avec api-version utilisateur, retry avec ${FALLBACK_API_VERSION}`,
      { primaryUrl, fallbackUrl }
    );
    response = await fetchWithTimeout(fallbackUrl, { method: 'POST', headers, body });
    urlUsed = fallbackUrl;
  }

  const rawDataUrl = await parseImageResponse(response, urlUsed);
  return fit16x9AndCompress(rawDataUrl);
}

// ─── Public API ─────────────────────────────────────────

export async function callAzureOpenAI(
  modelImage: string,
  brandImage: string,
  prompt: string
): Promise<string> {
  return callImagesEdits([modelImage, brandImage], prompt);
}

export async function callAzureOpenAIBatch(
  modelImage: string,
  brandImage: string,
  prompt: string,
  count = 3
): Promise<string[]> {
  const settled = await Promise.all(
    Array.from({ length: count }, () =>
      callAzureOpenAI(modelImage, brandImage, prompt).then(
        (img) => ({ ok: true as const, img }),
        (err: unknown) => ({ ok: false as const, err })
      )
    )
  );
  const successes = settled.flatMap((r) => (r.ok ? [r.img] : []));
  if (successes.length === 0) {
    const failures = settled.flatMap((r) => (r.ok ? [] : [r.err]));
    console.error('[callAzureOpenAIBatch] toutes les variantes ont échoué :', failures);
    const first = failures[0];
    const msg = first instanceof Error ? first.message : String(first || 'erreur inconnue');
    throw new Error(`Les ${count} variantes Azure ont échoué. Détail : ${msg}`);
  }
  if (successes.length < count) {
    console.warn(
      `[callAzureOpenAIBatch] ${count - successes.length} variante(s) échouée(s) sur ${count}`,
      settled.filter((r) => !r.ok)
    );
  }
  return successes;
}

export async function generateMouleFromAzure(prompt: string): Promise<string> {
  return callImagesGenerations(prompt);
}

export async function editImageWithAzureOpenAI(
  imageDataUrl: string,
  editPrompt: string
): Promise<string> {
  return callImagesEdits([imageDataUrl], editPrompt);
}

export async function refineImageWithAzureOpenAI(imageDataUrl: string): Promise<string> {
  return callImagesEdits([imageDataUrl], REFINE_PROMPT);
}
