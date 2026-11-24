# FauveF16 (Studio 3D Tech Pack)

Squelette du projet, à ouvrir dans VS Code.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis remplir les clés
npm run dev                  # http://localhost:3000
```

## Contenu

- `prototype/` : maquette HTML validée (ouvrir `index.html` dans un navigateur).
- `supabase/migrations/0001_famal_init.sql` : schéma `famal_*`, RLS et buckets. Non exécuté : à valider avant d'appliquer sur le projet Supabase partagé.
- `src/types/famal-spec.ts` : schémas polymorphiques ApparelSpec / GearSpec et types des lignes `famal_*`.
- `src/app/` : pages Next.js (App Router). La page Studio et le viewport Three.js sont à faire (Phase 1).
- `public/models/` : fichiers `.glb` des bases 3D (à fournir).

## Ce qui reste à faire

1. Valider le SQL puis l'appliquer au projet Supabase.
2. Brancher le viewport React Three Fiber sur les `.glb`.
3. Route `/api/analyze-product` (Claude Vision), puis copilote, puis export PDF et ZIP.
# Fauvef16
