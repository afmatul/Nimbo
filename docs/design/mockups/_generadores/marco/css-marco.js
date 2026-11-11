// CSS del marco compartido de la aplicación, extraído del generador de identity/seguridad sin cambios.
// Lo usan seguridad/generar.js y layout/generar.js (a través de marco.js). No editar a mano sin regenerar ambos.

// Tokens, hoja, lienzo, barra lateral, barra superior y encabezado de página (propuesta p. 08 y p. 17)
exports.MARCO = `  :root {
    /* Valores de ui-guidelines.md §3 (tonos AA de ADR-0014). La implementación usa las utilidades de Tailwind, nunca hex. */
    --sheet: #E7EDF5;          /* fondo de la hoja de mockups (no es un token de la app) */
    --background: #F4F7FB;
    --card: #FAFCFF;
    --border: #DDE6F0;
    --input: #7F93AA;
    --foreground: #1E2D40;
    --secondary-foreground: #3A5068;
    --muted-foreground: #5E7389;
    --primary: #4A6FA5;
    --primary-hover: #3B5A8A;
    --primary-foreground: #FFFFFF;
    --brand: #6B8DD6;
    --muted: #EEF3F9;
    --accent: #DDE6F0;
    --ring: #4A6FA5;
    --success: #6DB99A;
    --success-foreground: #3A7560;
    --destructive: #A34F4F;
    --destructive-soft: #C97B7B;
    --overlay: rgba(44, 58, 82, .45); /* velo de diálogo: agent-bg al 45 %; token pendiente (#6 de app-layout) */
    --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 18px;
    --shadow-card: 0 1px 3px rgba(74,111,165,.08), 0 1px 2px rgba(74,111,165,.04);
    --shadow-modal: 0 8px 24px rgba(44,58,82,.18);
    --shadow-button: 0 1px 2px rgba(107,141,214,.20);
    /* Mezclas al 12 % sobre card (fondo de alertas y distintivos) */
    --success-soft: color-mix(in srgb, var(--success) 12%, var(--card));
    --destructive-tint: color-mix(in srgb, var(--destructive-soft) 12%, var(--card));
    --brand-soft: color-mix(in srgb, var(--brand) 12%, var(--card));
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--sheet); color: var(--foreground);
    font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 1.5;
  }
  a { color: var(--primary); text-decoration: underline; text-underline-offset: 2px; }
  a:hover { color: var(--primary-hover); }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  .ico { flex: none; }

  /* Rótulo de la hoja */
  .sheet-label {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
    padding: 40px 48px 12px; font-size: 12px; line-height: 1.5; color: var(--secondary-foreground);
  }
  .sheet-label .chip { background: var(--border); border-radius: var(--radius-sm); padding: 1px 7px; font-weight: 600; font-size: 11px; }
  .sheet-label strong { color: var(--foreground); font-size: 13px; font-weight: 600; }
  .sheet-label .file { font-weight: 500; font-variant-numeric: tabular-nums; color: var(--primary-hover); }

  /* Lienzo y marco de la aplicación (propuesta p. 08 y p. 17) */
  .canvas {
    position: relative; margin: 0 48px 48px; background: var(--background); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card); overflow: hidden;
  }
  .app { display: grid; grid-template-columns: 236px minmax(0, 1fr); min-height: 860px; }
  .sidebar { display: flex; flex-direction: column; gap: 14px; background: var(--card); border-right: 1px solid var(--border); padding: 18px 12px 16px; }
  .brand-row { display: flex; align-items: center; gap: 10px; padding: 4px 8px 10px; border-bottom: 1px solid var(--border); }
  .logo { display: inline-flex; align-items: center; gap: 10px; color: var(--foreground); text-decoration: none; font-weight: 700; font-size: 17px; letter-spacing: .02em; min-height: 36px; }
  .logo-mark { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; background: var(--primary); color: var(--primary-foreground); font-size: 15px; font-weight: 700; box-shadow: var(--shadow-button); }
  .plan-chip { font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .04em; color: var(--secondary-foreground); background: var(--muted); border-radius: var(--radius-sm); padding: 2px 6px; }
  .nav { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .nav a { display: flex; align-items: center; gap: 12px; min-height: 36px; padding: 6px 12px; border-radius: var(--radius-md); color: var(--secondary-foreground); text-decoration: none; font-size: 13.5px; font-weight: 500; }
  .nav a:hover { background: var(--muted); color: var(--foreground); }
  .nav .meta { margin-left: auto; font-size: 11px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
  .nav-sep { height: 1px; background: var(--border); margin: 2px 8px; }
  .nav-title { margin: 6px 12px 0; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted-foreground); }
  .quota { margin-top: auto; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 14px; background: var(--card); }
  .quota-head { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; }
  .quota-bar { height: 6px; border-radius: 999px; background: var(--muted); margin: 8px 0 6px; overflow: hidden; }
  .quota-bar span { display: block; height: 100%; width: 21%; background: var(--success); border-radius: 999px; }
  .quota-meta { font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--muted-foreground); }

  .main { min-width: 0; display: flex; flex-direction: column; }
  .topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 64px; padding: 10px 28px; background: var(--card); border-bottom: 1px solid var(--border); }
  .topbar .menu-btn, .topbar .logo-mobile { display: none; }
  .crumbs ol { display: flex; align-items: center; gap: 10px; list-style: none; margin: 0; padding: 0; font-size: 14px; }
  .crumbs li + li::before { content: "/"; color: var(--muted-foreground); margin-right: 10px; }
  .crumbs a { color: var(--secondary-foreground); text-decoration: none; }
  .crumbs a:hover { color: var(--foreground); text-decoration: underline; }
  .crumbs [aria-current] { font-weight: 600; color: var(--foreground); }
  .account-btn { display: inline-flex; align-items: center; gap: 10px; min-height: 40px; padding: 4px 6px 4px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--secondary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
  .account-btn:hover { background: var(--muted); }
  .avatar { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; background: var(--card); color: var(--foreground); font-size: 11px; font-weight: 700; box-shadow: 0 0 0 2px var(--brand); }

  .content { padding: 28px 28px 40px; }
  .page-head h1 { margin: 0; font-size: 26px; line-height: 1.25; font-weight: 700; letter-spacing: -.01em; }
  .page-head p { margin: 6px 0 0; color: var(--secondary-foreground); font-size: 14.5px; }
`;

