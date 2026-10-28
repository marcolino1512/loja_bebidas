// maquina.js - Versao em JavaScript da regra de negocio (mesma logica do maquina.py).
//
// O GitHub Pages so hospeda arquivos estaticos e nao executa Python.
// Quando a API Flask nao esta disponivel, o app.js usa este motor local,
// que devolve exatamente o mesmo formato de JSON que a API.
//
// Todos os valores sao em centavos (inteiros), como no back-end.

const MaquinaLocal = (() => {
  const NOTAS = [20000, 10000, 5000, 2000, 1000, 500, 200];
  const MOEDAS = [100, 50, 25, 10, 5, 1];
  const DENOMINACOES = [...NOTAS, ...MOEDAS];

  const ESTOQUE_CAIXA_INICIAL = {
    20000: 0, 10000: 2, 5000: 4, 2000: 10, 1000: 10, 500: 10, 200: 10,
    100: 20, 50: 20, 25: 20, 10: 20, 5: 20, 1: 50,
  };

  // [codigo, nome, preco em centavos, estoque]
  const PRODUTOS_INICIAIS = [
    [1, "Coca-cola", 375, 2],
    [2, "Pepsi", 367, 5],
    [3, "Monster", 996, 1],
    [4, "Café", 125, 100],
    [5, "Redbull", 1399, 2],
  ];

  // O estado fica salvo no navegador para nao se perder ao recarregar a pagina.
  const CHAVE_STORAGE = "maquina-bebidas:estado";

  // ---------------- Formatacao ----------------

  /** 367 -> "R$ 3,67" */
  const formatarReais = (c) => `R$ ${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;

  /** (500, 1) -> "1 nota de R$ 5,00" | (1, 3) -> "3 moedas de 1 centavo" */
  function descreverPeca(valor, qtd) {
    if (NOTAS.includes(valor)) return `${qtd} ${qtd === 1 ? "nota" : "notas"} de ${formatarReais(valor)}`;
    const tipo = qtd === 1 ? "moeda" : "moedas";
    if (valor >= 100) return `${qtd} ${tipo} de ${formatarReais(valor)}`;
    return `${qtd} ${tipo} de ${valor} ${valor === 1 ? "centavo" : "centavos"}`;
  }

  // ---------------- Calculo do troco ----------------

  /**
   * Troco com o menor numero de pecas respeitando o estoque do caixa.
   * Retorna {denominacao: qtd} ou null se for impossivel.
   * Programacao dinamica (mochila limitada com divisao binaria);
   * a explicacao completa esta em calcular_troco no maquina.py.
   */
  function calcularTroco(valor, estoque) {
    if (valor === 0) return {};

    // 1) Pacotes binarios de cada denominacao: 1, 2, 4, 8... unidades
    const pacotes = [];
    const dens = Object.keys(estoque).map(Number).sort((a, b) => b - a);
    for (const den of dens) {
      let disponivel = Math.min(estoque[den], Math.floor(valor / den));
      for (let k = 1; disponivel > 0; k *= 2) {
        const q = Math.min(k, disponivel);
        pacotes.push([den, q]);
        disponivel -= q;
      }
    }

    // 2) melhor[a] = menor numero de pecas para somar "a" centavos
    const melhor = new Array(valor + 1).fill(Infinity);
    melhor[0] = 0;
    const usou = [];
    for (const [den, q] of pacotes) {
      const peso = den * q;
      const marcado = new Uint8Array(valor + 1);
      for (let a = valor; a >= peso; a--) {   // de tras para frente: cada pacote uma vez
        const candidato = melhor[a - peso] + q;
        if (candidato < melhor[a]) {
          melhor[a] = candidato;
          marcado[a] = 1;
        }
      }
      usou.push(marcado);
    }
    if (melhor[valor] === Infinity) return null;

    // 3) Reconstroi a solucao
    const resultado = {};
    let a = valor;
    for (let i = pacotes.length - 1; i >= 0; i--) {
      if (usou[i][a]) {
        const [den, q] = pacotes[i];
        resultado[den] = (resultado[den] || 0) + q;
        a -= den * q;
      }
    }
    return resultado;
  }

  // ---------------- Estado ----------------

  let produtos, caixa, historico;

  function resetar() {
    produtos = PRODUTOS_INICIAIS.map(([id, nome, preco, estoque]) => ({ id, nome, preco, estoque }));
    caixa = { ...ESTOQUE_CAIXA_INICIAL };
    historico = [];
    salvar();
  }

  function salvar() {
    try { localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ produtos, caixa, historico })); } catch { /* sem storage */ }
  }

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_STORAGE));
      if (salvo?.produtos && salvo?.caixa && salvo?.historico) {
        ({ produtos, caixa, historico } = salvo);
        return;
      }
    } catch { /* storage indisponivel ou corrompido */ }
    resetar();
  }

  // ---------------- Conversao para o formato da API ----------------

  const produtoJson = (p) => ({ ...p, preco_fmt: formatarReais(p.preco) });

  /** {centavos: qtd} -> lista ordenada da maior para a menor peca */
  const pecasJson = (pecas) => Object.entries(pecas)
    .map(([v, q]) => [Number(v), q])
    .filter(([, q]) => q)
    .sort((a, b) => b[0] - a[0])
    .map(([valor, qtd]) => ({ valor, qtd, tipo: NOTAS.includes(valor) ? "nota" : "moeda", texto: descreverPeca(valor, qtd) }));

  // ---------------- Operacoes (mesmas rotas da API) ----------------

  function estado() {
    const total = DENOMINACOES.reduce((s, d) => s + d * (caixa[d] || 0), 0);
    return {
      produtos: produtos.map(produtoJson),
      caixa: DENOMINACOES.map((valor) => ({ valor, qtd: caixa[valor] || 0, tipo: NOTAS.includes(valor) ? "nota" : "moeda" })),
      caixa_total_fmt: formatarReais(total),
      aceitas: { notas: NOTAS, moedas: MOEDAS },
      historico: historico.slice(-15).reverse(),
    };
  }

  /** Valida codigo e estoque. Lanca Error com a mensagem para o usuario. */
  function selecionar(codigo) {
    const p = produtos.find((x) => x.id === codigo);
    if (!p) {
      const ids = produtos.map((x) => x.id);
      throw new Error(`Código ${codigo} inválido. Escolha entre ${Math.min(...ids)} e ${Math.max(...ids)}.`);
    }
    if (p.estoque <= 0) throw new Error(`${p.nome} esgotado.`);
    return p;
  }

  /** Mesmas etapas de MaquinaDeBebidas.comprar no Python. */
  function comprar(codigo, pagamentoTexto) {
    const produto = selecionar(codigo);
    const pagamento = Object.fromEntries(Object.entries(pagamentoTexto).map(([d, q]) => [Number(d), Number(q)]));

    for (const [den, qtd] of Object.entries(pagamento)) {
      if (!DENOMINACOES.includes(Number(den)) || qtd < 0) throw new Error(`Denominação não aceita: ${den}`);
    }
    const pago = Object.entries(pagamento).reduce((s, [d, q]) => s + d * q, 0);
    if (pago < produto.preco) {
      throw new Error(`Valor insuficiente: pago ${formatarReais(pago)}, faltam ${formatarReais(produto.preco - pago)}.`);
    }

    // O dinheiro inserido entra no caixa e pode ser usado no troco
    for (const [d, q] of Object.entries(pagamento)) caixa[d] = (caixa[d] || 0) + q;

    const trocoValor = pago - produto.preco;
    const troco = calcularTroco(trocoValor, caixa);
    let resultado;

    if (troco === null) {
      for (const [d, q] of Object.entries(pagamento)) caixa[d] -= q;   // devolve ao cliente
      resultado = {
        sucesso: false,
        mensagem: `Sem troco disponível para ${formatarReais(trocoValor)}. Compra cancelada, dinheiro devolvido.`,
        troco: [], devolvido: pecasJson(pagamento),
      };
    } else {
      for (const [d, q] of Object.entries(troco)) caixa[d] -= q;
      produto.estoque -= 1;
      resultado = { sucesso: true, mensagem: `Retire sua ${produto.nome}!`, troco: pecasJson(troco), devolvido: [] };
    }

    Object.assign(resultado, {
      produto: produtoJson(produto),
      pago, pago_fmt: formatarReais(pago),
      troco_valor: trocoValor, troco_fmt: formatarReais(trocoValor),
    });
    historico.push(resultado);
    salvar();
    return resultado;
  }

  carregar();
  return { estado, selecionar, comprar, resetar };
})();
