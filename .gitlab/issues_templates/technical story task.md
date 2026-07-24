# História Técnica ou Capacitadora

A história técnica ou capacitadora é o recurso utilizado para definir escopos suficientemente implementáveis para incrementar o produto e entregar valor.

## Descrição

Descrição detalhada e precisa sobre o que deve ser feito e não pode ser descrito em linguagem de usuário.

## Critérios de Negócio

Descrição da lista de critérios de negócio que serão exigidos como comportamento esperado para a entrega da história.

1. O usuário precisa estar autenticado na aplicação.
2. ...

## Critérios de Aceitação

Descrição da lista de critérios técnicos que serão exigidos para considerar a atividade como concluída.

1. A _story_ precisa ser [`INVEST`](https://www.cursospm3.com.br/blog/como-usar-o-principio-invest-para-escrever-e-quebrar-user-stories/).
2. A _story_ deve pertencer a uma `milestone`.
3. O _branch_ deve ser criado seguindo o padrão `story/{id}-{slug}`.
4. Os _commits_ devem respeitar o padrão do `Conventional Commits` e devem fazer referência a esta tarefa com a menção [`Refs #0`](https://www.conventionalcommits.org/pt-br/v1.0.0/#mensagem-de-commit-de-uma-corre%C3%A7%C3%A3o-utilizando-n%C3%BAmero-de-ticket-opcional), onde `0` representa o `id` desta tarefa.
5. O código-fonte deve passar pelos `pipelines` ambientais com sucesso.
6. O `merge request` deve estar relacionado a esta _task_, aprovado e direcionado para o ambiente de `pre-stage`. Use o [template](/.gitlab/merge_request_templates/pre stage.md).
7. O código deve respeitar o [padrão de código](https://git.al.mt.gov.br/dev/documentation/-/blob/master/cookbook/development/padrao-de-codigo.md).

## Bloqueia

Nenhuma.

## Está Bloqueada Pela

Nenhuma.

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver sendo refinado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Adicione a etiqueta ~"waiting for planning poker" para indicar que a tarefa está pronta para ser refinada na próxima reunião de planejamento de `sprint`.

```md
/label ~"waiting for planning poker"
```

- [ ] Adicione a atividade em um marco de `sprint`, se aplicável.

```md
/milestone %"Sprint X"
```

- [ ] Adicione uma das etiquetas de pontos, oriundas do evento de planejamento, se aplicável.

```md
/unlabel ~"waiting for planning poker"
<!-- /label ~"01 point" -->
<!-- /label ~"02 points" -->
<!-- /label ~"03 points" -->
<!-- /label ~"05 points" -->
<!-- /label ~"08 points" -->
<!-- /label ~"13 points" -->
<!-- /label ~"21 points" -->
<!-- /label ~"34 points" -->
<!-- /label ~"55 points" -->
<!-- /label ~"89 points" -->
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

/label ~"technical" ~"workflow | planning"