// Botones (components/ui/button) y animación de carga
exports.BOTONES = `  /* Botones (components/ui/button) */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 8px 16px; border-radius: var(--radius-md); font: inherit; font-weight: 600; font-size: 13.5px; line-height: 1.2; cursor: pointer; text-decoration: none; white-space: nowrap; }
  .btn-sm { min-height: 36px; padding: 6px 12px; font-size: 13px; }
  .btn-outline { color: var(--secondary-foreground); background: var(--card); border: 1px solid var(--input); }
  .btn-outline:hover { background: var(--muted); color: var(--foreground); }
  .btn-primary { color: var(--primary-foreground); background: var(--primary); border: 1px solid var(--primary); box-shadow: var(--shadow-button); }
  .btn-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
  .btn-destructive { color: var(--primary-foreground); background: var(--destructive); border: 1px solid var(--destructive); }
  .btn[disabled] { opacity: .45; pointer-events: none; }
  .btn-busy { opacity: 1 !important; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin, .skeleton-line { animation: none !important; } }
`;

// Diálogo de confirmación (ConfirmDestructiveDialog)
exports.DIALOGO = `  /* Diálogo de confirmación (ConfirmDestructiveDialog) */
  .overlay { position: absolute; inset: 0; background: var(--overlay); z-index: 10; }
  .dialog { position: absolute; z-index: 11; top: 150px; left: 50%; transform: translateX(-50%); width: min(460px, calc(100% - 32px)); background: var(--card); border-radius: var(--radius-xl); box-shadow: var(--shadow-modal); padding: 24px; }
  .dialog h2 { margin: 0; font-size: 18px; line-height: 1.35; font-weight: 700; }
  .dialog p { margin: 8px 0 0; color: var(--secondary-foreground); font-size: 14px; }
  .dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
`;

// Por debajo de 900 px: la barra lateral pasa al cajón y la barra superior muestra el botón de menú
exports.MQ_900 = `  @media (max-width: 900px) {
    .app { grid-template-columns: minmax(0, 1fr); min-height: 0; }
    .sidebar { display: none; }
    .topbar { padding: 10px 12px; }
    .topbar .menu-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--foreground); cursor: pointer; }
    .topbar .logo-mobile { display: inline-flex; }
    .crumbs { display: none; }
    .topbar-left { display: flex; align-items: center; gap: 4px; }
    .account-btn .account-name { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
    .account-btn { padding: 4px; min-width: 44px; min-height: 44px; justify-content: center; }
  }
`;

// Por debajo de 600 px (dentro de @media): hoja, lienzo y encabezado
exports.MQ600_MARCO = `    .sheet-label { padding: 16px 12px 10px; }
    .canvas { margin: 0 8px 16px; border-radius: var(--radius-md); }
    .content { padding: 18px 12px 28px; }
    .page-head h1 { font-size: 23px; }
`;

// Por debajo de 600 px (dentro de @media): diálogo
exports.MQ600_DIALOGO = `    .dialog { top: 96px; padding: 20px 16px 16px; }
    .dialog-actions { flex-direction: column-reverse; }
    .dialog-actions .btn { width: 100%; }
`;

// Tramos de QuotaBar (ui-guidelines §4) en la tarjeta de cuota: los usan mis-archivos (005/006), espacio (007) y layout
exports.TRAMOS = `  /* Cuota en tramos de QuotaBar (§4): 70–89 % warning; 90–100 % destructive-soft */
  .quota-warn .quota-bar span { background: var(--warning); }
  .quota-full { border-color: color-mix(in srgb, var(--destructive-soft) 45%, var(--card)); }
  .quota-full .quota-bar span { background: var(--destructive-soft); }
  .quota-note { margin: 8px 0 0; font-size: 11.5px; line-height: 1.45; font-weight: 500; }
  .quota-warn .quota-note { color: var(--warning-foreground); }
  .quota-full .quota-note { color: var(--destructive); }
`;
