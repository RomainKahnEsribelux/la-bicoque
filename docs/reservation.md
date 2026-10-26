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

Deux admins maximum, invitations admin en attente comprises. Dans Gestion, un
admin peut enregistrer une invitation membre ou réserver la deuxième place admin.
L'adresse est liée côté serveur au compte après vérification de l'e-mail, jamais
à un rôle choisi à l'inscription. Une invitation non acceptée peut être annulée ;
un admin actif ne peut pas être révoqué depuis le site dans cette version.
Les invitations n'envoient aucun e-mail tant que le parcours SMTP n'est pas activé.
L'ancienne auto-activation du propriétaire est désactivée dans la nouvelle
migration, avant l'ouverture des inscriptions. Voir [la mise en service](../supabase/README.md).

## Mes séjours, annulations et paiements

La page Mes séjours affiche uniquement les demandes du compte connecté, y compris
pour un admin (sa vue complète reste dans Gestion). « Demande reçue » n'est pas
une réservation. Une approbation différée indique la date d'éligibilité J−21 ;
un conflit laisse le séjour non confirmé.

Le demandeur peut annuler une demande reçue, approuvée ou confirmée **avant le
jour d'arrivée en Europe/Brussels**. À partir de l'arrivée, un admin intervient
avec un motif. L'annulation libère les occupations et réévalue les approbations
éligibles sous le même verrou que le cron. Elle neutralise les notifications
non envoyées devenues obsolètes ; un e-mail déjà envoyé ne peut pas être rappelé.

Le suivi porte sur le **paiement total**, sans transaction en ligne. Le montant
est affiché seulement si le séjour est confirmé et le tarif validé : personnes
estimées × nuits × tarif enregistré en centimes. Les coordonnées de virement
ne sont consultables que pour ses propres séjours concernés ou par les admins.
Un admin marque le paiement reçu et peut corriger cette saisie avec un motif.
Les rappels non envoyés sont neutralisés pour un séjour payé. Une correction
peut remettre un rappel en attente, mais ne renvoie pas un rappel déjà livré.
Une annulation ne crée pas de remboursement automatique : la gestion traite
séparément tout montant déjà reçu.

## Fiche pratique et historique

La fiche pratique est accessible aux comptes à e-mail confirmé, sans validation
familiale supplémentaire. Son contenu est protégé en base par RLS, pas inclus
dans le bundle public. La synthèse des documents d'octobre 2020 exclut accès,
anciens contacts/tarifs et manipulations techniques non validées. Les cases de la
checklist ne sont pas enregistrées. Les horaires et détails actuels restent à
confirmer avec la gestion.

Le journal serveur commence à son installation. Il conserve acteur, date,
référence et changements métier des actions admin, membre et automatiques ;
il n'invente pas le passé et ne copie ni secrets ni coordonnées bancaires.
Seuls les admins le consultent, sans possibilité de modifier ses lignes.

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
