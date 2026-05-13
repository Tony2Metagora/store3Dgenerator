# Store 3D Generator — Metagora

Outil de génération d'univers de boutique en image, avatar dans une boutique, et déclinaison d'accessoires depuis un produit source. Deux providers IA supportés :

- **Gemini 2.5 Flash Image** (Google `generativelanguage` API)
- **Azure OpenAI gpt-image-2** (provider par défaut)

Plus upscaling **Magnific Illusio** (Freepik API) en post-traitement optionnel sur chaque image générée.

## Démarrage rapide

```bash
npm install
npm run dev
```

Les clés API sont saisies directement dans l'interface (champ **Paramètres API**) et persistées en `localStorage`. Aucun `.env` requis pour un usage local — utile uniquement si tu veux pré-remplir l'endpoint Gemini par défaut.

| Clé localStorage | Description |
|---|---|
| `img_provider` | `gemini` ou `azure` |
| `nb_endpoint`, `nb_edit_endpoint`, `nb_apikey` | Endpoints + clé Gemini |
| `azure_endpoint`, `azure_apikey` | Endpoint + clé Azure OpenAI |
| `freepik_api_key` | Clé Freepik (Magnific Illusio upscale) |

## Workflows

- **Fond de boutique** : moule × image marque × prompt → 3 variantes 3656×2056 (16:9).
- **Avatar dans boutique** : avatar × fond × prompt → 3 variantes.
- **Accessoires** : déclinaison d'un produit source en bijou, foulard, sac, ceinture (étape par étape).

Post-traitement sur chaque variante validée :
- ✏️ Modifier (edit prompt libre)
- ✨ Améliorer qualité (re-render contrôle composition)
- 🔍 **Upscale Magnific x4** (Freepik API, ~30s-2min)
- 💾 Télécharger / 📤 Remplacer (upload alternative)

## Déploiement GitHub Pages

```bash
npm run deploy
```

Build Vite + push `dist/` sur la branche `gh-pages` via `gh-pages`. URL prod : `tony2metagora.github.io/store3Dgenerator/`.

## Arborescence src/

```
src/
├── main.tsx                 # entry Vite
├── App.tsx                  # UI principale (tabs, settings, preview)
├── brands.ts                # prompts builders (boutique, avatar, accessoires)
├── moules.ts                # catalogue des moules (bijouterie, etc.)
├── moulesStore.ts           # IndexedDB store des moules générés
├── nanoBananaClient.ts      # API Gemini + post-process (fit 16:9, upscale Magnific)
├── openaiImageClient.ts     # API Azure OpenAI gpt-image-2
└── styles.css
```
