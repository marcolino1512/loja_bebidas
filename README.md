# Máquina de Venda de Bebidas

Simulador de uma máquina de venda de bebidas: o cliente escolhe a bebida, insere notas e moedas e recebe o troco com o **menor número possível de peças**, respeitando o que existe no caixa.

**Acesse online:** https://marcolino1512.github.io/loja_bebidas/

Funciona no computador e no celular.

---

## Funcionalidades

- Escolha da bebida pelo teclado numérico, tocando na prateleira ou pelas teclas 1 a 5 do teclado físico
- Inserção de notas (R$ 2 a R$ 200) e moedas (1 centavo a R$ 1)
- Validação de código inválido, produto esgotado e valor insuficiente
- Troco mínimo calculado com programação dinâmica, respeitando o estoque do caixa
- Quando não há troco possível, a compra é cancelada e o dinheiro devolvido
- Botão **C** cancela a compra e devolve o que foi inserido (ou tecla `Esc`)
- Painel do operador com estoque das bebidas, conteúdo do caixa, histórico e comprovante
- Layout adaptado para celular, com vibração ao tocar nos botões quando o aparelho suporta

## Estrutura

| Arquivo | Função |
|---|---|
| `maquina.py` | Regra de negócio: produtos, caixa, validações e cálculo do troco |
| `app.py` | API REST em Flask que expõe a máquina para o front-end |
| `terminal.py` | Versão de terminal, sem interface gráfica |
| `testes.py` | Testes automáticos da regra de negócio |
| `static/index.html` | Estrutura da página |
| `static/style.css` | Visual da máquina e ajustes para celular |
| `static/app.js` | Interface: vitrine, teclado, dinheiro e painel do operador |
| `static/maquina.js` | Mesma regra de negócio do `maquina.py`, em JavaScript |
| `.github/workflows/pages.yml` | Roda os testes e publica o site no GitHub Pages |

### Por que a regra de negócio existe em Python e em JavaScript?

O GitHub Pages só hospeda arquivos estáticos e não executa Python. Por isso o front-end detecta sozinho em que ambiente está rodando:

- **Com `python app.py`:** usa a API Flask, e o estado fica no servidor.
- **No GitHub Pages ou abrindo o `index.html` direto:** usa o `maquina.js`, e o estado fica salvo no navegador.

As duas versões seguem o mesmo algoritmo e devolvem o mesmo formato de dados.

## Como rodar localmente

Requisitos: Python 3.10 ou superior.

```bash
pip install -r requirements.txt

python testes.py      # roda os testes
python app.py         # abre em http://localhost:5000
python terminal.py    # versão de terminal
```

Para testar no celular na mesma rede Wi-Fi, rode `python app.py` e acesse `http://IP-DO-COMPUTADOR:5000`.

## Decisões técnicas

- **Valores em centavos (inteiros):** evita erros de ponto flutuante (em float, `0.1 + 0.2 != 0.3`).
- **Troco por programação dinâmica:** o algoritmo guloso (pegar sempre a maior moeda) falha quando o estoque é limitado. Exemplo: troco de 30 centavos com uma moeda de 25 e três de 10 no caixa. O guloso pega a de 25 e não consegue completar; a resposta certa é 3 × 10. A solução usada é a da mochila limitada com divisão binária das quantidades. O `testes.py` compara o resultado com força bruta em 300 casos aleatórios.
- **O dinheiro inserido entra no caixa** e pode ser usado no próprio troco. Se o troco for impossível, a operação é desfeita.
- **Denominações:** cédulas e moedas do Real. Para alterar, edite `NOTAS`, `MOEDAS` e `ESTOQUE_CAIXA_INICIAL` em `maquina.py` e em `static/maquina.js`.

## API

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/estado` | - | produtos, caixa, denominações aceitas e histórico |
| POST | `/api/selecionar` | `{"codigo": 2}` | produto escolhido |
| POST | `/api/comprar` | `{"codigo": 2, "pagamento": {"1000": 1}}` | resultado da compra com o troco |
| POST | `/api/resetar` | - | `{"ok": true}` |

No `pagamento`, a chave é o valor em centavos e o valor é a quantidade. `{"1000": 1}` significa uma nota de R$ 10.

Erros de regra de negócio retornam status 400 com `{"erro": "mensagem"}`.

## Publicação

A cada push na branch `main`, o GitHub Actions roda os testes e publica a pasta `static/` no GitHub Pages.
