// Pirâmide etária da unidade selecionada.
//
// O dado vem de site/data/pir_<nivel>_<ano>.csv, gerado por
// scripts/gerar_piramide.R: uma linha por unidade, "codigo,<76 caracteres>".
// São 38 valores (19 faixas de 5 anos x 2 sexos), dois caracteres base64 cada,
// em passo de 0,05 ponto percentual.
//
// Por que um arquivo separado, e não mais colunas nos hist_*/resumo_*: o
// coroplético precisa de TODAS as unidades para um indicador; a pirâmide
// precisa de UMA unidade, no clique. São padrões de acesso opostos. Aqui a
// linha fica guardada como string opaca e só é decodificada quando alguém
// clica — 38 valores em vez dos 542.260 do nível inteiro de 2022.

// LAYOUT, combinado com o R: 0..18 são homens da faixa 0 a 18, 19..37 são
// mulheres na mesma ordem. Faixa i cobre [5i, 5i+4]; a 18 é "90 ou mais".
const FAIXAS = 19;
const PASSO = 0.05;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const IDX = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) IDX[B64.charCodeAt(i)] = i;

export const rotuloFaixa = (i) => (i === FAIXAS - 1 ? '90+' : `${i * 5}–${i * 5 + 4}`);

// nivel.id -> Map(codigo -> string de 76 chars), ou null se o ano não tem arquivo
const cache = new Map();

// Quais (nível, ano) têm pirâmide, escrito por scripts/gerar_piramide.R. Sem o
// manifesto o site só descobriria que 1991 não tem tentando baixar, e cada
// clique num município de 1991 deixaria um 404 no console — que um try/catch
// não silencia, porque o log é da rede, não do JS. Ruído assim esconde erro de
// verdade. Lido uma vez; se ele próprio faltar, tudo fica sem pirâmide.
let indice = null;
async function carregarIndice() {
  if (indice) return indice;
  try {
    const r = await fetch('./data/pir_index.json');
    indice = new Set(r.ok ? await r.json() : []);
  } catch {
    indice = new Set();
  }
  return indice;
}

// Carrega sob demanda, na primeira vez que alguém clica numa unidade daquele
// nível. O ano sem arquivo grava `null` no cache e não tenta de novo.
export async function carregarPiramide(nivel) {
  if (cache.has(nivel.id)) return cache.get(nivel.id);

  const chave = `${nivel.nivel}_${nivel.ano}`;
  let mapa = null;
  if ((await carregarIndice()).has(chave)) {
    try {
      const r = await fetch(`./data/pir_${chave}.csv`);
      if (r.ok) {
        mapa = new Map();
        const linhas = (await r.text()).trim().split(/\r?\n/);
        for (let i = 1; i < linhas.length; i++) {
          const v = linhas[i].indexOf(',');
          // a linha fica INTEIRA no mapa, sem converter: são 542.260 valores no
          // nível de 2022 e só 38 vão ser usados por clique
          if (v > 0) mapa.set(linhas[i].slice(0, v), linhas[i].slice(v + 1));
        }
      }
    } catch {
      mapa = null;            // rede caiu no meio: a seção some, sem quebrar
    }
  }
  cache.set(nivel.id, mapa);
  return mapa;
}

export function temPiramide(nivel) {
  return cache.get(nivel.id) != null;
}

// 38 valores em percentual da população da unidade, ou null.
export function piramideDe(nivel, codigo) {
  const s = cache.get(nivel.id)?.get(String(codigo));
  if (!s || s.length !== 2 * FAIXAS * 2) return null;
  const v = new Float64Array(FAIXAS * 2);
  for (let i = 0; i < v.length; i++) {
    const alto = IDX[s.charCodeAt(i * 2)];
    const baixo = IDX[s.charCodeAt(i * 2 + 1)];
    if (alto < 0 || baixo < 0) return null;
    v[i] = (alto * 64 + baixo) * PASSO;
  }
  return v;
}

const soma = (v, a, b) => {
  let t = 0;
  for (let i = a; i < b; i++) t += v[i] + v[i + FAIXAS];
  return t;
};

// Resumo em texto, que é o que responde "esta população é jovem ou velha?"
// mais rápido que o desenho.
export function resumoPiramide(v) {
  const jovens = soma(v, 0, 3);        // 0 a 14
  const idosos = soma(v, 13, FAIXAS);  // 65 ou mais
  let h = 0;
  for (let i = 0; i < FAIXAS; i++) h += v[i];
  return {
    jovens, idosos, ativos: soma(v, 3, 13),
    homens: h, mulheres: 100 - h,
    // Índice de envelhecimento: idosos por 100 jovens. Cresce muito mais
    // depressa que qualquer uma das duas pontas isolada, e é o número que
    // separa um município do Sul de um do Norte num relance.
    envelhecimento: jovens > 0 ? (100 * idosos) / jovens : null,
  };
}

