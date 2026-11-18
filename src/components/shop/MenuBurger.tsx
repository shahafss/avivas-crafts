/**
 * The three lines of the menu button and of the menu drawer's close button (storefront.md 7.18,
 * research D21). The same markup in both, so the swap is invisible; inside an open drawer the lines
 * turn into an X (`.burger-line` rules in `globals.css`). Decorative: the button carries the name.
 */
export function MenuBurger() {
  return (
    <span aria-hidden="true" className="burger">
      <span className="burger-line burger-line-top" />
      <span className="burger-line burger-line-mid" />
      <span className="burger-line burger-line-bottom" />
    </span>
  );
}
