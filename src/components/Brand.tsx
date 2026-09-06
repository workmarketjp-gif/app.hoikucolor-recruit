const OFFICIAL_LOGO_URL = 'https://raw.githubusercontent.com/workmarketjp-gif/hoikucolor-app/main/src/logo/logo_hoikucolor.png';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Hoiku Color">
      <img className="brand-logo-image" src={OFFICIAL_LOGO_URL} alt="Hoiku Color" />
    </div>
  );
}
