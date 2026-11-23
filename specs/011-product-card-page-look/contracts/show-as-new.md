# Contract: the "Show as New" tick box

Spec FR-012; research D1; data model `product.show_as_new`.

## Piece editor (`/admin/products/[id]`, `PublishBar`)

- A checkbox directly under the "לא זמין להזמנה כרגע" box, built the same way (a `label` with a
  24 px checkbox, a bold line and a small `ink-2` hint), `data-testid="show-as-new-toggle"`.
- Text (`admin.products.bar.*`, Hebrew and English entries):
  - `showAsNew`: "הצגה כ'חדש'" / "Show as New"
  - `showAsNewHint`: "מציג תווית 'חדש' על כרטיס היצירה בחנות. אפשר להסיר את הסימון בכל עת." /
    "Shows a 'New' label on the piece's card in the shop. You can untick it at any time."
- Starts with the saved value (`EditorData` product `showAsNew`). Ticking or unticking changes
  nothing until "Save" (the same Save button and toast as the other fields). It is available in
  every state (draft, published, hidden) and is not part of the publish checklist.

## Server

| Piece | Rule |
|---|---|
| Server Action `setProductShowAsNew(productId: string, value: boolean)` (`src/app/admin/(protected)/products/[id]/actions.ts`) | `requireAdmin()` first; `productId` parsed with the existing `idSchema`; `typeof value !== 'boolean'` → the existing not-found failure; then calls the record function with the acting admin. |
| Record function `setProductShowAsNew(actor, id, value)` (`src/server/catalog/products.ts`) | In one transaction: `SELECT … FOR UPDATE` the product (missing → `admin.products.errors.not_found`); unchanged value → `ok` with no write; else update `show_as_new` and log `product.updated` with `{ field: 'showAsNew', to: value }`. |
| Editor save (`ProductEditor.saveAll`) | After `updateProduct` succeeds, when the box differs from the saved value, call the action; a failure shows the usual error toast (the same handling as `setProductOrderable`). |

## Storefront

- Only published pieces appear anywhere, so a ticked draft or hidden piece shows nothing until it
  is published.
- A published piece with `show_as_new = true` shows the "חדש" / "New" pill on every card (contract
  [ui.md](./ui.md) "Product card"). Unticking and saving removes it on the next page load.

## Checks

| Check | Where |
|---|---|
| Stores the value and logs it; unchanged value writes nothing; missing product fails; new products start `false` | `tests/integration/catalog-products.test.ts` |
| Admin only | `tests/integration/admin-actions-guard.test.ts` (discovers every exported action automatically) |
| Tick + Save → the card shows "חדש"; untick + Save → gone | `tests/e2e/admin-products.spec.ts` |
