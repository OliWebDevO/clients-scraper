# Guide d'implementation - Feature "Draft" (Cover Letter AI)

## Vue d'ensemble

La fonctionnalite "Draft" permet de generer automatiquement une lettre de motivation personnalisee pour chaque job, en utilisant OpenAI (GPT-4o-mini).

> **Note :** Le code supporte aussi Claude Haiku (Anthropic) en alternatif. Voir `lib/ai-customize.ts` pour basculer.

**Flux :**
1. L'utilisateur clique sur le bouton "Draft" d'un job
2. Le systeme scrape la description complete du job
3. Il lit le CV et la lettre de motivation uploades
4. OpenAI personalise la lettre de motivation
5. Un fichier DOCX est genere et telechargeable
6. Le CV et la lettre personnalisee apparaissent dans l'onglet **Email > Drafted Jobs**
7. L'utilisateur peut telecharger/consulter les deux documents depuis cet onglet
8. Pour re-generer un draft, il suffit de re-cliquer sur le bouton Draft dans l'onglet Jobs

---

## 1. Dependances npm

```bash
npm install openai pdf-parse mammoth docx
npm install --save-dev @types/pdf-parse
```

| Package | Usage |
|---------|-------|
| `openai` | Appel OpenAI API (GPT-4o-mini) |
| `pdf-parse` | Extraction texte depuis PDF |
| `mammoth` | Extraction texte depuis DOCX |
| `docx` | Generation de fichiers DOCX |

> **Alternatif :** `@anthropic-ai/sdk` pour utiliser Claude Haiku a la place (deja installe)

---

## 2. Cle API OpenAI

### Obtenir la cle
1. Aller sur [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Creer un compte ou se connecter
3. Creer une nouvelle cle API

### Configurer
Ajouter dans `.env.local` :
```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

**Cout estime :** ~$0.002 par draft (GPT-4o-mini)

> **Alternatif (Claude Haiku) :** `ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx` (~$0.008 par draft)

---

## 3. Bucket Supabase Storage

Le bucket `documents` doit exister dans Supabase Storage. Il est deja utilise pour les uploads CV/lettre.

Les drafts sont stockes dans le chemin : `drafts/{jobId}/Lettre_{company}.docx`

### Verifier/Creer le bucket
1. Aller dans **Supabase Dashboard > Storage**
2. Verifier que le bucket `documents` existe
3. Si non, creer un bucket `documents` (public ou prive selon vos preferences)

---

## 4. Migration SQL

Executer dans le **SQL Editor** de Supabase :

```sql
CREATE TABLE IF NOT EXISTS job_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path TEXT,
  filename TEXT,
  file_size INTEGER,
  job_description_text TEXT,
  ai_model TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_drafts_job_id ON job_drafts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_drafts_status ON job_drafts(status);
```

---

## 5. Variables d'environnement (`.env.local`)

```env
# Deja existantes
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# AI pour Draft (un des deux)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx  (alternatif)
```

---

## 6. Configuration Next.js

Le fichier `next.config.ts` doit inclure les packages server-side :

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "pdf-parse", "mammoth"],
};
```

---

## 7. Pre-requis avant utilisation

Avant de pouvoir utiliser le bouton "Draft", l'utilisateur doit :

1. **Uploader un CV** (PDF) dans l'onglet **Email > My Documents**
2. **Uploader une lettre de motivation** (PDF ou DOCX) dans le meme onglet
3. Avoir des **jobs** dans la base de donnees (via le scraping)

---

## 8. Section "Drafted Jobs" dans l'onglet Email

Une fois qu'un job a ete drafte, il apparait automatiquement dans l'onglet **Email** sous la section **"Drafted Jobs"**.

Pour chaque job drafte, on retrouve :
- **Le nom du poste** et de l'entreprise
- **Le CV** (original) : consultable et telechargeable
- **La lettre de motivation personnalisee** (DOCX genere) : telechargeable
- **Un lien pour re-generer** le draft depuis l'onglet Jobs

Cela permet de centraliser tous les documents prets a l'envoi pour chaque candidature.

---

## 9. Test end-to-end

1. Verifier que la cle `OPENAI_API_KEY` est configuree dans `.env.local`
2. Uploader un CV (PDF) dans l'onglet Email
3. Uploader une lettre de motivation (DOCX ou PDF) dans l'onglet Email
4. Aller dans **Jobs**
5. Cliquer sur l'icone **Draft** (FileText) d'un job
6. La modal s'ouvre avec une barre de progression
7. Attendre la generation (~10-30 secondes)
8. Cliquer sur **Telecharger (.docx)** dans la modal
9. Verifier le contenu du fichier DOCX
10. L'icone Draft du job doit passer en bleu (done)
11. Aller dans l'onglet **Email**
12. Verifier que le job apparait dans la section **"Drafted Jobs"**
13. Verifier que le **CV** est consultable/telechargeable
14. Verifier que la **lettre de motivation personnalisee** est telechargeable
15. Retourner dans Jobs et re-cliquer sur Draft pour re-generer

---

## 10. Architecture des fichiers

```
lib/
  document-parser.ts     # Parse PDF/DOCX -> texte
  job-description-scraper.ts  # Scrape descriptions de jobs
  ai-customize.ts        # Appel OpenAI API (+ Anthropic en commentaire)
  docx-generator.ts      # Generation DOCX

app/api/jobs/draft/stream/
  route.ts              # API SSE streaming

components/
  DraftModal.tsx         # Modal progression/resultat
  JobTable.tsx           # Colonne Draft ajoutee

app/jobs/
  page.tsx              # Handler + states Draft

app/emails/
  page.tsx              # Section "Drafted Jobs" (CV + lettre telechargeable)
```

---

## 11. Modele AI utilise

### Actif : OpenAI GPT-4o-mini
- **Modele :** `gpt-4o-mini`
- **Max tokens :** 2000
- **Cout :** ~$0.15/M input tokens, $0.60/M output tokens
- **Estimation par draft :** ~$0.002

### Alternatif : Claude Haiku (commente dans le code)
- **Modele :** `claude-haiku-4-5-20251001`
- **Max tokens :** 2000
- **Cout :** ~$0.25/M input tokens, $1.25/M output tokens
- **Estimation par draft :** ~$0.008

Pour basculer, modifier `lib/ai-customize.ts` : decommenter la version Anthropic et commenter la version OpenAI.
