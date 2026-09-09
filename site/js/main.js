// Bootstrap: nível geográfico, seletor de indicador por tema, painel lateral.

import { INDICADORES, TEMAS, ANOS, CAMADAS, camadaDe, niveisDoAno,
         indicadoresDoAno, focosDoAno, NOTAS_ANO, PISO_AMOSTRA,
         PALETAS, BASES_ESCALA, fmtValor, fmtInteiro,
         BASE_MONETARIA, ehMonetario,
         ORDEM_NIVEL, rotuloNivel } from './config.js';
import { carregarNivel, registro, fonteDoIndicador, valoresDaSerie,
         temColuna, nivelAusente } from './data.js';
import { carregarPiramide, piramideDe, blocoPiramide } from './piramide.js';
import { map, updateChoropleth, initInteracao, initModoLimpo, setCamada,
         camada, focar, limparFoco, focoAtual, initLegendaArrastavel,
         tornarArrastavel, CANTOS_LEGENDA,
         setModoLimpo, modoLimpoLigado, applyMapTheme,
         montarCanvas, baixarCanvas, comporGrade,
         bboxDaUnidade, unirBbox, enquadrarParaCaptura,
         capturarRecorte } from './map.js';
import { initTema } from './tema.js';

let indAtivo = INDICADORES.find((i) => i.default) ?? INDICADORES[0];
let selecao = null;   // { cod, titulo, sub }
let paletaAtiva = 'auto';
// 'serie' de saida: a comparacao entre censos e a razao de existir deste mapa,
// e deixar o padrao em 'ano' fazia a mesma cor querer dizer coisas diferentes
// em 1991 e em 2022 ate alguem descobrir o seletor.
let baseEscala = 'serie';   // 'ano' | 'serie' (ver BASES_ESCALA)
// 'contraste' | 'tom' | 'nenhuma'. Com 5.570 municipios no Brasil inteiro a
// linha de divisa ocupa mais pixel que o poligono e o mapa vira uma grade
// cinza: por isso o padrao e SEM borda. 'tom' contorna cada unidade com uma
// versao mais escura dela mesma, e 'contraste' e a linha escura fixa, que so
// compensa no zoom de municipio.
let bordaAtiva = 'nenhuma';

const ano = () => camada().ano;

// ------------------------------------------------------------------- censo
// Trocar de ano troca a malha, o CSV e o conjunto de indicadores ao mesmo
// tempo. Mantém o nível geográfico quando ele existe no censo escolhido (só
// 2010 e 2022 têm área de ponderação) e cai para município quando não existe.
function montarAnos() {
  const box = document.getElementById('sel-ano');
  box.innerHTML = ANOS.map(({ ano: a }) => `
    <button type="button" data-ano="${a}"
            class="btn-ano${a === ano() ? ' ativo' : ''}">${a}</button>`).join('');
  marcarAnosSemIndicador();

  // onclick, não addEventListener: montarAnos roda de novo a cada troca de ano
  // e addEventListener empilharia um handler por troca.
  box.onclick = (ev) => {
    const btn = ev.target.closest('.btn-ano');
    if (btn) irParaAno(Number(btn.dataset.ano));
  };
}

// Trocar de censo. Sai do botao da barra E da célula do selo, entao mora aqui.
async function irParaAno(novoAno) {
  if (novoAno === ano()) return;

  // Com recorte aplicado a troca de censo NÃO o desmonta: comparar a mesma
  // unidade entre censos é justamente o uso, e largar o recorte obrigava a
  // refazer clique e enquadramento a cada ano.
  //
  // Quando o censo novo não recorta por este nível (1991 não tem área de
  // ponderação para acender dentro de um município), o recorte cai e a troca
  // SEGUE. Cair sem trocar deixaria o clique sem efeito visível: o usuário
  // pediu 1991 e continuaria em 2000.
  if (focoAtual()) {
    pilhaFoco = [];         // a cadeia de recortes não sobrevive à troca de ano
    if (await trocarAnoComFoco(novoAno)) return;
    // só chega aqui quando o censo novo nem recorta por este nível: solta o
    // recorte e segue para a troca comum, abaixo
    limparFoco(null, { zoom: false });
    nivelAntesDoFoco = null;
    tituloFoco = '';
  }

  const alvo = camadaDe(novoAno, camada().nivel) ?? camadaDe(novoAno, 'mun');
  if (!alvo) return;

  await carregarNivel(alvo);
  setCamada(alvo);
  selecao = null;

  // o indicador escolhido pode não existir no censo novo
  const disponiveis = indicadoresDoAno(novoAno);
  if (!disponiveis.includes(indAtivo)) indAtivo = disponiveis[0];

  montarAnos();
  montarNiveis();
  montarSeletor();
  atualizarChipFoco();
  atualizarRodape();
  // await: quem troca de ano para FOTOGRAFAR precisa que a pintura tenha
  // acabado. Sem ele o mapa fica quieto com as cores do ano anterior e o
  // painel do facet sai errado, sem erro nenhum.
  await aplicarIndicador();
}

// Censo em que o indicador escolhido não existe fica esmaecido. Dos ~70
// indicadores, a maioria não atravessa os seis censos: 'microcomputador' só faz
// sentido de 2000 em diante, 'automóvel' só existe em 1970. Sem esta marca o
// usuário só descobre depois de clicar, quando o seletor de indicador já trocou
// sozinho debaixo dele.
//
// O botão continua CLICÁVEL. Trocar de censo é decisão legítima mesmo assim, e
// a troca cai no primeiro indicador daquele ano — desabilitar tiraria caminho
// sem oferecer outro.
function marcarAnosSemIndicador() {
  for (const b of document.querySelectorAll('#sel-ano .btn-ano')) {
    const a = Number(b.dataset.ano);
    const tem = indicadoresDoAno(a).includes(indAtivo);
    b.classList.toggle('sem-indicador', !tem);
    b.title = tem ? '' : `${indAtivo.label} não existe em ${a}`;
  }
}

