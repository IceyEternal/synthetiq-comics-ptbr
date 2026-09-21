# Comics PT-BR Sources — Synthetiq Books

Repositório separado para sources PT-BR de comics no Synthetiq Books.

## Sources preparadas

- Só Quadrinhos PT-BR
- HQ Now PT-BR

## Estado

A infraestrutura do repositório está pronta: `index.json`, manifests, módulos `pageImages`, helpers de runtime, hashes e validação CI.

Os quatro handlers marcados no `index.js` de cada source ainda precisam da implementação específica da estrutura atual do respetivo site:

`searchResults → extractDetails → extractChapters → extractImages`

Enquanto isso não for preenchido, o módulo falha explicitamente com `SOURCE_IMPLEMENTATION_REQUIRED` em vez de devolver dados falsos.

## Depois de editar uma source

Executa **Actions → Finalize Synthetiq hashes → Run workflow**. A Action recalcula os hashes e valida a estrutura.

Não alteres os IDs `soquadrinhos-ptbr-v1` e `hqnow-ptbr-v1` depois de instalares as sources.
