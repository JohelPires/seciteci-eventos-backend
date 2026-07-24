# Garantia de Qualidade

A tarefa de garantia de qualidade tem como objetivo verificar se um item construído tem, tudo que é preciso, para ser incorporado em um ramo de trabalho superior.

## Cenários

Descrição da lista de cenários que serão validados.

1. Ao acessar ... como ... espero ...
2. ...

## Critérios de Aceitação

1. A _task_ precisa ter um relacionamento de dependência com uma ou mais _story_.
2. As _story_ devem estar disponíveis no ambiente de `pre-stage`.
3. As _story_ devem ser testadas pelo time de `desenvolvimento`.
4. O _qa_ deve garantir que as _story_ atendem a todos os `critérios de negócio` estabelecidos.
5. O `merge request` deve estar relacionado a esta _task_, aprovado e direcionado para o ramo da `feature` ou `bug`. Use o [template](/.gitlab/merge_request_templates/code review.md).
6. O código-fonte deve passar pelo processo de revisão.
7. As evidências produzidas, como testes de interface para cada cenário, devem estar disponíveis nos comentários.
8. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver sendo refinado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Adicione a atividade em um marco de `sprint`, se aplicável.

```md
/milestone %"Sprint X"
```

- [ ] Mova a etiqueta para ~"workflow | qa" quando o tíquete estiver pronto para ser testado.

```md
/unlabel ~"workflow | analyzing"
/label ~"workflow | qa"
```

- [ ] Crie um [Code Review](/.gitlab/merge_request_templates/code review.md) apontando sua tarefa para a `feature` ou `bug` ou um [Implicit Review](/.gitlab/merge_request_templates/implicit review.md).

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

/label ~"qa" ~"workflow | planning"
