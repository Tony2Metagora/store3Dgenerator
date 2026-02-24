import { useState, useEffect, useCallback } from 'react';
import { buildBrandPrompt } from './brands';
import { callNanoBanana, setApiConfig, upscaleWithGemini } from './nanoBananaClient';
import './styles.css';

// Image modèle 3D Metagora — fixe, jamais modifiée par l'utilisateur
const MODEL_IMAGE_URL = import.meta.env.BASE_URL + 'model-store.jpg';

export default function App() {
  const [modelImageB64, setModelImageB64] = useState<string | null>(null);
  const [brandImage, setBrandImage] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>('');
  const [marque, setMarque] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState<string>(() => localStorage.getItem('nb_endpoint') || '');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('nb_apikey') || '');
  const [showApiConfig, setShowApiConfig] = useState(false);

  // Charger l'image modèle en base64 au démarrage
  useEffect(() => {
    fetch(MODEL_IMAGE_URL)
      .then((res) => res.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => setModelImageB64(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => setError('Impossible de charger l\'image modèle Metagora.'));
  }, []);

  // Persist & sync API config
  useEffect(() => {
    localStorage.setItem('nb_endpoint', apiEndpoint);
    localStorage.setItem('nb_apikey', apiKey);
    setApiConfig(apiEndpoint, apiKey);
  }, [apiEndpoint, apiKey]);

  // Met à jour le prompt dès que la marque ou la description change
  useEffect(() => {
    setPrompt(buildBrandPrompt(marque, description));
  }, [marque, description]);

  // Lecture du fichier uploadé (photo du magasin de la marque) en base64
  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setBrandName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setBrandImage(reader.result as string);
      setResultImage(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }, []);

  // Appel API avec les deux images
  const handleGenerate = async () => {
    if (!modelImageB64 || !brandImage) return;
    setLoading(true);
    setError(null);
    setResultImage(null);
    try {
      const dataUrl = await callNanoBanana(modelImageB64, brandImage, prompt);
      setResultImage(dataUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de la génération.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Upscale via Gemini
  const handleUpscale = async () => {
    if (!resultImage) return;
    setUpscaling(true);
    setError(null);
    try {
      const enhanced = await upscaleWithGemini(resultImage);
      setResultImage(enhanced);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de l\'upscale.';
      setError(msg);
    } finally {
      setUpscaling(false);
    }
  };

  // Téléchargement de l'image résultat
  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    const ext = resultImage.includes('image/png') ? 'png' : 'jpg';
    a.download = `store3d_${marque.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    a.click();
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>Store 3D <span>Generator</span></h1>
        <p>Metagora × Gemini — Transformez un magasin réel en boutique 3D de marque</p>
      </header>

      {/* API Config (collapsible) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <button
          className="btn-toggle"
          onClick={() => setShowApiConfig(!showApiConfig)}
          type="button"
        >
          {showApiConfig ? '▾' : '▸'} Paramètres API
          {apiKey ? ' ✓' : ''}
        </button>
        {showApiConfig && (
          <div style={{ marginTop: '0.75rem' }}>
            <div className="field">
              <label htmlFor="apiEndpoint">Endpoint API</label>
              <input
                id="apiEndpoint"
                type="url"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
              />
            </div>
            <div className="field">
              <label htmlFor="apiKey">Clé API</label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Votre clé API Gemini"
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Les clés sont sauvegardées dans le localStorage de votre navigateur.
            </p>
          </div>
        )}
      </div>

      <div className="layout">
        {/* ── Colonne gauche : Contrôles ── */}
        <div className="controls">
          {/* Image modèle Metagora (fixe) */}
          <div className="card">
            <h2>Image modèle 3D Metagora (référence fixe)</h2>
            <div className="upload-preview">
              <img src={MODEL_IMAGE_URL} alt="Boutique modèle Metagora" />
            </div>
          </div>

          {/* Étape 1 — Upload photo du magasin de la marque */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">1</span> Importer la photo du magasin de la marque</h2>
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept="image/jpeg,image/png" onChange={handleFileChange} />
              <div className="icon">📷</div>
              <p>Glissez-déposez ou cliquez pour sélectionner la photo du magasin réel<br />(JPEG / PNG)</p>
            </div>
            {brandImage && (
              <div className="upload-preview">
                <img src={brandImage} alt={brandName} />
              </div>
            )}
          </div>

          {/* Étape 2 — Marque / Description */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">2</span> Définir la marque et le produit</h2>

            <div className="field">
              <label htmlFor="marque">Marque</label>
              <input
                id="marque"
                type="text"
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                placeholder="Ex. : Ballot-Flurin, Chanel, Mariage Frères…"
              />
            </div>

            <div className="field">
              <label htmlFor="description">Description produit</label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex. : gamme d'apithérapie et produits dérivés du miel"
              />
            </div>

            <div className="field">
              <label>Prompt généré (modifiable)</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
          </div>

          {/* Étape 3 — Générer */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">3</span> Générer</h2>
            <button
              className="btn-generate"
              disabled={!brandImage || !modelImageB64 || loading}
              onClick={handleGenerate}
            >
              {loading ? 'Génération en cours…' : 'Générer l\'image'}
            </button>
            {error && <div className="error-msg">{error}</div>}
          </div>
        </div>

        {/* ── Colonne droite : Preview ── */}
        <div className="card preview-panel">
          <h2>Résultat</h2>
          {loading || upscaling ? (
            <div className="loading">
              <div className="spinner" />
              <p>{upscaling ? 'Amélioration en cours… Cela peut prendre quelques secondes.' : 'Génération en cours… Cela peut prendre quelques secondes.'}</p>
            </div>
          ) : resultImage ? (
            <>
              <div className="preview-image">
                <img src={resultImage} alt="Boutique générée" />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn-generate" onClick={handleUpscale} disabled={upscaling}>
                  🔍 Améliorer la qualité (AI Upscale)
                </button>
                <button className="btn-download" onClick={handleDownload}>
                  Télécharger l'image
                </button>
              </div>
            </>
          ) : (
            <div className="preview-placeholder">
              L'image générée apparaîtra ici après avoir cliqué sur « Générer »
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        Store 3D Generator — Metagora × Gemini
      </footer>
    </div>
  );
}
