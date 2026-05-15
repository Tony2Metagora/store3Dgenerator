import { useState, useEffect, useCallback, useRef } from 'react';
import {
  buildBrandPrompt,
  buildAvatarPrompt,
  buildAccessoryPrompt,
  ACCESSORY_DEFS,
  getAccessoryDef,
  DEFAULT_AVATAR_CADRAGE,
  type AccessoryCategory,
} from './brands';
import { MOULES, getMouleById, type MouleCategory } from './moules';
import { loadMoule, saveMoule, listMouleIds } from './moulesStore';
import {
  callNanoBananaBatch,
  generateMouleFromPrompt,
  setApiConfig,
  setEditEndpoint,
  setFreepikApiKey,
  editImageWithGemini,
  refineImageQuality,
  resizeToTargetHeight,
  padToAzureEditRatio,
  upscaleWithMagnific,
  getImageSize,
  TARGET_WIDTH,
  TARGET_HEIGHT,
} from './nanoBananaClient';
import {
  callAzureOpenAIBatch,
  generateMouleFromAzure,
  editImageWithAzureOpenAI,
  refineImageWithAzureOpenAI,
  setAzureConfig,
} from './openaiImageClient';
import { analyzeAccessorySafe } from './visionClient';
import './styles.css';

type Provider = 'gemini' | 'azure';
type Tab = 'boutique' | 'avatar' | 'accessoires';

const PREVIEW_COUNT = 3;

