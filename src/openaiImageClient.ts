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

async function parseImageResponse(response: Response): Promise<string> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur Azure OpenAI (${response.status}) : ${text || response.statusText}`);
  }
  const json = await response.json() as AzureImageResponse;
  if (json.error) {
    throw new Error(`Erreur Azure OpenAI : ${json.error.message || json.error.code || 'inconnue'}`);
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
  const endpoint = normalizeAzureUrl(rawEndpoint, 'edits');

  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('n', '1');
  fd.append('size', '1536x1024');
  fd.append('quality', 'high');
  images.forEach((dataUrl, idx) => {
    const { blob, ext } = dataUrlToBlob(dataUrl);
    fd.append('image', blob, `input-${idx}.${ext}`);
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: fd,
  });

  const rawDataUrl = await parseImageResponse(response);
  return fit16x9AndCompress(rawDataUrl);
}

/**
 * POST /images/generations — text-to-image pur (pas d'image en input).
 */
async function callImagesGenerations(prompt: string): Promise<string> {
  const { rawEndpoint, apiKey } = ensureCreds();
  const endpoint = normalizeAzureUrl(rawEndpoint, 'generations');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      n: 1,
      size: '1536x1024',
      quality: 'high',
      output_format: 'png',
    }),
  });

  const rawDataUrl = await parseImageResponse(response);
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
  const promises = Array.from({ length: count }, () =>
    callAzureOpenAI(modelImage, brandImage, prompt).catch((err) => {
      console.warn('Variante Azure échouée :', err);
      return null;
    })
  );
  const results = await Promise.all(promises);
  return results.filter((r): r is string => r !== null);
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
