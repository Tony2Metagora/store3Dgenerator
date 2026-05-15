// Proxy serverless Vercel — upscale Magnific Illusio (API Freepik).
//
// Pourquoi : api.freepik.com est une API server-to-server. Appelée directement
// depuis le navigateur, le preflight CORS échoue → « Failed to fetch ». Ce proxy :
//   - garde la clé Freepik côté serveur (variable d'env FREEPIK_API_KEY),
//   - renvoie les bons en-têtes CORS pour l'app GitHub Pages,
//   - relaie le code HTTP + le corps de Freepik tels quels (les vraies erreurs
//     — ex. 402 « plus de crédits » — remontent enfin jusqu'au client).
//
// Routes (toutes sur /api/magnific) :
//   POST /api/magnific            → crée le job d'upscale (corps JSON relayé à Freepik)
//   GET  /api/magnific?taskId=ID  → interroge le statut du job
//
// Variable d'environnement REQUISE : FREEPIK_API_KEY (ou freepik_api_key — les
// deux casses sont acceptées).

const FREEPIK_UPSCALER = 'https://api.freepik.com/v1/ai/image-upscaler';

// Origines autorisées à appeler le proxy depuis un navigateur (prod + dev local).
const ALLOWED_ORIGINS = [
  'https://tony2metagora.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

function applyCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader(
    'Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req, res) {
  applyCors(req, res);

  // Préflight CORS.
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Nom de variable tolérant à la casse : FREEPIK_API_KEY (canonique) OU
  // freepik_api_key (casse historique réutilisée depuis l'ancienne clé
  // localStorage). Les variables d'env Vercel sont sensibles à la casse.
  const apiKey = process.env.FREEPIK_API_KEY || process.env.freepik_api_key;
  if (!apiKey) {
    res.status(500).json({
      error: 'Clé Freepik absente : ajoutez la variable FREEPIK_API_KEY (ou freepik_api_key) dans Vercel → Settings → Environment Variables (scope Production), puis redéployez.',
    });
    return;
  }

  try {
    let fpRes;

    if (req.method === 'POST') {
      // Création du job — on relaie le corps JSON du client tel quel à Freepik.
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      fpRes = await fetch(FREEPIK_UPSCALER, {
        method: 'POST',
        headers: { 'x-freepik-api-key': apiKey, 'Content-Type': 'application/json' },
        body,
      });
    } else if (req.method === 'GET') {
      // Polling du statut d'un job existant.
      const taskId = req.query.taskId;
      if (!taskId) {
        res.status(400).json({ error: 'Paramètre taskId manquant.' });
        return;
      }
      fpRes = await fetch(`${FREEPIK_UPSCALER}/${encodeURIComponent(taskId)}`, {
        headers: { 'x-freepik-api-key': apiKey },
      });
    } else {
      res.status(405).json({ error: `Méthode ${req.method} non supportée.` });
      return;
    }

    // Relais transparent : même code HTTP et même corps que Freepik, afin que
    // les erreurs métier (402, 429, etc.) soient lisibles côté client.
    const text = await fpRes.text();
    res.setHeader('Content-Type', fpRes.headers.get('content-type') || 'application/json');
    res.status(fpRes.status).send(text);
  } catch (err) {
    res.status(502).json({
      error: 'Proxy : échec de la requête vers Freepik — ' + (err && err.message ? err.message : String(err)),
    });
  }
}
