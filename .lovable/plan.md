# Refonte de la facturation

## 1. Génération basée sur les commandes (au lieu d'une période)

**Logique :** une commande est "facturable" si son statut est Livré / Refusé / Annulé **et** qu'elle n'apparaît dans aucune `invoice_items.order_id`.

**UI "Générer une facture" (livreur & vendeur) :**
- Suppression des champs date début / date fin
- Liste déroulante des destinataires affichant : `Nom — N commandes en attente`
- Option `Tous` toujours présente, montrant le total global agrégé
- Bouton génère : crée une facture par destinataire avec toutes ses commandes en attente

**Code :** `invoiceGenerator.ts` reçoit `targetId?` et calcule depuis les commandes non facturées (left join sur `invoice_items`). `period_start`/`period_end` deviennent la min/max `updated_at` des commandes incluses (toujours stockés pour info).

## 2. Génération automatique avancée

**Schéma `invoice_schedules` (migration) — ajouter :**
- `schedule_mode text` ('daily' | 'weekly')
- `days_of_week int[]` (0=dim … 6=sam, utilisé si weekly)
- `hour int` (0–23)
- `minute int` (0–59)

**UI Admin :**
- Toggle activé
- Mode : Daily / Jours spécifiques (cases à cocher Lun–Dim)
- Time picker (heure + minute)
- Plus de champ "tous les N jours"

**Exécution :** la même logique d'auto-gen exploite désormais "toutes les commandes en attente" (équivalent à `Tous`).

## 3. Sous-statuts à côté du statut principal

**Affichage commandes (cellule statut, table `orders`) :**
- Statut principal (Livré/Refusé/Annulé/…) inchangé
- Si statut ∈ {Livré, Refusé, Annulé} **et** rôle = vendeur context :
  - Badge `Facturé` / `Non facturé` (présence dans `invoice_items` rattachée à une `invoices` `recipient_type='vendeur'`)
  - Badge `Payée` / `Non payée` (statut de l'invoice)

Implémenté dans `ColisMainRowCell.tsx` via une requête légère qui charge la map `order_id → {invoiced, paid}` au montage de la liste.

## 4. Export PDF + CSV

Bouton sur chaque ligne facture (et dans le détail) :
- **CSV** : génération côté client à partir de `invoice_items` (Papa-style join, pas de dépendance — concat manuel)
- **PDF** : `jspdf` + `jspdf-autotable` (à ajouter), template simple avec en-tête destinataire, période, lignes, total

## Fichiers touchés
- `supabase/migrations/...sql` — colonnes `invoice_schedules` + index `invoice_items(order_id)`
- `src/lib/invoiceGenerator.ts` — refactor sur commandes non facturées
- `src/lib/invoiceExport.ts` — nouveau (CSV + PDF helpers)
- `src/pages/admin/AdminFacturation.tsx` — nouveau sélecteur, nouveau bloc planification, boutons export
- `src/pages/vendeur/VendeurFacturation.tsx` — boutons export
- `src/components/dashboard/ColisMainRowCell.tsx` — sous-badges
- (optionnel) edge function `auto-invoice-runner` non incluse ici — le scheduling DB est posé, l'exécution réelle peut être branchée ensuite

## Ordre d'exécution
1. Migration schéma `invoice_schedules`
2. Refactor générateur + UI génération
3. Nouvelle UI scheduling
4. Sous-badges statut
5. Export PDF/CSV (ajout dépendance `jspdf` + `jspdf-autotable`)
