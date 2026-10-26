# Réservations familiales

## Comptes et accès

L'inscription est ouverte, avec confirmation de l'e-mail et un profil obligatoire
(prénom, nom, branche **Max-Léo**, **Gustave** ou **Hélène**). Seul un admin peut
corriger la branche ensuite. Le nom et la branche sont conservés dans chaque
demande : une correction du profil ne modifie pas les demandes existantes.

Les histoires, documents et calendriers sont accessibles à **toute personne ayant
un compte avec e-mail confirmé**, sans validation familiale supplémentaire.
Ce choix ne garantit donc pas que tous les lecteurs appartiennent à la famille.
Les archives sont protégées dans Supabase et son Storage privé, pas seulement
par la navigation React. Ne jamais placer ces contenus dans le dépôt GitHub public.

Deux admins sont prévus. L'adresse du premier a été convenue en privé ; le second reste
à fournir. Les adresses sont configurées côté serveur, pas publiées dans Git.
L'ancienne auto-activation du propriétaire est désactivée dans la nouvelle
migration, avant l'ouverture des inscriptions. Voir [la mise en service](../supabase/README.md).

## Priorité et approbation

- Année familiale du **1er juillet au 30 juin** ; Hélène pour **2026–2027**.
- L'année familiale contenant l'arrivée détermine la priorité de tout le séjour.
- Les admins configurent chaque période. Sans priorité, une demande ne peut pas
  être approuvée ; les séjours déjà confirmés ne sont pas rétroactivement modifiés.
- Toute demande doit être approuvée par un admin.
- Branche prioritaire : confirmation dès approbation, sous réserve de disponibilité.
- Autres branches : approbation anticipée possible, mais confirmation au plus tôt
  **21 jours avant l'arrivée**. Les dates ne sont pas garanties avant confirmation.
- Une approbation dans la fenêtre J−21 peut confirmer immédiatement.
- Les approbations éligibles sont traitées par ancienneté d'approbation, puis par
  identifiant pour départager. Les demandes compatibles sont confirmées ; les
  conflits sont visibles par les admins et ne deviennent pas des réservations.
- Une demande refusée n'est jamais confirmée par le traitement automatique.
- Les tâches fonctionnent sans navigateur ouvert. Les échéances utilisent
  **Europe/Brussels**, avec passage périodique (pas une promesse à la seconde près).

## Dates, partage et capacité

Tout le séjour doit être dans les **six prochains mois calendaires**.
Arrivée incluse et départ exclu : `[arrivée, départ)`. Un groupe peut arriver le
jour où un autre part. Les horaires saisis sont des préférences à confirmer.

Le demandeur choisit :

- **Ouvert** : d'autres groupes peuvent demander tout ou partie des mêmes dates ;
- **Exclusif** : aucun autre séjour confirmé ne peut chevaucher ces dates.

Chaque groupe a sa propre demande, ses horaires et son **effectif estimé**.
Le total confirmé ne dépasse jamais **30 personnes par nuit**, groupes cumulés.
Les blocages admin interdisent tout séjour sur leurs dates.
Les demandes en attente ou simplement approuvées ne consomment pas la capacité.

La base verrouille la ressource maison avant chaque confirmation ou blocage et
revérifie toute la période. La contrainte historique qui interdisait tout
chevauchement est remplacée pour permettre les séjours ouverts : aucune écriture
directe des membres ne doit contourner les fonctions contrôlées.

## E-mails et virement

Supabase planifie les traitements ; Resend envoie les messages côté serveur.

1. E-mail lors de la **confirmation effective**, pas de l'approbation différée.
2. Le lendemain du départ, récapitulatif par groupe :
   **effectif estimé × nombre de nuits × tarif par personne et par nuit**,
   avec instructions de virement.

Le tarif du séjour est conservé à la confirmation. Si aucun tarif n'était configuré,
un admin doit le valider pour ce séjour. Les changements de tarif global ne changent
pas les montants déjà validés. Le calcul utilise des centimes entiers.
Si tarif ou coordonnées manquent, les admins sont alertés et le message attend.

**Aucun paiement sur le site.** L'envoi d'un message n'est ni une facture fiscale
ni une preuve de paiement. Pas de vérification bancaire automatique.

La file d'envoi conserve les tentatives et les erreurs. Une panne e-mail ne retire
pas une réservation confirmée. Les reprises automatiques utilisent une clé
d'idempotence et une fenêtre de 23 h (inférieure à la rétention fournisseur de 24 h).
Après cette fenêtre ou épuisement des tentatives, vérifier la livraison chez
Resend avant toute réautorisation manuelle dans Gestion : une réponse réseau
incertaine ne permet pas de garantir une livraison exactement une fois.

## Reprise de l'ancien site

La présentation et les archives proviennent de `www.labicoque.org`, avec autorisation
de réutilisation. Histoires, arbre généalogique, frise, pacte et documents d'AG
restent privés dans la nouvelle application. Les commentaires et comptes WordPress
ne sont pas migrés. Le règlement historique est vide ; aucun règlement n'est inventé.

L'import du calendrier attend l'export Excel et la validation des admins :
dates, ouvert/exclusif, identité, branche et effectif ne sont pas devinés.
Ne pas envoyer rétroactivement des confirmations ou rappels pour des archives.
Ne pas importer directement des occupations confirmées en contournant les contrôles.
La bascule du domaine historique est une décision séparée.

## Vérifications avant ouverture

Tester deux groupes, deux admins dès que le second existe, J−22/J−21,
limites de six mois, période juillet–juin, partage à 30/31 personnes,
chevauchements partiels, conflits exclusifs, refus, mail de confirmation,
récapitulatif J+1, absence de tarif et reprise des e-mails.
Les tests locaux SQL ne remplacent pas les tests sur le projet Supabase réel,
le service d'e-mails et le site Cloudflare.
