# Identidade visual do painel

O painel reutiliza a logo já fornecida no projeto (`frontend/public/csi-logo.png`)
e a identidade azul, branca e dourada das versões anteriores. Estas regras são
o padrão de interface deste projeto; não substituem um manual oficial do colégio.

| Uso                            | Padrão                                       |
| ------------------------------ | -------------------------------------------- |
| Cor institucional da interface | `#17438f`                                    |
| Fundo profundo do cabeçalho    | `#10336e`                                    |
| Destaque de navegação          | `#ffc600`                                    |
| Fundo de trabalho              | `#f5f7fb`                                    |
| Superfícies                    | Branco, bordas suaves e cantos consistentes  |
| Títulos principais             | 30 px no computador, 27 px em telas pequenas |
| Botões e rótulos de campos     | 14 px; área de clique principal de 44 px     |
| Campos                         | 15 px; altura mínima de 46 px                |
| Textos auxiliares              | 13 px, com contraste suficiente para leitura |

Os seletores finais `.school-panel` em `frontend/v2/styles.css` concentram esse
acabamento. Substitua uma regra ali ao refinar o padrão, evitando criar temas
sucessivos sobrepostos. Use `PageHeading` para os títulos das áreas,
`button primary` para a ação principal e `button secondary` para ações de apoio.
Ação destrutiva deve manter rótulo acessível e confirmação explícita.

O cabeçalho preserva a navegação horizontal no computador; o menu lateral é
utilizado em telas menores. O rodapé deve manter “Desenvolvido pela T.I.”.
A camada visual administrativa não deve alcançar a urna pública, alterar a
contagem, associar identificação a votos ou mudar as permissões.

A revisão em navegador utiliza dados fictícios isolados. Nunca publique os
arquivos de fixture usados na revisão. A origem é `frontend/`; sincronize com
`npm run sync:preview` e recompile as versões PHP e Sites antes da publicação.
