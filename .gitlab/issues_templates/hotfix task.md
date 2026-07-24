# Correção

A correção é uma tarefa incorporada em uma atividade que tem por objetivo restabelecer um determinano comportamento desejado ou restaurar a disponibilidade.

## Comportamento detectado

Descrição clara sobre o problema a ser resolvido.

Caso a atividade faça parte de um _bug_ você pode fazer referência ao comportamento da atividade superior.

Caso a atividade faça parte de uma _feature_ você deve trazer os detalhes da origem do problema, como `code review` ou `approving`.

<!--
### Passo a passo para reproduzir o problema

1. Visite '...'
2. Clique em '...'
3. Vá até '...'
4. ...
-->

## Comportamento esperado

Descrição clara sobre qual o comportamento esperado para o problema destacado.

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. A _fix_ precisa ter um título claro e consistente.
2. A _fix_ precisa ser reprodutível.
3. A _fix_ precisa ter um cenário (comportamento esperado) plausível e reprodutível.
4. A _fix_ **não** deve pertencer a uma `milestone`.
5. O _branch_ deve ser criado seguindo o padrão `hotfix/{id}-{slug}`.
6. Os _commits_ devem respeitar o padrão do `Conventional Commits` e devem fazer referência a esta tarefa com a menção [`Refs #0`](https://www.conventionalcommits.org/pt-br/v1.0.0/#mensagem-de-commit-de-uma-corre%C3%A7%C3%A3o-utilizando-n%C3%BAmero-de-ticket-opcional), onde `0` representa o `id` desta tarefa.
7. O código-fonte deve passar pelos `pipelines` ambientais com sucesso.
8. O `merge request` deve estar relacionado a esta _task_, aprovado e direcionado para o ambiente de `pre-stage`. Use o [template](/.gitlab/merge_request_templates/pre stage.md).
9. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver sendo refinado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Mova a etiqueta para ~"workflow | building" quando o tíquete estiver pronto para ser construído.

```md
/unlabel ~"workflow | analyzing"
/label ~"workflow | building"
```

- [ ] Crie um [Merge Request](/.gitlab/merge_request_templates/pre stage.md) apontando sua tarefa para o ambiente de `pre-stage`.

- [ ] Atendido os critérios de aceitação a tarefa deve ser encerrada.

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

/label ~"hotfix" ~"workflow | planning"
