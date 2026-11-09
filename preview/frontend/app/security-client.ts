import { responseData } from './http';
export async function auth(action: string, payload: any = {}) {
  const result = await responseData(
    await fetch('/api/auth', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
      },
      body: JSON.stringify({ action, ...payload }),
    }),
  );
  if (result.panelKey) sessionStorage.setItem('urna_panel_key', result.panelKey);
  return result;
}
