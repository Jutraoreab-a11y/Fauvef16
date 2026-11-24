# FauveF16 (Studio 3D Tech Pack)

Studio de création de fiches techniques avec aperçu 3D, import d'images et export local.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis remplir les clés
npm run dev                  # http://localhost:3000
```

## Contenu

- `prototype/` : maquette HTML historique, conservée comme référence de l'interface migrée.
- `supabase/migrations/0001_famal_init.sql` : schéma `famal_*`, RLS et buckets. Non exécuté : à valider avant d'appliquer sur le projet Supabase partagé.
- `src/types/famal-spec.ts` : schémas polymorphiques ApparelSpec / GearSpec et types des lignes `famal_*`.
- `src/app/` : application Next.js (App Router).
- `src/components/studio/` : interface React, données produit, logique métier et scène React Three Fiber.
- `public/models/` : fichiers `.glb` des bases 3D (à fournir).

## Limites actuelles

L'analyse du produit et le copilote sont simulés localement. Le rendu utilise une géométrie 3D générée dans le navigateur ; l'intégration Supabase, Claude Vision et les exports PDF/ZIP restent à réaliser.
# Fauvef16
