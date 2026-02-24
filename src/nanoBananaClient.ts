import type { NanoBananaResponse } from './types';

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

  // Calcul des dimensions cibles
  const ratio = TARGET_HEIGHT / img.height;
  const targetWidth = Math.round(img.width * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = TARGET_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.drawImage(img, 0, 0, targetWidth, TARGET_HEIGHT);

  // Compression JPEG progressive pour rester < 5 Mo
  let quality = 0.92;
  let result = canvas.toDataURL('image/jpeg', quality);

  // Estimation taille réelle : base64 → ~75% de la longueur string
  while (result.length * 0.75 > MAX_BYTES && quality > 0.3) {
    quality -= 0.05;
    result = canvas.toDataURL('image/jpeg', quality);
  }

  return result;
}

/**
 * Appelle l'API Nano Banana et retourne une dataURL prête à afficher.
 */
export async function callNanoBanana(
  sourceImageBase64: string,
  prompt: string
): Promise<string> {
  const ENDPOINT = getEndpoint();
  const API_KEY = getApiKey();

  if (!ENDPOINT) {
    throw new Error('Endpoint non configuré. Renseignez-le dans les paramètres API ci-dessus ou dans .env.');
  }
  if (!API_KEY) {
    throw new Error('Clé API non configurée. Renseignez-la dans les paramètres API ci-dessus ou dans .env.');
  }

  const payload = {
    model: 'nano-banana-pro',
    prompt,
    image: sourceImageBase64,
  };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Erreur API (${response.status}) : ${text || response.statusText}`);
  }

  const data: NanoBananaResponse = await response.json();

  if (data.error) {
    throw new Error(`Erreur Nano Banana : ${data.error}`);
  }

  let dataUrl: string;

  if (data.image_base64) {
    // L'API renvoie du base64
    const prefix = data.image_base64.startsWith('data:') ? '' : 'data:image/jpeg;base64,';
    dataUrl = prefix + data.image_base64;
  } else if (data.image_url) {
    // L'API renvoie une URL publique — on la fetch en blob puis on convertit
    const imgResp = await fetch(data.image_url);
    if (!imgResp.ok) throw new Error('Impossible de télécharger l\'image générée.');
    const blob = await imgResp.blob();
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    throw new Error('Réponse API inattendue : aucune image reçue.');
  }

  // Post-traitement : redimensionner à 2056px de hauteur + compression < 5 Mo
  dataUrl = await resizeAndCompress(dataUrl);

  return dataUrl;
}
