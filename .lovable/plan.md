# خطة العمل — Refonte UI كاملة

## 1. Design System — Clean Corporate
تحديث `src/index.css` و`tailwind.config.ts`:
- Palette: navy `#0f1b3d` (primary), `#1e3a5f` (primary-glow), `#3b6fa0` (accent), `#e8edf3` (surface), `#fafbfc` (background)
- Typography: Inter للنص + Space Grotesk للعناوين (system-grade)
- Tokens semantic: `--background`, `--primary`, `--primary-foreground`, `--accent`, `--card`, `--border`, `--muted`, `--surface`, `--shadow-elegant`, `--gradient-primary`
- Radius: 8px (clean corporate)
- Update `StatusBadge`, `Button`, `Card`, `Table` styling لتنسجم

## 2. Fix Placeholder نهائيا
**المشكل:** `src/pages/Index.tsx` فيه placeholder image كيظهر خلال:
- Login flow (قبل redirect)
- Login as user (impersonation)
- أي route mismatch لحظي

**الحل:**
- استبدال Index.tsx بـ redirect مباشر للـ dashboard (إلى route مناسب حسب auth state) بدون image placeholder
- في `DashboardRouter.tsx` و`Impersonate.tsx`: استعمال loading screen موحد (logo + spinner) بدل placeholder.svg
- إضافة `AppLoading` component مشترك (logo OdiTship + spinner subtle) واستعماله في كل loading states

## 3. Top Navigation (dashboards فقط)
إنشاء `src/components/dashboard/TopNav.tsx`:
- Logo يسار + Nav links وسط + User menu + ProfileModal trigger يمين
- Sticky, h-16, navy background, accent hover, active underline
- Responsive: hamburger drawer < md
- Sub-nav للـ admin (Parametres, Workflows...) كـ dropdown أنيق

تعديل `src/components/DashboardLayout.tsx`:
- إزالة `SidebarProvider` و`AppSidebar`
- استبدال بـ `<TopNav />` + `<main>` بـ container max-w-7xl
- Footer محذوف من dashboards (يبقى في public layout)

## 4. Classic preset — enrichissement + حذف Canvas
**حذف:**
- ملف `AdminColisPreviewCanvas.tsx` (Canvas page)
- ملف `ColisCanvasPage.tsx` (renderer)
- إزالة `enabled`/`appliesTo` من `ColisPagePreset` (renderer canvas)
- إزالة `pagePreset.enabled && pagePreset.appliesTo.X` checks في:
  - `LivreurColis.tsx`, `VendeurColis.tsx`, `AdminColis.tsx`, `RamassoireColis` (إن وجد)
- إزالة route `/parametres/page-template` (canvas preview)
- حذف entries من sidebar/nav للـ Canvas

**Classic preset جديد** — `src/lib/colisClassicPreset.ts`:
```ts
type ClassicPreset = {
  fields: { key: ColisField; visible: boolean; order: number; label?: string }[];
  // ColisField = tracking|customer|city|phone|product|price|status|date|seller|actions
  appearance: {
    headerBg: string; headerFg: string;
    rowBg: string; rowAltBg: string; rowFg: string;
    borderColor: string; accentColor: string;
    fontSize: number;       // 12-18 px
    rowHeight: number;      // 36-72 px
    padding: number;        // 8-24 px
    radius: number;         // 0-16 px
  };
  statusBadges: Record<string, { bg: string; fg: string }>;
  details: {
    enabled: boolean;
    layout: 'tabs' | 'sections' | 'compact';
    fields: { key: DetailField; visible: boolean; order: number; group?: string }[];
    // DetailField: customer_block, address_block, product_block, history_timeline, comments, postponed, scheduled, financials, driver
    appearance: {
      bg: string; fg: string; accentColor: string;
      sectionGap: number; padding: number;
      showIcons: boolean; showHistory: boolean;
    };
  };
};
```

**UI ديال التحكم** — صفحة جديدة `AdminClassicPreset.tsx`:
- Tabs: **Champs** | **Apparence** | **Statuts** | **Détails (open)**
- **Champs:** drag-and-drop list (`@dnd-kit/sortable` موجود؟ سأفحص — وإلا up/down arrows) + checkbox visible
- **Apparence:** color pickers (HTML5 `<input type="color">`) + Sliders (`@/components/ui/slider`) للـ font/row/padding/radius
- **Statuts:** قائمة statuts + color picker لكل واحد
- **Détails (open):** نفس الفكرة (drag fields, layout select, colors, gap)
- زر **Reset** → يعيد defaults (مع confirm dialog)
- Live preview على اليمين (split view) كيتحدث في real-time
- Save → `app_settings` row `colis_classic_preset_v1`

**تطبيق:** 
- `ColisTable` component جديد يقرأ Classic preset ويرندر table مع كاع التحكم
- يستعمل في كل dashboards (vendeur/admin/livreur/ramassoire)
- Open details panel: customizable حسب preset

## 5. Cleanup
- حذف `AppSidebar` (إن كان موجود) من dashboard pages
- تحديث routes في `App.tsx`: حذف canvas preview route
- تحديث `AdminParametres.tsx`: استبدال Canvas/Page Template entry بـ "Affichage des colis" (Classic preset)
- اختبار كل dashboards تشتغل

## ملفات سيتم تعديلها
- `src/index.css`, `tailwind.config.ts` — design tokens
- `src/pages/Index.tsx`, `src/pages/Impersonate.tsx`, `src/pages/DashboardRouter.tsx` — fix placeholder
- `src/components/dashboard/TopNav.tsx` (جديد), `src/components/dashboard/AppLoading.tsx` (جديد)
- `src/components/DashboardLayout.tsx` — top nav
- `src/lib/colisClassicPreset.ts` (جديد), `src/components/dashboard/ColisTable.tsx` (جديد)
- `src/pages/admin/parametres/AdminClassicPreset.tsx` (جديد)
- `src/pages/admin/AdminParametres.tsx`, `src/App.tsx` — routes
- جميع `*Colis.tsx` pages (livreur/vendeur/admin/ramassoire)
- حذف: `ColisCanvasPage.tsx`, `AdminColisPagePreset.tsx`, `AdminColisPreviewCanvas.tsx`, `colisPagePreset.ts`

## نقطة مهمة
شغل كبير. هل نديرو كلشي في pass واحدة، ولا تفضل نقسموها؟
- **Pass 1:** Design tokens + Top nav + fix placeholder
- **Pass 2:** Classic preset enrichi + حذف Canvas

أكد لي: نمشي بـ Pass واحدة كاملة، ولا نقسم؟