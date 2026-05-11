
# Refonte du système de tarification

## Objectif
Passer d'un tarif unique par ville (table `pricing_rules`) vers un système de **packs tarifaires** réutilisables, croisant **ville de ramassage** et **ville de destination**, avec délai de livraison, et permettant des **tarifs personnalisés** par vendeur ou par livreur.

---

## 1. Schéma base de données (migration)

### Nouvelles tables

**`pickup_cities`** – villes d'où partent les ramassages
- `name` (unique)

**`pricing_packs`** – packs réutilisables (Frais livraison / refus / annulation + délai)
- `name`, `delivery_fee`, `refusal_fee`, `annulation_fee`, `delivery_delay_hours`, `scope` (`global` | `vendeur` | `livreur`), `owner_id` (nullable, vendeur ou livreur)

**`pricing_pack_links`** – lie un pack à des couples (ville de ramassage × ville de destination)
- `pack_id`, `pickup_city`, `destination_city`
- Index unique composite, permet "toutes les villes" via wildcard `*`

### RLS
- `pickup_cities` / `pricing_packs` / `pricing_pack_links`: lecture par tous authentifiés, écriture admin uniquement
- Vendeurs/livreurs voient leurs propres packs

### Migration des données
- Convertir les `pricing_rules` actuelles (vendeur_id NULL) en un pack global "Standard" lié à toutes les villes

---

## 2. Nouvelle entrée Paramètres: "Tarifs & Délai Livraison"

Nouvel onglet dans `AdminParametres.tsx` avec 3 sous-sections:

### a) Villes de ramassage
- CRUD simple (comme `AdminCities`)

### b) Packs tarifaires
- Créer/éditer un pack: nom, 3 frais, délai (heures/jours)
- Bouton "Lier à des villes":
  - Sélection ville de ramassage (ou *Toutes*)
  - Multi-select villes destination + checkbox **"Toutes les villes"**
- Liste des liens existants par pack

### c) (la liste des règles courantes reste dans `AdminCities` pour compat, mais les frais sont gérés via packs)

---

## 3. Page publique `/pricing`

- Ajouter un **`<Select>` "Filtrer par ville de ramassage"** en tête de tableau
- Le tableau affiche pour chaque ville destination: frais livraison / refus / annulation + **délai**
- Données calculées via résolution: pack global lié au couple (ramassage, destination)

---

## 4. Tarifs personnalisés Vendeur

Dans `AdminUtilisateurs.tsx` (panneau d'édition d'un vendeur):
- Toggle **"Tarif personnalisé"**
- Si activé: éditeur inline (mêmes 3 champs frais)
- Bouton "Appliquer aux villes": multi-select destinations + checkbox "Toutes les villes"
- Sauvegarde comme `pricing_pack` scope=`vendeur`, owner=vendeur_id, lié aux villes choisies

Au calcul des factures: si pack vendeur existe pour une ville → prioritaire sur global.

---

## 5. Tarifs personnalisés Livreur

Nouvelle section dans `AdminLivreurs.tsx` (onglet Livreurs & API):
- Bouton "Tarifs" par livreur ouvrant un dialog
- Champs: 3 frais
- Multi-select villes **filtré par les hubs assignés au livreur** (via `hub_cities`)
- Checkbox "Toutes les villes des hubs"
- Sauvegarde pack scope=`livreur`, owner=livreur_id

---

## 6. Résolution des prix (helper partagé)

Nouveau `src/lib/pricingResolver.ts`:
```
resolvePrice({ pickupCity, destCity, vendeurId?, livreurId? })
  → { delivery_fee, refusal_fee, annulation_fee, delay }
Priorité: livreur > vendeur > global
```
Utilisé par: `/pricing`, futures factures, affichage commande.

---

## Détails techniques

- Tables avec RLS, triggers `updated_at`
- Wildcard `*` pour "toutes les villes" dans `pricing_pack_links` évite explosion de lignes
- Frontend: composants réutilisables `PackEditor`, `CityLinker`
- Pas de breaking change sur `pricing_rules` (gardée comme legacy fallback le temps de la migration UI)

---

## Hors scope (à confirmer plus tard)
- Recalcul rétroactif des factures déjà émises
- Application automatique du nouveau délai aux commandes en cours

---

Approuvez ce plan pour que je lance la migration DB puis l'implémentation UI.