const fmt1 = (x) => x.toFixed(1).replace('.', ',');

// SVG em vez de canvas: o painel é redimensionável, o texto fica selecionável e
// as cores saem de currentColor/variáveis do tema, sem repintar no toggle.
export function svgPiramide(v, { largura = 320, alturaFaixa = 13 } = {}) {
  const H = FAIXAS * alturaFaixa;
  const EIXO = 38;                       // faixa central com o rótulo etário
  const meia = (largura - EIXO) / 2;

  let max = 0;
  for (const x of v) if (x > max) max = x;
  if (!(max > 0)) return '';

  // Grade em passo redondo, o mesmo critério do resto do site: números que o
  // leitor consegue somar de cabeça, não o máximo exato da unidade.
  const passo = max > 8 ? 4 : max > 4 ? 2 : max > 2 ? 1 : max > 1 ? 0.5 : 0.25;
  const teto = Math.ceil(max / passo) * passo;
  const px = (x) => (x / teto) * meia;

  const grade = [];
  for (let g = passo; g <= teto + 1e-9; g += passo) {
    for (const lado of [-1, 1]) {
      const x = largura / 2 + lado * (EIXO / 2 + px(g));
      grade.push(`<line class="pir-grade" x1="${x.toFixed(1)}" y1="0" ` +
                 `x2="${x.toFixed(1)}" y2="${H}"/>`);
    }
  }

  const barras = [];
  const rotulos = [];
  for (let i = 0; i < FAIXAS; i++) {
    // faixa 0 embaixo: é assim que uma pirâmide se lê
    const y = (FAIXAS - 1 - i) * alturaFaixa;
    const alt = alturaFaixa - 2;
    const lh = px(v[i]);
    const lm = px(v[i + FAIXAS]);
    const xh = largura / 2 - EIXO / 2 - lh;
    const xm = largura / 2 + EIXO / 2;
    barras.push(
      `<rect class="pir-h" x="${xh.toFixed(1)}" y="${y}" width="${lh.toFixed(1)}" height="${alt}"><title>Homens, ${rotuloFaixa(i)} anos: ${fmt1(v[i])}%</title></rect>`,
      `<rect class="pir-m" x="${xm.toFixed(1)}" y="${y}" width="${lm.toFixed(1)}" height="${alt}"><title>Mulheres, ${rotuloFaixa(i)} anos: ${fmt1(v[i + FAIXAS])}%</title></rect>`);
    // um rótulo a cada duas faixas: com 19 eles se encavalam
    if (i % 2 === 0 || i === FAIXAS - 1) {
      rotulos.push(`<text class="pir-idade" x="${largura / 2}" y="${y + alt - 2}" ` +
                   `text-anchor="middle">${rotuloFaixa(i)}</text>`);
    }
  }

  const escala = [`<text class="pir-eixo" x="${(largura / 2 - EIXO / 2 - meia).toFixed(1)}" ` +
                  `y="${H + 11}" text-anchor="start">${fmt1(teto)}%</text>`,
                  `<text class="pir-eixo" x="${(largura / 2 + EIXO / 2 + meia).toFixed(1)}" ` +
                  `y="${H + 11}" text-anchor="end">${fmt1(teto)}%</text>`];

  return `<svg class="pir-svg" viewBox="0 0 ${largura} ${H + 15}" ` +
         `preserveAspectRatio="xMidYMid meet" role="img" ` +
         `aria-label="Pirâmide etária por sexo e faixa de cinco anos">` +
         grade.join('') + barras.join('') + rotulos.join('') + escala.join('') +
         '</svg>';
}

// Bloco pronto para o painel lateral: título, gráfico e as três leituras.
export function blocoPiramide(v) {
  const r = resumoPiramide(v);
  const linha = (rot, val) => `
    <div class="dado-linha secundario">
      <span class="dado-label">${rot}</span>
      <span class="dado-valor">${val}</span>
    </div>`;
  return `
    <h3 class="tema-titulo">Estrutura etária</h3>
    <div class="pir-legenda">
      <span><i class="pir-chip pir-h"></i>homens ${fmt1(r.homens)}%</span>
      <span><i class="pir-chip pir-m"></i>mulheres ${fmt1(r.mulheres)}%</span>
    </div>
    ${svgPiramide(v)}
    ${linha('0 a 14 anos', fmt1(r.jovens) + '%')}
    ${linha('15 a 64 anos', fmt1(r.ativos) + '%')}
    ${linha('65 anos ou mais', fmt1(r.idosos) + '%')}
    ${linha('Idosos por 100 jovens',
            r.envelhecimento == null ? '—' : fmt1(r.envelhecimento))}`;
}
