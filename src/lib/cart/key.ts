/** The identity of a cart line: the same product with the same option values is one line. */
export function lineKey(item: { productId: string; optionValueIds: readonly string[] }): string {
  return `${item.productId}:${[...item.optionValueIds].sort().join(',')}`;
}
