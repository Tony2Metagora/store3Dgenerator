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

const FETCH_TIMEOUT_MS = 300_000; // 5 min — gpt-image-2 quality=high peut prendre 90-180s,
// et 3 en parallèle peuvent se queue derrière le rate-limit (10 req/min sur Azure standard).

/**
 * Wrap fetch avec un AbortController qui kill la requête après FETCH_TIMEOUT_MS.
 * Évite le "load infini" si CORS bloque ou si le réseau pend.
 * Convertit aussi les erreurs CORS/network en message lisible.
 * Logge la durée totale en console pour diagnostic.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startedAt = performance.now();
  const opLabel = url.match(/\/images\/(\w+)/)?.[1] || 'fetch';
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const elapsed = Math.round(performance.now() - startedAt);
    console.log(`[Azure ${opLabel}] ${res.status} en ${elapsed}ms`);
    return res;
  } catch (err) {
    const elapsed = Math.round(performance.now() - startedAt);
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn(`[Azure ${opLabel}] timeout après ${elapsed}ms`);
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

/**
 * Mappe un code d'erreur / un body Azure brut vers un message utilisateur clair.
 * Couvre les cas vus en prod : modération, rate limit, taille image, version
 * d'API, content filter sur le prompt.
 */
function explainAzureError(status: number, body: string, code?: string): string {
  const lower = (body + ' ' + (code || '')).toLowerCase();

  // Content moderation — le plus fréquent sur /images/edits avec un portrait
  // réaliste (Azure ajoute des contrôles supplémentaires par rapport à /generations).
  if (
    status === 400 &&
    (lower.includes('moderation_blocked') ||
      lower.includes('content_policy') ||
      lower.includes('safety') ||
      lower.includes('content_filter'))
  ) {
    return (
      'Image refusée par le filtre de modération Azure OpenAI. ' +
      'Cause la plus courante : gpt-image-1/2 bloque automatiquement toute image identifiée comme portrait réaliste d\'une personne réelle (le filtre ne peut pas distinguer un avatar IA d\'une vraie photo). ' +
      'Solutions : ' +
      '(1) basculer sur Nano Banana (Gemini) pour le tab Accessoires — pas de filtre portrait ; ' +
      '(2) utiliser une image de départ avec un personnage moins photoréaliste (style 3D / cartoon) ; ' +
      '(3) reformuler l\'instruction complémentaire pour rester très neutre.'
    );
  }
  if (status === 429) {
    return (
      'Rate limit Azure OpenAI atteint (généralement 10 req/min sur tier standard). ' +
      'Attendez 60s avant de relancer, ou demandez à Azure d\'augmenter le quota de votre déploiement gpt-image-2.'
    );
  }
  if (status === 400 && lower.includes('size')) {
    return `Taille d'image non supportée par Azure (${body}). gpt-image-1/2 accepte uniquement 1024x1024, 1024x1536 ou 1536x1024.`;
  }
  if (status === 400 && lower.includes('extra_body')) {
    return `Erreur de schéma Azure (champ extra_body injecté). Mettez à jour votre client ou retirez les paramètres non-standard.`;
  }
  if (status === 404) {
    return `Endpoint non trouvé (404). L'api-version est peut-être trop ancienne — l'app retente automatiquement avec 2025-04-01-preview. Si l'erreur persiste, vérifiez le nom du déploiement dans l'URL.`;
  }
  if (status === 401 || status === 403) {
    return `Authentification refusée (${status}). Vérifiez votre clé Azure OpenAI dans les paramètres API.`;
  }
  // Fallback : message brut
  return `Erreur Azure OpenAI (${status}) : ${body || 'réponse vide'}`;
}

async function parseImageResponse(response: Response, urlForErr: string): Promise<string> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Tente de parser le body comme JSON pour extraire un code d'erreur structuré.
    let errCode: string | undefined;
    try {
      const parsed = JSON.parse(text) as { error?: { code?: string } };
      errCode = parsed.error?.code;
    } catch {
      // body non-JSON, on garde text brut
    }
    console.error(`[Azure parseImageResponse] HTTP ${response.status} — body :`, text);
    const friendly = explainAzureError(response.status, text, errCode);
    throw new Error(`${friendly} — URL : ${urlForErr}`);
  }
  const json = await response.json() as AzureImageResponse;
  if (json.error) {
    console.error('[Azure parseImageResponse] body.error :', json.error);
    const friendly = explainAzureError(
      200,
      json.error.message || '',
      json.error.code
    );
    throw new Error(`${friendly} — URL : ${urlForErr}`);
  }
  const item = json.data?.[0];
  if (!item?.b64_json) {
    console.error('[Azure parseImageResponse] data manquant :', json);
    throw new Error(
      `Aucune image dans la réponse Azure OpenAI. La requête a réussi (HTTP 200) mais data[0].b64_json est absent. Voir console F12 pour le payload exact.`
    );
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
  // Azure exige `image` pour 1 seule image, `image[]` pour plusieurs (sinon erreur
  // "Duplicate parameter: 'image'").
  const fieldName = images.length > 1 ? 'image[]' : 'image';
  const buildFormData = () => {
    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('n', '1');
    fd.append('size', '1536x1024');
    fd.append('quality', 'high');
    images.forEach((dataUrl, idx) => {
      const { blob, ext } = dataUrlToBlob(dataUrl);
      fd.append(fieldName, blob, `input-${idx}.${ext}`);
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

/**
 * Génère N variantes Azure en SÉQUENTIEL.
 *
 * Pourquoi pas en parallèle ? Azure rate-limit gpt-image-2 (~10 req/min sur tier
 * standard, et concurrency cap ~2) tue silencieusement les requêtes simultanées
 * → on n'obtenait que 1 image sur 3. Le séquentiel coûte ~3× plus de temps mur
 * (≈90-180s par variante, soit 3-9 min au total) mais garantit les N variantes.
 */
export async function callAzureOpenAIBatch(
  modelImage: string,
  brandImage: string,
  prompt: string,
  count = 3
): Promise<string[]> {
  const successes: string[] = [];
  const failures: unknown[] = [];
  for (let i = 0; i < count; i++) {
    try {
      console.log(`[callAzureOpenAIBatch] variante ${i + 1}/${count} en cours…`);
      const img = await callAzureOpenAI(modelImage, brandImage, prompt);
      successes.push(img);
    } catch (err) {
      console.warn(`[callAzureOpenAIBatch] variante ${i + 1}/${count} échouée :`, err);
      failures.push(err);
    }
  }
  if (successes.length === 0) {
    console.error('[callAzureOpenAIBatch] toutes les variantes ont échoué :', failures);
    const first = failures[0];
    const msg = first instanceof Error ? first.message : String(first || 'erreur inconnue');
    throw new Error(`Les ${count} variantes Azure ont échoué. Détail : ${msg}`);
  }
  if (successes.length < count) {
    console.warn(
      `[callAzureOpenAIBatch] ${count - successes.length} variante(s) échouée(s) sur ${count} — voir warnings ci-dessus`
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
