import { alertLevels } from '../theme';

export default function TagAlerta({ nivel }) {
  const cfg = alertLevels[nivel] ?? alertLevels.OK;
  return (
    <span className="tag" style={{ color: cfg.cor, background: cfg.fundo }}>
      {cfg.label}
    </span>
  );
}
