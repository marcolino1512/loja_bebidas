// app.js - Interface da maquina (vitrine, teclado, dinheiro, painel do operador).
//
// A regra de negocio nao fica aqui. Este arquivo so desenha a tela e chama
// a funcao api(), que fala com:
//   - a API Flask (app.py), quando o projeto roda com "python app.py";
//   - o motor local (maquina.js), quando a pagina esta no GitHub Pages
//     ou foi aberta sem o servidor.

const $ = (s) => document.querySelector(s);
const brl = (c) => "R$ " + Math.floor(c / 100) + "," + String(c % 100).padStart(2, "0");
const rotuloMoeda = (v) => (v >= 100 ? "R$ " + v / 100 : v + "¢");
const telaPequena = () => window.matchMedia("(max-width: 860px)").matches;

const estado = {
  dados: null,        // ultimo retorno de "api/estado"
  selecionado: null,  // produto escolhido no teclado ou na vitrine
  inserido: {},       // dinheiro inserido na compra atual: {centavos: qtd}
  processando: false, // trava a interface enquanto a compra e finalizada
};

// Estoque inicial de cada bebida, usado so para desenhar a barra de estoque.
const ESTOQUE_INICIAL = { 1: 2, 2: 5, 3: 1, 4: 100, 5: 2 };

// ---------------- Comunicacao (API Flask ou motor local) ----------------

let usarMotorLocal = null; // definido na primeira chamada

/** Verifica uma vez se a API Flask responde; se nao, usa o maquina.js. */
async function detectarModo() {
  if (location.protocol === "file:") return true;
  try {
    const r = await fetch("api/estado", { cache: "no-store" });
    return !(r.ok && (r.headers.get("content-type") || "").includes("json"));
  } catch {
    return true;
  }
}

/**
 * Chama uma rota da maquina. Sem corpo = GET, com corpo = POST.
 * Em caso de erro de regra de negocio lanca Error com a mensagem.
 */
async function api(rota, corpo) {
  if (usarMotorLocal === null) usarMotorLocal = await detectarModo();

  if (usarMotorLocal) {
    switch (rota) {
      case "estado": return MaquinaLocal.estado();
      case "selecionar": return MaquinaLocal.selecionar(Number(corpo.codigo));
      case "comprar": return MaquinaLocal.comprar(Number(corpo.codigo), corpo.pagamento);
      case "resetar": MaquinaLocal.resetar(); return { ok: true };
    }
  }

  const opts = corpo === undefined ? {} :
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
  const r = await fetch("api/" + rota, opts);
  const json = await r.json();
  if (!r.ok) throw new Error(json.erro || "Erro na máquina");
  return json;
}

/** Busca o estado e redesenha tudo. Guarda o estado anterior para
 *  destacar no painel do caixa o que mudou. */
async function atualizar() {
  const antes = estado.dados;
  estado.dados = await api("estado");
  renderVitrine();
  renderOperador(antes);
  renderDinheiro();
}

/** Pequena vibracao no celular (ignorado onde nao ha suporte). */
const vibrar = (padrao) => { try { navigator.vibrate?.(padrao); } catch { /* sem suporte */ } };

// ---------------- Visor LCD ----------------

let lcdTimer;

/** Escreve duas linhas no visor. voltarEm (ms) restaura a mensagem padrao. */
function lcd(l1, l2 = "", erro = false, voltarEm = 0) {
  clearTimeout(lcdTimer);
  $("#lcd1").textContent = l1;
  $("#lcd2").textContent = l2;
  $("#lcd").classList.toggle("erro", erro);
  if (voltarEm) lcdTimer = setTimeout(lcdPadrao, voltarEm);
}

function lcdPadrao() {
  if (estado.selecionado) return mostrarFalta();
  lcd("ESCOLHA UMA BEBIDA", "TOQUE OU DIGITE 1-5");
}

const totalInserido = () => Object.entries(estado.inserido).reduce((s, [v, q]) => s + v * q, 0);

/** Mostra o produto escolhido e quanto ainda falta inserir. */
function mostrarFalta() {
  const p = estado.selecionado, falta = p.preco - totalInserido();
  lcd(`${p.id} ${p.nome.toUpperCase()} ${p.preco_fmt}`,
      falta > 0 ? `INSIRA ${brl(falta)}` : "PROCESSANDO...");
}

// ---------------- Vitrine ----------------

/** HTML de uma lata/copo desenhado em CSS (classes .p1 a .p5). */
function desenhoItem(p) {
  const curto = { 1: "COLA", 2: "PEPSI", 3: "ENERGY", 4: "CAFÉ", 5: "ENERGY" }[p.id] || "";
  return `<div class="item p${p.id}"><span>${curto}</span></div>`;
}

