# Pesquisa

Tarefa destinada à experimentação e estudo que apoia alguma das áreas do desenvolvimento.

## Descrição

Descrição detalhada sobre a pesquisa a ser realizada.

## Hipótese ou Resultado

Descrição da hipótese a ser confirmada ou refutada, bem como os resultados esperados ou desejados da pesquisa.

## Atividades

- [ ] Mova a etiqueta para ~"workflow | analyzing" quando o tíquete estiver pronto para ser avaliado.

```md
/unlabel ~"workflow | planning"
/label ~"workflow | analyzing"
```

- [ ] Documente nos comentários o resultado obtido para a hipótese avaliada.

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

/label ~"research" ~"workflow | planning"
