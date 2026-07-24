# Documentação

Artefato destinado a produzir documentação isoladamente (quando a documentação pertencer a entrega de um produto, ela deve ser produzida na _issue_ que deu origem), que **deve** ser incorporada ao repositório do projeto, seja no principal (junto ao código-fonte, normalmente técnica) ou em secundários (separado do código-fonte, como as `wikis`).

## Descrição

Descreva de forma detalhada o objetivo da documentação e onde ela deve ser registrada.

## Critérios de Negócio

1. A página deve descrever informações de como acessar...
2. Deve ser descrito como instalar...
3. ...

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. O título deve ser claro, preciso, conciso. Use este [tutorial](https://medium.com/@scotty.middleton/naming-guide-for-task-bug-and-user-story-titles-7e1e081a36b9) como um guia.
2. O _branch_ deve ser criado seguindo o padrão `docs/{id}-{slug}`. Desconsiderar em caso de `wiki`.
3. A _documentation_ precisa ser submetida ao processo de `qa` e ser aprovada.
4. O _qa_ deve garantir que a _documentation_ atende a todos os `critérios de negócio` estabelecidos.
5. O `merge request` deve estar relacionado a esta _task_, aprovado e direcionado para o ramo da `master`. Use o [template](/.gitlab/merge_request_templates/master.md).
6. As evidências produzidas devem estar relacionadas a esta _issue_ ou uma de suas filhas.
7. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver pronto para ser atacado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Crie uma ou mais [Research](/.gitlab/issue_templates/research task.md), se for o caso.
- [ ] Crie uma ou mais [QA](/.gitlab/issue_templates/qa task.md), se for o caso.

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

/label ~"documentation" ~"workflow | planning"
