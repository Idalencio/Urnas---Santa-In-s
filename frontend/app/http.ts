export async function responseData(response: Response) {
  let data: any;
  try {
    data = JSON.parse(await response.text());
  } catch {
    if (response.status === 413)
      throw Error('A imagem excedeu o limite de envio. Use um arquivo de até 2 MB.');
    if (response.redirected || response.status === 401 || response.status === 403)
      throw Error('Sua sessão terminou. Entre novamente no painel para continuar.');
    throw Error('O servidor não respondeu corretamente. Tente novamente em alguns instantes.');
  }
  if (!response.ok)
    throw Error(data.error || 'Não foi possível concluir a operação. Tente novamente.');
  return data;
}
