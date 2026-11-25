'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProductType } from '@/types/famal-spec';
import type { StudioAssetKind, StudioSpec } from '@/components/studio/types';

/**
 * Bibliothèque des modèles enregistrés.
 *
 * Deux stockages derrière la même interface :
 * - Supabase (`famal_projects`) dès que NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont définies :
 *   chaque utilisateur se connecte par lien magique et ne voit que ses modèles (RLS) ;
 * - sinon le navigateur (localStorage), pour travailler tout de suite.
 */

export interface SavedAsset {
  id: string;
  name: string;
  kind: StudioAssetKind;
  x: number;
  y: number;
  size: number;
  /** Image du logo en data URL (null pour un patch généré). */
  dataUrl: string | null;
}

export interface HistoryEntry {
  at: string;
  text: string;
  lines: string[];
}

export interface SavedModel {
  id: string;
  name: string;
  collection: string;
  productType: ProductType;
  category: string;
  spec: StudioSpec;
  assets: SavedAsset[];
  history: HistoryEntry[];
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SavedModelSummary = Pick<
  SavedModel,
  'id' | 'name' | 'collection' | 'productType' | 'category' | 'thumbnail' | 'updatedAt'
>;

export type ModelDraft = Omit<SavedModel, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface ModelStore {
  readonly kind: 'local' | 'supabase';
  list(): Promise<SavedModelSummary[]>;
  load(id: string): Promise<SavedModel | null>;
  save(model: ModelDraft): Promise<SavedModel>;
  duplicate(id: string): Promise<SavedModel | null>;
  remove(id: string): Promise<void>;
}

const summarize = ({ id, name, collection, productType, category, thumbnail, updatedAt }: SavedModel): SavedModelSummary => ({
  id, name, collection, productType, category, thumbnail, updatedAt,
});

// ---------------------------------------------------------------------------
// Navigateur
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'fauvef16.models.v1';

class LocalModelStore implements ModelStore {
  readonly kind = 'local' as const;

  private read(): SavedModel[] {
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as SavedModel[]) : [];
    } catch {
      return [];
    }
  }

  private write(models: SavedModel[]) {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(models));
    } catch (error) {
      throw new Error(
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? 'Espace de stockage du navigateur plein : supprimez d’anciens modèles ou des logos lourds.'
          : 'Impossible d’enregistrer le modèle dans ce navigateur.',
      );
    }
  }

  async list() {
    return this.read()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(summarize);
  }

  async load(id: string) {
    return this.read().find((model) => model.id === id) ?? null;
  }

  async save(draft: ModelDraft) {
    const models = this.read();
    const now = new Date().toISOString();
    const existing = draft.id ? models.find((model) => model.id === draft.id) : undefined;
    const saved: SavedModel = {
      ...draft,
      id: existing?.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.write(existing ? models.map((model) => (model.id === saved.id ? saved : model)) : [saved, ...models]);
    return saved;
  }

  async duplicate(id: string) {
    const source = await this.load(id);
    if (!source) return null;
    const { id: _ignored, createdAt: _created, updatedAt: _updated, ...rest } = source;
    return this.save({ ...rest, name: `${source.name} (variante)` });
  }

  async remove(id: string) {
    this.write(this.read().filter((model) => model.id !== id));
  }
}

// ---------------------------------------------------------------------------
// Supabase : table famal_projects (migration supabase/migrations/0001_famal_init.sql)
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  brand_name: string;
  project_name: string;
  product_type: ProductType;
  category: string;
  product_spec_json: {
    spec?: StudioSpec;
    assets?: SavedAsset[];
    history?: HistoryEntry[];
    thumbnail?: string | null;
  };
  created_at: string;
  updated_at: string;
}

const fromRow = (row: ProjectRow): SavedModel => ({
  id: row.id,
  name: row.project_name,
  collection: row.brand_name,
  productType: row.product_type,
  category: row.category,
  spec: row.product_spec_json.spec ?? { zones: [], sliders: [] },
  assets: row.product_spec_json.assets ?? [],
  history: row.product_spec_json.history ?? [],
  thumbnail: row.product_spec_json.thumbnail ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

class SupabaseModelStore implements ModelStore {
  readonly kind = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  private async userId(): Promise<string> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) throw new Error('Connectez-vous pour retrouver vos modèles.');
    return data.user.id;
  }

  async list() {
    const { data, error } = await this.client
      .from('famal_projects')
      .select('id, brand_name, project_name, product_type, category, product_spec_json->thumbnail, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Liste des modèles indisponible : ${error.message}`);
    return (data ?? []).map((row) => {
      const record = row as unknown as Omit<ProjectRow, 'product_spec_json'> & { thumbnail: string | null };
      return {
        id: record.id,
        name: record.project_name,
        collection: record.brand_name,
        productType: record.product_type,
        category: record.category,
        thumbnail: record.thumbnail ?? null,
        updatedAt: record.updated_at,
      };
    });
  }

  async load(id: string) {
    const { data, error } = await this.client.from('famal_projects').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Modèle introuvable : ${error.message}`);
    return data ? fromRow(data as ProjectRow) : null;
  }

  async save(draft: ModelDraft) {
    const userId = await this.userId();
    const payload = {
      user_id: userId,
      brand_name: draft.collection,
      project_name: draft.name,
      product_type: draft.productType,
      category: draft.category,
      product_spec_json: {
        spec: draft.spec,
        assets: draft.assets,
        history: draft.history,
        thumbnail: draft.thumbnail,
      },
    };
    const query = draft.id
      ? this.client.from('famal_projects').update(payload).eq('id', draft.id).select('*').single()
      : this.client.from('famal_projects').insert(payload).select('*').single();
    const { data, error } = await query;
    if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
    return fromRow(data as ProjectRow);
  }

  async duplicate(id: string) {
    const source = await this.load(id);
    if (!source) return null;
    const { id: _ignored, createdAt: _created, updatedAt: _updated, ...rest } = source;
    return this.save({ ...rest, name: `${source.name} (variante)` });
  }

  async remove(id: string) {
    const { error } = await this.client.from('famal_projects').delete().eq('id', id);
    if (error) throw new Error(`Suppression impossible : ${error.message}`);
  }
}

// ---------------------------------------------------------------------------

let client: SupabaseClient | null | undefined;

/** Client Supabase si les clés sont configurées, sinon null. */
export function supabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key) : null;
  return client;
}

let store: ModelStore | null = null;

export function modelStore(): ModelStore {
  if (!store) {
    const supabase = supabaseClient();
    store = supabase ? new SupabaseModelStore(supabase) : new LocalModelStore();
  }
  return store;
}
