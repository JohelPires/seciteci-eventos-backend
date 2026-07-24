# Desejo

Artefato destino ao registro e documentação dos desejos associados ao projeto.

## Proposta

Descreva uma proposta tangível para seu desejo.

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. O título deve ser claro, preciso, conciso. Use este [tutorial](https://medium.com/@scotty.middleton/naming-guide-for-task-bug-and-user-story-titles-7e1e081a36b9) como um guia.
2. A _desire_ será fechada após a análise e conclusão pela não implantação.
3. A _desire_  será fechada após a análise e conclusão pela implantação, após a abertura da `issue` correspondente.
4. As evidências produzidas devem estar relacionadas a esta _issue_ ou uma de suas filhas.
5. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver pronto para ser avaliado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Crie uma ou mais [Research](/.gitlab/issue_templates/research task.md), se for o caso.

- [ ] Incentive seus colegas a reagirem à atividade, colocando o emoji numérico de 1 a 10, onde o maior indica mais importância; além de reagir com os polegares.
- [ ] Documente na própria `issue` o resultado da análise, indicando parecer favorável ou não ao prosseguimento da demanda.
- [ ] Caso opte pelo prosseguimento, crie a `issue` de implementação e relacione a esta.

- [ ] Atendido os critérios de aceitação o tíquete deve ser encerrado.

```md
/unlabel ~"workflow | planning"
/unlabel ~"workflow | analyzing"
/close
```

<!-- configurações automáticas de abertura -->

/label ~"desire" ~"workflow | planning"
