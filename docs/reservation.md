# Réservation de La bicoque

La première version utilise des demandes de séjour pour la maison entière.
Le voyageur connecté indique son prénom et son nom, ses dates, le nombre de
personnes et ses heures d'arrivée/de départ souhaitées, choisies à l'heure
pleine. Ces horaires sont des préférences à confirmer, pas des horaires promis
par le site.

- L'arrivée est incluse et le départ exclu de la période (format `[arrivée, départ)`).
  Ainsi, un nouveau séjour peut commencer le jour où un autre se termine.
- Les demandes en attente ne bloquent pas les dates.
- Seuls un séjour confirmé par le propriétaire ou un blocage manuel rendent les
  dates indisponibles.
- PostgreSQL impose une contrainte d'exclusion sur toutes les périodes occupées :
  deux confirmations ou blocages qui se chevauchent ne peuvent pas être validés,
  même si deux opérations ont lieu en même temps.
- La capacité doit être configurée par le propriétaire avant l'envoi des demandes.
- Les membres connectés voient le prénom et le nom des voyageurs dont le séjour
  est confirmé, dans le calendrier partagé. Les blocages manuels restent
  anonymes. Les e-mails, messages et demandes non confirmées ne sont pas exposés
  dans ce calendrier.
- Dans **Réservation**, le calendrier mensuel utilise le vert pour les jours
  libres, le rouge pour les jours occupés et le gris pour les jours passés.
  Sélectionner deux dates libres choisit l'arrivée puis le départ ; un départ
  le jour où commence un autre séjour reste possible, mais aucun chevauchement
  n'est accepté.
- Le prénom et le nom sont requis lors d'une demande. Le propriétaire voit ces
  informations et l'adresse e-mail associée au compte pour pouvoir contacter le
  voyageur.
- Les voyageurs ne peuvent lire que leurs propres demandes. Le propriétaire gère
  les confirmations, refus, capacité et blocages.

## Mise en place de la base

Le fichier de migration inclut maintenant la collecte du prénom/nom et
l'affichage des noms des séjours confirmés. Si une ancienne version de cette
migration a déjà été exécutée dans Supabase, ne la relance pas : il faut préparer
une migration de mise à niveau distincte.

1. Désactiver **Allow new users to sign up** dans les paramètres Auth Supabase.
2. Garder un seul utilisateur Auth jusqu'à l'activation de son accès propriétaire.
3. Dans le Dashboard Supabase, ouvrir **SQL Editor**, créer une nouvelle requête,
   y coller le contenu de `supabase/migrations/20261016090000_booking_requests.sql`,
   puis l'exécuter. Si Supabase renvoie une erreur, ne pas répéter aveuglément le
   script : corriger ou annuler toute exécution partielle avant de recommencer.
4. Revenir sur `/gestion` dans le site, se connecter avec le compte propriétaire
   et choisir **Activer les droits propriétaire**. La base n'autorise cette
   opération qu'une fois et seulement si un unique utilisateur Auth existe.
5. Définir le nombre maximal de voyageurs dans la section **Gestion**. Tant que
   cette valeur est absente, le formulaire refuse les demandes.

Pour l'instant, un séjour d'au moins une nuit est accepté ; aucune durée
minimale supérieure n'est configurée. Confirmer cette règle avant la publication.

La migration active RLS et expose les opérations par des fonctions contrôlées.
La fonction calendrier ne renvoie aux membres connectés que les dates occupées
et le nom des séjours confirmés.
Ne pas ajouter de clé Supabase `secret` ou `service_role` au frontend. Ne pas
créer d'autres comptes avant d'avoir activé le propriétaire : une fois plusieurs
utilisateurs présents, le mécanisme d'activation initiale refusera de choisir
arbitrairement un propriétaire.

Après cela, tester une demande avec le compte voyageur, la confirmer depuis
**Gestion**, et vérifier qu'une deuxième période qui se chevauche est rejetée.
La synchronisation Airbnb/Booking.com, les paiements et les notifications
automatiques restent hors périmètre.
