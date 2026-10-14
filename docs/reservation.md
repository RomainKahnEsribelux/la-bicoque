# Réservation — pistes

| Option | Avantages | Inconvénients |
|---|---|---|
| **Cal.com** (open source, embed React `@calcom/embed-react`) | Prêt à l'emploi, sync Google/Outlook, gratuit pour 1 utilisateur | Moins personnalisable, dépendance externe |
| **Table `bookings` dans Supabase** + formulaire React | Contrôle total, données chez nous, gérable depuis Directus | À développer (créneaux, conflits, emails) |
| **Collection Directus** + Flows (emails de confirmation) | Gestion back-office directe | Logique de créneaux à coder |

Recommandation pour démarrer : intégrer Cal.com, puis migrer vers une solution Supabase si besoin de plus de contrôle.