// ------------------------------------------------------------ nível de análise
function montarNiveis() {
  const box = document.getElementById('sel-nivel');
  const disponiveis = niveisDoAno(ano());
  // Os TRES niveis sempre, na mesma ordem, mesmo onde um deles nao existe: o
  // que muda entre censos e o que esta disponivel, e ver o botao esmaecido diz
  // isso. Antes o botao sumia, e a barra encolhia de trinta pixels ao trocar de
  // ano — parecia falha de renderizacao, nao ausencia de dado.
  box.innerHTML = ORDEM_NIVEL.map((nv) => {
    const c = disponiveis.find((x) => x.nivel === nv);
    if (!c) {
      return `<button type="button" class="btn-nivel ausente" disabled
              title="Área de ponderação só existe a partir de 2000: antes disso o IBGE não publicou essa divisão"
              >${rotuloNivel(nv)}</button>`;
    }
    return `<button type="button" data-camada="${c.id}"
            class="btn-nivel${c === camada() ? ' ativo' : ''}">${c.label}</button>`;
  }).join('');

  box.onclick = async (ev) => {
    const btn = ev.target.closest('.btn-nivel');
    if (!btn) return;
    const novo = CAMADAS.find((c) => c.id === btn.dataset.camada);
    if (!novo || novo === camada()) return;

    box.querySelectorAll('.btn-nivel').forEach((b) => b.classList.toggle('ativo', b === btn));
    // o CSV do nível pode não ter sido baixado ainda
    await carregarNivel(novo);
    // trocar de nível abandona o recorte: o container escolhido era do nível
    // anterior, e mantê-lo pintaria filhos de outra hierarquia
    if (focoAtual()) { pilhaFoco = []; limparFoco(null, { zoom: false });
                       nivelAntesDoFoco = null; tituloFoco = ''; }
    setCamada(novo);
    selecao = null;             // a seleção não sobrevive à troca de geometria
    atualizarChipFoco();
    aplicarIndicador();
  };
}

// ---------------------------------------------------------- seletor de indicador
// Com ~70 indicadores a lista plana de rádios vira inutilizável: um <select>
// com <optgroup> agrupa por tema e cabe na barra lateral.
//
// A lista mostra o CATALOGO INTEIRO, em qualquer censo. Antes ela era
// recortada pelo ano — 2022 tinha 70 indicadores e 1970 cinco — e mudava de
// tamanho e de conteudo a cada clique na barra de anos, o que faz procurar
// alguma coisa nela ser um exercicio de memoria: o item que estava ali sumiu
// porque o ano mudou, nao porque nao existe.
//
// Quem responde "existe neste censo?" e o selo, que ja esta em cada linha; e
// quem nao existe no ano corrente sai esmaecido e, ao ser escolhido, leva
// junto para o censo mais proximo que o tenha.
//
// O selo de anos: dois de tres censos por linha, azul onde o indicador existe e
// cinza claro onde nao. E a resposta visual para a pergunta que se faz o tempo
// todo diante da lista — "isso da para comparar com 1980?".
const ANOS_SELO = ANOS.map((a) => a.ano);
const CURTO = { 1970: '70', 1980: '80', 1991: '91',
                2000: '00', 2010: '10', 2022: '22' };

function selo(ind) {
  const tem = (a) => ind.anos.includes(a);
  // A celula do ano em que o indicador EXISTE e clicavel e leva para aquele
  // censo. E o caminho curto para a pergunta que o selo levanta: ver que existe
  // em 1980 e querer ver 1980. Onde nao existe a celula e inerte — clicar
  // levaria a um censo que trocaria o indicador debaixo do usuario.
  // O par que esta no mapa agora sai em vermelho, e so no indicador ativo:
  // marcar o ano corrente em toda linha diria "este ano", nao "esta escolha".
  const atual = ind === indAtivo ? ano() : null;
  const cels = ANOS_SELO.map((a) => tem(a)
    ? `<i class="sim${a === atual ? ' atual' : ''}" data-ano="${a}"
          role="button" tabindex="-1"
          title="${a === atual ? `${ind.label} em ${a}, no mapa agora`
                               : `Ver ${ind.label} em ${a}`}">${CURTO[a]}</i>`
    : `<i class="nao">${CURTO[a]}</i>`).join('');
  const lista = ANOS_SELO.filter(tem).join(', ');
  return `<span class="selo-anos" title="Existe em ${lista}. Clique num ano para ir até ele.">${cels}</span>`;
}

// Um clique no ano do selo troca de censo, e se veio de uma linha da lista
// troca tambem o indicador. Delegado no documento porque os selos sao
// redesenhados a cada troca de ano.
function initSeloClicavel() {
  document.addEventListener('click', (ev) => {
    const cel = ev.target.closest('.selo-anos i.sim');
    if (!cel) return;
    ev.preventDefault();
    ev.stopPropagation();          // nao abre nem escolhe na lista
    const opcao = cel.closest('.ind-opcao');
    const alvo = Number(cel.dataset.ano);
    if (opcao) {
      indAtivo = INDICADORES[Number(opcao.dataset.i)];
      abrirLista(false);
      atualizarBotaoIndicador();
      // clicar no ano que ja esta ativo troca so o indicador; irParaAno sai
      // cedo nesse caso e o mapa nao seria repintado
      if (alvo === ano()) { aplicarIndicador(); return; }
    }
    irParaAno(alvo);
  }, true);
}

// Lista propria em vez de <select>: o selo e HTML, e <option> so aceita texto.
// O que se ganha alem do selo e o filtro por digitacao — com ~70 indicadores em
// seis temas, rolar a lista inteira e o caminho lento.
let listaAberta = false;

// O censo mais PROXIMO em que o indicador existe, para quando ele e escolhido
// num ano que nao o tem. Proximo, e nao o mais recente: quem esta em 1980 e
// escolhe 'automovel' quer 1970, que fica ao lado, e nao 2022.
function anoMaisProximo(ind) {
  const a = ano();
  return [...ind.anos].sort((x, y) => Math.abs(x - a) - Math.abs(y - a))[0];
}

function montarSeletor() {
  const opcoes = document.getElementById('ind-opcoes');
  const busca = document.getElementById('ind-busca');

  const desenhar = (filtro = '') => {
    const f = filtro.trim().toLowerCase();
    const passa = (i) => !f || i.label.toLowerCase().includes(f) ||
                         i.col.toLowerCase().includes(f);
    opcoes.innerHTML = TEMAS.map((t) => {
      const itens = INDICADORES.filter((i) => i.tema === t.id && passa(i));
      if (!itens.length) return '';
      return `<div class="ind-tema">${t.label}</div>` + itens.map((i) => {
        const aqui = i.anos.includes(ano());
        return `
        <button type="button" role="option"
                class="ind-opcao${aqui ? '' : ' fora-do-ano'}"
                data-i="${INDICADORES.indexOf(i)}"
                aria-selected="${i === indAtivo}"${aqui ? '' :
                  ` title="${i.label} não existe em ${ano()}: escolher leva para ${anoMaisProximo(i)}"`}>
          ${selo(i)}<span class="ind-rotulo">${i.label}</span><span
            class="ind-info" data-i="${INDICADORES.indexOf(i)}"
            aria-hidden="true">i</span>
        </button>`;
      }).join('');
    }).join('') || '<p class="ind-vazio">Nenhum indicador com esse texto.</p>';
  };

  desenhar();
  busca.oninput = () => desenhar(busca.value);

  opcoes.onclick = (ev) => {
    const b = ev.target.closest('.ind-opcao');
    if (!b) return;
    indAtivo = INDICADORES[Number(b.dataset.i)];
    abrirLista(false);
    atualizarBotaoIndicador();
    // Escolher um indicador que nao existe no censo corrente LEVA ao censo que
    // o tem, em vez de pintar o mapa de cinza e explicar depois. E o mesmo
    // gesto que a celula do selo ja fazia; a diferenca e que agora a linha
    // inteira serve, porque a lista deixou de esconder o que falta no ano.
    if (!indAtivo.anos.includes(ano())) { irParaAno(anoMaisProximo(indAtivo)); return; }
    aplicarIndicador();
  };

  atualizarBotaoIndicador();
}

