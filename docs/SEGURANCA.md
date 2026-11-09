# Segurança da urna

## Atualização de 9 de novembro de 2026

A proteção em duas etapas e o histórico administrativo funcionam no pacote PHP/MySQL e na prévia D1. Os ambientes têm bancos e chaves separados. Esta atualização não altera o eleitorado publicado nem vincula votos à matrícula.

### Ativar a proteção da conta

1. Entre no painel e abra **Conta → Proteção em duas etapas → Ativar proteção**.
2. Confirme sua senha atual e adicione o QR code a um aplicativo autenticador compatível com TOTP.
3. Digite o código do aplicativo para concluir. A configuração pendente expira em 10 minutos e pertence à aba que a iniciou.
4. Guarde os dez códigos de recuperação em local seguro, separado da senha. São exibidos uma vez e cada um funciona uma vez.

O QR code é gerado no navegador, sem enviar a chave a um serviço externo. A ativação é individual: esta atualização não configura o celular de ninguém. O painel lembra administradores que ainda não ativaram a proteção e indica a situação de cada conta em Acessos.

Depois da ativação, a senha sozinha não cria sessão. O login pede um código do aplicativo ou de recuperação. Ativar, renovar códigos ou desativar exige novamente a senha; renovar/desativar e trocar senha também exige o segundo fator. Essas alterações invalidam as outras sessões. Redefinir uma senha administrativa não remove o segundo fator.

| Proteção     | Implementação                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Autenticador | RFC 6238, SHA-1, 6 dígitos, 30 segundos, tolerância de um intervalo em cada direção              |
| Reutilização | Último intervalo aceito é persistido; a transação/CAS impede consumo duplicado                   |
| Recuperação  | Dez códigos aleatórios de 128 bits; somente SHA-256 no banco; consumo único                      |
| Chave TOTP   | 160 bits aleatórios; AES-256-GCM no servidor; não é devolvida após a configuração                |
| Tentativas   | Login limitado por IP e conta; operações de MFA limitadas por conta                              |
| Sessões      | Cookie HttpOnly/Secure em HTTPS, chave adicional da aba, validade de 12 horas e versão revogável |

Se um código tiver acabado de ser usado, espere o aplicativo mostrar o próximo. A revogação é conferida pelo servidor a cada requisição; linhas antigas de sessão podem permanecer até a limpeza sem conceder acesso.

### Chaves e recuperação pela T.I.

**PHP/CloudPanel:** a chave AES é criada automaticamente em `storage/security/mfa.key`, fora de `public`, com arquivo 0600 e diretório 0700. O usuário PHP precisa escrever em `storage`. Faça backup privado dessa chave junto com o banco. Não a publique nem a envie ao GitHub. Apagar ou substituir a chave impede a leitura dos autenticadores existentes.

Se alguém perder o autenticador e todos os códigos, a T.I. com acesso ao servidor pode executar:

```sh
php bin/console.php reset-mfa nome_do_usuario
```

O comando exige a confirmação textual `REDEFINIR`, registra a ação como console da T.I., preserva a senha e encerra todas as sessões da conta. Depois, o usuário deve entrar e configurar outro autenticador. Esse comando não deve ser disponibilizado pela web. O comando `reset-password` preserva a MFA e também gera um registro no histórico.

**Prévia hospedada:** a chave `MFA_ENCRYPTION_KEY` é um segredo do ambiente, com 64 caracteres hexadecimais aleatórios. Não fica no código, no banco ou em `.openai/hosting.json`. Não a rotacione sem um plano de recuperação. Para recuperação extraordinária da prévia, use o acesso de manutenção ao banco pela plataforma; não existe endpoint web que permita a outra conta remover a MFA silenciosamente. A identidade e a restrição de público da plataforma continuam preservadas.

### Histórico administrativo

Administradores consultam **Histórico**; contas de equipe não têm esse acesso, mesmo com permissão de apuração. A API é somente leitura e exige sessão e chave do painel. Há filtros por responsável, ação, eleição e data, com paginação de 50 registros. Datas dos filtros usam UTC; horários da lista são exibidos no fuso do navegador.

O registro inclui data, ID e nome do responsável, ação, tipo e ID do alvo, eleição relacionada e totais da importação. Inclui cadastros e alterações de eleições, candidatos, urnas, alunos, turmas e acessos; importações, inclusive sem mudanças; publicação, encerramento, duplicação, exclusão de rascunhos, cancelamento de liberações; uploads e alterações de senha/MFA. Entradas bem-sucedidas no painel também ficam registradas. Operações antigas do painel legado recebem prefixo `legacy.`.

Mudanças administrativas e seu histórico são confirmados na mesma transação: falha ao registrar desfaz a alteração. No D1, o evento só acompanha a revisão vencedora do CAS. Arquivos enviados ao armazenamento antes de uma falha podem ficar sem referência; isso não confirma sua associação a um candidato.

Não são gravados senha, chave de autenticação, QR code, tokens, códigos de recuperação, conteúdo bruto de listas ou escolhas de voto. Matrícula pode aparecer como alvo de uma alteração cadastral ou cancelamento administrativo, nunca junto de uma escolha de voto. Eventos de votação pública ficam fora desse histórico.

O histórico começa nesta atualização; ações anteriores não podem ser reconstruídas. Não há edição ou exclusão de eventos pela interface/API. Ele não é uma prova imutável contra alguém que controla o banco ou o servidor. Defina retenção e backups conforme as regras da escola; não há expurgo automático nesta versão.

### Dependências e verificações

A revisão atualizou Next.js para 16.4.1, React/React DOM/RSC da prévia para 19.2.8 e Vite para 8.1.6, além das dependências transitivas apontadas pela auditoria. Os overrides em `preview/pnpm-workspace.yaml` e `preview/package.json` mantêm versões corrigidas; não os remova antes de conferir a árvore completa novamente.

Na checagem desta entrega, os 23 alertas das dependências de produção da prévia caíram para zero. Também foram consultadas as dependências de desenvolvimento. Auditoria de pacotes cobre alertas conhecidos naquele momento; não comprova ausência de vulnerabilidades na aplicação.

Verificações reproduzíveis:

```sh
npm ci
npm audit
npm run check:v2
npm run check:legacy
npm run test:tally
npm run test:http
```

No diretório `preview`, após instalar com a versão de pnpm do projeto:

```sh
pnpm audit
node scripts/check-security.mjs
```

A suíte de segurança cobre vetores oficiais RFC 6238, sessão sem segundo fator, códigos repetidos, recuperação de uso único, validade e vínculo da configuração, revogação de sessões, permissões, dados omitidos do histórico e rollback quando o log falha. Os testes usam bancos descartáveis e dados fictícios. O CI verifica dependências e fluxos para evitar regressões.

### Implantação do pacote PHP

A migração `database/006_security.sql` adiciona apenas as tabelas `admin_mfa` e `admin_audit`, sem modificar os votos existentes. Atualize a aplicação completa, mantenha o document root em `public`, execute `php bin/console.php install` e `php bin/console.php check`, e confirme HTTPS e permissões do armazenamento. O primeiro acesso também aplica migrações pendentes sob bloqueio. A publicação da prévia não instala este pacote no CloudPanel.

Ainda é necessário validar a configuração real do servidor, backups/restauração e operação da escola. A matrícula continua sendo a forma de liberação do aluno; ela não é um segredo forte e esta entrega não troca esse método. Não foi feita certificação de segurança nem declaração de conformidade legal.
