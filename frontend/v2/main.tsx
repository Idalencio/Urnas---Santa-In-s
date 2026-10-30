import { createRoot } from 'react-dom/client';
import App from './app';
import Terminal from './terminal';
const match = location.pathname.match(/^\/v2\/urna\/([a-zA-Z0-9-]+)\/?$/);
createRoot(document.getElementById('root')!).render(match ? <Terminal id={match[1]} /> : <App />);
