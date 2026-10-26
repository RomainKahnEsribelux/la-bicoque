# Supabase : base, comptes, contenus privés et automatisation

## Configuration publique du frontend

Dans `frontend/.env.local` pour le développement et les **variables de build**
Cloudflare pour la production :

```dotenv
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Les variables `VITE_` sont publiques. Ne jamais y mettre une clé secrète,
`service_role`, un mot de passe ou des coordonnées bancaires.

## Migrations : vérifier l'état réel avant toute exécution

Sauvegarder les données existantes et vérifier les tables/fonctions et l'historique
de migrations du projet. Les migrations s'exécutent **dans cet ordre** :

1. `20261016090000_booking_requests.sql` : base historique ;
2. `20261021100000_family_bookings.sql` : profils, admins, priorités familiales,
   partage, capacité de 30, J−21, tarifs et file d'e-mails ;
3. `20261021120000_family_content.sql` : articles/documents et Storage privé.

Ne pas relancer une migration déjà exécutée, ni modifier une migration historique
pour mettre à jour une base existante. Une ancienne version de la première
migration peut nécessiter une adaptation distincte après examen.
La nouvelle migration familiale est transactionnelle.

Utiliser la CLI Supabase liée au bon projet (`supabase db push`) si l'historique est
cohérent, ou le SQL Editor après contrôle explicite. Le push GitHub ne migre pas la base.

Le projet hébergé a reçu ces trois migrations via MCP, avec les versions serveur
`20261025220005` (`booking_requests`), `20261025220849` (`family_bookings`) et
`20261025220901` (`family_content`). Elles sont déjà installées : ne pas les
réexécuter. Avant tout futur `supabase db push`, réconcilier explicitement
l'historique distant avec les versions des fichiers locaux ci-dessus.

## Administrateurs et inscriptions

Les inscriptions ne doivent être ouvertes **qu'après** l'installation de la
migration familiale : elle retire l'ancienne fonction d'auto-activation.
Dans Auth, activer l'inscription e-mail et **Confirm email**.

Les comptes admins sont provisionnés par une liste autorisée serveur, jamais
par des métadonnées d'inscription. Les adresses réelles restent dans la base
privée, pas dans la migration du dépôt public. Configurer le premier compte
convenu, puis le second lorsqu'il sera connu, avec cette procédure :

```sql
-- Remplacer uniquement par l'adresse vérifiée de l'administrateur.
insert into public.admin_allowlist(email) values ('admin@example.com');
-- Si le compte est déjà confirmé, ce UPDATE déclenche le provisionnement.
update auth.users set email_confirmed_at=email_confirmed_at
where lower(email)='admin@example.com' and email_confirmed_at is not null;
```

Ne pas utiliser cette procédure pour un troisième admin. Aucun compte ni mot de
passe n'est créé par ces instructions. Les comptes existants complètent leur
profil sur `/profil`. Les changements de branche se font dans `/gestion`.

Dans Auth → URL Configuration :
- Site URL : `https://la-bicoque.romain-kahn.workers.dev` ;
- autoriser explicitement `https://la-bicoque.romain-kahn.workers.dev/auth/callback`
  et les URL locales nécessaires au développement.

Configurer un SMTP de production pour Auth (éventuellement Resend SMTP). Le service
d'envoi Auth par défaut a des restrictions ; ne pas présumer qu'il enverra les
confirmations à tous les nouveaux comptes. Valider un vrai e-mail de confirmation.

## E-mails métier et tâches planifiées

### Confirmations automatiques seules (sans e-mail)

La migration `20261026170000_family_confirmation_cron.sql` installe `pg_cron`
et programme `family-confirmations` toutes les 15 minutes. Elle appelle
`public.process_family_bookings()` côté serveur, sans navigateur, Resend, Vault
ni Edge Function. Elle ne rend pas cette fonction accessible aux membres.

Seules les demandes approuvées sont traitées : priorité familiale de l'arrivée,
J−21 inclus pour les autres branches, dates disponibles et capacité par nuit.
Les échéances utilisent la date de Bruxelles. Les conflits ou paramètres manquants
restent à traiter dans Gestion. Le traitement prépare aussi les notifications et
rappels dans `email_outbox`, mais **n'envoie aucun e-mail**.

Cette migration est installée sur le projet hébergé via MCP sous la version
`20261026164315` (`family_confirmation_cron`). Ne pas la réexécuter avec une
autre version sans réconcilier l'historique distant et les fichiers locaux.

Contrôler le calendrier et les exécutions depuis le SQL Editor ou MCP :

```sql
select jobid, jobname, schedule, command, active
from cron.job where jobname = 'family-confirmations';

select d.runid, d.status, d.return_message, d.start_time, d.end_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname = 'family-confirmations'
order by d.start_time desc limit 10;

-- Suspension (remplacer false par true pour reprendre).
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'family-confirmations';
```

