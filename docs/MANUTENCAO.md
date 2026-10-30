# Atualização do código e do GitHub

O repositório principal escolhido pelo usuário é:
`https://github.com/Idalencio/Urnas---Santa-In-s`, branch `main`.

O usuário autorizou que as alterações feitas por aqui também sejam registradas e
enviadas ao GitHub. Essa orientação está em `AGENTS.md` para as próximas tarefas.

## Ao modificar o projeto

1. Atualize a branch sem sobrescrever mudanças de outras pessoas.
2. Edite as fontes e comente as regras importantes.
3. Se alterar a interface, execute `npm run sync:preview`.
4. Execute os checks, testes e builds apropriados, conforme `DESENVOLVIMENTO.md`.
5. Confira o diff, incluindo os arquivos compilados que serão entregues ao CloudPanel.
6. Registre um commit descritivo, faça push e confira o commit remoto.
7. Informe o que mudou, como foi validado e o link do resultado.

Exemplo de fluxo com Git autenticado:

```bash
git pull --ff-only
npm run check:v2
npm run build:v2
git status --short
git diff --check
git add README.md server frontend public database docs tests bin
# Confira os arquivos selecionados antes de criar o commit.
git diff --cached --stat
git commit -m "Descrever a alteração realizada"
git push origin main
```

O exemplo lista pastas usuais; selecione também novos arquivos legítimos, se necessário.
`git diff --cached` deve ser revisado antes do envio. A autenticação do Git deve usar
a conexão do ambiente, SSH ou o gerenciador de credenciais, sem gravar tokens no projeto.
Se o push for recusado, primeiro confira o estado remoto e preserve o histórico.

## O que este fluxo atualiza

O commit registra código, migrações, testes, documentação e os arquivos compilados
necessários. Não envia o banco da escola, alunos, fotos de usuários ou configurações reais.
Arquivos produzidos por ferramentas e dependências ficam fora do versionamento.

GitHub Actions valida as alterações na branch principal e em pull requests. O workflow
tem acesso de leitura ao repositório e não possui credenciais de produção.

O envio ao GitHub não instala a aplicação no CloudPanel. A publicação no ambiente
hospedado de testes é uma etapa separada, que deve usar o projeto Sites existente e
preservar seu público. Quando ela ocorrer, mantenha o código de `preview/` alinhado
com o código publicado.

## Empacotar para o CloudPanel

Use a raiz do projeto PHP e preserve `public` como raiz do domínio. A pasta `preview`
não é necessária na instalação PHP. O clone não contém `config/config.php` nem
`config/local-admin.php`; crie-os somente na instalação e preserve-os nas atualizações.
Veja o guia [LEIA-ME-CLOUDPANEL.md](../LEIA-ME-CLOUDPANEL.md).
