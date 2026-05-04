// =====================================================================
// Full-page HTML/CSS template for Colis listing pages.
// Used by AdminColis / VendeurColis / LivreurColis when enabled.
// Edited from: Admin → Paramètres → Info Colis → "Page template" tab.
// =====================================================================

export const COLIS_PAGE_PRESET_KEY = "colis_page_preset";

export interface ColisPagePreset {
  enabled: boolean;            // when true, listing pages render this template instead of the classic table
  appliesTo: {
    admin: boolean;
    vendeur: boolean;
    livreur: boolean;
  };
  pageHeaderHtml: string;      // wrapper around the whole page (gets {{rows}} placeholder)
  rowHtml: string;             // template repeated for every order
  emptyHtml: string;           // shown when no orders match
  css: string;
}

/* -----------------------------------------------------------
   Default preset — clean Mallshopex-inspired layout
   • Primary teal #08938A, ink #1B2C40, muted #f8f8f8
   • Tokens (resolved at render time):
       Row:  {{customer_name}} {{customer_phone}} {{customer_city}}
             {{customer_address}} {{product_name}} {{order_value}}
             {{status}} {{tracking}} {{created_relative}}
             {{status_class}} {{status_label}}
             {{action:select}} {{action:details}}
             {{action:print_sticker}} {{action:edit}} {{action:delete}}
             {{action:confirm}} {{action:pickup}}
             {{action:call}} {{action:whatsapp}}
       Page: {{title}} {{count}} {{filters}} {{toolbar}} {{rows}}
   ----------------------------------------------------------- */

