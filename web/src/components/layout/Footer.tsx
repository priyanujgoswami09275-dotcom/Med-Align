// Footer disclaimer, exact text, present on every screen (test-pinned).
export function Footer() {
  return (
    <footer className="mt-10 border-t border-border/60 bg-card/70 px-4 py-4 backdrop-blur-sm sm:px-6">
      <p className="mx-auto max-w-5xl text-[12px] leading-5 text-muted-foreground sm:text-[13px]">
        Demo with synthetic data. Decision support, not medical advice. If someone feels very unwell, call 112.
      </p>
    </footer>
  );
}