function renderVitrine() {
  // limite de itens desenhados por prateleira (menos em telas estreitas)
  const MAX = window.matchMedia("(max-width: 420px)").matches ? 6 : 8;
  $("#vitrine").innerHTML = estado.dados.produtos.map((p) => {
    const visiveis = Math.min(Math.max(p.estoque, 0), MAX);
    const fantasma = p.estoque === 0 ? 1 : 0; // item apagado quando esgota
    const sel = estado.selecionado?.id === p.id ? "selecionada" : "";
    return `
      <button class="prateleira ${sel} ${p.estoque ? "" : "esgotada"}" data-codigo="${p.id}"
              aria-label="${p.nome}, ${p.preco_fmt}${p.estoque ? "" : ", esgotado"}">
        <div class="itens">
          ${desenhoItem(p).repeat(visiveis + fantasma)}
          ${p.estoque > MAX ? `<span class="mais">+${p.estoque - MAX}</span>` : ""}
        </div>
        <div class="etiqueta">
          <span class="cod">${p.id}</span><span class="nome">${p.nome}</span>
          ${p.estoque ? `<span>${p.preco_fmt}</span>` : `<span class="esg">ESGOTADO</span>`}
        </div>
      </button>`;
  }).join("");
}

// ---------------- Notas e moedas ----------------

/** Botoes de dinheiro ficam desabilitados ate uma bebida ser escolhida. */
function renderDinheiro() {
  const { notas, moedas } = estado.dados.aceitas;
  const travado = !estado.selecionado || estado.processando;
  $("#notas").innerHTML = notas.map((v) =>
    `<button class="nota n${v / 100}" data-valor="${v}" ${travado ? "disabled" : ""}>R$ ${v / 100}</button>`).join("");
  $("#moedas").innerHTML = moedas.map((v) =>
    `<button class="moeda m${v}" data-valor="${v}" ${travado ? "disabled" : ""}>${rotuloMoeda(v)}</button>`).join("");
  $("#inserido").textContent = brl(totalInserido());
  $(".painel").classList.toggle("aguardando", !!estado.selecionado);
}

// ---------------- Fluxo de compra ----------------

/** Passo 1: escolher a bebida pelo codigo. */
async function escolher(codigo) {
  if (estado.processando) return;
  if (totalInserido() > 0) return lcd("FINALIZE OU CANCELE", "A COMPRA ATUAL", true, 1800);
  try {
    estado.selecionado = await api("selecionar", { codigo });
    mostrarFalta();
    vibrar(15);
    // No celular o dinheiro fica abaixo da vitrine: rola ate ele.
    if (telaPequena()) $(".painel").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    estado.selecionado = null;
    lcd("CÓDIGO " + codigo, e.message.toUpperCase(), true, 2200);
    vibrar([40, 60, 40]);
  }
  renderVitrine(); renderDinheiro();
}

/** Passo 2: inserir notas/moedas. Ao atingir o preco a compra e finalizada. */
async function inserir(valor) {
  if (!estado.selecionado || estado.processando) return;
  estado.inserido[valor] = (estado.inserido[valor] || 0) + 1;
  vibrar(10);
  renderDinheiro();
  if (totalInserido() >= estado.selecionado.preco) {
    await finalizar();
  } else {
    mostrarFalta();
  }
}

/** Passo 3: envia a compra e mostra bebida, troco e comprovante. */
async function finalizar() {
  estado.processando = true; renderDinheiro(); mostrarFalta();
  try {
    const r = await api("comprar", { codigo: estado.selecionado.id, pagamento: estado.inserido });
    if (r.sucesso) {
      lcd("OBRIGADO!", r.troco_valor ? `TROCO ${r.troco_fmt}` : "SEM TROCO", false, 3500);
      soltarBebida(r.produto);
      mostrarBandeja(r.troco);
      vibrar([30, 50, 80]);
    } else {
      lcd("SEM TROCO", "DINHEIRO DEVOLVIDO", true, 3500);
      mostrarBandeja(r.devolvido, true);
      vibrar([60, 80, 60]);
    }
    mostrarRecibo(r);
    if (telaPequena()) $(".saidas").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    lcd("ERRO", e.message.toUpperCase(), true, 3000);
  }
  estado.selecionado = null; estado.inserido = {}; estado.processando = false;
  await atualizar();
}

/** Botao C: cancela a compra e devolve o que foi inserido. */
function cancelar() {
  if (estado.processando) return;
  const devolver = Object.entries(estado.inserido).map(([v, q]) => ({ valor: +v, qtd: q }));
  if (devolver.length) mostrarBandeja(devolver.map((p) => ({ ...p, texto: `${p.qtd}× ${rotuloMoeda(p.valor)}` })), true);
  estado.selecionado = null; estado.inserido = {};
  lcd("CANCELADO", devolver.length ? "RETIRE SEU DINHEIRO" : "", false, 1800);
  renderVitrine(); renderDinheiro();
}

/** Mostra a bebida caindo na saida (PUSH). */
function soltarBebida(p) {
  $("#bebida-saida").innerHTML = desenhoItem(p);
  $("#push").disabled = false;
}