export const defaultColisPagePreset: ColisPagePreset = {
  enabled: false,
  appliesTo: { admin: true, vendeur: true, livreur: true },

  pageHeaderHtml: `<div class="cp-page">
  <header class="cp-page__head">
    <h1 class="cp-page__title">{{title}}</h1>
    <div class="cp-page__count">{{count}} colis</div>
  </header>

  <div class="cp-toolbar">{{toolbar}}</div>
  <div class="cp-filters">{{filters}}</div>

  <section class="cp-table">
    <div class="cp-table__head">
      <div class="cp-th cp-th--check"></div>
      <div class="cp-th">Client</div>
      <div class="cp-th">Ville</div>
      <div class="cp-th">Prix</div>
      <div class="cp-th">Statut</div>
      <div class="cp-th cp-th--actions">Actions</div>
    </div>
    <div class="cp-table__body">{{rows}}</div>
  </section>
</div>`,

  rowHtml: `<article class="cp-row cp-row--{{status_class}}">
  <div class="cp-cell cp-cell--check">{{action:select}}</div>

  <div class="cp-cell cp-cell--client">
    <div class="cp-client__name">{{customer_name}}</div>
    <div class="cp-client__meta">
      <span class="cp-tracking">{{tracking}}</span>
      <span class="cp-dot">·</span>
      <span class="cp-time">{{created_relative}}</span>
    </div>
    <div class="cp-client__product">{{product_name}}</div>
  </div>

  <div class="cp-cell cp-cell--city">{{customer_city}}</div>
  <div class="cp-cell cp-cell--price">{{order_value}}</div>

  <div class="cp-cell cp-cell--status">
    <span class="cp-badge cp-badge--{{status_class}}">{{status_label}}</span>
  </div>

  <div class="cp-cell cp-cell--actions">
    {{action:whatsapp}}
    {{action:call}}
    {{action:print_sticker}}
    {{action:edit}}
    {{action:delete}}
    {{action:details}}
  </div>
</article>`,

  emptyHtml: `<div class="cp-empty">Aucune commande</div>`,

  css: `:root{
  --cp-primary:#08938A;
  --cp-primary-soft:rgba(8,147,138,.10);
  --cp-ink:#1B2C40;
  --cp-muted:#6b7c8f;
  --cp-bg:#ffffff;
  --cp-line:#e6ebf2;
  --cp-soft:#f6f8fb;
  --cp-radius:10px;
  --cp-radius-sm:6px;
}
.cp-page{font-family:Helvetica,Arial,sans-serif;color:var(--cp-ink);padding:1.5rem;display:flex;flex-direction:column;gap:1rem}
.cp-page__head{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem}
.cp-page__title{font-size:2rem;font-weight:800;margin:0;letter-spacing:-.01em}
.cp-page__count{font-size:.85rem;color:var(--cp-muted);background:var(--cp-soft);padding:.4rem .75rem;border-radius:999px;border:1px solid var(--cp-line)}

.cp-toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.cp-toolbar > *{flex:0 0 auto}
.cp-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem;background:var(--cp-bg);border:1px solid var(--cp-line);border-radius:var(--cp-radius);padding:.75rem}

.cp-table{background:var(--cp-bg);border:1px solid var(--cp-line);border-radius:var(--cp-radius);overflow:hidden}
.cp-table__head{display:grid;grid-template-columns:36px 2fr 1fr 110px 140px 1.2fr;gap:.5rem;align-items:center;padding:.85rem 1rem;background:var(--cp-soft);border-bottom:1px solid var(--cp-line);font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--cp-muted);font-weight:700}
.cp-th--actions{text-align:right;justify-self:end}
.cp-table__body{display:flex;flex-direction:column}

.cp-row{display:grid;grid-template-columns:36px 2fr 1fr 110px 140px 1.2fr;gap:.5rem;align-items:center;padding:.9rem 1rem;border-bottom:1px solid var(--cp-line);transition:background .15s}
.cp-row:last-child{border-bottom:0}
.cp-row:hover{background:var(--cp-soft)}

.cp-cell--check{display:flex;justify-content:center}
.cp-client__name{font-weight:700;font-size:.95rem}
.cp-client__meta{display:flex;align-items:center;gap:.4rem;color:var(--cp-muted);font-size:.78rem;margin-top:2px}
.cp-tracking{font-family:ui-monospace,Menlo,monospace;background:var(--cp-soft);padding:.05rem .4rem;border-radius:4px;border:1px solid var(--cp-line)}
.cp-dot{opacity:.5}
.cp-client__product{font-size:.8rem;color:var(--cp-muted);margin-top:2px}
.cp-cell--city{font-weight:600}
.cp-cell--price{font-weight:800;font-variant-numeric:tabular-nums}

.cp-cell--actions{display:flex;justify-content:flex-end;gap:.35rem;flex-wrap:wrap}

.cp-badge{display:inline-block;font-size:.72rem;font-weight:700;padding:.3rem .6rem;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;background:var(--cp-soft);color:var(--cp-ink);border:1px solid var(--cp-line)}
.cp-badge--cree{background:#eef2f7;color:#3c5471;border-color:#dde4ee}
.cp-badge--confirme{background:#e7f3ff;color:#1f74ff;border-color:#cfe2ff}
.cp-badge--pickup{background:var(--cp-primary-soft);color:var(--cp-primary);border-color:rgba(8,147,138,.25)}
.cp-badge--transit{background:#fff5e0;color:#b8730e;border-color:#ffe0a3}
.cp-badge--livre{background:#e6f8ec;color:#1c8c45;border-color:#c8ecd4}
.cp-badge--reporte{background:#fff0c2;color:#8a6300;border-color:#ffe28a}
.cp-badge--annule,.cp-badge--refuse{background:#ffe7e7;color:#c1272d;border-color:#ffc9c9}
.cp-badge--retourne{background:#f5e7ff;color:#6c2bd9;border-color:#e3c9ff}

/* Action buttons (anchors injected as buttons) */
.cp-btn{appearance:none;border:1px solid var(--cp-line);background:#fff;color:var(--cp-ink);padding:.4rem .65rem;border-radius:var(--cp-radius-sm);font-size:.78rem;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem;font-weight:600;transition:all .15s}
.cp-btn:hover{border-color:var(--cp-primary);color:var(--cp-primary)}
.cp-btn--primary{background:var(--cp-primary);color:#fff;border-color:var(--cp-primary)}
.cp-btn--primary:hover{background:#067a72;color:#fff}
.cp-btn--icon{padding:.4rem;width:32px;justify-content:center}
.cp-btn--danger{color:#c1272d;border-color:#ffc9c9}
.cp-btn--danger:hover{background:#ffe7e7;color:#c1272d;border-color:#ffc9c9}

.cp-empty{padding:3rem;text-align:center;color:var(--cp-muted);font-style:italic}

@media (max-width: 900px){
  .cp-table__head{display:none}
  .cp-row{grid-template-columns:1fr;padding:1rem;gap:.5rem;border-bottom:8px solid var(--cp-soft)}
  .cp-cell--actions{justify-content:flex-start}
}
`,
};

