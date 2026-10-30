import { createRoot } from 'react-dom/client';
import App from './app/ui';
import TerminalApp from './app/terminal-app';
import TestUrnas from './app/test-urnas';
import './app/globals.css';
const path = location.pathname.replace(/^\/alternativa(?=\/|$)/, '').replace(/\/$/, '') || '/';
let content;
if (path === '/testar') content = <TestUrnas />;
else if (path === '/testar/padrao') content = <TestUrnas initialModel="standard" />;
else if (path === '/testar/infantil') content = <TestUrnas initialModel="images" />;
else if (/^\/urna\/[a-zA-Z0-9-]+$/.test(path))
  content = <TerminalApp terminalId={path.split('/')[2]} />;
else content = <App />;
createRoot(document.getElementById('root')!).render(content);
