// Ciclos entre módulos (CA-7, Art. VIII.4): el grafo de `architecture.md` §3 es un DAG. `maxDepth` acota el costo
// del recorrido (plan 000 §6.4); un ciclo más largo que 6 saltos lo detectaría `/design-check`.
export default [
  {
    files: ['**/*.ts'],
    rules: {
      'import-x/no-cycle': ['error', { maxDepth: 6 }],
    },
  },
];
