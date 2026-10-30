# Urna Santa Inês — evolução em três semanas

Ponto de partida: 28/10/2026. Janela de três semanas até 18/11/2026.
A data da eleição real ainda deve ser confirmada pela escola.

## Semana 1 — 28/10 a 03/11

- Validar a alfa: eleições independentes, números livres, chapas com ou sem vice.
- Conferir a importação de nome, turma e matrícula com uma pequena lista de teste.
- Testar o bloqueio de repetição na mesma eleição e a liberação em outra eleição.
- Conferir o tamanho das fotos, a identificação do vice e a digitação dos números.
- Decidir se o título será o modelo emitido pelo sistema e se terá um número
  próprio ou usará a matrícula.
- Ajustar o fluxo conforme os primeiros testes da equipe.

Resultado esperado: fluxo completo compreendido pela equipe e primeira lista
de ajustes de interface e regras.

## Semana 2 — 04/11 a 10/11

- Aplicar os ajustes da primeira rodada.
- Validar o modelo de título com a escola.
- Importar um arquivo no mesmo formato da exportação real e conferir turmas,
  duplicidades e matrículas com zeros à esquerda.
- Ensaiar duas ou mais urnas na mesma eleição, usando os aparelhos da escola.
- Testar perda de conexão antes e depois da confirmação, atualização de página,
  expiração da liberação, cancelamento pelo responsável e votação agendada.
- Avaliar se será necessário aceitar `.xlsx` diretamente ou outro formato.

Resultado esperado: versão beta estável no ambiente de homologação do CloudPanel.

## Semana 3 — 11/11 a 17/11

- Fazer um ensaio completo com número de aparelhos e volume próximos do uso real.
- Conferir a apuração contra votos de teste conhecidos e a lista de participação.
- Validar teclado, fotos, som, tamanho dos botões e funcionamento nos iPads.
- Ensaiar backup e restauração e revisar os acessos administrativos.
- Corrigir os problemas encontrados, definir a configuração final e evitar novas
  mudanças de regras na reta final.
- Preparar instruções curtas para os mesários e checklist de abertura e encerramento.

Resultado esperado: versão candidata à publicação, com ensaio aprovado pela equipe.

## Revisão final — 18/11

Confirmar os critérios de aceite abaixo e a data do evento antes da publicação final.

### Critérios de aceite

- Os candidatos são cadastrados e apurados por eleição.
- Números repetidos em eleições diferentes funcionam e não recebem zero automático.
- Prefeito e vice aparecem identificados, com foto do vice menor.
- Somente alunos habilitados para a eleição conseguem liberar a urna.
- Uma matrícula confirma no máximo um voto por eleição, inclusive com várias urnas.
- O mesmo estudante pode participar uma vez de outra eleição.
- Reenvio de confirmação não duplica votos.
- Participação e escolha do candidato ficam separadas nos dados e no painel.
- Ao terminar, a urna pede a matrícula do próximo estudante.
- Ao mudar a eleição de uma urna, os resultados anteriores são preservados.
- Os títulos e o arquivo de alunos foram conferidos com a escola.
- Backup, restauração, conexão e dispositivos foram ensaiados.

Em cada rodada, registraremos os problemas encontrados, as decisões da escola
e os ajustes necessários para a próxima versão.
