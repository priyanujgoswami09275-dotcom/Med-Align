// Footer disclaimer, exact text, present on every screen (test-pinned).
export function Footer() {
  return (
    <footer className="print-disclaimer mt-8 border-t border-border px-4 py-4 sm:px-6">
      <p className="mx-auto max-w-5xl text-[14px] leading-5 text-muted-foreground">
        Demo with synthetic data. Decision support, not medical advice. If someone feels very unwell, call 112.
      </p>
    </footer>
  );
}
