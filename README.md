# Store 3D Generator — Metagora × Nano Banana

Outil en ligne pour transformer une image de boutique « moule Metagora » en univers de marque via l'API Nano Banana.

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Copier le fichier d'environnement et renseigner vos clés
cp .env.example .env
# Éditer .env → mettre votre endpoint et clé API Nano Banana

# 3. Lancer le serveur de développement
npm run dev
```

## Configuration

| Variable | Description |
|---|---|
| `VITE_NANOBANANA_ENDPOINT` | URL de l'API Nano Banana |
| `VITE_NANOBANANA_API_KEY` | Clé API Nano Banana |

## Déploiement GitHub Pages

Le déploiement est automatique via GitHub Actions à chaque push sur `main`.

**Note :** Les variables d'environnement (clé API) ne sont **pas** incluses dans le build GitHub Pages par défaut. Pour un usage en production, vous pouvez :
- Ajouter les secrets dans **Settings > Secrets > Actions** de votre repo GitHub
- Ou saisir la clé API directement dans l'interface (champ prévu à cet effet)

## Arborescence

```
store3Dgenerator/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example
├── .gitignore
├── .github/workflows/deploy.yml
├── public/
│   └── favicon.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── brands.ts
    ├── nanoBananaClient.ts
    ├── types.ts
    ├── styles.css
    └── vite-env.d.ts
```
