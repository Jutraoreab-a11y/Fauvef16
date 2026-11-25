'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { modelStore, supabaseClient, type SavedModelSummary } from '@/lib/models-store';

interface ModelsDrawerProps {
  open: boolean;
  currentId: string | null;
  /** Change à chaque enregistrement pour rafraîchir la liste. */
  revision: number;
  onClose: () => void;
  onOpenModel: (id: string) => void;
  onDuplicated: (id: string) => void;
  onDeleted: (id: string) => void;
  onError: (message: string) => void;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

/** Connexion par lien magique (seulement quand Supabase est configuré). */
function SupabaseLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const supabase = supabaseClient();
  const [email, setEmail] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return undefined;
    void supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (session) onSignedIn();
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, onSignedIn]);

  if (!supabase) return null;
  if (userEmail) {
    return (
      <p className="muted small">
        Connecté : {userEmail} ·{' '}
        <button className="linkbtn" type="button" onClick={() => { void supabase.auth.signOut(); }}>Se déconnecter</button>
      </p>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setFailure(`Envoi du lien impossible : ${error.message}`);
      return;
    }
    setFailure(null);
    setSent(true);
  };

  return sent ? (
    <p className="muted small">Lien envoyé à {email}. Ouvrez-le pour retrouver vos modèles.</p>
  ) : (
    <form className="login-form" onSubmit={(event) => { void submit(event); }}>
      <p className="muted small">Connectez-vous pour enregistrer et retrouver vos modèles sur tous vos appareils.</p>
      <input
        type="email"
        required
        placeholder="votre@email.com"
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <button className="btn primary full" type="submit">Recevoir un lien de connexion</button>
      {failure && <p className="small" role="alert">{failure}</p>}
    </form>
  );
}

export function ModelsDrawer({
  open,
  currentId,
  revision,
  onClose,
  onOpenModel,
  onDuplicated,
  onDeleted,
  onError,
}: ModelsDrawerProps) {
  const store = modelStore();
  const [models, setModels] = useState<SavedModelSummary[] | null>(null);
  // onError change à chaque rendu du parent : on le lit via une ref pour garder `refresh` stable.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(() => {
    store.list().then(setModels).catch((error: unknown) => {
      setModels([]);
      onErrorRef.current(error instanceof Error ? error.message : 'Liste des modèles indisponible.');
    });
  }, [store]);

  useEffect(() => {
    if (open) refresh();
  }, [open, revision, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const run = (action: () => Promise<void>) => {
    action().catch((error: unknown) => onError(error instanceof Error ? error.message : 'Action impossible.'));
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="Mes modèles" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Bibliothèque</p>
            <h2>Mes modèles</h2>
          </div>
          <button className="btn-text" type="button" onClick={onClose} aria-label="Fermer">Fermer</button>
        </div>
        {store.kind === 'supabase' ? (
          <SupabaseLogin onSignedIn={refresh} />
        ) : (
          <p className="muted small">Modèles enregistrés dans ce navigateur.</p>
        )}

        {models === null ? (
          <p className="muted small">Chargement…</p>
        ) : models.length === 0 ? (
          <p className="muted small">Aucun modèle enregistré. Vos modifications sont sauvegardées automatiquement dès le premier changement.</p>
        ) : (
          <ul className="model-list">
            {models.map((model) => (
              <li key={model.id} className={model.id === currentId ? 'current' : ''}>
                <div className="model-thumb">
                  {model.thumbnail ? <img src={model.thumbnail} alt="" /> : <span className="muted small">Aperçu</span>}
                </div>
                <div className="model-info">
                  <strong>{model.name}</strong>
                  <span className="muted small">
                    {model.collection} · {model.productType === 'apparel' ? 'Vêtement' : 'Équipement'} · {model.category}
                  </span>
                  <span className="muted small">Modifié le {dateFormat.format(new Date(model.updatedAt))}</span>
                  <span className="model-actions">
                    <button className="linkbtn" type="button" onClick={() => onOpenModel(model.id)}>
                      {model.id === currentId ? 'Ouvert' : 'Ouvrir'}
                    </button>
                    {' · '}
                    <button
                      className="linkbtn"
                      type="button"
                      onClick={() => run(async () => {
                        const copy = await store.duplicate(model.id);
                        if (copy) onDuplicated(copy.id);
                        refresh();
                      })}
                    >
                      Dupliquer
                    </button>
                    {' · '}
                    <button
                      className="linkbtn"
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Supprimer définitivement « ${model.name} » ? Cette action est irréversible.`)) return;
                        run(async () => {
                          await store.remove(model.id);
                          onDeleted(model.id);
                          refresh();
                        });
                      }}
                    >
                      Supprimer
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
