let runtimeEndpoint = '';
let runtimeApiKey = '';
let runtimeEditEndpoint = '';

// Proxy Vercel pour l'API Freepik (clé côté serveur + CORS géré).
// Un appel direct à api.freepik.com depuis le navigateur échoue (« Failed to
// fetch ») : preflight CORS non géré. Code du proxy : dossier freepik-proxy/.
const MAGNIFIC_PROXY = 'https://freepik-proxy-theta.vercel.app/api/magnific';

export function setApiConfig(endpoint: string, apiKey: string) {
  runtimeEndpoint = endpoint;
  runtimeApiKey = apiKey;
}

export function setEditEndpoint(url: string) {
  runtimeEditEndpoint = url;
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

// Magnific (Freepik) plafonne la taille de SORTIE de l'upscale à 25,3 Mpx.
// On upscale en 2x → la sortie fait 4× les pixels de l'entrée, donc l'image
// envoyée doit rester sous ~6,25 Mpx (sinon HTTP 400 "exceeds maximum size").
const MAGNIFIC_MAX_OUTPUT_PX = 25_000_000;                 // marge sous les 25,3 Mpx
const MAGNIFIC_MAX_INPUT_PX = MAGNIFIC_MAX_OUTPUT_PX / 4;  // 2x → ×4 pixels

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de charger l\'image pour le post-traitement'));
    img.src = src;
  });
}

/**
 * Réduit une image pour qu'elle ne dépasse pas `maxPixels` (largeur × hauteur),
 * en préservant le ratio. No-op si elle est déjà sous la limite. Sortie JPEG
 * compressée < 3 Mo.
 */
