import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ChordChartFormatter from './ChartFormatter.jsx';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <ChordChartFormatter />
  </StrictMode>,
);
