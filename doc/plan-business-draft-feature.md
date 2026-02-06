# Plan: Feature "Business Draft" - Personnalisation automatique du mail de proposition client

## Contexte

Adapter la fonctionnalite "Draft" (jobs) au contexte clients/businesses. L'utilisateur veut pouvoir :
1. Uploader un **mail de proposition type** (template de base) dans l'onglet Email
2. Cliquer sur un bouton "Draft" sur un business dans la liste Clients
3. Le systeme analyse le business (site web, categorie, activite)
4. Claude AI personalise le mail de proposition en fonction de l'activite du commerce
5. Le mail propose un produit adapte (site web, app de gestion, compta, etc.)
6. Le draft genere apparait dans une section "Drafted Clients" dans l'onglet Email

---

## Etape 1 : Nouveau type de document - "Proposal Template"

### Modifications `lib/types.ts`
- Etendre le type `UserDocument.type` : `"cv" | "cover_letter" | "proposal_template"`
- Ajouter `BusinessDraft` interface :
  ```ts
  interface BusinessDraft {
    id: string;
    business_id: string;
    storage_path: string;
    filename: string;
    file_size: number;
    business_analysis: string | null; // cache de l'analyse du business
    ai_model: string;
    status: "pending" | "generating" | "completed" | "failed";
    error_message: string | null;
    created_at: string;
  }
  ```
- Ajouter `BusinessDraftPhase` type
- Ajouter entree `business_drafts` dans le type `Database`

### Schema SQL
```sql
CREATE TABLE IF NOT EXISTS business_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  storage_path TEXT,
  filename TEXT,
  file_size INTEGER,
  business_analysis TEXT,
  ai_model TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Etape 2 : Business Analyzer (`lib/business-analyzer.ts`) - NOUVEAU

Service qui analyse un business pour comprendre son activite :

1. **Scrape du site web** (si `website_url` existe) :
   - Fetch la page d'accueil
   - Extraire : meta description, titres, texte principal
   - Limiter a ~2000 caracteres

2. **Infos Google Maps** (deja en base) :
   - `category`, `name`, `address`, `rating`, `review_count`

3. **Recherche Google complementaire** (optionnel) :
   - Fetch `https://www.google.com/search?q={business_name}+{city}`
   - Extraire les snippets pertinents

4. **Output** : un texte structuré decrivant l'activite du business, ses besoins potentiels

---

## Etape 3 : AI Proposal Customization (`lib/ai-proposal.ts`) - NOUVEAU

Appel Claude AI pour personnaliser le mail de proposition :

- **Input** :
  - Nom du business, categorie, adresse
  - Analyse du business (site web, activite)
  - Website score + issues (de notre analyse existante)
  - Template de proposition original

- **System prompt** :
  - Garder le meme ton et style que le template original
  - Proposer un produit/service adapte a l'activite du business :
    - Restaurant/Commerce -> site vitrine, reservation en ligne, menu digital
    - Profession liberale -> site vitrine, prise de RDV en ligne
    - Artisan/PME -> site web + systeme de devis en ligne
    - Association -> site web, gestion membres
    - Si le site existe mais est mauvais (website_score eleve) -> refonte complete
    - Si pas de site -> creation de site
  - Personnaliser les arguments de vente en fonction du secteur
  - Garder la meme langue que le template

- **Output** : texte du mail personnalise (plain text)

---

## Etape 4 : Upload du Proposal Template dans Email

### Modifications `app/emails/page.tsx`
- Ajouter une 3eme carte dans "My Documents" : **Proposal Template**
  - Accepte PDF, DOCX, TXT
  - Meme pattern que CV et Cover Letter
  - Label : "Client Proposal Template"

### Modifications API documents
- Gerer le type `"proposal_template"` dans l'upload/download

---

## Etape 5 : API Route SSE (`app/api/clients/draft/stream/route.ts`) - NOUVEAU

Meme pattern que `app/api/jobs/draft/stream/route.ts` :

1. **Init (5%)** : Charger le business depuis Supabase
2. **Analyzing business (15-40%)** :
   - Scrape du site web si disponible
   - Compilation des infos (categorie, rating, issues)
3. **Reading proposal template (45-50%)** : Telecharger et parser le template
4. **Generating (55-75%)** : Appel Claude AI
5. **Saving (80-90%)** : Upload du texte genere, upsert dans `business_drafts`
6. **Complete** : Retourner le texte du mail + URL de telechargement

---

## Etape 6 : Draft Modal Business (`components/BusinessDraftModal.tsx`) - NOUVEAU

Similaire a `DraftModal.tsx` mais adapte :
- Memes 3 etats (generating, error, success)
- En mode success : afficher un apercu du mail genere + bouton copier + bouton telecharger

---

## Etape 7 : Integration BusinessTable

### Modifications `components/BusinessTable.tsx`
- Nouveaux props : `onDraft(business)`, `draftStatuses`
- Nouvelle colonne "Draft" dans le tableau desktop
- Bouton Draft dans les actions mobile
- 3 etats visuels (vide, generating, done)

---

## Etape 8 : Integration Clients Page

### Modifications `app/clients/page.tsx`
- States pour le draft (meme pattern que jobs)
- `fetchDraftStatuses()` au mount
- `handleDraft(business)` avec SSE streaming
- Passer props au BusinessTable
- Ajouter BusinessDraftModal

---

## Etape 9 : Section "Drafted Clients" dans Email Page

### Modifications `app/emails/page.tsx`
- Fetch `business_drafts` avec status "completed"
- Section similaire a "Drafted Jobs" :
  - Nom du business, categorie
  - Apercu du mail genere
  - Boutons : Copier le mail, Telecharger, Envoyer directement

---

## Fichiers a creer

| Fichier | Description |
|---------|-------------|
| `lib/business-analyzer.ts` | Analyse du business (site web, categorie) |
| `lib/ai-proposal.ts` | Appel Claude pour personnaliser le mail |
| `app/api/clients/draft/stream/route.ts` | API SSE streaming |
| `components/BusinessDraftModal.tsx` | Modal progression/resultat |

## Fichiers a modifier

| Fichier | Modification |
|---------|-------------|
| `lib/types.ts` | BusinessDraft, BusinessDraftPhase, type "proposal_template" |
| `doc/supabase-schema.sql` | Table business_drafts |
| `components/BusinessTable.tsx` | Colonne/bouton Draft |
| `app/clients/page.tsx` | Handler, states, modal |
| `app/emails/page.tsx` | Upload proposal template + section "Drafted Clients" |

---

## Estimation

- **Complexite** : Similaire au job draft (patterns identiques)
- **Cout AI par draft** : ~$0.008 (Claude Haiku)
- **Temps de generation** : ~15-30 secondes par business (plus si scrape du site web)

---

## Differences avec le Job Draft

| Aspect | Job Draft | Business Draft |
|--------|-----------|----------------|
| Document source | Lettre de motivation | Mail de proposition |
| Analyse | Description du job | Site web + categorie du business |
| Output | Lettre personnalisee (DOCX) | Mail personnalise (texte/DOCX) |
| Contexte AI | Adapter la lettre au poste | Proposer un produit adapte au commerce |
| Action post-draft | Telecharger | Copier/Envoyer directement |
