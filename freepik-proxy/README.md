# Freepik Magnific Proxy

Proxy serverless (Vercel) pour l'upscale **Magnific Illusio** de l'app
**Store 3D Generator** (hébergée sur GitHub Pages).

L'API Freepik est server-to-server : appelée directement depuis le navigateur, le
preflight CORS échoue (« Failed to fetch »). Ce proxy garde la clé côté serveur,
relaie les requêtes et renvoie les bons en-têtes CORS.

## Variable d'environnement (obligatoire)

| Nom                                  | Valeur                               |
|---------------------------------------|--------------------------------------|
| `FREEPIK_API_KEY` (ou `freepik_api_key`) | Clé API Freepik (plan API — `FPSX…`) |

Le code accepte les deux casses ; `FREEPIK_API_KEY` reste le nom recommandé.

À définir dans **Vercel → Project → Settings → Environment Variables**
(scope *Production*), puis redéployer.

## Routes

- `POST /api/magnific` — crée un job d'upscale (corps JSON relayé à Freepik).
- `GET  /api/magnific?taskId=<id>` — interroge le statut du job.

Le proxy relaie le code HTTP et le corps de Freepik tels quels : une vraie erreur
métier (402 « plus de crédits », 429 « rate limit »…) remonte donc lisible côté client.

## Déploiement

```
vercel deploy --prod
```

## Limite

Le corps de requête Vercel est plafonné (~4,5 Mo). L'image est transmise en base64 ;
les variantes de l'app (< 3 Mo en JPEG) passent sans problème. Bien au-delà, l'upscale
échouerait avec un code 413.
