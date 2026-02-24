let runtimeEndpoint = '';
let runtimeApiKey = '';

export function setApiConfig(endpoint: string, apiKey: string) {
  runtimeEndpoint = endpoint;
  runtimeApiKey = apiKey;
}

function getEndpoint() {
  return runtimeEndpoint || import.meta.env.VITE_NANOBANANA_ENDPOINT || '';
}
function getApiKey() {
  return runtimeApiKey || import.meta.env.VITE_NANOBANANA_API_KEY || '';
}

const TARGET_HEIGHT = 2056;
const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo

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
 *  1. Redimensionne l'image pour que la hauteur = 2056 px (ratio conservé)
 *  2. Compresse en JPEG pour rester sous 5 Mo
 */
async function resizeAndCompress(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);

  const ratio = TARGET_HEIGHT / img.height;
  const targetWidth = Math.round(img.width * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(img, 0, 0, targetWidth, TARGET_HEIGHT);

  let quality = 0.92;
  let result = canvas.toDataURL('image/jpeg', quality);

  while (result.length * 0.75 > MAX_BYTES && quality > 0.3) {
    quality -= 0.05;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  return result;
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
