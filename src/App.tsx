import { useState, useEffect, useCallback, useRef } from 'react';
import { buildBrandPrompt } from './brands';
import {
  callNanoBanana,
  setApiConfig,
  setEditEndpoint,
  setUpscaleUrl,
  upscaleImage,
  editImageWithGemini,
  resizeToTargetHeight,
  getImageHeight,
} from './nanoBananaClient';
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
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState<string>(() => localStorage.getItem('nb_endpoint') || '');
  const [editEndpointState, setEditEndpointState] = useState<string>(() => localStorage.getItem('nb_edit_endpoint') || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('nb_apikey') || '');
  const [upscaleUrl, setUpscaleUrlState] = useState<string>(() => localStorage.getItem('nb_upscale_url') || 'https://upscale-worker.metagoraup.workers.dev');
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [altImageHeight, setAltImageHeight] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const altFileInputRef = useRef<HTMLInputElement>(null);

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
    localStorage.setItem('nb_edit_endpoint', editEndpointState);
    localStorage.setItem('nb_upscale_url', upscaleUrl);
    setApiConfig(apiEndpoint, apiKey);
    setEditEndpoint(editEndpointState);
    setUpscaleUrl(upscaleUrl);
  }, [apiEndpoint, apiKey, editEndpointState, upscaleUrl]);

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
      setResultError(null);
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

  // Appel API avec les deux images (génération)
  const handleGenerate = async () => {
    if (!modelImageB64 || !brandImage) return;
    setLoading(true);
    setError(null);
    setResultError(null);
    setResultImage(null);
    setAltImageHeight(null);
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

  // Modification de l'image via prompt libre (API 2)
  const handleEdit = async () => {
    if (!resultImage || !editPrompt.trim()) return;
    setEditing(true);
    setResultError(null);
    try {
      const modified = await editImageWithGemini(resultImage, editPrompt.trim());
      setResultImage(modified);
      setAltImageHeight(null);
      setEditPrompt('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de la modification.';
      setResultError(msg);
    } finally {
      setEditing(false);
    }
  };

  // Upscale via Cloudflare Worker + Replicate Real-ESRGAN
  const handleUpscale = async () => {
    if (!resultImage) return;
    setUpscaling(true);
    setResultError(null);
    try {
      const enhanced = await upscaleImage(resultImage);
      setResultImage(enhanced);
      setAltImageHeight(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue lors de l\'upscale.';
      setResultError(msg);
    } finally {
      setUpscaling(false);
    }
  };

  // Upload d'une image alternative
  const handleAltUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setResultImage(dataUrl);
      setResultError(null);
      const h = await getImageHeight(dataUrl);
      setAltImageHeight(h);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-uploaded
    e.target.value = '';
  };

  // Redimensionner l'image alternative à 2056px
  const handleResizeAlt = async () => {
    if (!resultImage) return;
    setResizing(true);
    setResultError(null);
    try {
      const resized = await resizeToTargetHeight(resultImage);
      setResultImage(resized);
      const h = await getImageHeight(resized);
      setAltImageHeight(h);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du redimensionnement.';
      setResultError(msg);
    } finally {
      setResizing(false);
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

  const isBusy = upscaling || editing || resizing;

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
              <label htmlFor="apiEndpoint">Endpoint API (Génération)</label>
              <input
                id="apiEndpoint"
                type="url"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                placeholder="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
              />
            </div>
            <div className="field">
              <label htmlFor="editEndpoint">Endpoint API (Modification)</label>
              <input
                id="editEndpoint"
                type="url"
                value={editEndpointState}
                onChange={(e) => setEditEndpointState(e.target.value)}
                placeholder="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
              />
            </div>
            <div className="field">
              <label htmlFor="apiKey">Clé API (partagée génération + modification)</label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Votre clé API Gemini"
              />
            </div>
            <div className="field" style={{ marginTop: '1rem' }}>
              <label htmlFor="upscaleUrl">URL du service d'upscale (Cloudflare Worker)</label>
              <input
                id="upscaleUrl"
                type="url"
                value={upscaleUrl}
                onChange={(e) => setUpscaleUrlState(e.target.value)}
                placeholder="https://upscale-worker.votre-domaine.workers.dev"
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

        {/* ── Colonne droite : Preview + Actions ── */}
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

              {/* Info hauteur si image alternative uploadée */}
              {altImageHeight !== null && (
                <div className="info-msg" style={{ marginTop: '0.75rem' }}>
                  Hauteur actuelle : <strong>{altImageHeight}px</strong>
                  {altImageHeight !== 2056 && (
                    <>
                      {' '} (attendu : 2056px)
                      <button
                        className="btn-inline"
                        onClick={handleResizeAlt}
                        disabled={resizing}
                      >
                        {resizing ? '⏳ Redimensionnement…' : '↕ Redimensionner à 2056px'}
                      </button>
                    </>
                  )}
                  {altImageHeight === 2056 && <> ✓ Format correct</>}
                </div>
              )}

              {/* Spinner pour actions en cours */}
              {(upscaling || editing) && (
                <div className="loading" style={{ marginTop: '0.75rem', padding: '1rem' }}>
                  <div className="spinner" />
                  <p>
                    {upscaling && 'Upscale en cours via Real-ESRGAN… Cela peut prendre 30 à 60 secondes.'}
                    {editing && 'Modification en cours via Gemini…'}
                  </p>
                </div>
              )}

              {/* Erreurs du panneau résultat */}
              {resultError && <div className="error-msg" style={{ marginTop: '0.75rem' }}>{resultError}</div>}

              {/* ── Section : Modifier l'image avec un prompt ── */}
              <div className="result-section" style={{ marginTop: '1rem' }}>
                <label className="result-section-label">Modifier l'image (prompt libre)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <textarea
                    className="edit-prompt-input"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Ex. : change la couleur du sol en blanc, ajoute un logo au centre…"
                    rows={2}
                  />
                  <button
                    className="btn-action btn-edit"
                    onClick={handleEdit}
                    disabled={isBusy || !editPrompt.trim()}
                    title="Appliquer la modification"
                  >
                    {editing ? '⏳' : '✏️'} Modifier
                  </button>
                </div>
              </div>

              {/* ── Boutons d'action ── */}
              <div className="result-actions" style={{ marginTop: '1rem' }}>
                <button className="btn-action btn-upscale" onClick={handleUpscale} disabled={isBusy}>
                  {upscaling ? '⏳ Upscale…' : '🔍 Upscale x4'}
                </button>
                <button className="btn-action btn-download-action" onClick={handleDownload} disabled={isBusy}>
                  💾 Télécharger
                </button>
                <button
                  className="btn-action btn-alt-upload"
                  onClick={() => altFileInputRef.current?.click()}
                  disabled={isBusy}
                >
                  📤 Remplacer par une image
                </button>
                <input
                  ref={altFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: 'none' }}
                  onChange={handleAltUpload}
                />
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