/** Mostra o troco (ou o dinheiro devolvido) na bandeja. */
function mostrarBandeja(pecas, devolucao = false) {
  $("#bandeja .rotulo").textContent = devolucao ? "Devolução" : "Troco";
  $("#bandeja-itens").innerHTML = pecas.length
    ? pecas.map((p, i) => `<span class="peca" style="animation-delay:${i * 80}ms">${p.texto}</span>`).join("")
    : "<em>sem troco</em>";
}

/** Comprovante da ultima operacao, exibido no painel do operador. */
function mostrarRecibo(r) {
  const linhas = r.sucesso
    ? r.troco.map((p) => `<div>· ${p.texto}</div>`).join("") || "<div>Sem troco</div>"
    : `<div>${r.mensagem}</div>`;
  $("#recibo").innerHTML = `
    <h2>${r.sucesso ? "COMPROVANTE" : "COMPRA CANCELADA"}</h2>
    <div class="linha"><span>${r.produto.nome}</span><span>${r.produto.preco_fmt}</span></div>
    <div class="linha"><span>Valor pago</span><span>${r.pago_fmt}</span></div>
    <div class="linha"><span>Troco</span><span>${r.troco_fmt}</span></div>
    <hr>${linhas}`;
  $("#recibo").classList.remove("oculto");
}

// ---------------- Painel do operador ----------------

/** Tabela de bebidas, caixa (com diferenca da ultima operacao) e historico. */
function renderOperador(antes) {
  const d = estado.dados;
  $("#tabela-bebidas").innerHTML = d.produtos.map((p) => {
    const ini = ESTOQUE_INICIAL[p.id] || p.estoque || 1;
    return `<tr><td>${p.id}</td><td>${p.nome}</td><td class="num">${p.preco_fmt}</td>
      <td class="num ${p.estoque ? "" : "zero"}">${p.estoque}
      <div class="barra"><i style="width:${Math.min(100, (p.estoque / ini) * 100)}%"></i></div></td></tr>`;
  }).join("");

  $("#total-caixa").textContent = d.caixa_total_fmt;
  const qtdAntes = Object.fromEntries((antes?.caixa || []).map((c) => [c.valor, c.qtd]));
  $("#grade-caixa").innerHTML = d.caixa.map((c) => {
    const delta = antes ? c.qtd - qtdAntes[c.valor] : 0;
    const cls = delta < 0 ? "mudou-menos" : delta > 0 ? "mudou-mais" : "";
    const sinal = delta ? ` <small>(${delta > 0 ? "+" : ""}${delta})</small>` : "";
    return `<div class="slot-caixa ${cls}">${c.tipo} ${rotuloMoeda(c.valor)}<b class="${c.qtd ? "" : "zero"}">${c.qtd}${sinal}</b></div>`;
  }).join("");

  $("#historico").innerHTML = d.historico.length
    ? d.historico.map((h) => `<li class="${h.sucesso ? "" : "falha"}">
        <strong>${h.produto.nome}</strong> - pago ${h.pago_fmt}, troco ${h.troco_fmt}
        <small>${h.sucesso ? (h.troco.map((p) => p.texto).join(" · ") || "sem troco") : h.mensagem}</small></li>`).join("")
    : `<li class="vazio">Nenhuma venda ainda.</li>`;
}

// ---------------- Eventos ----------------

$("#teclado").addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "btn-cancelar") return cancelar();
  escolher(+t.dataset.tecla);
});

// Tocar na prateleira tambem escolhe a bebida
$("#vitrine").addEventListener("click", (e) => {
  const p = e.target.closest(".prateleira");
  if (p) escolher(+p.dataset.codigo);
});

document.querySelector(".dinheiro").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-valor]");
  if (b && !b.disabled) inserir(+b.dataset.valor);
});

// Retirar a bebida e o troco
$("#push").addEventListener("click", () => {
  $("#bebida-saida").innerHTML = ""; $("#push").disabled = true;
  $("#bandeja-itens").innerHTML = "<em>vazio</em>";
});

// Abas do painel do operador
document.querySelectorAll(".aba").forEach((aba) => aba.addEventListener("click", () => {
  document.querySelectorAll(".aba").forEach((a) => a.classList.toggle("ativa", a === aba));
  document.querySelectorAll(".conteudo").forEach((c) => c.classList.toggle("oculto", c.id !== "aba-" + aba.dataset.aba));
}));

$("#btn-reset").addEventListener("click", async () => {
  await api("resetar", {});
  estado.selecionado = null; estado.inserido = {};
  $("#recibo").classList.add("oculto");
  lcdPadrao();
  estado.dados = null; await atualizar();
});

// Atalhos do teclado fisico: 1-9 escolhe, Esc cancela
document.addEventListener("keydown", (e) => {
  if (/^[1-9]$/.test(e.key)) escolher(+e.key);
  if (e.key === "Escape") cancelar();
});

atualizar();