// ------------------------------------------------- ficha do indicador
// O 'i' de cada linha abre, no hover, a mesma coisa que a página de fórmulas
// mostra: como o número é feito. A pergunta que se faz diante de uma lista de
// noventa indicadores não é "o que é isso" — é "isso é comparável com o outro
// censo, e o que exatamente entra na conta".
//
// metodologia.json tem 322 KB (33 KB comprimido) e não entra na carga inicial:
// é buscado na primeira vez que alguém pousa o mouse num 'i'. Enquanto não
// chega, o balão mostra o que já se sabe do config.js.
let metod = null;
let metodPedido = null;

function pedirMetodologia() {
  metodPedido ??= fetch('./data/metodologia.json')
    .then((r) => r.json())
    .then((j) => { metod = j; return j; })
    .catch((e) => { console.warn('sem metodologia:', e.message); return null; });
  return metodPedido;
}

// O ano a descrever: o que está na tela, se o indicador existir nele; senão o
// mais recente em que existe. Mostrar a fórmula de um censo que não é o da tela
// sem dizer qual seria pior que não mostrar.
function anoDaFicha(ind) {
  return ind.anos.includes(ano()) ? ano() : [...ind.anos].sort().pop();
}

const escapar = (t) => String(t ?? '')
  .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function fichaHtml(ind) {
  const a = anoDaFicha(ind);
  const e = metod?.anos?.[String(a)]?.find((x) => x.col === ind.col);
  const linha = (r, v) => (v ? `<dt>${r}</dt><dd>${escapar(v)}</dd>` : '');

  return `<h4>${escapar(ind.label)}</h4>` +
    `<p class="fi-anos">${ind.anos.join(' · ')}${
      a === ano() ? '' : ` — fórmula de ${a}, que não é o censo na tela`}</p>` +
    (ind.desc ? `<p>${ind.desc}</p>` : '') +
    (ehMonetario(ind)
      ? '<p class="fi-marca">Cada censo mediu na moeda da sua época — e 1991 em ' +
        'salários mínimos. O que o mapa mostra já está deflacionado.</p>'
      : '') +
    (e
      ? `<dl class="fi-formula">${linha('tipo', e.tipo)}${
          linha('registro', e.registro)}${linha('peso', e.peso)}${
          linha('numerador', e.num)}${linha('denominador', e.den)}</dl>` +
        (e.nota ? `<p class="fi-nota">${escapar(e.nota)}</p>` : '')
      : metod ? '<p class="fi-nota">Sem fórmula registrada para este censo.</p>'
              : '<p class="fi-nota">carregando a fórmula…</p>');
}

function mostrarFicha(alvo, ind) {
  const pop = document.getElementById('ind-ficha');
  pop.innerHTML = fichaHtml(ind);
  pop.hidden = false;

  // à direita da coluna, e nunca para fora da tela: a lista rola, então a linha
  // pode estar em qualquer altura
  const r = alvo.getBoundingClientRect();
  const h = pop.getBoundingClientRect().height;
  pop.style.left = `${Math.round(r.right + 10)}px`;
  pop.style.top = `${Math.round(
    Math.min(Math.max(8, r.top - 8), innerHeight - h - 8))}px`;
}

function esconderFicha() {
  document.getElementById('ind-ficha').hidden = true;
}

function initFicha() {
  const opcoes = document.getElementById('ind-opcoes');
  opcoes.addEventListener('mouseover', async (ev) => {
    const i = ev.target.closest('.ind-info');
    if (!i) return;
    const ind = INDICADORES[Number(i.dataset.i)];
    mostrarFicha(i, ind);
    if (!metod) { await pedirMetodologia(); if (!document.getElementById('ind-ficha').hidden) mostrarFicha(i, ind); }
  });
  opcoes.addEventListener('mouseout', (ev) => {
    if (ev.target.closest('.ind-info')) esconderFicha();
  });
  // a lista rola por baixo do balão; deixá-lo parado apontaria para outra linha
  opcoes.addEventListener('scroll', esconderFicha);
}

function atualizarBotaoIndicador() {
  document.getElementById('ind-botao').innerHTML =
    `${selo(indAtivo)}<span class="ind-rotulo">${indAtivo.label}</span>` +
    '<span class="ind-seta" aria-hidden="true"></span>';
}

// Altura ate o fim da tela, medida do topo REAL da lista — que depende do
// botao, de uma ou duas linhas conforme o nome do indicador. O CSS tem um
// fallback proximo disto; esta medida so o torna exato.
function medirAlturaDaLista() {
  const lista = document.getElementById('ind-lista');
  lista.style.removeProperty('--lista-alt');
  const topo = lista.getBoundingClientRect().top;
  lista.style.setProperty('--lista-alt',
                          `${Math.max(200, Math.round(innerHeight - topo - 14))}px`);
}

function abrirLista(abrir) {
  listaAberta = abrir;
  const lista = document.getElementById('ind-lista');
  const botao = document.getElementById('ind-botao');
  lista.hidden = !abrir;
  botao.setAttribute('aria-expanded', String(abrir));
  if (abrir) {
    medirAlturaDaLista();
    const b = document.getElementById('ind-busca');
    b.value = '';
    b.dispatchEvent(new Event('input'));
    b.focus();
    // deixa a escolha atual visivel sem precisar rolar atras dela
    lista.querySelector('[aria-selected="true"]')
         ?.scrollIntoView({ block: 'center' });
  } else {
    botao.focus();
  }
}

function initSeletorIndicador() {
  document.getElementById('ind-botao')
          .addEventListener('click', () => abrirLista(!listaAberta));

  // com a lista aberta, --lista-alt guarda a altura da janela ANTERIOR
  addEventListener('resize', () => { if (listaAberta) medirAlturaDaLista(); });

  // fecha ao clicar fora ou com Escape; sem isso a lista fica presa aberta por
  // cima do mapa e o clique seguinte cai nela em vez de no mapa
  document.addEventListener('pointerdown', (ev) => {
    if (listaAberta && !ev.target.closest('#sel-indicador')) abrirLista(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && listaAberta) { ev.stopPropagation(); abrirLista(false); }
  });

  // setas percorrem a lista, Enter escolhe
  document.getElementById('ind-lista').addEventListener('keydown', (ev) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(ev.key)) return;
    const itens = [...document.querySelectorAll('.ind-opcao')];
    if (!itens.length) return;
    const atual = itens.indexOf(document.activeElement);
    if (ev.key === 'Enter' && atual >= 0) { itens[atual].click(); return; }
    ev.preventDefault();
    const passo = ev.key === 'ArrowDown' ? 1 : -1;
    const alvo = atual < 0 ? (passo > 0 ? 0 : itens.length - 1)
                           : (atual + passo + itens.length) % itens.length;
    itens[alvo].focus();
  });
}

