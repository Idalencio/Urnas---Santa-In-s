import { createRoot } from 'react-dom/client';
import App from './app';
import Terminal from './terminal';
import PublicTally from './public-tally';
const match = location.pathname.match(/^\/v2\/urna\/([a-zA-Z0-9-]+)\/?$/);
const tally = location.pathname.match(/^\/v2\/apuracao\/([a-f0-9]{64})\/?$/);
createRoot(document.getElementById('root')!).render(
  tally ? <PublicTally token={tally[1]} /> : match ? <Terminal id={match[1]} /> : <App />,
);