export default function App() {
  // Tabs (workflow actif)
  const [activeTab, setActiveTab] = useState<Tab>(
    () => (localStorage.getItem('active_tab') as Tab) || 'boutique'
  );

  // Moules
  const [moulesData, setMoulesData] = useState<Record<string, string | null>>({});
  const [moulesReady, setMoulesReady] = useState(false);
  const [selectedMouleId, setSelectedMouleId] = useState<MouleCategory>('bijouterie');
  const [generatingMoules, setGeneratingMoules] = useState<Set<string>>(new Set());
  const [atelierOpen, setAtelierOpen] = useState(false);
  const [mouleErrors, setMouleErrors] = useState<Record<string, string>>({});

  // Brand inputs (tab Boutique)
  const [brandImage, setBrandImage] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>('');
  const [marque, setMarque] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');

  // Avatar inputs (tab Avatar dans boutique)
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState<string>('');
  const [avatarDragging, setAvatarDragging] = useState(false);
  const [boutiqueBgImage, setBoutiqueBgImage] = useState<string | null>(null);
  const [boutiqueBgName, setBoutiqueBgName] = useState<string>('');
  const [boutiqueBgDragging, setBoutiqueBgDragging] = useState(false);
  const [avatarContext, setAvatarContext] = useState<string>(DEFAULT_AVATAR_CADRAGE);
  const [avatarPrompt, setAvatarPrompt] = useState<string>('');

  // Accessoires inputs (tab Accessoires) — 1 seul accessoire à intégrer parmi les types disponibles
  const [accStartImage, setAccStartImage] = useState<string | null>(null);
  const [accStartName, setAccStartName] = useState<string>('');
  const [accStartDragging, setAccStartDragging] = useState(false);
  const [accCategory, setAccCategory] = useState<AccessoryCategory>('bijou');
  const [accImage, setAccImage] = useState<string | null>(null);
  const [accName, setAccName] = useState<string>('');
  const [accDragging, setAccDragging] = useState<boolean>(false);
  const [accExtraInstruction, setAccExtraInstruction] = useState<string>('');

  // Preview variants
  const [variants, setVariants] = useState<string[]>([]);
  const [variantBadges, setVariantBadges] = useState<string[]>([]); // labels custom (sinon "1", "2", "3")
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [accAnalyzing, setAccAnalyzing] = useState(false); // phase Vision (analyse accessoire) avant le batch d'image gen

  // Post-actions
  const [editing, setEditing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [altSize, setAltSize] = useState<{ width: number; height: number } | null>(null);
  const altFileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // API config
  const [provider, setProvider] = useState<Provider>(
    () => (localStorage.getItem('img_provider') as Provider) || 'azure'
  );
  const [apiEndpoint, setApiEndpoint] = useState<string>(() =>
    localStorage.getItem('nb_endpoint') ||
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
  );
  const [editEndpointState, setEditEndpointState] = useState<string>(() =>
    localStorage.getItem('nb_edit_endpoint') ||
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
  );
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('nb_apikey') || '');
  const [freepikApiKeyState, setFreepikApiKeyState] = useState<string>(
    () => localStorage.getItem('freepik_api_key') || ''
  );
  const [upscaling, setUpscaling] = useState(false);
  const [azureEndpoint, setAzureEndpoint] = useState<string>(
    () => localStorage.getItem('azure_endpoint') || ''
  );
  const [azureKey, setAzureKey] = useState<string>(() => localStorage.getItem('azure_apikey') || '');
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

  // Persist la clé API Freepik (appel direct Magnific Illusio depuis le browser).
  useEffect(() => {
    localStorage.setItem('freepik_api_key', freepikApiKeyState);
    setFreepikApiKey(freepikApiKeyState);
  }, [freepikApiKeyState]);

  // Persist & sync API config (les 2 jeux de credentials persistent en parallèle)
  useEffect(() => {
    localStorage.setItem('img_provider', provider);
    localStorage.setItem('nb_endpoint', apiEndpoint);
    localStorage.setItem('nb_apikey', apiKey);
    localStorage.setItem('nb_edit_endpoint', editEndpointState);
    localStorage.setItem('azure_endpoint', azureEndpoint);
    localStorage.setItem('azure_apikey', azureKey);
    setApiConfig(apiEndpoint, apiKey);
    setEditEndpoint(editEndpointState);
    setAzureConfig(azureEndpoint, azureKey);
  }, [provider, apiEndpoint, apiKey, editEndpointState, azureEndpoint, azureKey]);

  // Met à jour le prompt dès que la marque, la description ou le moule changent
  useEffect(() => {
    const moule = getMouleById(selectedMouleId);
    setPrompt(buildBrandPrompt(marque, description, moule));
  }, [marque, description, selectedMouleId]);

  // Met à jour le prompt avatar quand le contexte change
  useEffect(() => {
    setAvatarPrompt(buildAvatarPrompt(avatarContext));
  }, [avatarContext]);

  // Persiste le tab actif et reset les variantes au changement
  useEffect(() => {
    localStorage.setItem('active_tab', activeTab);
    setVariants([]);
    setVariantBadges([]);
    setSelectedVariant(null);
    setError(null);
    setResultError(null);
    setAltSize(null);
  }, [activeTab]);

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

  // ─── Upload Avatar (tab Avatar) ───
  const readAvatarFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setAvatarName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarImage(reader.result as string);
      setVariants([]);
      setSelectedVariant(null);
      setError(null);
      setResultError(null);
    };
    reader.readAsDataURL(file);
  };
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readAvatarFile(file);
  };
  const handleAvatarDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setAvatarDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readAvatarFile(file);
  }, []);

  // ─── Upload Fond de boutique (tab Avatar) ───
  const readBoutiqueBgFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setBoutiqueBgName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setBoutiqueBgImage(reader.result as string);
      setVariants([]);
      setSelectedVariant(null);
      setError(null);
      setResultError(null);
    };
    reader.readAsDataURL(file);
  };
  const handleBoutiqueBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readBoutiqueBgFile(file);
  };
  const handleBoutiqueBgDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setBoutiqueBgDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readBoutiqueBgFile(file);
  }, []);

  // ─── Uploads tab Accessoires ───
  const readAccStartFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setAccStartName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAccStartImage(reader.result as string);
      setVariants([]);
      setVariantBadges([]);
      setSelectedVariant(null);
      setError(null);
      setResultError(null);
    };
    reader.readAsDataURL(file);
  };
  const handleAccStartFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readAccStartFile(file);
  };
  const handleAccStartDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setAccStartDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readAccStartFile(file);
  }, []);

  const readAccFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setAccName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => setAccImage(reader.result as string);
    reader.readAsDataURL(file);
  };
  const handleAccFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readAccFile(file);
    e.target.value = '';
  };
  const handleAccDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setAccDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readAccFile(file);
  }, []);
  const clearAccImage = () => {
    setAccImage(null);
    setAccName('');
  };

  // ─── Génération 3 variantes en parallèle (dispatch selon provider) ───
  const handleGenerate = async () => {
    if (!selectedMouleData || !brandImage) return;
    setLoading(true);
    setError(null);
    setResultError(null);
    setVariants([]);
    setSelectedVariant(null);
    setAltSize(null);
    try {
      const results = provider === 'azure'
        ? await callAzureOpenAIBatch(selectedMouleData, brandImage, prompt, PREVIEW_COUNT)
        : await callNanoBananaBatch(selectedMouleData, brandImage, prompt, PREVIEW_COUNT);
      if (results.length === 0) {
        setError(`Aucune variante générée. Vérifiez votre ${provider === 'azure' ? 'clé Azure OpenAI' : 'clé Gemini'} et la console F12 pour le détail.`);
      } else {
        setVariants(results);
        setSelectedVariant(0);
      }
    } catch (err: unknown) {
      console.error('[handleGenerate] échec :', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Génération avatar dans boutique (tab Avatar — dispatch selon provider) ───
  const handleGenerateAvatar = async () => {
    if (!avatarImage || !boutiqueBgImage) return;
    setLoading(true);
    setError(null);
    setResultError(null);
    setVariants([]);
    setSelectedVariant(null);
    setAltSize(null);
    try {
      // Ordre des images : 1 = avatar, 2 = fond de boutique (cohérent avec buildAvatarPrompt)
      const results = provider === 'azure'
        ? await callAzureOpenAIBatch(avatarImage, boutiqueBgImage, avatarPrompt, PREVIEW_COUNT)
        : await callNanoBananaBatch(avatarImage, boutiqueBgImage, avatarPrompt, PREVIEW_COUNT);
      if (results.length === 0) {
        setError(`Aucune variante générée. Vérifiez votre ${provider === 'azure' ? 'clé Azure OpenAI' : 'clé Gemini'} et la console F12 pour le détail.`);
      } else {
        setVariants(results);
        setSelectedVariant(0);
      }
    } catch (err: unknown) {
      console.error('[handleGenerateAvatar] échec :', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Génération 3 variantes accessoire (tab Accessoires) ───
  // 1 seul accessoire choisi (catégorie + image), 3 variantes en parallèle/séquentiel
  // selon provider. Azure tourne en quality=medium pour rester sous ~30-60s par variante
  // (l'utilisateur peut upscaler la variante choisie via Magnific x4 en post).
  const handleGenerateAccessories = async () => {
    if (!accStartImage || !accImage) return;
    const acc = getAccessoryDef(accCategory);
    if (!acc) return;

    setLoading(true);
    setError(null);
    setResultError(null);
    setVariants([]);
    setVariantBadges([]);
    setSelectedVariant(null);
    setAltSize(null);

    try {
      // 1. Analyse Vision : produit un brief textuel précis de l'accessoire
      //    (type, matériau, couleur, dimensions réelles, placement) que gpt-image
      //    pourra cibler. Évite que le modèle invente une taille ou un cadrage.
      //    En cas d'échec Vision, on retombe sur un brief vide (silencieux).
      setAccAnalyzing(true);
      console.log(`[Accessoires] analyse Vision ${acc.label}…`);
      const visionDescription = await analyzeAccessorySafe(provider, accImage, acc, {
        azureEndpoint,
        azureKey,
        geminiEndpoint: apiEndpoint,
        geminiKey: apiKey,
      });
      if (visionDescription) {
        console.log(`[Accessoires] brief Vision ${acc.label} :\n${visionDescription}`);
      }
      setAccAnalyzing(false);

      // 2. Génération des 3 variantes avec le prompt enrichi du brief Vision.
      const prompt = buildAccessoryPrompt(acc, accExtraInstruction, visionDescription);
      // Azure /edits ne sort que du 3:2 → on pad l'image de départ 16:9 au
      // ratio Azure pour que le modèle édite sans recomposer (centrage du
      // personnage préservé). Gemini sort du 16:9 natif → pas de pad.
      const startForGen = provider === 'azure'
        ? await padToAzureEditRatio(accStartImage)
        : accStartImage;
      const results = provider === 'azure'
        ? await callAzureOpenAIBatch(startForGen, accImage, prompt, PREVIEW_COUNT, 'medium')
        : await callNanoBananaBatch(startForGen, accImage, prompt, PREVIEW_COUNT);
      if (results.length === 0) {
        setError(
          `Aucune variante générée. Vérifiez votre ${provider === 'azure' ? 'clé Azure OpenAI' : 'clé Gemini'} et la console F12 pour le détail.`
        );
      } else {
        setVariants(results);
        setSelectedVariant(0);
      }
    } catch (err: unknown) {
      console.error('[handleGenerateAccessories] échec :', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setAccAnalyzing(false);
      setLoading(false);
    }
  };

  // ─── Génération / regénération d'un moule (dispatch selon provider) ───
  const handleGenerateMoule = async (id: MouleCategory) => {
    const m = getMouleById(id);
    if (!m) return;
    setGeneratingMoules((prev) => new Set(prev).add(id));
    setMouleErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const dataUrl = provider === 'azure'
        ? await generateMouleFromAzure(m.genPrompt)
        : await generateMouleFromPrompt(m.genPrompt);
      await saveMoule(id, dataUrl);
      setMoulesData((prev) => ({ ...prev, [id]: dataUrl }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error(`[Atelier moule "${m.label}"] échec :`, err);
      setMouleErrors((prev) => ({ ...prev, [id]: msg }));
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
      const modified = provider === 'azure'
        ? await editImageWithAzureOpenAI(activeImage, editPrompt.trim())
        : await editImageWithGemini(activeImage, editPrompt.trim());
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? modified : v)));
      setAltSize(null);
      setEditPrompt('');
    } catch (err: unknown) {
      console.error('[handleEdit] échec :', err);
      setResultError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setEditing(false);
    }
  };

  const handleRefine = async () => {
    if (!activeImage || selectedVariant === null) return;
    setRefining(true);
    setResultError(null);
    try {
      const refined = provider === 'azure'
        ? await refineImageWithAzureOpenAI(activeImage)
        : await refineImageQuality(activeImage);
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? refined : v)));
      setAltSize(null);
    } catch (err: unknown) {
      console.error('[handleRefine] échec :', err);
      setResultError(err instanceof Error ? err.message : 'Erreur lors du raffinement.');
    } finally {
      setRefining(false);
    }
  };

  const handleUpscale = async () => {
    if (!activeImage || selectedVariant === null) return;
    if (!freepikApiKeyState) {
      setResultError('Clé API Freepik non configurée — renseigne-la dans Paramètres API.');
      return;
    }
    setUpscaling(true);
    setResultError(null);
    try {
      const upscaled = await upscaleWithMagnific(activeImage, { scale: 4 });
      setVariants((prev) => prev.map((v, i) => (i === selectedVariant ? upscaled : v)));
      setAltSize(null);
    } catch (err: unknown) {
      console.error('[handleUpscale] échec :', err);
      setResultError(err instanceof Error ? err.message : "Erreur lors de l'upscale Magnific.");
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

  const isBusy = editing || refining || resizing || upscaling;
  const missingMoules = MOULES.filter((m) => !moulesData[m.id]);
  const activeKey = provider === 'azure' ? azureKey : apiKey;
  const canGenerateBoutique = !!selectedMouleData && !!brandImage && !!activeKey && !loading;
  const canGenerateAvatar = !!avatarImage && !!boutiqueBgImage && !!activeKey && !loading;
  const canGenerateAccessoires =
    !!accStartImage && !!accImage && !!activeKey && !loading;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>Store 3D <span>Generator</span></h1>
        <p>Metagora — Transforme un magasin réel en boutique 3D de marque</p>
      </header>

      {/* API Config */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <button
          className="btn-toggle"
          onClick={() => setShowApiConfig(!showApiConfig)}
          type="button"
        >
          {showApiConfig ? '▾' : '▸'} Paramètres API
          {activeKey ? ` ✓ (${provider === 'azure' ? 'GPT Image' : 'Nano Banana'})` : ''}
        </button>
        {showApiConfig && (
          <div style={{ marginTop: '0.75rem' }}>
            <div className="field">
              <label>Provider d&apos;image</label>
              <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.35rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="provider"
                    value="gemini"
                    checked={provider === 'gemini'}
                    onChange={() => setProvider('gemini')}
                  />
                  <span>Nano Banana (Gemini)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="provider"
                    value="azure"
                    checked={provider === 'azure'}
                    onChange={() => setProvider('azure')}
                  />
                  <span>GPT Image (Azure OpenAI)</span>
                </label>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Tous les flux (variantes, moules, modification, raffinement) utilisent le provider sélectionné. Les 2 jeux de credentials sont persistés en parallèle — vous pouvez switcher sans retaper.
              </p>
            </div>

            {provider === 'gemini' && (
              <>
                <div className="field">
                  <label htmlFor="apiEndpoint">Endpoint Génération (Gemini)</label>
                  <input
                    id="apiEndpoint"
                    type="url"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="editEndpoint">Endpoint Modification (Gemini)</label>
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
              </>
            )}

            {provider === 'azure' && (
              <>
                <div className="field">
                  <label htmlFor="azureEndpoint">Endpoint Azure OpenAI (gpt-image-2)</label>
                  <input
                    id="azureEndpoint"
                    type="url"
                    value={azureEndpoint}
                    onChange={(e) => setAzureEndpoint(e.target.value)}
                    placeholder="https://YOUR-RESOURCE.cognitiveservices.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=2024-02-01"
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Colle l&apos;URL telle qu&apos;elle apparaît dans le portail Azure (que ce soit <code>/images/generations</code> ou <code>/images/edits</code>) — l&apos;outil bascule automatiquement sur le bon endpoint en interne pour chaque flux. Auth via <code>Authorization: Bearer</code>.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="azureKey">Clé Azure OpenAI</label>
                  <input
                    id="azureKey"
                    type="password"
                    value={azureKey}
                    onChange={(e) => setAzureKey(e.target.value)}
                    placeholder="Votre clé Azure OpenAI"
                  />
                </div>
              </>
            )}

            <div className="field" style={{ marginTop: '0.75rem', borderTop: '1px dashed var(--border)', paddingTop: '0.75rem' }}>
              <label htmlFor="freepikApiKey">Clé API Freepik (Magnific Illusio)</label>
              <input
                id="freepikApiKey"
                type="password"
                value={freepikApiKeyState}
                onChange={(e) => setFreepikApiKeyState(e.target.value)}
                placeholder="FPSXxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Crée la sur <a href="https://www.freepik.com/api" target="_blank" rel="noopener noreferrer">freepik.com/api</a> (plan API requis).
                Une fois renseignée, le bouton <strong>🔍 Upscale Magnific x4</strong> s&apos;active sur chaque image générée.
                Appel direct depuis le browser (CORS ouvert) — pas de proxy serveur.
              </p>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Sauvegardé localement dans votre navigateur.
            </p>
          </div>
        )}
      </div>

      {/* Tabs : workflow actif */}
      <div className="card" style={{ marginBottom: '1rem', padding: '0.4rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {([
            { key: 'boutique' as Tab, label: 'Fond de boutique' },
            { key: 'avatar' as Tab, label: 'Avatar dans boutique' },
            { key: 'accessoires' as Tab, label: 'Accessoires' },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                padding: '0.6rem 1rem',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: activeTab === t.key ? 600 : 500,
                background: activeTab === t.key ? 'var(--accent)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Atelier Moules — uniquement sur tab Boutique */}
      {activeTab === 'boutique' && (
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
              const moulErr = mouleErrors[m.id];
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
                    disabled={busy || !activeKey}
                  >
                    {busy ? 'Génération…' : img ? 'Regénérer' : 'Générer'}
                  </button>
                  {moulErr && (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 0.6rem',
                        background: '#fef2f2',
                        border: '1px solid #fca5a5',
                        borderRadius: '0.4rem',
                        color: '#b91c1c',
                        fontSize: '0.72rem',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}
                    >
                      <strong style={{ display: 'block', marginBottom: '0.15rem' }}>
                        Erreur — voir aussi F12 console
                      </strong>
                      {moulErr}
                    </div>
                  )}
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
      )}

      <div className="layout">
        {/* ── Colonne gauche : Contrôles (varie selon le tab) ── */}
        <div className="controls">
          {/* TAB BOUTIQUE — étapes 1 à 4 (moule + photo magasin → variantes) */}
          {activeTab === 'boutique' && (<>
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
              disabled={!canGenerateBoutique}
              onClick={handleGenerate}
            >
              {loading ? `Génération de ${PREVIEW_COUNT} variantes…` : `Générer ${PREVIEW_COUNT} variantes`}
            </button>
            {error && <div className="error-msg">{error}</div>}
            {!selectedMouleData && moulesReady && (
              <p className="hint">Sélectionnez un moule disponible (étape 1).</p>
            )}
            {!brandImage && <p className="hint">Importez la photo du magasin (étape 2).</p>}
            {!activeKey && <p className="hint">Renseignez votre clé {provider === 'azure' ? 'Azure OpenAI' : 'Gemini'} dans les paramètres API.</p>}
          </div>
          </>)}

          {/* TAB AVATAR — étapes 1 à 3 (avatar + fond → variantes fusionnées) */}
          {activeTab === 'avatar' && (<>
            {/* Étape 1 — Upload avatar */}
            <div className="card">
              <h2><span className="step-num">1</span> Importer l&apos;avatar (personnage)</h2>
              <div
                className={`upload-zone ${avatarDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setAvatarDragging(true); }}
                onDragLeave={() => setAvatarDragging(false)}
                onDrop={handleAvatarDrop}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFileChange} />
                <div className="icon">🧑</div>
                <p>Glissez-déposez ou cliquez pour sélectionner<br />une image d&apos;avatar (JPEG / PNG / WebP)</p>
              </div>
              {avatarImage && (
                <div className="upload-preview">
                  <img src={avatarImage} alt={avatarName} />
                </div>
              )}
            </div>

            {/* Étape 2 — Upload fond de boutique */}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2><span className="step-num">2</span> Importer le fond de boutique</h2>
              <div
                className={`upload-zone ${boutiqueBgDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setBoutiqueBgDragging(true); }}
                onDragLeave={() => setBoutiqueBgDragging(false)}
                onDrop={handleBoutiqueBgDrop}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBoutiqueBgFileChange} />
                <div className="icon">🏬</div>
                <p>Glissez-déposez ou cliquez pour sélectionner<br />le décor de boutique (JPEG / PNG / WebP)</p>
              </div>
              {boutiqueBgImage && (
                <div className="upload-preview">
                  <img src={boutiqueBgImage} alt={boutiqueBgName} />
                </div>
              )}
            </div>

            {/* Étape 3 — Cadrage / contexte (pré-rempli, modifiable) */}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2><span className="step-num">3</span> Cadrage du personnage</h2>
              <div className="field">
                <label htmlFor="avatarContext">
                  Comment placer l&apos;avatar (modifiable, pré-rempli avec le cadrage type LMS Metagora)
                </label>
                <textarea
                  id="avatarContext"
                  value={avatarContext}
                  onChange={(e) => setAvatarContext(e.target.value)}
                  placeholder="Ex. : avatar centré au premier plan, plan 3/4 buste, face caméra…"
                  rows={5}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Cette consigne est injectée comme règle prioritaire dans le prompt. Si vide, le cadrage par défaut est utilisé.
                </p>
              </div>
              <details className="prompt-details">
                <summary>Prompt complet généré (modifiable)</summary>
                <textarea value={avatarPrompt} onChange={(e) => setAvatarPrompt(e.target.value)} rows={10} />
              </details>
            </div>

            {/* Étape 4 — Générer */}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2><span className="step-num">4</span> Fusionner ({PREVIEW_COUNT} variantes)</h2>
              <button
                className="btn-generate"
                disabled={!canGenerateAvatar}
                onClick={handleGenerateAvatar}
              >
                {loading ? `Fusion de ${PREVIEW_COUNT} variantes…` : `Fusionner (${PREVIEW_COUNT} variantes)`}
              </button>
              {error && <div className="error-msg">{error}</div>}
              {!avatarImage && <p className="hint">Importez l&apos;avatar (étape 1).</p>}
              {!boutiqueBgImage && <p className="hint">Importez le fond de boutique (étape 2).</p>}
              {!activeKey && <p className="hint">Renseignez votre clé {provider === 'azure' ? 'Azure OpenAI' : 'Gemini'} dans les paramètres API.</p>}
            </div>
          </>)}

          {/* TAB ACCESSOIRES — étape 1 image de départ, étape 2 sélecteur catégorie + image accessoire, étape 3 générer 3 variantes */}
          {activeTab === 'accessoires' && (<>
            {/* Étape 1 — Image de départ */}
            <div className="card">
              <h2><span className="step-num">1</span> Image de départ</h2>
              <p className="hint" style={{ marginBottom: '0.6rem' }}>
                Photo de la personne sur laquelle on va ajouter l&apos;accessoire (en général, une variante de l&apos;onglet « Avatar dans boutique » téléchargée puis ré-importée ici).
              </p>
              <div
                className={`upload-zone ${accStartDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setAccStartDragging(true); }}
                onDragLeave={() => setAccStartDragging(false)}
                onDrop={handleAccStartDrop}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAccStartFileChange} />
                <div className="icon">🖼️</div>
                <p>Glissez-déposez ou cliquez pour sélectionner<br />l&apos;image de départ (JPEG / PNG / WebP)</p>
              </div>
              {accStartImage && (
                <div className="upload-preview">
                  <img src={accStartImage} alt={accStartName} />
                </div>
              )}
            </div>

            {/* Étape 2 — Accessoire à intégrer (1 catégorie + 1 image) */}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2><span className="step-num">2</span> Accessoire à intégrer</h2>
              <p className="hint" style={{ marginBottom: '0.6rem' }}>
                Choisissez le type d&apos;accessoire, importez son image — 3 variantes seront générées parmi lesquelles choisir.
              </p>

              <div className="field" style={{ marginBottom: '0.8rem' }}>
                <label>Type d&apos;accessoire</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {ACCESSORY_DEFS.map((acc) => {
                    const isSelected = accCategory === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setAccCategory(acc.id)}
                        style={{
                          padding: '0.55rem 1rem',
                          border: isSelected ? '2px solid #e41e45' : '1px solid #d4d4d8',
                          background: isSelected ? 'rgba(228, 30, 69, 0.08)' : '#fff',
                          color: isSelected ? '#e41e45' : '#27272a',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: isSelected ? 600 : 500,
                          fontSize: '0.95rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span>{acc.emoji}</span>
                        {acc.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className={`upload-zone ${accDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setAccDragging(true); }}
                onDragLeave={() => setAccDragging(false)}
                onDrop={handleAccDrop}
              >
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAccFileChange} />
                <div className="icon">📤</div>
                <p>Glissez-déposez ou cliquez pour importer<br />l&apos;image de l&apos;accessoire (JPEG / PNG / WebP)</p>
              </div>
              {accImage && (
                <div className="upload-preview" style={{ position: 'relative' }}>
                  <img src={accImage} alt={accName} />
                  <button
                    type="button"
                    onClick={clearAccImage}
                    title="Retirer cette image"
                    style={{
                      position: 'absolute',
                      top: '0.4rem',
                      right: '0.4rem',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '1.6rem',
                      height: '1.6rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="field" style={{ marginTop: '1rem' }}>
                <label htmlFor="accExtraInstruction">
                  Instruction complémentaire pour l&apos;IA (optionnel)
                </label>
                <textarea
                  id="accExtraInstruction"
                  value={accExtraInstruction}
                  onChange={(e) => setAccExtraInstruction(e.target.value)}
                  placeholder="Ex. : le sac est porté à la main droite ; le foulard est noué en pointe sur le devant…"
                  rows={3}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Ce texte est injecté comme consigne prioritaire dans le prompt. Laissez vide si rien à préciser.
                </p>
              </div>
            </div>

            {/* Étape 3 — Composer */}
            <div className="card" style={{ marginTop: '1rem' }}>
              <h2><span className="step-num">3</span> Composer (3 variantes)</h2>
              <button
                className="btn-generate"
                disabled={!canGenerateAccessoires}
                onClick={handleGenerateAccessories}
              >
                {loading
                  ? accAnalyzing
                    ? 'Analyse Vision de l’accessoire…'
                    : 'Composition…'
                  : 'Composer 3 variantes'}
              </button>
              {error && <div className="error-msg">{error}</div>}
              {!accStartImage && <p className="hint">Importez l&apos;image de départ (étape 1).</p>}
              {accStartImage && !accImage && (
                <p className="hint">Importez l&apos;image de l&apos;accessoire (étape 2).</p>
              )}
              {!activeKey && <p className="hint">Renseignez votre clé {provider === 'azure' ? 'Azure OpenAI' : 'Gemini'} dans les paramètres API.</p>}
            </div>
          </>)}
        </div>

        {/* ── Colonne droite : Previews + Actions ── */}
        <div className="card preview-panel">
          <h2>Résultats ({TARGET_WIDTH}×{TARGET_HEIGHT})</h2>

          {loading && variants.length === 0 ? (
            <div className="loading">
              <div className="spinner" />
              <p>
                {activeTab === 'accessoires'
                  ? accAnalyzing
                    ? `Analyse Vision de l’accessoire en cours… (~5-15s) — l’IA décrit matériau, couleur et dimensions réelles pour cadrer le rendu.`
                    : `${PREVIEW_COUNT} variantes en cours… ${provider === 'azure' ? '30-90s par variante (Azure GPT image medium), soit ~2-3 min au total. Upscale Magnific x4 dispo après sélection.' : '10-30 secondes.'}`
                  : `${PREVIEW_COUNT} variantes en cours… ${provider === 'azure' ? '2-4 min par variante (séquentiel Azure GPT image).' : '10-30 secondes.'}`}
              </p>
            </div>
          ) : variants.length > 0 ? (
            <>
              <div className="variant-grid">
                {variants.map((v, i) => {
                  const badge = variantBadges[i] || `${i + 1}`;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`variant-thumb${selectedVariant === i ? ' selected' : ''}`}
                      onClick={() => { setSelectedVariant(i); setAltSize(null); }}
                    >
                      <img src={v} alt={badge} />
                      <span className="variant-badge">{badge}</span>
                    </button>
                  );
                })}
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

                  {(editing || refining) && (
                    <div className="loading" style={{ marginTop: '0.75rem', padding: '1rem' }}>
                      <div className="spinner" />
                      <p>
                        {editing && `Modification en cours via ${provider === 'azure' ? 'Azure OpenAI' : 'Gemini'}…`}
                        {refining && `Raffinement qualité via ${provider === 'azure' ? 'Azure OpenAI' : 'Gemini'}… 10-30 s.`}
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
                    <button className="btn-action btn-refine" onClick={handleRefine} disabled={isBusy}>
                      {refining ? '⏳ Raffinement…' : '✨ Améliorer qualité'}
                    </button>
                    <button
                      className="btn-action btn-upscale"
                      onClick={handleUpscale}
                      disabled={isBusy || !freepikApiKeyState}
                      title={freepikApiKeyState ? 'Upscale x4 via Magnific Illusio (30s-2min)' : "Configure d'abord la clé API Freepik dans les paramètres"}
                    >
                      {upscaling ? '⏳ Upscale…' : '🔍 Upscale Magnific x4'}
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
          ) : error ? (
            <div className="error-msg" style={{ marginTop: 0, padding: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <strong style={{ display: 'block', marginBottom: '0.4rem' }}>
                ❌ La génération a échoué
              </strong>
              {error}
            </div>
          ) : (
            <div className="preview-placeholder">
              {activeTab === 'accessoires'
                ? 'Le résultat de la composition apparaîtra ici (1 image par accessoire ajouté).'
                : `Les ${PREVIEW_COUNT} variantes apparaîtront ici après la génération.`}
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        Store 3D Generator — Metagora × {provider === 'azure' ? 'Azure OpenAI' : 'Gemini'}
      </footer>
    </div>
  );
}
