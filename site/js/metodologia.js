// Página de metodologia: mostra, para cada indicador de cada censo, a fórmula
// que o código realmente executa, com o significado de cada código usado.
//
// O conteúdo vem de site/data/metodologia.json, gerado por
// scripts/gerar_metodologia.py a partir do SQL da extração. Nada aqui é escrito
// à mão: uma página de metodologia redigida em separado descreveria a intenção,
// não o que roda, e esconderia justamente o erro que se procura.
//
// Os rótulos e temas vêm do mesmo config.js que alimenta o mapa, então indicador
// renomeado lá aparece renomeado aqui sem trabalho nenhum.

import { INDICADORES, TEMAS, ANOS, indicadoresDoAno } from './config.js';
import { initTema } from './tema.js';

const TIPO = {
  pct: 'percentual', media: 'média', mediana: 'mediana',
  razao: 'razão', total: 'total', composto: 'composto',
};

const esc = (t) => String(t ?? '').replace(/[&<>]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Destaca os códigos de variável dentro da fórmula, que é o que o olho procura
// quando está conferindo. Aceita os dois formatos: D0260/P0111 em 2022,
// v0208/v6531 nos microdados da amostra de 1970 a 2010.
const realce = (f) => esc(f).replace(/\b([DPFM]\d{4}|v\d{3,4})\b/g,
  '<b class="met-var">$1</b>');

let dados = null;
let anoAtivo = 2022;

function cartao(ind, entrada) {
  const rot = entrada ? entrada.label : ind.col;
  const linhas = [
    ['numerador', ind.num],
    ['denominador', ind.den],
  ].filter(([, v]) => v);

  const gloss = Object.entries(ind.glossario || {}).map(([v, g]) => {
    const cods = Object.entries(g.codigos || {});
    const lista = cods.length
      ? `<div class="met-cods">${cods.map(([k, r]) =>
          `<span><code>${esc(k)}</code> ${esc(r)}</span>`).join('')}</div>`
      : '<div class="met-cods met-numerica">variável numérica, sem códigos</div>';
    return `<div class="met-gloss">
        <div class="met-gloss-cab"><code>${esc(v)}</code> ${esc(g.desc)}</div>
        ${lista}</div>`;
  }).join('');

  // Indicador que está no catálogo mas não foi extraído naquele censo (ou o
  // contrário) é exatamente o tipo de coisa que esta página existe para expor.
  const orfao = !entrada
    ? '<span class="met-flag">fora do catálogo do site</span>' : '';

  return `<article class="met-card" data-busca="${esc(
      (ind.col + ' ' + rot + ' ' + ind.num + ' ' + ind.den + ' ' +
       ind.vars.join(' ')).toLowerCase())}">
    <div class="met-cab">
      <code class="met-col">${esc(ind.col)}</code>
      <span class="met-rot">${esc(rot)}</span>
      ${orfao}
      <span class="met-tags">
        <span class="met-tag">${esc(TIPO[ind.tipo] || ind.tipo)}</span>
        ${ind.registro ? `<span class="met-tag">${esc(ind.registro)}</span>` : ''}
        ${ind.peso ? `<span class="met-tag">${
            /^[A-Z]\d{4}$/.test(ind.peso) ? 'peso ' + esc(ind.peso) : esc(ind.peso)
          }</span>` : ''}
      </span>
    </div>
    <dl class="met-formula">${linhas.map(([k, v]) =>
      `<dt>${k}</dt><dd>${realce(v)}</dd>`).join('')}</dl>
    ${ind.nota ? `<p class="met-nota">${esc(ind.nota)}</p>` : ''}
    ${gloss}
  </article>`;
}

function render() {
  const lista = dados.anos[String(anoAtivo)] || [];
  const doAno = indicadoresDoAno(anoAtivo);
  const porCol = new Map(INDICADORES.map((i) => [i.col, i]));

  document.getElementById('met-intro').innerHTML =
    `<strong>${lista.length}</strong> indicadores extraídos no Censo ` +
    `${anoAtivo}. Fonte: ${esc(dados.fonte[String(anoAtivo)] || '')}`;

  // O catálogo do site e a extração podem divergir: coluna extraída que ninguém
  // mapeou, ou indicador declarado no config sem fórmula por trás. Os dois
  // casos são defeito, e ficam ditos aqui em vez de sumirem.
  const extraidos = new Set(lista.map((i) => i.col));
  const semFormula = doAno.filter((i) => !extraidos.has(i.col)).map((i) => i.col);
  const aviso = document.getElementById('met-conflito');
  if (semFormula.length) {
    aviso.hidden = false;
    aviso.innerHTML = `<strong>Sem fórmula correspondente na extração de ` +
      `${anoAtivo}:</strong> <code>${semFormula.map(esc).join('</code>, <code>')}` +
      `</code>. Ou o indicador está declarado no catálogo sem ter sido extraído, ` +
      `ou o gerador não conseguiu ler a fórmula.`;
  } else {
    aviso.hidden = true;
  }

  // agrupa por tema, na ordem do site; o que não tem entrada no catálogo cai
  // num grupo próprio no fim
  const grupos = TEMAS.map((t) => ({
    label: t.label,
    itens: lista.filter((i) => porCol.get(i.col)?.tema === t.id),
  })).filter((g) => g.itens.length);
  const soltos = lista.filter((i) => !porCol.has(i.col));
  if (soltos.length) grupos.push({ label: 'Sem entrada no catálogo', itens: soltos });

  document.getElementById('met-lista').innerHTML = grupos.map((g) => `
    <section class="met-tema">
      <h2>${esc(g.label)} <span class="met-n">${g.itens.length}</span></h2>
      ${g.itens.map((i) => cartao(i, porCol.get(i.col))).join('')}
    </section>`).join('');

  filtrar();
}

function filtrar() {
  const q = document.getElementById('busca').value.trim().toLowerCase();
  for (const c of document.querySelectorAll('.met-card')) {
    c.hidden = q && !c.dataset.busca.includes(q);
  }
  for (const s of document.querySelectorAll('.met-tema')) {
    s.hidden = !s.querySelector('.met-card:not([hidden])');
  }
}

function montarAnos() {
  const box = document.getElementById('sel-ano');
  const disponiveis = ANOS.filter((a) => dados.anos[String(a.ano)]);
  box.innerHTML = disponiveis.map(({ ano }) => `
    <button type="button" data-ano="${ano}"
            class="btn-ano${ano === anoAtivo ? ' ativo' : ''}">${ano}</button>`).join('');
  box.onclick = (ev) => {
    const b = ev.target.closest('.btn-ano');
    if (!b) return;
    anoAtivo = Number(b.dataset.ano);
    montarAnos();
    render();
  };
}

async function init() {
  initTema();
  dados = await (await fetch('./data/metodologia.json')).json();
  if (!dados.anos[String(anoAtivo)]) {
    anoAtivo = Number(Object.keys(dados.anos).sort().at(-1));
  }
  montarAnos();
  render();
  document.getElementById('busca').addEventListener('input', filtrar);
}

init();
