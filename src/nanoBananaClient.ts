let runtimeEndpoint = '';
let runtimeApiKey = '';
let runtimeEditEndpoint = '';
let runtimeUpscaleUrl = '';

export function setApiConfig(endpoint: string, apiKey: string) {
  runtimeEndpoint = endpoint;
  runtimeApiKey = apiKey;
}

export function setEditEndpoint(url: string) {
  runtimeEditEndpoint = url;
}

export function setUpscaleUrl(url: string) {
  runtimeUpscaleUrl = url;
}

function getUpscaleUrl() {
  return runtimeUpscaleUrl || '';
}

function getEndpoint() {
  return runtimeEndpoint || import.meta.env.VITE_NANOBANANA_ENDPOINT || '';
}
function getEditEndpoint() {
  return runtimeEditEndpoint || '';
}
function getApiKey() {
  return runtimeApiKey || import.meta.env.VITE_NANOBANANA_API_KEY || '';
}

// Format cible : 16:9 paysage, hauteur 2056 imposée par le moteur 3D.
export const TARGET_HEIGHT = 2056;
export const TARGET_WIDTH = Math.round((TARGET_HEIGHT * 16) / 9); // 3656
const MAX_BYTES = 3 * 1024 * 1024; // 3 Mo

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de charger l\'image pour le post-traitement'));
    img.src = src;
  });
}

/**
 * Redimensionne + crop centré vers exactement TARGET_WIDTH × TARGET_HEIGHT (16:9).
 * Si l'image générée n'est pas 16:9, on scale-to-fill puis on center-crop.
 * Sortie JPEG compressée < 3 Mo.
 */
async function fit16x9AndCompress(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);

  const srcRatio = img.width / img.height;
  const targetRatio = TARGET_WIDTH / TARGET_HEIGHT;

  // Scale-to-fill : on prend la plus grande dimension nécessaire, on crop l'excédent.
  let drawW: number;
  let drawH: number;
  if (srcRatio > targetRatio) {
    // Source plus large → on fixe la hauteur, on crop latéralement
    drawH = TARGET_HEIGHT;
    drawW = drawH * srcRatio;
  } else {
    // Source plus étroite → on fixe la largeur, on crop en haut/bas
    drawW = TARGET_WIDTH;
    drawH = drawW / srcRatio;
  }
  const dx = (TARGET_WIDTH - drawW) / 2;
  const dy = (TARGET_HEIGHT - drawH) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = TARGET_WIDTH;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, drawW, drawH);

  let quality = 0.95;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length * 0.75 > MAX_BYTES && quality > 0.5) {
    quality -= 0.04;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

/**
 * Redimensionne vers exactement TARGET_HEIGHT en préservant le ratio source
 * (pas de crop). Utile pour une image alt uploadée manuellement.
 */
export async function resizeToTargetHeight(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const ratio = TARGET_HEIGHT / img.height;
  const targetWidth = Math.round(img.width * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(img, 0, 0, targetWidth, TARGET_HEIGHT);

  let quality = 0.95;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length * 0.75 > MAX_BYTES && quality > 0.5) {
    quality -= 0.04;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

export async function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(dataUrl);
  return { width: img.width, height: img.height };
}

export async function getImageHeight(dataUrl: string): Promise<number> {
  const img = await loadImage(dataUrl);
  return img.height;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error('Format d\'image invalide.');
  return { mimeType: match[1], data: match[2] };
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function callGemini(endpoint: string, apiKey: string, parts: GeminiPart[]): Promise<string> {
  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { aspectRatio: '16:9' },
    },
  };

  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${endpoint}${separator}key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur API (${response.status}) : ${text || response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const candidates = json.candidates ?? [];
  for (const candidate of candidates) {
    const candidateParts = candidate.content?.parts ?? [];
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        const imgMime = part.inlineData.mimeType || 'image/jpeg';
        return `data:${imgMime};base64,${part.inlineData.data}`;
      }
    }
  }
  throw new Error('Aucune image trouvée dans la réponse de l\'API.');
}

/**
 * Génère UNE image boutique à partir du moule + image marque + prompt.
 * Sortie au format 16:9 × 2056 de hauteur.
 */
