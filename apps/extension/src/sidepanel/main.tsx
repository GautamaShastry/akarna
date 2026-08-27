import { StrictMode, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function SidePanel(): ReactElement {
  return (
    <main className="panel">
      <p className="eyebrow">Akarna</p>
      <h1>Form assistance, safely.</h1>
      <p className="summary">
        Start from a supported form to inspect fields and issue controlled commands.
      </p>
      <button type="button" className="primary-button">
        Start session
      </button>
      <p className="notice">Milestone 0 uses typed commands on local fixture forms.</p>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Side panel root element is missing');
}

createRoot(root).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
