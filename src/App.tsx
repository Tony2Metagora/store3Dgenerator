import { useState, useEffect, useCallback, useRef } from 'react';
import { buildBrandPrompt } from './brands';
import { MOULES, getMouleById, type MouleCategory } from './moules';
import { loadMoule, saveMoule, listMouleIds } from './moulesStore';
import {
  callNanoBananaBatch,
  generateMouleFromPrompt,
  setApiConfig,
  setEditEndpoint,
  setUpscaleUrl,
  upscaleImage,
  editImageWithGemini,
  resizeToTargetHeight,
  getImageSize,
  TARGET_WIDTH,
  TARGET_HEIGHT,
} from './nanoBananaClient';
import './styles.css';

const PREVIEW_COUNT = 3;

export default function App() {
  // Moules
  const [moulesData, setMoulesData] = useState<Record<string, string | null>>({});
  const [moulesReady, setMoulesReady] = useState(false);
  const [selectedMouleId, setSelectedMouleId] = useState<MouleCategory>('bijouterie');
  const [generatingMoules, setGeneratingMoules] = useState<Set<string>>(new Set());
  const [atelierOpen, setAtelierOpen] = useState(false);

  // Brand inputs
  const [brandImage, setBrandImage] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>('');
  const [marque, setMarque] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');

  // Preview variants
  const [variants, setVariants] = useState<string[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Post-actions
  const [upscaling, setUpscaling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [altSize, setAltSize] = useState<{ width: number; height: number } | null>(null);
  const altFileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // API config
  const [apiEndpoint, setApiEndpoint] = useState<string>(() =>
    localStorage.getItem('nb_endpoint') ||
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
  );
  const [editEndpointState, setEditEndpointState] = useState<string>(() =>
    localStorage.getItem('nb_edit_endpoint') ||
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
  );
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('nb_apikey') || '');
  const [upscaleUrl, setUpscaleUrlState] = useState<string>(
    () => localStorage.getItem('nb_upscale_url') || 'https://upscale-worker.metagoraup.workers.dev'
  );
  const [showApiConfig, setShowApiConfig] = useState(false);

  // ─── Charger les moules au démarrage ───
  useEffect(() => {
    (async () => {
      const cached = await listMouleIds();
      const next: Record<string, string | null> = {};
      for (const m of MOULES) {
        if (cached.includes(m.id)) {
          next[m.id] = await loadMoule(m.id);
        } else if (m.seedImage) {
          try {
            const res = await fetch(import.meta.env.BASE_URL + m.seedImage);
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            next[m.id] = dataUrl;
          } catch {
            next[m.id] = null;
          }
        } else {
          next[m.id] = null;
        }
      }
      setMoulesData(next);
      setMoulesReady(true);
    })();
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

  // Met à jour le prompt dès que la marque, la description ou le moule changent
  useEffect(() => {
    const moule = getMouleById(selectedMouleId);
    setPrompt(buildBrandPrompt(marque, description, moule));
  }, [marque, description, selectedMouleId]);

  const selectedMouleData = moulesData[selectedMouleId] ?? null;

  // ─── Upload photo marque ───
  const readBrandFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setBrandName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setBrandImage(reader.result as string);
      setVariants([]);
      setSelectedVariant(null);
      setError(null);
      setResultError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readBrandFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readBrandFile(file);
  }, []);

  // ─── Génération 3 variantes en parallèle ───
  const handleGenerate = async () => {
    if (!selectedMouleData || !brandImage) return;
    setLoading(true);
    setError(null);
    setResultError(null);
    setVariants([]);
    setSelectedVariant(null);
    setAltSize(null);
    try {
      const results = await callNanoBananaBatch(selectedMouleData, brandImage, prompt, PREVIEW_COUNT);
      if (results.length === 0) {
        setError('Aucune variante générée. Vérifiez votre clé API Gemini et réessayez.');
      } else {
        setVariants(results);
        setSelectedVariant(0);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Génération / regénération d'un moule ───
  const handleGenerateMoule = async (id: MouleCategory) => {
    const m = getMouleById(id);
    if (!m) return;
    setGeneratingMoules((prev) => new Set(prev).add(id));
    try {
      const dataUrl = await generateMouleFromPrompt(m.genPrompt);
      await saveMoule(id, dataUrl);
      setMoulesData((prev) => ({ ...prev, [id]: dataUrl }));
    } catch (err: unknown) {
      setError(`Moule "${m.label}" : ${err instanceof Error ? err.message : 'erreur'}`);
    } finally {
      setGeneratingMoules((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ─── Actions sur la variante sélectionnée ───
  const activeImage = selectedVariant !== null ? variants[selectedVariant] ?? null : null;

  const handleEdit = async () => {
    if (!activeImage || !editPrompt.trim() || selectedVariant === null) return;
    setEditing(true);
    setResultError(null);
    try {
      const modified = await editImageWithGemini(activeImage, editPrompt.trim());
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? modified : v)));
      setAltSize(null);
      setEditPrompt('');
    } catch (err: unknown) {
      setResultError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setEditing(false);
    }
  };

  const handleUpscale = async () => {
    if (!activeImage || selectedVariant === null) return;
    setUpscaling(true);
    setResultError(null);
    try {
      const enhanced = await upscaleImage(activeImage);
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? enhanced : v)));
      setAltSize(null);
    } catch (err: unknown) {
      setResultError(err instanceof Error ? err.message : 'Erreur lors de l\'upscale.');
    } finally {
      setUpscaling(false);
    }
  };

  const handleAltUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/') || selectedVariant === null) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? dataUrl : v)));
      setResultError(null);
      setAltSize(await getImageSize(dataUrl));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleResizeAlt = async () => {
    if (!activeImage || selectedVariant === null) return;
    setResizing(true);
    setResultError(null);
    try {
      const resized = await resizeToTargetHeight(activeImage);
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? resized : v)));
      setAltSize(await getImageSize(resized));
    } catch (err: unknown) {
      setResultError(err instanceof Error ? err.message : 'Erreur lors du redimensionnement.');
    } finally {
      setResizing(false);
    }
  };

  const handleDownload = () => {
    if (!activeImage) return;
    const a = document.createElement('a');
    a.href = activeImage;
    const ext = activeImage.includes('image/png') ? 'png' : 'jpg';
    a.download = `store3d_${(marque || 'metagora').replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    a.click();
  };

  const isBusy = upscaling || editing || resizing;
  const missingMoules = MOULES.filter((m) => !moulesData[m.id]);
  const canGenerate = !!selectedMouleData && !!brandImage && !!apiKey && !loading;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>Store 3D <span>Generator</span></h1>
        <p>Metagora × Gemini — Transforme un magasin réel en boutique 3D de marque</p>
      </header>

      {/* API Config */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <button
          className="btn-toggle"
          onClick={() => setShowApiConfig(!showApiConfig)}
          type="button"
        >
          {showApiConfig ? '▾' : '▸'} Paramètres API{apiKey ? ' ✓' : ''}
        </button>
        {showApiConfig && (
          <div style={{ marginTop: '0.75rem' }}>
            <div className="field">
              <label htmlFor="apiEndpoint">Endpoint Génération</label>
              <input
                id="apiEndpoint"
                type="url"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="editEndpoint">Endpoint Modification</label>
              <input
                id="editEndpoint"
                type="url"
                value={editEndpointState}
                onChange={(e) => setEditEndpointState(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="apiKey">Clé API Gemini</label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Votre clé Gemini"
              />
            </div>
            <div className="field">
              <label htmlFor="upscaleUrl">URL Upscale (Cloudflare Worker)</label>
              <input
                id="upscaleUrl"
                type="url"
                value={upscaleUrl}
                onChange={(e) => setUpscaleUrlState(e.target.value)}
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Sauvegardé localement dans votre navigateur.
            </p>
          </div>
        )}
      </div>

      {/* Atelier Moules */}
      <div className="card atelier" style={{ marginBottom: '1rem' }}>
        <button
          className="btn-toggle"
          onClick={() => setAtelierOpen(!atelierOpen)}
          type="button"
        >
          {atelierOpen ? '▾' : '▸'} Atelier moules
          <span className="atelier-count">
            {MOULES.length - missingMoules.length}/{MOULES.length} prêts
          </span>
        </button>
        {atelierOpen && (
          <div className="atelier-grid">
            {MOULES.map((m) => {
              const img = moulesData[m.id];
              const busy = generatingMoules.has(m.id);
              return (
                <div key={m.id} className="atelier-card">
                  <div className="atelier-thumb">
                    {img ? (
                      <img src={img} alt={m.label} />
                    ) : (
                      <div className="atelier-thumb-empty">À générer</div>
                    )}
                  </div>
                  <div className="atelier-info">
                    <strong>{m.label}</strong>
                    <span>{m.description}</span>
                  </div>
                  <button
                    className="btn-atelier-gen"
                    onClick={() => handleGenerateMoule(m.id)}
                    disabled={busy || !apiKey}
                  >
                    {busy ? 'Génération…' : img ? 'Regénérer' : 'Générer'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {missingMoules.length > 0 && !atelierOpen && (
          <p className="atelier-hint">
            {missingMoules.length} moule{missingMoules.length > 1 ? 's' : ''} non
            généré{missingMoules.length > 1 ? 's' : ''} — ouvrez l'atelier pour les créer.
          </p>
        )}
      </div>

      <div className="layout">
        {/* ── Colonne gauche : Contrôles ── */}
        <div className="controls">
          {/* Étape 1 — Choisir le moule */}
          <div className="card">
            <h2><span className="step-num">1</span> Choisir le moule</h2>
            <div className="moule-selector">
              {MOULES.map((m) => {
                const img = moulesData[m.id];
                const disabled = !img;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`moule-chip${selectedMouleId === m.id ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                    onClick={() => !disabled && setSelectedMouleId(m.id)}
                    disabled={disabled}
                    title={disabled ? 'Moule non généré — ouvrez l\'atelier' : m.description}
                  >
                    <div className="moule-chip-thumb">
                      {img ? <img src={img} alt={m.label} /> : <span>—</span>}
                    </div>
                    <span className="moule-chip-label">{m.label}</span>
                  </button>
                );
              })}
            </div>
            {!moulesReady && <p className="hint">Chargement des moules…</p>}
          </div>

          {/* Étape 2 — Photo marque */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">2</span> Photo du magasin réel</h2>
            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
              <div className="icon">📷</div>
              <p>Glissez-déposez ou cliquez pour sélectionner<br />une photo du magasin réel de la marque</p>
            </div>
            {brandImage && (
              <div className="upload-preview">
                <img src={brandImage} alt={brandName} />
              </div>
            )}
          </div>

          {/* Étape 3 — Marque / Description */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">3</span> Marque & produit</h2>
            <div className="field">
              <label htmlFor="marque">Marque</label>
              <input
                id="marque"
                type="text"
                value={marque}
                onChange={(e) => setMarque(e.target.value)}
                placeholder="Ex. : Cabaïa, Hermès, Sisley…"
              />
            </div>
            <div className="field">
              <label htmlFor="description">Description produit</label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex. : sacs à dos et bonnets modulables colorés"
              />
            </div>
            <details className="prompt-details">
              <summary>Prompt généré (modifiable)</summary>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={10} />
            </details>
          </div>

          {/* Étape 4 — Générer */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h2><span className="step-num">4</span> Générer {PREVIEW_COUNT} variantes</h2>
            <button
              className="btn-generate"
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {loading ? `Génération de ${PREVIEW_COUNT} variantes…` : `Générer ${PREVIEW_COUNT} variantes`}
            </button>
            {error && <div className="error-msg">{error}</div>}
            {!selectedMouleData && moulesReady && (
              <p className="hint">Sélectionnez un moule disponible (étape 1).</p>
            )}
            {!brandImage && <p className="hint">Importez la photo du magasin (étape 2).</p>}
            {!apiKey && <p className="hint">Renseignez votre clé Gemini dans les paramètres API.</p>}
          </div>
        </div>

        {/* ── Colonne droite : Previews + Actions ── */}
        <div className="card preview-panel">
          <h2>Résultats ({TARGET_WIDTH}×{TARGET_HEIGHT})</h2>

          {loading ? (
            <div className="loading">
              <div className="spinner" />
              <p>{PREVIEW_COUNT} variantes en cours… 10-30 secondes.</p>
            </div>
          ) : variants.length > 0 ? (
            <>
              <div className="variant-grid">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`variant-thumb${selectedVariant === i ? ' selected' : ''}`}
                    onClick={() => { setSelectedVariant(i); setAltSize(null); }}
                  >
                    <img src={v} alt={`Variante ${i + 1}`} />
                    <span className="variant-badge">{i + 1}</span>
                  </button>
                ))}
              </div>

              {activeImage && (
                <>
                  <div className="preview-image main">
                    <img src={activeImage} alt="Variante sélectionnée" />
                  </div>

                  {altSize && (
                    <div className="info-msg" style={{ marginTop: '0.75rem' }}>
                      Taille actuelle : <strong>{altSize.width}×{altSize.height}</strong>
                      {(altSize.height !== TARGET_HEIGHT || altSize.width !== TARGET_WIDTH) ? (
                        <>
                          {' '} (attendu : {TARGET_WIDTH}×{TARGET_HEIGHT})
                          <button className="btn-inline" onClick={handleResizeAlt} disabled={resizing}>
                            {resizing ? 'Redimensionnement…' : 'Redimensionner'}
                          </button>
                        </>
                      ) : <> ✓ Format correct</>}
                    </div>
                  )}

                  {(upscaling || editing) && (
                    <div className="loading" style={{ marginTop: '0.75rem', padding: '1rem' }}>
                      <div className="spinner" />
                      <p>
                        {upscaling && 'Upscale x4 via Real-ESRGAN… 30-60 s.'}
                        {editing && 'Modification en cours…'}
                      </p>
                    </div>
                  )}

                  {resultError && <div className="error-msg" style={{ marginTop: '0.75rem' }}>{resultError}</div>}

                  <div className="result-section" style={{ marginTop: '1rem' }}>
                    <label className="result-section-label">Modifier la variante sélectionnée</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <textarea
                        className="edit-prompt-input"
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="Ex. : sol en marbre clair, plus de lumière naturelle…"
                        rows={2}
                      />
                      <button
                        className="btn-action btn-edit"
                        onClick={handleEdit}
                        disabled={isBusy || !editPrompt.trim()}
                      >
                        {editing ? '⏳' : '✏️'} Modifier
                      </button>
                    </div>
                  </div>

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
                      📤 Remplacer
                    </button>
                    <input
                      ref={altFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleAltUpload}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="preview-placeholder">
              Les {PREVIEW_COUNT} variantes apparaîtront ici après la génération.
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
