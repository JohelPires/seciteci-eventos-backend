# Bug

## Descrição

Informe uma descrição consistente do problema enfrentado.

## Cliente

:man: Fulano de Tal | :necktie: Cargo | :office: Setor | :iphone: (65) 9 9999-9999

## Passo a passo para reproduzir o problema

1. Visite '...'
2. Clique em '...'
3. Vá até '...'
4. ...

### Comportamento detectado

Descrição clara e consisa do comportamento detectado.

### Comportamento esperado

Descrição clara e consisa do comportamento esperado.

## Fotos, vídeos ou outras evidências

Se relevante, copie e cole as evidências do problema.

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. O _bug_ precisa ser confirmado pelo time de `desenvolvimento`.
2. O título deve ser claro e fazer referência ao problema que de fato está sendo corrigido. Use este [tutorial](https://medium.com/practical-software-testing/write-better-bugs-titles-af3762e0e941) como um guia.
3. O _branch_ deve ser criado seguindo o padrão `bug/{id}-{slug}`.
4. A correção deve ser testada pelo time de `desenvolvimento`.
5. O `qa` deve garantir que a correção devolve o comportamento esperado à aplicação.
6. A correção deve ser homologada pelo time de `atendimento`.
7. O `merge request` deve estar aprovado e direcionado para o `master`.
8. O código-fonte deve passar pelo processo de revisão.
9. O código-fonte deve passar pelos `pipelines` ambientais com sucesso.
10. A correção deve estar adicionada em uma `release` com data de publicação definida.
11. ...

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver pronto para ser atacado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Confirmar o comportamento detectado. Ao confirmar altere a informação de **Status** para `Reconhecido`, caso não seja possível, entre em contato com o reclamante ou escale para sua gerência.
- [ ] Determinar a **Severidade** do problema, onde `0` é Desconhecido, `1` é Crítica, `2` é Alta, `3` é Média e `4` é Baixa. Leve em consideração fatores como: criticidade da aplicação e/ou processo; tempo de indisponibilidade; quantidade de usuários afetados e a existência de contorno.

```md
/severity 0
<!-- /severity 1 -->
<!-- /severity 2 -->
<!-- /severity 3 -->
<!-- /severity 4 -->
```

- [ ] Crie uma ou mais [Research](/.gitlab/issue_templates/research task.md), se for o caso.
- [ ] Crie uma ou mais [Hotfix](/.gitlab/issue_templates/hotfix task.md), se for o caso.
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

/label ~"bug" ~"workflow | planning"