export const normalizeColisPagePreset = (value: unknown): ColisPagePreset => {
  const v = (value && typeof value === "object" ? value : {}) as Partial<ColisPagePreset>;
  const a = (v.appliesTo && typeof v.appliesTo === "object" ? v.appliesTo : {}) as Partial<ColisPagePreset["appliesTo"]>;
  return {
    enabled: Boolean(v.enabled),
    appliesTo: {
      admin: a.admin ?? true,
      vendeur: a.vendeur ?? true,
      livreur: a.livreur ?? true,
    },
    pageHeaderHtml: typeof v.pageHeaderHtml === "string" ? v.pageHeaderHtml : defaultColisPagePreset.pageHeaderHtml,
    rowHtml: typeof v.rowHtml === "string" ? v.rowHtml : defaultColisPagePreset.rowHtml,
    emptyHtml: typeof v.emptyHtml === "string" ? v.emptyHtml : defaultColisPagePreset.emptyHtml,
    css: typeof v.css === "string" ? v.css : defaultColisPagePreset.css,
  };
};

export const colisPageVariables = [
  { token: "{{customer_name}}", desc: "Nom du client" },
  { token: "{{customer_phone}}", desc: "Téléphone" },
  { token: "{{customer_city}}", desc: "Ville" },
  { token: "{{customer_address}}", desc: "Adresse" },
  { token: "{{product_name}}", desc: "Produit" },
  { token: "{{order_value}}", desc: "Montant (formaté)" },
  { token: "{{order_value_raw}}", desc: "Montant brut" },
  { token: "{{status}}", desc: "Statut brut" },
  { token: "{{status_label}}", desc: "Statut affichable" },
  { token: "{{status_class}}", desc: "CSS class du statut (cree/confirme/pickup/...)" },
  { token: "{{tracking}}", desc: "Numéro de tracking" },
  { token: "{{created_at}}", desc: "Date de création" },
  { token: "{{created_relative}}", desc: "Relative (il y a 5 min)" },
  { token: "{{seller}}", desc: "Vendeur" },
  { token: "{{driver}}", desc: "Livreur" },
];

export const colisPageActions = [
  { token: "{{action:select}}", desc: "Case à cocher (sélection)" },
  { token: "{{action:details}}", desc: "Voir détails (toggle)" },
  { token: "{{action:edit}}", desc: "Modifier (vendeur, statut Crée)" },
  { token: "{{action:delete}}", desc: "Supprimer (vendeur, statut Crée)" },
  { token: "{{action:print_sticker}}", desc: "Imprimer sticker (statut Pickup)" },
  { token: "{{action:confirm}}", desc: "Confirmer (statut Crée)" },
  { token: "{{action:pickup}}", desc: "Envoyer pickup (statut Confirmé)" },
  { token: "{{action:call}}", desc: "Appeler le client" },
  { token: "{{action:whatsapp}}", desc: "WhatsApp client" },
];

export const colisPagePageVars = [
  { token: "{{title}}", desc: "Titre de la page" },
  { token: "{{count}}", desc: "Nombre d'éléments filtrés" },
  { token: "{{filters}}", desc: "Bloc filtres React (slot)" },
  { token: "{{toolbar}}", desc: "Bloc actions globales React (slot)" },
  { token: "{{rows}}", desc: "Liste des lignes (rendu rowHtml)" },
];
