"""
terminal.py - Versao de terminal da maquina (sem interface web).

Fluxo: mostra o menu, espera o codigo da bebida, pede o valor pago
ate ser suficiente e imprime o troco detalhado.

Como rodar:
    python terminal.py
"""
from maquina import (MaquinaDeBebidas, CompraInvalida, formatar_reais,
                     reais_para_centavos, calcular_troco, DENOMINACOES)

LINHA = "=" * 46


def mostrar_menu(m: MaquinaDeBebidas) -> None:
    """Imprime a tabela de produtos com preco e estoque."""
    print(f"\n{LINHA}\n{'MÁQUINA DE BEBIDAS':^46}\n{LINHA}")
    print(f"{'ID':<4}{'Produto':<14}{'Valor':>12}{'Estoque':>12}")
    for p in m.produtos.values():
        est = p.estoque if p.estoque else "ESGOTADO"
        print(f"{p.id:<4}{p.nome:<14}{formatar_reais(p.preco):>12}{est:>12}")
    print(f"{LINHA}\n0 = sair\n")


def valor_em_pecas(valor: int) -> dict[int, int]:
    """No terminal o cliente digita um valor (ex.: 10,00) em vez de inserir
    notas. Aqui esse valor e convertido nas cedulas/moedas equivalentes,
    como se ele tivesse inserido o dinheiro na maquina."""
    return calcular_troco(valor, {d: 10**6 for d in DENOMINACOES})


def main() -> None:
    """Loop principal: repete ate o usuario digitar 0."""
    m = MaquinaDeBebidas()
    while True:
        mostrar_menu(m)
        try:
            codigo = int(input("Digite o código da bebida: "))
        except ValueError:
            print("Digite apenas números.")
            continue
        if codigo == 0:
            print("Até logo!")
            break
        try:
            produto = m.selecionar(codigo)
        except CompraInvalida as e:
            print(e)
            continue

        print(f"\n{produto.nome} custa {formatar_reais(produto.preco)}")
        while True:  # pede o valor de novo enquanto for insuficiente
            try:
                pago = reais_para_centavos(input("Valor inserido (ex.: 10,00): "))
            except ValueError:
                print("Valor inválido.")
                continue
            if pago >= produto.preco:
                break
            print(f"Valor menor que o preço. Insira pelo menos {formatar_reais(produto.preco)}.")

        r = m.comprar(codigo, valor_em_pecas(pago))
        print(f"\n{'[OK]' if r.sucesso else '[CANCELADO]'} {r.mensagem}")
        if r.sucesso and r.troco_valor:
            print(f"Troco: {formatar_reais(r.troco_valor)}")
            for linha in r.troco_descrito():
                print(f"   - {linha}")
        input("\n[Enter para continuar]")


if __name__ == "__main__":
    main()
