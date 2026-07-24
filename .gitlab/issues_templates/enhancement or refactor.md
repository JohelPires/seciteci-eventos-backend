# Aprimoramento|Refatoração

Artefato destinado a controlar **pequenas** melhorias e ajustes, que não necessitam do controle completo do ciclo de vida de trabalho. São exemplos de atividades: alterações em CI/CD, ferramentas de desenvolvimento, testes, scripts de automação, alterações de texto fixo em tela, disposição de elementos, documentação, entre outros.

A refatoração é o processo aplicado exclusivamente ao código-fonte que precisa passar por um ajuste técnico, geralmente apontado por um processo de qualidade ou uma preparação evolutiva.

## Descrição

Descreva de forma detalhada o objeto a ser implementado.

## Critérios de Negócio

1. A aplicação deve registrar ...
2. ...

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. O título deve ser claro, preciso, conciso. Use este [tutorial](https://medium.com/@scotty.middleton/naming-guide-for-task-bug-and-user-story-titles-7e1e081a36b9) como um guia.
2. O _enhancement_ precisa ser submetida ao processo de `qa` e ser aprovada.
3. O _qa_ deve garantir que o _enhancement_ atende a todos os `critérios de negócio` estabelecidos.
4. O `merge request` deve estar relacionado a esta _task_, aprovado e direcionado para o ramo da `master`. Use o [template](/.gitlab/merge_request_templates/master.md).
5. O código-fonte deve passar pelos `pipelines` ambientais com sucesso.
6. As evidências produzidas devem estar relacionadas a esta _issue_ ou uma de suas filhas.
7. O _enhancement_ deve estar adicionado em uma `release` com data de publicação definida.
8. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver pronto para ser atacado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Crie uma ou mais [Research](/.gitlab/issue_templates/research task.md), se for o caso.
- [ ] Crie uma ou mais [User Story](/.gitlab/issue_templates/user story task.md), se for o caso.
- [ ] Crie uma ou mais [Technical Story](/.gitlab/issue_templates/technical story task.md), se for o caso.

- [ ] Mova a etiqueta para ~"workflow | qa" quando o tíquete estiver pronto para ser atacado.

```md
/unlabel ~"workflow | analyzing"
/label ~"workflow | qa"
```

- [ ] Crie um [Merge Request](/.gitlab/merge_request_templates/master.md) apontando sua tarefa para a `master`.

- [ ] Atendido os critérios de aceitação o tíquete deve ser encerrado.

```md
/unlabel ~"workflow | planning"
/unlabel ~"workflow | analyzing"
/unlabel ~"workflow | building"
/unlabel ~"workflow | qa"
/unlabel ~"workflow | approving"
/close
```

## Dicas

Caso sua atividade esteja impedida adicione a etique ~"help" para indicar que você precisa de ajuda com esta atividade.

<!-- configurações automáticas de abertura -->

/label ~"enhancement" ~"refactor" ~"workflow | planning"