export async function callNanoBanana(
  modelImageBase64: string,
  brandImageBase64: string,
  prompt: string
): Promise<string> {
  const ENDPOINT = getEndpoint();
  const API_KEY = getApiKey();
  if (!ENDPOINT) throw new Error('Endpoint non configuré. Renseignez-le dans les paramètres API.');
  if (!API_KEY) throw new Error('Clé API non configurée. Renseignez-la dans les paramètres API.');

  const model = parseDataUrl(modelImageBase64);
  const brand = parseDataUrl(brandImageBase64);

  const raw = await callGemini(ENDPOINT, API_KEY, [
    { text: prompt },
    { inlineData: { mimeType: model.mimeType, data: model.data } },
    { inlineData: { mimeType: brand.mimeType, data: brand.data } },
  ]);
  return fit16x9AndCompress(raw);
}

/**
 * Génère N variantes en parallèle. Chaque appel est indépendant ;
 * les échecs individuels sont silencieusement filtrés.
 */
export async function callNanoBananaBatch(
  modelImageBase64: string,
  brandImageBase64: string,
  prompt: string,
  count = 3
): Promise<string[]> {
  const promises = Array.from({ length: count }, () =>
    callNanoBanana(modelImageBase64, brandImageBase64, prompt).catch((err) => {
      console.warn('Variante échouée :', err);
      return null;
    })
  );
  const results = await Promise.all(promises);
  return results.filter((r): r is string => r !== null);
}

/**
 * Génère un moule (text-to-image pur, sans image d'entrée).
 * Utilisé par l'Atelier moules.
 */
export async function generateMouleFromPrompt(prompt: string): Promise<string> {
  const ENDPOINT = getEndpoint();
  const API_KEY = getApiKey();
  if (!ENDPOINT) throw new Error('Endpoint non configuré.');
  if (!API_KEY) throw new Error('Clé API non configurée.');

  const raw = await callGemini(ENDPOINT, API_KEY, [{ text: prompt }]);
  return fit16x9AndCompress(raw);
}

/**
 * Modifie une image existante via un prompt libre.
 */
export async function editImageWithGemini(
  imageDataUrl: string,
  editPrompt: string
): Promise<string> {
  const EDIT_ENDPOINT = getEditEndpoint();
  const API_KEY = getApiKey();
  if (!EDIT_ENDPOINT) throw new Error('Endpoint de modification non configuré.');
  if (!API_KEY) throw new Error('Clé API non configurée.');

  const img = parseDataUrl(imageDataUrl);
  const raw = await callGemini(EDIT_ENDPOINT, API_KEY, [
    { text: editPrompt },
    { inlineData: { mimeType: img.mimeType, data: img.data } },
  ]);
  return fit16x9AndCompress(raw);
}

/**
 * Upscale via Cloudflare Worker → Replicate Real-ESRGAN x4.
 * Conservé tel quel ; l'utilisateur peut l'appeler à la demande
 * après avoir sélectionné la variante qu'il préfère.
 */
export async function upscaleImage(imageDataUrl: string): Promise<string> {
  const UPSCALE_URL = getUpscaleUrl();
  if (!UPSCALE_URL) {
    throw new Error('URL du service d\'upscale non configurée.');
  }

  const createRes = await fetch(UPSCALE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, scale: 4 }),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Erreur upscale création (${createRes.status}) : ${text || createRes.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createJson: any = await createRes.json();
  if (createJson.error) throw new Error(`Erreur upscale : ${createJson.error}`);
  const predictionId = createJson.id;
  if (!predictionId) throw new Error('Aucun ID de prediction retourné par le service d\'upscale.');

  const baseUrl = UPSCALE_URL.replace(/\/+$/, '');
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`${baseUrl}/status?id=${predictionId}`);
    if (!pollRes.ok) {
      const text = await pollRes.text().catch(() => '');
      throw new Error(`Erreur polling upscale (${pollRes.status}) : ${text || pollRes.statusText}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pollJson: any = await pollRes.json();
    if (pollJson.error) throw new Error(`Erreur upscale : ${pollJson.error}`);
    if (pollJson.status === 'failed') {
      throw new Error(`Upscale échoué : ${pollJson.error || 'erreur inconnue'}`);
    }
    if (pollJson.status === 'succeeded' && pollJson.image) {
      return fit16x9AndCompress(pollJson.image);
    }
  }
  throw new Error('Upscale timeout : le traitement a pris plus de 3 minutes.');
}
