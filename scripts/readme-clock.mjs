// Loaded with `node --import` by scripts/readme-assets.mjs, so every Ledger process in the README
// demo starts at the instant LEDGER_README_NOW names and the regenerated cards are byte-identical on
// any day. Time still advances from that instant, so timeouts, lock waits, and expiry checks behave
// as they do on a real clock. Without the variable, nothing changes.

const RealDate = globalThis.Date;
const pinned = RealDate.parse(process.env.LEDGER_README_NOW ?? "");

if (Number.isFinite(pinned)) {
  const offset = pinned - RealDate.now();
  const now = () => RealDate.now() + offset;
  // A function rather than a class so `Date()` without `new` keeps returning a string.
  function DemoDate(...args) {
    if (!new.target) return new RealDate(now()).toString();
    return args.length === 0 ? new RealDate(now()) : new RealDate(...args);
  }
  Object.setPrototypeOf(DemoDate, RealDate);
  DemoDate.prototype = RealDate.prototype;
  DemoDate.now = now;
  globalThis.Date = DemoDate;
}
