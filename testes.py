"""
testes.py - Testes automaticos da regra de negocio (maquina.py).

Nao usa nenhuma biblioteca externa: cada funcao que comeca com "teste_"
e executada e, se algum assert falhar, o script para com erro.

Como rodar:
    python testes.py
"""
import random
from itertools import product as combinacoes

from maquina import (MaquinaDeBebidas, CompraInvalida, calcular_troco,
                     DENOMINACOES, reais_para_centavos)


def forca_bruta(valor, estoque):
    """Testa todas as combinacoes possiveis e retorna o menor numero de pecas
    (ou None). E lento, serve apenas para conferir o calcular_troco."""
    dens = [d for d in estoque if estoque[d] > 0]
    melhor = None
    for qtds in combinacoes(*[range(min(estoque[d], valor // d) + 1) for d in dens]):
        if sum(d * q for d, q in zip(dens, qtds)) == valor:
            n = sum(qtds)
            if melhor is None or n < melhor:
                melhor = n
    return melhor


def teste_exemplo_pepsi():
    """Pepsi de R$ 3,67 paga com R$ 10,00 -> troco de R$ 6,33 em 7 pecas
    (5,00 + 1,00 + 0,25 + 0,05 + 3 x 0,01)."""
    m = MaquinaDeBebidas()
    r = m.comprar(2, {1000: 1})
    assert r.sucesso and r.troco_valor == 633
    assert sum(v * q for v, q in r.troco.items()) == 633
    assert sum(r.troco.values()) == 7


def teste_guloso_falharia():
    """Troco de 30 centavos com uma moeda de 25 e tres de 10: o guloso
    pegaria a de 25 e travaria; o correto e 3 x 10."""
    assert calcular_troco(30, {25: 1, 10: 3}) == {10: 3}


def teste_sem_troco_cancela():
    """Com o caixa vazio a compra e cancelada e o dinheiro devolvido."""
    m = MaquinaDeBebidas()
    m.caixa = {d: 0 for d in DENOMINACOES}
    antes = m.produtos[1].estoque
    r = m.comprar(1, {500: 1})  # Coca R$ 3,75 com R$ 5 -> troco 1,25 impossivel
    assert not r.sucesso
    assert m.produtos[1].estoque == antes   # bebida nao saiu
    assert m.caixa[500] == 0                 # nota nao ficou no caixa
    assert r.devolvido == {500: 1}


def teste_pagamento_exato_entra_no_caixa():
    """Pagamento exato nao gera troco e o dinheiro fica no caixa."""
    m = MaquinaDeBebidas()
    antes = m.caixa[100]
    r = m.comprar(4, {100: 1, 25: 1})  # Cafe R$ 1,25
    assert r.sucesso and r.troco == {}
    assert m.caixa[100] == antes + 1


def teste_estoque_produto():
    """Depois de vender o unico Monster, uma nova compra deve ser recusada."""
    m = MaquinaDeBebidas()
    assert m.comprar(3, {1000: 1}).sucesso
    try:
        m.comprar(3, {1000: 1})
        assert False, "deveria estar esgotado"
    except CompraInvalida:
        pass


def teste_validacoes():
    """Codigo inexistente e valor insuficiente geram CompraInvalida."""
    m = MaquinaDeBebidas()
    for codigo, pagamento in [(9, {1000: 1}), (1, {200: 1})]:
        try:
            m.comprar(codigo, pagamento)
            assert False
        except CompraInvalida:
            pass


def teste_pd_igual_forca_bruta():
    """Compara o calcular_troco com a forca bruta em 300 casos aleatorios."""
    random.seed(42)
    dens = [500, 200, 100, 50, 25, 10, 5, 1]
    for _ in range(300):
        estoque = {d: random.randint(0, 4) for d in dens}
        valor = random.randint(1, 900)
        r = calcular_troco(valor, estoque)
        esperado = forca_bruta(valor, estoque)
        if esperado is None:
            assert r is None
        else:
            assert r is not None and sum(r.values()) == esperado
            assert sum(d * q for d, q in r.items()) == valor
            assert all(q <= estoque[d] for d, q in r.items())


def teste_conversao():
    """Conversao de texto digitado para centavos."""
    assert reais_para_centavos("10") == 1000
    assert reais_para_centavos("3,67") == 367
    assert reais_para_centavos("0.5") == 50


if __name__ == "__main__":
    testes = [f for n, f in list(globals().items()) if n.startswith("teste_")]
    for t in testes:
        t()
        print(f"OK  {t.__name__}")
    print(f"\n{len(testes)} testes passaram.")
