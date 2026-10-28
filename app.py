"""
app.py - API REST (Flask) que expoe a MaquinaDeBebidas para o front-end.

Como rodar:
    pip install -r requirements.txt
    python app.py
    abrir http://localhost:5000

Rotas:
    GET  /api/estado      -> produtos, caixa e historico
    POST /api/selecionar  corpo: {"codigo": 2}
    POST /api/comprar     corpo: {"codigo": 2, "pagamento": {"1000": 1}}
    POST /api/resetar     -> volta ao estado inicial

Os arquivos da pasta static/ sao servidos na raiz do site (/style.css,
/app.js...). Assim o mesmo index.html funciona aqui e no GitHub Pages.
"""
from flask import Flask, jsonify, request, send_from_directory

from maquina import (MaquinaDeBebidas, CompraInvalida, NOTAS, MOEDAS,
                     formatar_reais, descrever_peca)

app = Flask(__name__, static_folder="static", static_url_path="")
maquina = MaquinaDeBebidas()  # estado mantido em memoria enquanto o servidor roda


# ---------------------------------------------------------------------------
# Conversao dos objetos da maquina para JSON
# ---------------------------------------------------------------------------

def produto_json(p):
    """Produto -> dict com o preco ja formatado para exibicao."""
    return {"id": p.id, "nome": p.nome, "preco": p.preco,
            "preco_fmt": formatar_reais(p.preco), "estoque": p.estoque}


def pecas_json(pecas: dict[int, int]):
    """{centavos: qtd} -> lista de pecas com tipo (nota/moeda) e descricao."""
    return [{"valor": v, "qtd": q, "tipo": "nota" if v in NOTAS else "moeda",
             "texto": descrever_peca(v, q)} for v, q in pecas.items() if q]


def resultado_json(r):
    """ResultadoCompra -> dict usado pelo front para montar LCD, bandeja e recibo."""
    return {"sucesso": r.sucesso, "mensagem": r.mensagem,
            "produto": produto_json(r.produto) if r.produto else None,
            "pago": r.pago, "pago_fmt": formatar_reais(r.pago),
            "troco_valor": r.troco_valor, "troco_fmt": formatar_reais(r.troco_valor),
            "troco": pecas_json(r.troco), "devolvido": pecas_json(r.devolvido)}


def erro(msg, status=400):
    """Resposta de erro padrao: {"erro": "mensagem"}."""
    return jsonify({"erro": msg}), status


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    """Pagina principal (front-end)."""
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/estado")
def estado():
    """Estado completo da maquina. O historico vem do mais recente para o
    mais antigo e limitado as 15 ultimas operacoes."""
    return jsonify({
        "produtos": [produto_json(p) for p in maquina.produtos.values()],
        "caixa": [{"valor": v, "qtd": q, "tipo": "nota" if v in NOTAS else "moeda"}
                  for v, q in maquina.caixa.items()],
        "caixa_total_fmt": formatar_reais(maquina.total_caixa()),
        "aceitas": {"notas": NOTAS, "moedas": MOEDAS},
        "historico": [resultado_json(r) for r in reversed(maquina.historico[-15:])],
    })


@app.post("/api/selecionar")
def selecionar():
    """Valida o codigo digitado e devolve o produto escolhido."""
    dados = request.get_json(silent=True) or {}
    try:
        return jsonify(produto_json(maquina.selecionar(int(dados.get("codigo", -1)))))
    except (ValueError, TypeError):
        return erro("Código inválido.")
    except CompraInvalida as e:
        return erro(str(e))


@app.post("/api/comprar")
def comprar():
    """Finaliza a compra. As chaves de "pagamento" chegam como texto
    (JSON so tem chaves string) e sao convertidas para int aqui."""
    dados = request.get_json(silent=True) or {}
    try:
        codigo = int(dados["codigo"])
        pagamento = {int(k): int(v) for k, v in dados.get("pagamento", {}).items()}
    except (KeyError, ValueError, TypeError, AttributeError):
        return erro("Requisição mal formada.")
    try:
        return jsonify(resultado_json(maquina.comprar(codigo, pagamento)))
    except CompraInvalida as e:
        return erro(str(e))


@app.post("/api/resetar")
def resetar():
    """Restaura produtos, caixa e historico."""
    maquina.resetar()
    return jsonify({"ok": True})


if __name__ == "__main__":
    # host 0.0.0.0 permite abrir pelo celular na mesma rede Wi-Fi
    # usando o IP do computador, ex.: http://192.168.0.10:5000
    app.run(host="0.0.0.0", port=5000, debug=True)
