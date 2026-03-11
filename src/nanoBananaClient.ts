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

const TARGET_HEIGHT = 2056;
const MAX_BYTES = 3 * 1024 * 1024; // 3 Mo

/**
 * Charge une dataURL dans un HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de charger l\'image pour le post-traitement'));
    img.src = src;
  });
}

/**
 * Post-traitement côté front :
 *  1. Redimensionne l'image pour obtenir exactement TARGET_HEIGHT px de hauteur
 *  2. Compresse en JPEG pour rester sous 3 Mo
 */
async function resizeAndCompress(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);

  let targetWidth = img.width;
  let targetHeight = img.height;

  // Forcer exactement TARGET_HEIGHT (up ou down)
  if (img.height !== TARGET_HEIGHT) {
    const ratio = TARGET_HEIGHT / img.height;
    targetWidth = Math.round(img.width * ratio);
    targetHeight = TARGET_HEIGHT;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  let quality = 0.99;
  let result = canvas.toDataURL('image/jpeg', quality);

  while (result.length * 0.75 > MAX_BYTES && quality > 0.5) {
    quality -= 0.02;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  return result;
}

/**
 * Redimensionne une image à exactement TARGET_HEIGHT px de hauteur (en gardant le ratio).
 * Utilisé pour normaliser les images uploadées manuellement.
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

  let quality = 0.99;
  let result = canvas.toDataURL('image/jpeg', quality);

  while (result.length * 0.75 > MAX_BYTES && quality > 0.5) {
    quality -= 0.02;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  return result;
}

/**
 * Retourne la hauteur d'une image à partir de sa dataURL.
 */
export async function getImageHeight(dataUrl: string): Promise<number> {
  const img = await loadImage(dataUrl);
  return img.height;
}

/**
 * Extrait le base64 pur et le mimeType d'une dataURL.
 * "data:image/jpeg;base64,/9j/4A..." → { mimeType: "image/jpeg", data: "/9j/4A..." }
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) throw new Error('Format d\'image invalide.');
  return { mimeType: match[1], data: match[2] };
}

/**
 * Appelle l'API Gemini (generateContent) et retourne une dataURL prête à afficher.
 * L'authentification se fait via ?key=API_KEY dans l'URL.
 */
export async function callNanoBanana(
  modelImageBase64: string,
  brandImageBase64: string,
  prompt: string
): Promise<string> {
  const ENDPOINT = getEndpoint();
  const API_KEY = getApiKey();

  if (!ENDPOINT) {
    throw new Error('Endpoint non configuré. Renseignez-le dans les paramètres API ci-dessus.');
  }
  if (!API_KEY) {
    throw new Error('Clé API non configurée. Renseignez-la dans les paramètres API ci-dessus.');
  }

  // Extraire le base64 pur des deux images
  const model = parseDataUrl(modelImageBase64);
  const brand = parseDataUrl(brandImageBase64);

  // Payload Gemini generateContent — prompt + image modèle + image marque
  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: model.mimeType,
              data: model.data,
            },
          },
          {
            inlineData: {
              mimeType: brand.mimeType,
              data: brand.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  // Ajout de ?key=... à l'URL
  const separator = ENDPOINT.includes('?') ? '&' : '?';
  const url = `${ENDPOINT}${separator}key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur API (${response.status}) : ${text || response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  // Parcourir la réponse Gemini pour trouver la partie image
  const candidates = json.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const imgMime = part.inlineData.mimeType || 'image/jpeg';
        let dataUrl = `data:${imgMime};base64,${part.inlineData.data}`;
        // Post-traitement : redimensionner à 2056px de hauteur + compression < 5 Mo
        dataUrl = await resizeAndCompress(dataUrl);
        return dataUrl;
      }
    }
  }

  throw new Error('Aucune image trouvée dans la réponse de l\'API. Vérifiez que le modèle supporte la génération d\'images.');
}

/**
 * Modifie une image existante via l'API Gemini (endpoint dédié modification).
 * Envoie l'image + un prompt texte libre → retourne l'image modifiée.
 */
export async function editImageWithGemini(
  imageDataUrl: string,
  editPrompt: string
): Promise<string> {
  const EDIT_ENDPOINT = getEditEndpoint();
  const API_KEY = getApiKey();

  if (!EDIT_ENDPOINT) {
    throw new Error('Endpoint de modification non configuré. Renseignez-le dans les paramètres API.');
  }
  if (!API_KEY) {
    throw new Error('Clé API non configurée. Renseignez-la dans les paramètres API.');
  }

  const img = parseDataUrl(imageDataUrl);

  const payload = {
    contents: [
      {
        parts: [
          { text: editPrompt },
          {
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
    },
  };

  const separator = EDIT_ENDPOINT.includes('?') ? '&' : '?';
  const url = `${EDIT_ENDPOINT}${separator}key=${API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur API modification (${response.status}) : ${text || response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  const candidates = json.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const imgMime = part.inlineData.mimeType || 'image/jpeg';
        let dataUrl = `data:${imgMime};base64,${part.inlineData.data}`;
        dataUrl = await resizeAndCompress(dataUrl);
        return dataUrl;
      }
    }
  }

  throw new Error('Aucune image trouvée dans la réponse de modification.');
}

/**
 * Upscale une image via le proxy Cloudflare Worker → Replicate Real-ESRGAN (x4).
 * Étape 1 : POST / → upload + créer la prediction → retourne { id }
 * Étape 2 : Poll GET /status?id=xxx toutes les 3s jusqu'à succeeded/failed
 */
export async function upscaleImage(imageDataUrl: string): Promise<string> {
  const UPSCALE_URL = getUpscaleUrl();

  if (!UPSCALE_URL) {
    throw new Error('URL du service d\'upscale non configurée. Renseignez-la dans les paramètres API ci-dessus.');
  }

  // Étape 1 — Créer la prediction
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

  if (createJson.error) {
    throw new Error(`Erreur upscale : ${createJson.error}`);
  }

  const predictionId = createJson.id;
  if (!predictionId) {
    throw new Error('Aucun ID de prediction retourné par le service d\'upscale.');
  }

  // Étape 2 — Polling jusqu'à complétion (max 3 min)
  const baseUrl = UPSCALE_URL.replace(/\/+$/, '');
  const maxAttempts = 60; // 60 × 3s = 3 min
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await fetch(`${baseUrl}/status?id=${predictionId}`);

    if (!pollRes.ok) {
      const text = await pollRes.text().catch(() => '');
      throw new Error(`Erreur polling upscale (${pollRes.status}) : ${text || pollRes.statusText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pollJson: any = await pollRes.json();

    if (pollJson.error) {
      throw new Error(`Erreur upscale : ${pollJson.error}`);
    }

    if (pollJson.status === 'failed') {
      throw new Error(`Upscale échoué : ${pollJson.error || 'erreur inconnue'}`);
    }

    if (pollJson.status === 'succeeded' && pollJson.image) {
      // Compresser l'image upscalée (PNG ~21Mo → JPEG <5Mo)
      return await resizeAndCompress(pollJson.image);
    }

    // Sinon status = starting/processing → on continue le polling
  }

  throw new Error('Upscale timeout : le traitement a pris plus de 3 minutes.');
}