async function downscaleToMaxPixels(dataUrl: string, maxPixels: number): Promise<string> {
  const img = await loadImage(dataUrl);
  const px = img.width * img.height;
  if (px <= maxPixels) return dataUrl;

  const ratio = Math.sqrt(maxPixels / px);
  const w = Math.floor(img.width * ratio);
  const h = Math.floor(img.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.95;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length * 0.75 > MAX_BYTES && quality > 0.5) {
    quality -= 0.04;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  return result;
}

/**
 * Redimensionne + crop centré vers exactement TARGET_WIDTH × TARGET_HEIGHT (16:9).
 * Si l'image générée n'est pas 16:9, on scale-to-fill puis on center-crop.
 * Sortie JPEG compressée < 3 Mo.
 */
export async function fit16x9AndCompress(dataUrl: string): Promise<string> {
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
  const settled = await Promise.all(
    Array.from({ length: count }, () =>
      callNanoBanana(modelImageBase64, brandImageBase64, prompt).then(
        (img) => ({ ok: true as const, img }),
        (err: unknown) => ({ ok: false as const, err })
      )
    )
  );
  const successes = settled.flatMap((r) => (r.ok ? [r.img] : []));
  if (successes.length === 0) {
    const failures = settled.flatMap((r) => (r.ok ? [] : [r.err]));
    console.error('[callNanoBananaBatch] toutes les variantes ont échoué :', failures);
    const first = failures[0];
    const msg = first instanceof Error ? first.message : String(first || 'erreur inconnue');
    throw new Error(`Les ${count} variantes Gemini ont échoué. Détail : ${msg}`);
  }
  if (successes.length < count) {
    console.warn(
      `[callNanoBananaBatch] ${count - successes.length} variante(s) échouée(s) sur ${count}`,
      settled.filter((r) => !r.ok)
    );
  }
  return successes;
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
 * Upscale via Magnific (API Freepik, moteur magnific_sparkle).
 *
 * Les appels API (création du job + polling) passent par le proxy Vercel
 * MAGNIFIC_PROXY : la clé Freepik reste côté serveur et le CORS est géré
 * (un appel direct à api.freepik.com depuis le navigateur échoue — preflight
 * CORS non géré, « Failed to fetch »). Le téléchargement final de l'image
 * upscalée se fait en direct depuis le CDN Freepik (fichier volumineux).
 *
 * Async : POST → polling toutes les 5s, max ~3min. Retourne le dataUrl upscalé.
 */
export async function upscaleWithMagnific(
  imageDataUrl: string,
  opts: { creativity?: number; resemblance?: number } = {}
): Promise<string> {
  if (!imageDataUrl.startsWith('data:image/')) throw new Error('Image invalide (data URL attendue).');

  // Magnific plafonne la sortie à 25,3 Mpx. On upscale en 2x (sortie = entrée
  // × 4) → on réduit d'abord l'image si elle dépasse ~6,25 Mpx (les variantes
  // de l'app font 3656×2056 ≈ 7,5 Mpx → léger downscale avant l'envoi).
  const prepared = await downscaleToMaxPixels(imageDataUrl, MAGNIFIC_MAX_INPUT_PX);
  const m = prepared.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/s);
  if (!m) throw new Error('Format data URL invalide');
  const imageB64 = m[1];
  const scale_factor = '2x';

  // 1. Création du job (via le proxy Vercel — pas de clé côté client)
  const createRes = await fetch(MAGNIFIC_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageB64,
      scale_factor,
      // engine : 'magnific_sparkle' = moteur ÉQUILIBRÉ — améliorations subtiles
      // qui préservent la structure et les matières organiques (peau, tissu)
      // sans sur-accentuer. L'ancien 'magnific_illusio' est conçu pour les
      // ILLUSTRATIONS et AJOUTE du détail imaginatif → il inventait de fausses
      // veines / un teint vieilli sur la peau des avatars.
      engine: 'magnific_sparkle',
      // optimized_for : profil de rendu (enum Freepik). 'films_n_photography'
      // pour du contenu photographique réaliste.
      optimized_for: 'films_n_photography',
      // Réglages CONSERVATEURS (échelle -10..10, 0 = neutre) : on veut un
      // upscale FIDÈLE, pas un re-render créatif. creativity négatif = ne rien
      // inventer ; hdr neutre = ne pas accentuer le micro-contraste de la peau ;
      // resemblance haut = coller au visage et à la peau d'origine.
      creativity: opts.creativity ?? -6,
      hdr: 0,
      resemblance: opts.resemblance ?? 9,
      fractality: 0,
      // Prompt court orienté fidélité (Freepik le recommande pour les images IA).
      prompt:
        'Ultra-realistic high-resolution photograph. Smooth, natural, youthful skin with even tone. Preserve the subject exactly as in the source — do not add wrinkles, visible veins, age spots or skin blemishes.',
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '');
    throw new Error(`Magnific create HTTP ${createRes.status}: ${err.slice(0, 250)}`);
  }
  const created = await createRes.json() as { data?: { task_id?: string } };
  const taskId = created?.data?.task_id;
  if (!taskId) throw new Error('Magnific : task_id manquant');

  // 2. Polling (max ~3min) — via le proxy
  const maxAttempts = 36; // 36 × 5s = 180s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${MAGNIFIC_PROXY}?taskId=${encodeURIComponent(taskId)}`);
    if (!pollRes.ok) continue;
    const json = await pollRes.json() as { data?: { status?: string; generated?: string[]; error?: string } };
    const data = json?.data;
    const status = String(data?.status || '').toUpperCase();
    if (status === 'FAILED') throw new Error('Magnific échoué : ' + (data?.error || 'erreur inconnue'));
    if (status === 'COMPLETED') {
      const outUrl = data?.generated?.[0];
      if (!outUrl) throw new Error('Magnific : pas d\'image générée');
      // Téléchargement direct de l'image upscalée depuis le CDN Freepik,
      // puis conversion en data URL pour rester compatible avec le pipeline.
      let blob: Blob;
      try {
        const imgRes = await fetch(outUrl);
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
        blob = await imgRes.blob();
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        throw new Error(
          'Image upscalée générée, mais son téléchargement depuis le CDN Freepik a '
          + `échoué (probable blocage CORS du CDN). Détail : ${detail}`
        );
      }
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
    // sinon : CREATED / IN_PROGRESS → on continue
  }
  throw new Error('Magnific : timeout (>3min) — réessaie ou vérifie le quota Freepik.');
}

