export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="Hoiku Color">
      <span className="brand-flower" aria-hidden="true">
        <i className="petal p1" /><i className="petal p2" /><i className="petal p3" /><i className="petal p4" />
      </span>
      <span className="brand-type">
        <strong>Hoiku <em>Color</em></strong>
        {!compact && <small>保育観で選ぶ、AIマッチング採用サイト。</small>}
      </span>
    </div>
  );
}