### Livraison des e-mails (activation séparée, facultative)

Créer un compte Resend et vérifier un expéditeur autorisé. Configurer uniquement
dans les secrets **serveur** Supabase :

- `RESEND_API_KEY` ;
- `FAMILY_EMAIL_FROM` (expéditeur vérifié) ;
- `FAMILY_JOBS_SECRET` (valeur aléatoire forte, jamais une clé publique).

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis à l'Edge Function par
Supabase. Ne pas les recopier dans le frontend ou le dépôt.

Déployer :

```powershell
supabase functions deploy family-jobs
```

La fonction utilise `verify_jwt=false` et vérifie elle-même **obligatoirement**
`Authorization: Bearer FAMILY_JOBS_SECRET`. Sans ce secret valide, elle renvoie 401.
Elle traite les confirmations et la file d'envoi ; seules les fonctions SQL
internes accordées au rôle serveur sont appelables par le service.

Dans Supabase Vault, créer `family_jobs_url` (URL HTTPS complète de l'Edge Function)
et `family_jobs_secret` (même valeur que `FAMILY_JOBS_SECRET`), sans les mettre dans
le chat ou Git. Vérifier les disponibilités/quotas Cron, Vault, pg_net et Edge Functions.
Exécuter ensuite [setup-family-cron.sql](./setup-family-cron.sql) pour programmer
uniquement la livraison des e-mails toutes les 15 minutes. Ne pas exécuter ce
script pour activer seulement J−21. Avant la livraison, vérifier les messages
déjà en attente : les reprises automatiques expirent après 23 heures.

Contrôler `cron.job_run_details`, les réponses pg_net, journaux Edge Functions et
la file `email_outbox` visible dans Gestion. Un job HTTP accepté n'est pas une
preuve de livraison. Tester une confirmation et un rappel réels avant d'annoncer
l'automatisation opérationnelle.

Les reprises se limitent à 8 tentatives dans une fenêtre de 23 h pour rester dans
la fenêtre d'idempotence du fournisseur. Après vérification de l'absence d'envoi
chez Resend, un admin peut réautoriser manuellement un message en échec/expiré.

## Réglages métier

Dans Gestion :
- priorité **Hélène pour juillet 2026–juin 2027**, puis configurer les périodes suivantes ;
- capacité fixée au maximum demandé de **30 personnes** ;
- tarif EUR par personne estimée et par nuit et instructions de virement ;
- validation du tarif des séjours confirmés avant qu'un tarif ait été défini.

Les données bancaires sont en base privée, jamais dans le code public.
Sans montant validé ou instructions, les rappels restent en attente.
Voir [les règles complètes](../docs/reservation.md).

## Archives

La migration crée `family_articles`, `family_documents` et le bucket privé
`family-archives`. Les lecteurs doivent avoir un e-mail confirmé ; les écritures
sont réservées aux admins. Des URL signées temporaires servent les fichiers.
Conserver les textes et fichiers familiaux hors du dépôt public. Les pages affichent
explicitement l'attente d'import tant qu'aucune donnée n'a été chargée.

L'inventaire autorisé est conservé dans l'espace privé de session, pas dans Git.
L'import d'occupations est bloqué jusqu'à réception et validation de l'export Excel.
Ne pas modifier ni supprimer les données de l'ancien site pendant la préparation.

L'utilitaire `scripts/import-family-content.mjs` valide un manifeste JSON et des
fichiers locaux avant toute écriture :

```powershell
# Validation seule, sans réseau ni secret :
node .\supabase\scripts\import-family-content.mjs 'C:\private-archives\manifest.json'
# Après configuration privée de SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY :
node .\supabase\scripts\import-family-content.mjs 'C:\private-archives\manifest.json' --apply
```

Exécuter depuis la racine, après restauration des dépendances frontend. Le
manifeste et ses médias doivent rester **hors du dépôt**. `--help` donne le schéma :
`articles` (slug, titre, texte brut, provenance) et `documents` (titre, fichier local,
provenance et article associé). L'import est rejouable par slug et chemin stable,
mais n'est pas une transaction unique entre base et Storage ; en cas d'échec,
inspecter le message et reprendre le même manifeste après correction.
Les anciens PDF, images et documents Office sont pris en charge ; les fichiers
HTML et les chemins sortant du dossier de manifeste sont refusés.

## Validation locale

Depuis `frontend` :

```powershell
npm test
npm run build
npm run lint
```

Les tests utilisent PostgreSQL embarqué (PGlite) avec des schémas Auth/Storage de
test. Ils vérifient les migrations et règles SQL ; ils ne remplacent pas le test
multi-connexion sur PostgreSQL hébergé, les e-mails Resend, ni les politiques
Storage du service réel. Ne jamais utiliser des mots de passe réels dans les tests.
