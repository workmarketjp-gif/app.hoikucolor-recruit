import logoHoikuColor from '../logo/logo_hoikucolor.png';
import './brand.css';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Hoiku Color">
      <img className="brand-logo-image" src={logoHoikuColor} alt="Hoiku Color" />
    </div>
  );
}