// Fonte do dado muda com o censo, e o rodapé é o que o leitor tem para saber de
// onde veio o número.
const FONTE_2022 = 'Censo Demográfico 2022, IBGE (microdados de acesso controlado)';
const fonteDoAno = (a) => a === 2022
  ? FONTE_2022
  : `Censo Demográfico ${a}, IBGE — microdados da amostra`;

const GEOBR = '<a href="https://ipeagit.github.io/geobr/" target="_blank" ' +
              'rel="noopener">geobr</a>';

function atualizarRodape() {
  // innerHTML, e nao textContent, por causa do link do geobr. O unico trecho
  // variavel e o ano, que e numero.
  document.getElementById('app-footer').innerHTML =
    `${fonteDoAno(ano())} · Proporções ponderadas pelo peso amostral · ` +
    `Malha: IBGE ${ano()} via ${GEOBR}`;
}

// ----------------------------------------------- cores, escala e downloads
function montarControles() {
  const pal = document.getElementById('sel-paleta');
  pal.innerHTML = PALETAS.map((p) =>
    `<option value="${p.id}"${p.id === paletaAtiva ? ' selected' : ''}>${p.label}</option>`
  ).join('');
  pal.onchange = () => { paletaAtiva = pal.value; aplicarIndicador(); };

  const base = document.getElementById('sel-base');
  base.innerHTML = BASES_ESCALA.map((b) =>
    `<option value="${b.id}"${b.id === baseEscala ? ' selected' : ''}>${b.label}</option>`
  ).join('');
  base.onchange = () => { baseEscala = base.value; aplicarIndicador(); };

  const borda = document.getElementById('sel-borda');
  borda.onchange = () => { bordaAtiva = borda.value; aplicarIndicador(); };

  document.getElementById('btn-csv').onclick = baixarCsv;
}

// ------------------------------------------------ paineis colapsaveis
// Com malha densa o mapa e a informacao; os dois paineis somam 590 px de
// largura e cobrem metade da tela num notebook. Recolher e devolver o mapa.
function initPaineis() {
  const par = [
    ['sb-toggle', 'sidebar',     'sb-fechada', '\u2039', '\u203a', 'indicadores'],
    ['rp-toggle', 'right-panel', 'rp-fechada', '\u203a', '\u2039', 'valores'],
  ];
  for (const [btn, alvo, classe, fechar, abrir, nome] of par) {
    const b = document.getElementById(btn);
    b.addEventListener('click', () => {
      const fechada = document.body.classList.toggle(classe);
      b.textContent = fechada ? abrir : fechar;
      b.setAttribute('aria-expanded', String(!fechada));
      b.title = `${fechada ? 'Mostrar' : 'Recolher'} o painel de ${nome}`;
      // o mapa ocupa o espaco liberado; sem isto o canvas fica do tamanho
      // antigo e a projecao sai deslocada do container
      setTimeout(() => map.resize(), 210);
    });
  }
}

const baixar = (blob, nome) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  // O ancora precisa estar NO DOCUMENTO: clicar num elemento solto funciona em
  // alguns navegadores e falha em silencio em outros, sem erro nenhum.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

// Nome de arquivo previsivel e sem acento: vira anexo de e-mail e nome de
// coluna em planilha na mesma tarde.
const nomeArquivo = (ext) =>
  `censo${ano()}_${camada().nivel}_${indAtivo.col}.${ext}`;

