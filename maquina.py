"""
maquina.py - Regra de negocio da Maquina de Venda de Bebidas.

Este modulo nao depende de Flask, HTML ou terminal: contem apenas a logica.
Por isso ele e reaproveitado pela API (app.py), pela versao de terminal
(terminal.py) e pelos testes (testes.py).

Todos os valores monetarios sao guardados em CENTAVOS (int):
    R$ 3,67 -> 367
Trabalhar com inteiros evita os erros de arredondamento do float
(em float, 0.1 + 0.2 != 0.3).
"""

from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Configuracao: denominacoes aceitas, caixa inicial e produtos
# ---------------------------------------------------------------------------

# Cedulas e moedas do Real, em centavos, da maior para a menor.
NOTAS = [20000, 10000, 5000, 2000, 1000, 500, 200]
MOEDAS = [100, 50, 25, 10, 5, 1]
DENOMINACOES = NOTAS + MOEDAS

# Quantidade de cada cedula/moeda que a maquina tem para dar troco ao ligar.
ESTOQUE_CAIXA_INICIAL = {
    20000: 0, 10000: 2, 5000: 4, 2000: 10, 1000: 10, 500: 10, 200: 10,
    100: 20, 50: 20, 25: 20, 10: 20, 5: 20, 1: 50,
}

# (codigo, nome, preco em centavos, quantidade em estoque)
PRODUTOS_INICIAIS = [
    (1, "Coca-cola", 375, 2),
    (2, "Pepsi", 367, 5),
    (3, "Monster", 996, 1),
    (4, "Café", 125, 100),
    (5, "Redbull", 1399, 2),
]


# ---------------------------------------------------------------------------
# Formatacao e conversao de valores
# ---------------------------------------------------------------------------

def formatar_reais(centavos: int) -> str:
    """Converte centavos em texto no formato brasileiro.

    Exemplo: 367 -> 'R$ 3,67'
    """
    return f"R$ {centavos // 100},{centavos % 100:02d}"


def descrever_peca(valor: int, qtd: int) -> str:
    """Descreve uma parte do troco por extenso, tratando singular/plural.

    Exemplos:
        descrever_peca(500, 1) -> '1 nota de R$ 5,00'
        descrever_peca(1, 3)   -> '3 moedas de 1 centavo'
    """
    if valor in NOTAS:
        tipo = "nota" if qtd == 1 else "notas"
        return f"{qtd} {tipo} de {formatar_reais(valor)}"
    tipo = "moeda" if qtd == 1 else "moedas"
    if valor >= 100:
        return f"{qtd} {tipo} de {formatar_reais(valor)}"
    unidade = "centavo" if valor == 1 else "centavos"
    return f"{qtd} {tipo} de {valor} {unidade}"


def reais_para_centavos(texto: str) -> int:
    """Converte o valor digitado pelo usuario em centavos.

    Aceita virgula ou ponto como separador decimal e ignora 'R$' e espacos.
        '10'    -> 1000
        '10,50' -> 1050
        '3.67'  -> 367

    Lanca ValueError se o texto nao for um valor valido.
    """
    texto = texto.strip().replace("R$", "").replace(" ", "").replace(",", ".")
    if not texto:
        raise ValueError("valor vazio")
    reais, _, cents = texto.partition(".")
    if not reais.isdigit() or (cents and (not cents.isdigit() or len(cents) > 2)):
        raise ValueError(f"valor inválido: {texto}")
    return int(reais) * 100 + int(cents.ljust(2, "0") or 0)


# ---------------------------------------------------------------------------
# Calculo do troco
# ---------------------------------------------------------------------------

