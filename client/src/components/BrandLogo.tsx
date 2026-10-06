interface BrandLogoProps {
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}

export function BrandLogo({ className = "", decorative = false, priority = false }: BrandLogoProps) {
  return (
    <img
      src="/lory-boutique-logo.png"
      alt={decorative ? "" : "Lory Boutique — Estilo em todos os momentos"}
      width={1080}
      height={1080}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={`shrink-0 aspect-square object-contain rounded-full ${className}`}
    />
  );
}