// Exporta O QUE ESTA NO MAPA, nao o CSV inteiro: ja com o piso de amostra
// aplicado e, havendo recorte, so o que esta dentro dele. E o que permite conferir um
// numero da figura sem refazer o filtro.
function baixarCsv() {
  const n = camada();
  const fonte = fonteAtualFiltrada();
  const linhas = [['codigo', 'nome', 'valor', 'unidade',
                   'n_amostra', 'pop_pond'].join(',')];
  const nomeCol = { ap: 'nome_ap', mun: 'nome_mun', uf: 'nome_uf' }[n.nivel];

  for (const [cod, v] of [...fonte.values].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const r = registro(n, cod) ?? {};
    const nome = String(r[nomeCol] ?? '');
    linhas.push([
      cod,
      // nome com virgula quebraria a coluna seguinte: 511 areas tem
      /[",]/.test(nome) ? `"${nome.replace(/"/g, '""')}"` : nome,
      v,
      ehMonetario(indAtivo) ? BASE_MONETARIA : (indAtivo.unidade ?? ''),
      r[indAtivo.den] ?? '',
      r.pop_pond ?? '',
    ].join(','));
  }
  baixar(new Blob(['\ufeff' + linhas.join('\n')],
                  { type: 'text/csv;charset=utf-8' }), nomeArquivo('csv'));
}

// ---------------------------------------------------------------- figura
// Clicar em PNG não baixa direto: abre a montagem da figura. Título e fonte
// aparecem SOBRE o mapa, editáveis no lugar, e um painel flutuante carrega o
// que não cabe lá — canto da legenda, mapa de fundo, e quais censos entram.
// Segundo clique em PNG salva; Esc cancela.
let editandoFigura = false;
let cantoLegenda = 'ie';
let comLegenda = true;
let anosDoFacet = null;      // não-nulo só durante a captura, para forçar a escala

function initFigura() {
  document.getElementById('btn-png').onclick = () =>
    (editandoFigura ? salvarFigura() : abrirFigura());
  document.getElementById('fig-cancelar').onclick = fecharFigura;
  document.getElementById('fig-salvar').onclick = salvarFigura;

  const canto = document.getElementById('fig-canto');
  canto.innerHTML = CANTOS_LEGENDA
    .map((c) => `<option value="${c.id}">${c.label}</option>`).join('') +
    '<option value="nenhuma">sem legenda</option>';
  canto.onchange = () => {
    comLegenda = canto.value !== 'nenhuma';
    if (comLegenda) cantoLegenda = canto.value;
  };

  document.getElementById('fig-limpo').onchange = (ev) =>
    setModoLimpo(ev.target.checked);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && editandoFigura) fecharFigura();
  });

  tornarArrastavel(document.getElementById('fig-panel'),
                   { pega: '#fig-cabeca', quando: () => editandoFigura });
}

// A barra de controles muda de altura com o que esta ligado (chip do recorte,
// Mostrar, Cortes). Medir depois de aplicar a classe e antes de mostrar o
// titulo e o que garante que ele caia LOGO abaixo dela, em vez de sumir atras.
function posicionarTitulo() {
  const barra = document.getElementById('mapa-controles');
  const painel = document.getElementById('map-panel');
  const alto = barra.getBoundingClientRect().bottom
             - painel.getBoundingClientRect().top;
  painel.style.setProperty('--fig-topo', `${Math.round(alto) + 12}px`);
}

function abrirFigura() {
  editandoFigura = true;
  document.body.classList.add('editando-figura');
  posicionarTitulo();
  document.getElementById('fig-limpo').checked = modoLimpoLigado();
  preencherTextos();
  montarAnosDaFigura();
  document.getElementById('fig-panel').hidden = false;
  document.getElementById('btn-png').classList.add('ativo');
  document.getElementById('btn-png').title = 'Salvar a figura em PNG';
}

function fecharFigura() {
  editandoFigura = false;
  document.body.classList.remove('editando-figura');
  document.getElementById('fig-panel').hidden = true;
  document.getElementById('btn-png').classList.remove('ativo');
  document.getElementById('btn-png').title = 'Montar e baixar a imagem do mapa';

  // os textos guardam o que foi digitado; sem limpar, a próxima figura de
  // outro indicador abriria com o título da anterior
  for (const id of ['gr-titulo', 'gr-fonte']) {
    const el = document.getElementById(id);
    el.textContent = '';
    delete el.dataset.editado;
  }
}

// Censos que podem entrar na figura: o indicador existe naquele ano E, havendo
// recorte, a unidade existe na malha daquele ano. Um município criado em 1997
// simplesmente não tem painel de 1970 para oferecer.
//
// O 'await carregarNivel' não é opcional: registro() lê o CSV em memória, e sem
// carregar antes um censo que o usuário ainda não visitou responderia "a
// unidade não existe" — a lista ficaria dependendo de por onde ele navegou.
async function censosDisponiveis() {
  const f = focoAtual();
  const nivelCont = f ? f.cont.nivel : camada().nivel;
  const alvos = ANOS.map(({ ano: a }) => camadaDe(a, nivelCont)).filter(Boolean);
  if (f) await Promise.all(alvos.map(carregarNivel));

  return ANOS.map(({ ano: a }) => {
    const cIndicador = indicadoresDoAno(a).includes(indAtivo);
    const alvo = camadaDe(a, nivelCont);
    const focos = alvo ? focosDoAno(a)[alvo.nivel] : null;
    const cUnidade = !f || (alvo && focos && registro(alvo, f.cod));
    return { ano: a, ok: cIndicador && !!cUnidade,
             motivo: !cIndicador ? `${indAtivo.label} não existe`
                                 : !cUnidade ? 'a unidade não existe nesta malha'
                                             : '' };
  });
}

async function montarAnosDaFigura() {
  const box = document.getElementById('fig-anos');
  box.textContent = 'carregando…';
  const censos = await censosDisponiveis();
  if (!editandoFigura) return;      // fechou enquanto carregava
  box.innerHTML = censos.map(({ ano: a, ok, motivo }) => `
    <label class="fig-ano${ok ? '' : ' fora'}"${motivo ? ` title="${a}: ${motivo}"` : ''}>
      <input type="checkbox" value="${a}"${ok ? '' : ' disabled'}${
        a === ano() ? ' checked' : ''}> ${a}
    </label>`).join('');
  // trocar a seleção muda o que o título e a fonte podem afirmar
  box.onchange = () => preencherTextos();
  preencherTextos();
}

const anosMarcados = () =>
  [...document.querySelectorAll('#fig-anos input:checked')]
    .map((i) => Number(i.value)).sort();

async function salvarFigura() {
  const btn = document.getElementById('fig-salvar');
  const titulo = document.getElementById('gr-titulo').textContent.trim();
  const creditos = document.getElementById('gr-fonte').textContent.trim();
  const anos = anosMarcados();
  btn.disabled = true;
  try {
    const canvas = anos.length > 1
      ? await montarFacet(anos, { titulo, creditos })
      : await montarCanvas({ titulo, creditos, comLegenda, cantoLegenda });
    await baixarCanvas(canvas, nomeArquivo('png'));
    fecharFigura();
  } catch (e) {
    alert('Não foi possível gerar o PNG: ' + e.message +
          '\n\nSe o erro for de segurança do canvas, marque "sem mapa de fundo": ' +
          'a textura de outra origem é o que contamina o canvas.');
  } finally {
    btn.disabled = false;
  }
}

// Vários censos lado a lado, na mesma escala e no mesmo enquadramento. Não são
// vários mapas: é o mapa fotografado uma vez por censo, com a barra de anos
// andando sozinha. Volta ao censo de origem no fim, dê certo ou não.
async function montarFacet(anos, { titulo, creditos }) {
  const anoOrigem = ano();
  const f = focoAtual();
  const cod = f?.cod ?? null;
  const nivelCont = f ? f.cont.nivel : null;

  anosDoFacet = anos;
  try {
    // enquadramento comum: a união dos bbox da unidade nos censos escolhidos.
    // Cada censo tem a extensão da SUA malha, e deixar cada painel enquadrar
    // pelo próprio faria a figura comparar recortes diferentes.
    let bb = null;
    if (cod) {
      const caixas = [];
      for (const a of anos) {
        const alvo = camadaDe(a, nivelCont);
        if (alvo) caixas.push(await bboxDaUnidade(alvo, cod));
      }
      bb = unirBbox(caixas);
    }
    if (!bb) bb = map.getBounds().toArray();   // sem recorte: o que está na tela

    const paineis = [];
    let recorte = null;
    for (const a of anos) {
      await irParaAno(a);
      const desenhou = !cod || !!focoAtual();
      if (!desenhou) { paineis.push({ ano: a, canvas: null,
                                      nota: `sem ${cod} em ${a}` }); continue; }
      const r = await enquadrarParaCaptura(bb);
      recorte ??= r;          // o primeiro define o corte; os demais repetem
      paineis.push({ ano: a, canvas: capturarRecorte(recorte) });
    }
    return comporGrade(paineis, { titulo, creditos, comLegenda });
  } finally {
    anosDoFacet = null;
    if (ano() !== anoOrigem) await irParaAno(anoOrigem);
  }
}

// ------------------------------------------------------------------- foco
// Recortar uma unidade e desenhar só as subdivisões dela. Era um MODO, com
// tela própria: entrar escondia a lista de indicadores, o painel de valores e
// metade do cabeçalho, mesmo para quem só queria ver os municípios de São
// Paulo. Virou navegação: shift+clique recorta, Esc devolve, e todo o resto da
// interface continua funcionando por cima.
let escalaLocal = true;      // quantis sobre o recorte, não sobre o Brasil
let nivelAntesDoFoco = null;
let pilhaFoco = [];          // recortes acima do atual, para o Esc subir um a um

// O container é a camada atual, se ela puder ser recortada naquele censo.
// Município só é recortável onde há área de ponderação para acender dentro,
// ou seja 2010 e 2022; UF é recortável em todos.
function containerDoNivel() { return focosDoAno(ano())[camada().nivel] ?? null; }

function initFoco() {
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && focoAtual() && !editandoFigura) sairDoFoco();
  });

  document.getElementById('gr-escala').addEventListener('change', (ev) => {
    escalaLocal = ev.target.value === 'local';
    aplicarIndicador();
  });

  document.getElementById('gr-filhos').addEventListener('change', () => {
    if (focoAtual()) refocar();       // mesma unidade, outro nível de filhos
  });

  document.getElementById('foco-sair').addEventListener('click', sairDoFoco);
  atualizarChipFoco();
}

// A trilha do recorte, e o único lugar onde shift+clique é anunciado: sem ela
// o atalho seria invisível para quem nunca leu a metodologia.
function atualizarChipFoco() {
  const chip = document.getElementById('foco-chip');
  const dica = document.getElementById('foco-dica');
  const f = focoAtual();
  document.body.classList.toggle('com-foco', !!f);

  if (f) {
    chip.querySelector('#foco-nome').textContent = tituloFoco || f.cod;
    chip.hidden = false;
  } else {
    chip.hidden = true;
  }

  // fora do foco, diz se dá para recortar dali e por que não, quando não dá
  const podeFocar = !!containerDoNivel();
  dica.hidden = !!f;
  dica.textContent = podeFocar
    ? 'shift+clique recorta uma unidade'
    : camadaDe(ano(), 'ap') && camada().nivel === 'ap'
      ? 'área de ponderação não se subdivide'
      : `em ${ano()} não há área de ponderação para desenhar dentro do município`;
}

// A camada que está sendo recortada. Depois de focar, camada() já aponta para
// os FILHOS, não para o container: derivar do nível atual escolheria o
// container errado, e o filtro sairia com o campo errado, casando com nada.
function camadaContainer() {
  return focoAtual()?.cont ?? nivelAntesDoFoco ?? camada();
}

function filhosEscolhidos() {
  const c = camadaContainer();
  const cont = focosDoAno(c.ano)[c.nivel];
  if (!cont) return null;
  const sel = document.getElementById('gr-filhos');
  return cont.filhos[Number(sel.value)] ?? cont.filhos[0];
}

// Repovoa o seletor de filhos para o container de um ano. Os filhos possíveis
// mudam com o censo: em 2010 um estado pode ser recortado em municípios OU em
// áreas de ponderação, e em 1970 só em municípios.
function montarFilhos(cont, preferido) {
  const sel = document.getElementById('gr-filhos');
  sel.innerHTML = cont.filhos
    .map((f, i) => `<option value="${i}">${f.label}</option>`).join('');
  const i = preferido ? cont.filhos.findIndex((f) => f.nivel === preferido.nivel) : -1;
  sel.selectedIndex = i >= 0 ? i : 0;
  document.getElementById('gr-filhos-linha').hidden = cont.filhos.length < 2;
  return cont.filhos[sel.selectedIndex];
}

// Troca de censo mantendo o recorte.
//
// A unidade recortada pode não existir no censo novo — município criado depois,
// ou nível de container que aquele ano não tem. Quando não existe, o recorte é
// solto e o ano pedido vale assim mesmo: o usuário pediu o outro censo, e ficar
// no ano anterior deixaria o clique sem efeito visível.
async function trocarAnoComFoco(novoAno) {
  const cont = camadaContainer();
  const alvo = camadaDe(novoAno, cont.nivel);
  const focos = alvo ? focosDoAno(novoAno)[alvo.nivel] : null;
  if (!alvo || !focos) return false;   // aquele censo não recorta por este nível

  const f = focoAtual();
  const cod = f?.cod ?? null;
  const sigla = f?.sigla ?? null;
  const filhosAntes = f?.filhos ?? filhosEscolhidos();

  limparFoco(alvo, { zoom: false });   // sem o afastamento: já vamos reenquadrar
  await carregarNivel(alvo);
  setCamada(alvo);
  nivelAntesDoFoco = alvo;
  selecao = null;

  const disponiveis = indicadoresDoAno(novoAno);
  if (!disponiveis.includes(indAtivo)) indAtivo = disponiveis[0];

  const filhos = montarFilhos(focos, filhosAntes);

  montarAnos();
  montarNiveis();
  montarSeletor();

  // registro() é a pergunta certa: o código existe na malha DAQUELE censo?
  if (cod && registro(alvo, cod)) {
    await carregarNivel(await focar(alvo, cod, sigla, filhos));
  } else {
    // o censo trocou de todo jeito, só o recorte é que não sobreviveu
    if (cod) console.info(`${cod} não existe em ${novoAno}: recorte desfeito`);
    nivelAntesDoFoco = null;
    tituloFoco = '';
  }

  atualizarChipFoco();
  atualizarRodape();
  preencherTextos();
  await aplicarIndicador();
  return true;      // 'true' = o ano trocou aqui; quem chama não deve repetir
}

// Esc sobe UM nível de cada vez. Quem desceu estado -> município -> área de
// ponderação quer voltar ao município, não ao Brasil: saltar tudo obrigaria a
// refazer os dois cliques e o enquadramento.
async function sairDoFoco() {
  const anterior = pilhaFoco.pop();
  selecao = null;

  if (anterior) {
    limparFoco(null, { zoom: false });
    montarFilhos(focosDoAno(anterior.cont.ano)[anterior.cont.nivel], anterior.filhos);
    await carregarNivel(
      await focar(anterior.cont, anterior.cod, anterior.sigla, anterior.filhos));
    tituloFoco = anterior.titulo;
  } else {
    limparFoco(nivelAntesDoFoco);
    nivelAntesDoFoco = null;
    tituloFoco = '';
    // O nível de filhos e a base dos cortes valiam para AQUELE recorte; deixá-los
    // ligados faria o próximo recorte começar com escolha herdada de outro.
    document.getElementById('gr-filhos').selectedIndex = 0;
    document.getElementById('gr-escala').value = 'local';
    escalaLocal = true;
  }

  atualizarChipFoco();
  if (editandoFigura) posicionarTitulo();
  preencherTextos();
  aplicarIndicador();
  atualizarPainel();
}

async function refocar() {
  const f = focoAtual();
  if (!f) return;
  const filhos = filhosEscolhidos();
  const nivelFilhos = await focar(f.cont, f.cod, f.sigla, filhos);
  await carregarNivel(nivelFilhos);
  preencherTextos();
  aplicarIndicador();
}

// Shift+clique recorta a unidade. Encadeia sozinho: recortado o estado, a
// camada corrente já é a dos municípios, então o shift+clique seguinte recorta
// o município e acende as áreas de ponderação — nos censos que as têm.
async function escolherFoco(cod, titulo, props) {
  const cont = containerDoNivel();
  if (!cont) return;
  const f = focoAtual();
  // guarda a camada a que sair do foco tem de voltar, só na primeira descida
  if (!f) nivelAntesDoFoco = camada();
  else pilhaFoco.push({ ...f, titulo: tituloFoco });

  const filhos = montarFilhos(cont, null);
  const nivelFilhos = await focar(camada(), cod, props.abbrev_state, filhos);
  await carregarNivel(nivelFilhos);
  tituloFoco = titulo;
  atualizarChipFoco();
  preencherTextos();
  aplicarIndicador();
}

let tituloFoco = '';

function preencherTextos() {
  const t = document.getElementById('gr-titulo');
  const f = document.getElementById('gr-fonte');

  // Com vários censos na figura, o ano sai do título e a fonte passa a citar
  // todos: "Alfabetização · Minas Gerais · 2022" numa grade de quatro censos
  // seria simplesmente falso.
  const anos = editandoFigura ? anosMarcados() : [];
  const varios = anos.length > 1;

  // só prefixa se o usuário ainda não editou. Sem unidade recortada não entra
  // o separador vazio, que sairia como "Indicador ·  · 1991".
  if (!t.dataset.editado) {
    t.textContent = [indAtivo.label, tituloFoco, varios ? '' : ano()]
      .filter(Boolean).join(' · ');
  }
  if (!f.dataset.editado) {
    const fonte = varios
      ? `Censos Demográficos de ${anos.join(', ')}, IBGE`
      : fonteDoAno(ano());
    f.textContent = `Fonte: ${fonte}. Proporções ponderadas pelo peso amostral.` +
                    (ehMonetario(indAtivo)
                      ? ` Valores em ${BASE_MONETARIA}, deflacionados pelo INPC.`
                      : '');
  }
}

// A fonte que o mapa está desenhando, já com o recorte aplicado. O CSV usa a MESMA função, senão o arquivo baixado não bate com a
// figura que está na tela.
//
// No recorte, a escala pode ser calculada só sobre as unidades visíveis. Muda
// o que a figura diz: local mostra a variação interna, nacional mostra onde a
// unidade está no país. Sem isso, município homogêneo vira cor única. O código
// carrega a hierarquia: cod_ap começa com os dígitos do município, que começam
// com os da UF. Filtrar por prefixo dispensa colunas extras no CSV e vale para
// qualquer combinação container/filhos.
function fonteAtualFiltrada() {
  const fonte = fonteDoIndicador(camada(), indAtivo);
  const f = focoAtual();
  if (f && escalaLocal) {
    const dentro = new Map(), popDentro = new Map();
    for (const [cod, v] of fonte.values) {
      if (!String(cod).startsWith(f.cod)) continue;
      dentro.set(cod, v);
      popDentro.set(cod, fonte.pop.get(cod) ?? 0);
    }
    if (dentro.size) { fonte.values = dentro; fonte.pop = popDentro; }
  }
  return fonte;
}

// A escala comparavel entre censos carrega CSVs, entao esta funcao virou
// assincrona. Trocar de ano duas vezes rapido dispara duas cargas, e a primeira
// pode terminar depois da segunda e pintar classes velhas. O contador descarta
// o resultado que ja foi superado.
let geracao = 0;

async function aplicarIndicador() {
  const meu = ++geracao;
  const n = camada();
  const fonte = fonteAtualFiltrada();
  document.getElementById('ind-desc').innerHTML = indAtivo.desc;
  // ponto único por onde passa toda troca de ano, nível ou indicador
  marcarAnosSemIndicador();

  // lacuna de cobertura do censo, quando existe: a mancha cinza precisa de
  // explicação, senão parece bug do mapa
  const nota = document.getElementById('ano-nota');
  nota.textContent = NOTAS_ANO[n.ano] ?? '';
  nota.hidden = !nota.textContent;

  const aviso = document.getElementById('ind-aviso');
  if (nivelAusente(n)) {
    // camada declarada no catálogo cujo CSV ainda não foi gerado
    aviso.hidden = false;
    aviso.textContent =
      `O recorte por ${n.label.toLowerCase()} de ${n.ano} ainda não tem dado ` +
      'gerado. A malha existe e o mapa está pronto; falta a extração.';
  } else if (!temColuna(n, indAtivo.col)) {
    // acontece com as medianas nos censos por amostra: elas sao calculadas por
    // municipio e a mediana do estado nao sai da soma delas
    aviso.hidden = false;
    aviso.textContent =
      `${indAtivo.label} não foi calculado por ${n.label.toLowerCase()} em ` +
      `${n.ano}. Mediana não se soma: a do estado teria de sair do microdado, ` +
      'e a extração desse censo agregou por município.';
  } else if (fonte.descartadas > 0) {
    aviso.hidden = false;
    const unidade = n.nivel === 'ap' ? 'áreas' : n.nivel === 'mun' ? 'municípios' : 'estados';
    aviso.textContent =
      `${fmtInteiro(fonte.descartadas)} ${unidade} sem cor: menos de ${PISO_AMOSTRA} ` +
      `registros na amostra, estimativa instável demais para mapear.`;
  } else {
    aviso.hidden = true;
  }

  // Escala comparável entre censos: as classes saem da série inteira, e só a
  // pintura usa o ano corrente. Sem isso, a mesma cor quer dizer coisas
  // diferentes em 1991 e em 2022, e a comparação visual entre mapas mente.
  //
  // Cortes e Escala são EIXOS SEPARADOS, e as quatro
  // combinações fazem sentido:
  //
  //   Cortes           Escala                domínio dos cortes
  //   do recorte       deste censo           unidades do recorte, um ano
  //   do recorte       comparável entre..    unidades do recorte, todos os censos
  //   nacional         deste censo           país, um ano
  //   nacional         comparável entre..    país, todos os censos
  //
  // A segunda linha é a mais útil numa figura de relatório — a mesma unidade
  // ao longo dos censos, com a escala apertada nela — e era justamente a que
  // não existia: a série vinha sempre nacional, então a combinação foi
  // suspensa em vez de implementada. Agora o prefixo do recorte vai junto.
  // Durante a captura de um facet a escala é FORÇADA para a série dos censos
  // escolhidos, quaisquer que sejam os controles da barra: painéis com cortes
  // diferentes desmentiriam a figura, que existe para ser comparada.
  const notaBase = document.getElementById('base-nota');
  let dominio = null;
  if (baseEscala === 'serie' || anosDoFacet) {
    const f = focoAtual();
    const recorte = f && escalaLocal ? f.cod : null;
    const { valores, anos } =
      await valoresDaSerie(n.nivel, indAtivo, recorte, anosDoFacet);
    dominio = valores.length ? valores : null;
    const onde = recorte
      ? `dentro do recorte, no nível ${n.label.toLowerCase()}`
      : `no nível ${n.label.toLowerCase()}`;
    notaBase.textContent = anos.length > 1
      ? `Cortes calculados sobre ${anos.join(', ')} juntos, ${onde}. A mesma ` +
        'cor quer dizer o mesmo valor em todos esses censos.'
      : anos.length === 1
        ? `${indAtivo.label} só existe em ${anos[0]}${recorte ? ' neste recorte' : ''}: ` +
          'não há série para comparar.'
        : 'Sem valor algum na série para este recorte: os cortes voltam a sair ' +
          'do censo corrente.';
    notaBase.hidden = false;
  } else {
    notaBase.hidden = true;
  }

  if (meu !== geracao) return;      // outra troca chegou primeiro
  updateChoropleth(fonte, { paleta: paletaAtiva, dominio, borda: bordaAtiva });
  atualizarPainel();
}

// ------------------------------------------------------------- painel lateral
function atualizarPainel() {
  const titulo = document.getElementById('ap-title');
  const corpo  = document.getElementById('ap-dados');
  const vazio  = document.getElementById('placeholder-panel');
  const n = camada();

  if (!selecao) {
    titulo.textContent = `Nenhum${n.nivel === 'ap' ? 'a área' : n.nivel === 'mun' ? ' município' : ' estado'} selecionad${n.nivel === 'ap' ? 'a' : 'o'}`;
    corpo.innerHTML = '';
    corpo.style.display = 'none';
    vazio.style.display = '';
    esconderPiramide();     // sem unidade escolhida nao ha piramide a mostrar
    return;
  }

  const r = registro(n, selecao.cod);
  vazio.style.display = 'none';
  corpo.style.display = '';
  titulo.textContent = selecao.titulo;

  if (!r) {
    corpo.innerHTML = '<p class="sem-dado">Sem dado amostral divulgado para esta unidade.</p>';
    return;
  }

  // Mostra o tema do indicador ativo inteiro, não os 73: o painel serve para
  // ler a unidade no contexto do assunto escolhido. Só os que existem naquele
  // censo, senão o painel enche de linha vazia.
  const tema = TEMAS.find((t) => t.id === indAtivo.tema);
  const doTema = indicadoresDoAno(n.ano).filter((i) => i.tema === indAtivo.tema);

  const linhas = doTema.map((ind) => {
    const amostra = r[ind.den];
    const instavel = amostra != null && amostra < PISO_AMOSTRA;
    const valor = instavel ? 'amostra pequena' : fmtValor(r[ind.col], ind);
    return `
      <div class="dado-linha${ind === indAtivo ? ' ativo' : ''}${instavel ? ' instavel' : ''}">
        <span class="dado-label">${ind.label}</span>
        <span class="dado-valor">${valor}</span>
      </div>`;
  }).join('');

  const contexto = [
    ['Domicílios estimados', r.dom_pond],
    ['População estimada',   r.pop_pond],
    ['Domicílios na amostra', r.n_dom_amostra],
    ['Pessoas na amostra',    r.n_pes_amostra],
  ].map(([rot, v]) => `
    <div class="dado-linha secundario">
      <span class="dado-label">${rot}</span>
      <span class="dado-valor">${fmtInteiro(v)}</span>
    </div>`).join('');

  corpo.innerHTML =
    `<p class="ap-sub">${selecao.sub}</p>` +
    `<h3 class="tema-titulo">${tema ? tema.label : ''}</h3>${linhas}${contexto}`;

  desenharPiramide(n, selecao.cod, selecao.titulo);
}

// A pirâmide entra DEPOIS do painel, e não junto: o arquivo dela é carregado na
// primeira vez que alguém clica numa unidade, e esperar por ele deixaria o
// resto em branco por causa de um gráfico.
//
// E ela mora num quadro FLUTUANTE sobre o mapa, não na coluna da direita. É a
// única coisa do painel que se lê comparando com o mapa — "esta área é mais
// velha que a vizinha?" — e presa na lateral obrigava a tirar os olhos do mapa
// e voltar. Arrastável pelo mesmo motivo que a legenda: ela tapa exatamente a
// região que se quer olhar quando a unidade escolhida fica embaixo dela.
//
// O contador descarta a resposta de um clique que já foi superado por outro,
// pelo mesmo motivo que aplicarIndicador() tem o dele.
let geracaoPir = 0;
let pirFechada = false;    // o usuário fechou: não reabrir sozinho

async function desenharPiramide(n, cod, titulo) {
  const meu = ++geracaoPir;
  const painel = document.getElementById('pir-panel');
  await carregarPiramide(n);
  if (meu !== geracaoPir) return;

  const v = piramideDe(n, cod);
  // Ano ou unidade sem pirâmide não ganha quadro nenhum: um título com espaço
  // vazio embaixo parece mapa quebrado.
  if (!v || pirFechada) { painel.hidden = true; return; }

  document.getElementById('pir-titulo').textContent = titulo ?? '';
  document.getElementById('pir-box').innerHTML = blocoPiramide(v);
  painel.hidden = false;
}

function esconderPiramide() {
  document.getElementById('pir-panel').hidden = true;
}

function initPiramideFlutuante() {
  const painel = document.getElementById('pir-panel');
  tornarArrastavel(painel, { pega: '#pir-cabeca' });
  document.getElementById('pir-fechar').addEventListener('click', () => {
    pirFechada = true;
    painel.hidden = true;
  });
  // Fechar vale para aquela leitura, nao para sempre: o clique numa unidade
  // nova zera pirFechada (ver initInteracao). Sem isso o usuario fecha uma vez
  // e nunca mais ve piramide nenhuma, sem saber por que.
}

// ------------------------------------------------------------------ arranque
async function init() {
  initTema(applyMapTheme);   // tema.js nao conhece o mapa; quem repinta e daqui
  initModoLimpo();
  initLegendaArrastavel();
  initPiramideFlutuante();
  initSeletorIndicador();
  initFicha();
  initSeloClicavel();
  initPaineis();
  montarAnos();
  montarNiveis();
  montarSeletor();
  montarControles();
  atualizarRodape();
  initFoco();
  initFigura();

  // marca os textos como editados para parar de sobrescrever o que o usuário escreveu
  for (const id of ['gr-titulo', 'gr-fonte']) {
    document.getElementById(id).addEventListener('input', (ev) => {
      ev.target.dataset.editado = '1';
    });
  }

  await carregarNivel(camada());

  const pintar = () => aplicarIndicador();
  if (map.isStyleLoaded()) pintar(); else map.once('load', pintar);

  initInteracao(
    (cod, titulo, sub, props, _camada, recortar) => {
      // shift+clique recorta; clique comum lê. São perguntas diferentes, e
      // atender as duas com o mesmo gesto era o que obrigava a existir um modo.
      if (recortar && containerDoNivel()) { escolherFoco(cod, titulo, props); return; }
      selecao = { cod, titulo, sub };
      pirFechada = false;     // unidade nova, leitura nova
      atualizarPainel();
    },
    () => { selecao = null; atualizarPainel(); },
  );

  atualizarPainel();

  const pronto = () => document.getElementById('carregando')?.remove();
  map.once('idle', pronto);
  setTimeout(pronto, 15000);   // rede ruim nao deixa o aviso preso na tela
}

init();