def calcular_troco(valor: int, estoque: dict[int, int]) -> dict[int, int] | None:
    """Calcula o troco com o MENOR numero possivel de cedulas/moedas.

    Parametros:
        valor   -- valor do troco em centavos
        estoque -- {denominacao: quantidade disponivel no caixa}

    Retorna {denominacao: quantidade} ou None se nao for possivel
    formar o valor exato com o que existe no caixa.

    Por que nao usar o algoritmo guloso (sempre pegar a maior moeda)?
    Com estoque limitado ele pode falhar. Exemplo: troco de R$ 0,30 com
    uma moeda de 25 e tres de 10 no caixa. O guloso pega a de 25 e fica
    sem como completar os 5 centavos, enquanto a resposta certa e 3 x 10.

    Solucao: programacao dinamica (problema da mochila limitada).
    Cada denominacao com c unidades e dividida em "pacotes" de 1, 2, 4, 8...
    unidades. Cada pacote pode ser usado no maximo uma vez (mochila 0/1)
    e, combinando os pacotes, e possivel formar qualquer quantidade de 0 a c.
    Isso reduz bastante o numero de itens processados.
    """
    if valor == 0:
        return {}

    # 1) Divide o estoque de cada denominacao em pacotes binarios.
    pacotes = []  # lista de (denominacao, unidades no pacote)
    for den in sorted(estoque, reverse=True):
        disponivel = min(estoque[den], valor // den)  # mais que isso nunca e util
        k = 1
        while disponivel > 0:
            q = min(k, disponivel)
            pacotes.append((den, q))
            disponivel -= q
            k *= 2

    # 2) Tabela da PD: melhor[a] = menor numero de pecas que soma "a" centavos.
    INF = float("inf")
    melhor = [0] + [INF] * valor
    # usou[i][a] = 1 se o pacote i melhorou o resultado para o valor "a".
    usou = []

    for den, q in pacotes:
        peso = den * q
        marcado = bytearray(valor + 1)
        # Percorre de tras para frente para cada pacote ser usado so uma vez.
        for a in range(valor, peso - 1, -1):
            candidato = melhor[a - peso] + q
            if candidato < melhor[a]:
                melhor[a] = candidato
                marcado[a] = 1
        usou.append(marcado)

    if melhor[valor] == INF:
        return None

    # 3) Reconstroi quais pacotes foram usados, do ultimo para o primeiro.
    resultado: dict[int, int] = {}
    a = valor
    for i in range(len(pacotes) - 1, -1, -1):
        if usou[i][a]:
            den, q = pacotes[i]
            resultado[den] = resultado.get(den, 0) + q
            a -= den * q
    return dict(sorted(resultado.items(), reverse=True))


# ---------------------------------------------------------------------------
# Entidades
# ---------------------------------------------------------------------------

@dataclass
class Produto:
    """Bebida vendida pela maquina."""
    id: int
    nome: str
    preco: int    # em centavos
    estoque: int  # unidades disponiveis


@dataclass
class ResultadoCompra:
    """Resultado de uma tentativa de compra (aprovada ou cancelada)."""
    sucesso: bool
    mensagem: str
    produto: Produto | None = None
    pago: int = 0                                              # total inserido
    troco_valor: int = 0                                       # valor do troco
    troco: dict[int, int] = field(default_factory=dict)        # pecas entregues de troco
    devolvido: dict[int, int] = field(default_factory=dict)    # dinheiro devolvido se cancelou

    def troco_descrito(self) -> list[str]:
        """Lista o troco por extenso, ex.: ['1 nota de R$ 5,00', ...]."""
        return [descrever_peca(v, q) for v, q in self.troco.items()]


class CompraInvalida(Exception):
    """Erro de regra de negocio: codigo invalido, produto esgotado,
    valor insuficiente ou denominacao nao aceita."""


# ---------------------------------------------------------------------------
# Maquina
# ---------------------------------------------------------------------------

class MaquinaDeBebidas:
    """Guarda o estado da maquina (produtos, caixa e historico)
    e executa as operacoes de venda."""

    def __init__(self):
        self.resetar()

    def resetar(self) -> None:
        """Restaura produtos, caixa e historico para o estado inicial."""
        self.produtos = {pid: Produto(pid, nome, preco, est)
                         for pid, nome, preco, est in PRODUTOS_INICIAIS}
        self.caixa = dict(ESTOQUE_CAIXA_INICIAL)
        self.historico: list[ResultadoCompra] = []

    # ---- consultas ---------------------------------------------------------

    def selecionar(self, codigo: int) -> Produto:
        """Retorna o produto do codigo informado.

        Lanca CompraInvalida se o codigo nao existir ou se o produto
        estiver esgotado.
        """
        produto = self.produtos.get(codigo)
        if produto is None:
            raise CompraInvalida(f"Código {codigo} inválido. Escolha entre "
                                 f"{min(self.produtos)} e {max(self.produtos)}.")
        if produto.estoque <= 0:
            raise CompraInvalida(f"{produto.nome} esgotado.")
        return produto

    def total_caixa(self) -> int:
        """Soma, em centavos, de todo o dinheiro guardado no caixa."""
        return sum(v * q for v, q in self.caixa.items())

    # ---- operacao principal -------------------------------------------------

    def comprar(self, codigo: int, pagamento: dict[int, int]) -> ResultadoCompra:
        """Executa uma compra.

        Parametros:
            codigo    -- codigo do produto
            pagamento -- cedulas/moedas inseridas, ex.: {1000: 1} = uma nota de R$ 10

        Etapas:
          1. valida o produto e o estoque;
          2. confere se o valor pago cobre o preco;
          3. coloca o dinheiro inserido no caixa (ele pode ser usado no troco);
          4. calcula o troco com o menor numero de pecas;
          5. se nao houver troco possivel, desfaz tudo e devolve o dinheiro;
          6. caso contrario, entrega o troco e baixa o estoque do produto.

        Lanca CompraInvalida nos casos das etapas 1 e 2.
        """
        produto = self.selecionar(codigo)

        for den, qtd in pagamento.items():
            if den not in DENOMINACOES or qtd < 0:
                raise CompraInvalida(f"Denominação não aceita: {den}")
        pago = sum(den * qtd for den, qtd in pagamento.items())
        if pago < produto.preco:
            raise CompraInvalida(f"Valor insuficiente: pago {formatar_reais(pago)}, "
                                 f"faltam {formatar_reais(produto.preco - pago)}.")

        for den, qtd in pagamento.items():
            self.caixa[den] = self.caixa.get(den, 0) + qtd

        troco_valor = pago - produto.preco
        troco = calcular_troco(troco_valor, self.caixa)

        if troco is None:
            # Sem troco: retira do caixa o que o cliente inseriu e devolve.
            for den, qtd in pagamento.items():
                self.caixa[den] -= qtd
            res = ResultadoCompra(False,
                                  f"Sem troco disponível para {formatar_reais(troco_valor)}. "
                                  "Compra cancelada, dinheiro devolvido.",
                                  produto, pago, troco_valor,
                                  devolvido={d: q for d, q in pagamento.items() if q})
            self.historico.append(res)
            return res

        for den, qtd in troco.items():
            self.caixa[den] -= qtd
        produto.estoque -= 1

        res = ResultadoCompra(True, f"Retire sua {produto.nome}!",
                              produto, pago, troco_valor, troco)
        self.historico.append(res)
        return res
