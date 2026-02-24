import { useState, useEffect, useCallback } from 'react';
import { buildBrandPrompt } from './brands';
import { callNanoBanana, setApiConfig } from './nanoBananaClient';
import './styles.css';

export default function App() {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('');
  const [marque, setMarque] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState<string>(() => localStorage.getItem('nb_endpoint') || '');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('nb_apikey') || '');
  const [showApiConfig, setShowApiConfig] = useState(false);

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

  // Lecture du fichier uploadé en base64
  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setSourceName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setSourceImage(reader.result as string);
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

  // Appel API
  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true);
    setError(null);
    setResultImage(null);
    try {
      const dataUrl = await callNanoBanana(sourceImage, prompt);
      setResultImage(dataUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de la génération.';
      setError(msg);
    } finally {
      setLoading(false);
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
        <p>Metagora × Nano Banana — Transformez votre boutique modèle en univers de marque</p>
      </header>

      {/* API Config (collapsible) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <button
          className="btn-toggle"
          onClick={() => setShowApiConfig(!showApiConfig)}
          type="button"
        >
          {showApiConfig ? '▾' : '▸'} Paramètres API Nano Banana
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
                placeholder="Votre clé API Nano Banana"
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
          {/* Étape 1 — Upload */}
          <div className="card">
            <h2><span className="step-num">1</span> Importer l'image modèle Metagora</h2>
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept="image/jpeg,image/png" onChange={handleFileChange} />
              <div className="icon">📷</div>
              <p>Glissez-déposez ou cliquez pour sélectionner<br />(JPEG / PNG)</p>
            </div>
            {sourceImage && (
              <div className="upload-preview">
                <img src={sourceImage} alt={sourceName} />
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
              <label>Prompt généré (lecture seule)</label>
              <textarea readOnly value={prompt} />
            </div>
          </div>

          {/* Étape 3 — Générer */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">3</span> Lancer Nano Banana</h2>
            <button
              className="btn-generate"
              disabled={!sourceImage || loading}
              onClick={handleGenerate}
            >
              {loading ? 'Génération en cours…' : 'Générer l\'image avec Nano Banana'}
            </button>
            {error && <div className="error-msg">{error}</div>}
          </div>
        </div>

        {/* ── Colonne droite : Preview ── */}
        <div className="card preview-panel">
          <h2>Résultat</h2>
          {loading ? (
            <div className="loading">
              <div className="spinner" />
              <p>Génération en cours… Cela peut prendre quelques secondes.</p>
            </div>
          ) : resultImage ? (
            <>
              <div className="preview-image">
                <img src={resultImage} alt="Boutique générée" />
              </div>
              <button className="btn-download" onClick={handleDownload}>
                Télécharger l'image
              </button>
            </>
          ) : (
            <div className="preview-placeholder">
              L'image générée apparaîtra ici après avoir cliqué sur « Générer »
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        Store 3D Generator — Metagora × Nano Banana
      </footer>
    </div>
  );
}
