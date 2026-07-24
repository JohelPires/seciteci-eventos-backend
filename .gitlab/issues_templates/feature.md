# Funcionalidade

Artefato destinado a controlar o ciclo de vida de uma funcionalidade a ser incorporada na aplicação, incluindo melhoria das existentes, que controlam o ciclo de vida completo de desenvolvimento.

## Proposta

Descreva uma proposta de funcionalidade, de forma clara e consistente.

## Cliente

:man: Fulano de Tal | :necktie: Cargo | :office: Setor | :iphone: (65) 9 9999-9999

## Critérios de Negócio

1. A aplicação deve registrar ...
2. ...

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. A _feature_ precisa ser refinada pelo time de `desenvolvimento` em uma ou mais `story`.
2. O título deve ser claro, preciso, conciso. Use este [tutorial](https://medium.com/@scotty.middleton/naming-guide-for-task-bug-and-user-story-titles-7e1e081a36b9) como um guia.
3. O _branch_ deve ser criado seguindo o padrão `feature/{id}-{slug}`.
4. A _feature_ precisa ser submetida ao processo de `qa` e ser aprovada.
5. O _approver_ deve garantir que a _feature_ atende a todos os `critérios de negócio` estabelecidos.
6. O `merge request` deve estar relacionado a esta _task_, aprovado e direcionado para o ramo da `master`. Use o [template](/.gitlab/merge_request_templates/master.md).
7. O código-fonte deve passar pelos `pipelines` ambientais com sucesso.
8. As evidências produzidas devem estar relacionadas a esta _issue_ ou uma de suas filhas.
9. O _approver_ deve coletar um aceite (de acordo) por escrito (físico ou digital) com o cliente.
10. A _feature_ deve estar adicionada em uma `release` com data de publicação definida.
11. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver pronto para ser atacado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Crie uma ou mais [Research](/.gitlab/issue_templates/research task.md), se for o caso.
- [ ] Crie uma ou mais [User Story](/.gitlab/issue_templates/user story task.md), se for o caso.
- [ ] Crie uma ou mais [Technical Story](/.gitlab/issue_templates/technical story task.md), se for o caso.
- [ ] Crie uma ou mais [QA](/.gitlab/issue_templates/qa task.md), se for o caso.

- [ ] Mova a etiqueta para ~"workflow | approving" quando o tíquete estiver pronto para ser atacado.

```md
/unlabel ~"workflow | analyzing"
/label ~"workflow | approving"
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

/label ~"feature" ~"workflow | planning"
