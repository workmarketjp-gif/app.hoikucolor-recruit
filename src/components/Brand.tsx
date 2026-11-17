import './brand.css';

const logoHoikuPoppy = '/logo/logo_hoikupoppy.png.png';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Hoiku Poppy">
      <img className="brand-logo-image" src={logoHoikuPoppy} alt="Hoiku Poppy" />
    </div>
  );
}
