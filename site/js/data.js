// Carrega os CSVs de indicadores (um por nível geográfico) e serve as fontes do
// choropleth.
//
// Cada nível é carregado sob demanda, na primeira vez que o usuário o escolhe:
// o de área de ponderação tem 14.270 linhas e ~5 MB, e não faz sentido baixá-lo
// para quem só quer olhar o mapa por estado.

import { lerCsv } from './escala.js';
import { PISO_AMOSTRA, CAMADAS, indicadoresDoAno } from './config.js';

// colunas que ficam como texto; todo o resto vira número
const TEXTO = new Set(['cod_ap', 'cod_mun', 'cod_uf', 'nome_ap', 'nome_mun',
                       'nome_uf', 'sigla_uf', 'tipo_ap']);

const cache = new Map();   // id do nivel -> { linhas, porCodigo }

export async function carregarNivel(nivel) {
  if (cache.has(nivel.id)) return cache.get(nivel.id);

  let linhas;
  try {
    linhas = await ler(nivel);
  } catch (e) {
    // Nivel declarado no catalogo cujo CSV ainda nao foi gerado. Acontece entre
    // acrescentar a camada e rodar a extracao: melhor um painel que diz isso do
    // que uma pagina quebrada. 'ausente' liga o aviso em main.js.
    console.warn(`sem dado para ${nivel.id}:`, e.message);
    const vazio = { linhas: [], porCodigo: new Map(), ausente: true };
    cache.set(nivel.id, vazio);
    return vazio;
  }
  const porCodigo = new Map(linhas.map((d) => [String(d[nivel.chaveCsv]), d]));
  const dados = { linhas, porCodigo };
  cache.set(nivel.id, dados);
  return dados;
}

function ler(nivel) {
  return lerCsv(nivel.arquivo, (d) => {
    const o = {};
    for (const k in d) {
      if (TEXTO.has(k)) o[k] = d[k];
      else o[k] = d[k] === '' || d[k] === 'NA' ? null : +d[k];
    }
    return o;
  });
}

export function nivelAusente(nivel) {
  return cache.get(nivel.id)?.ausente === true;
}

export function registro(nivel, codigo) {
  return cache.get(nivel.id)?.porCodigo.get(String(codigo)) ?? null;
}

// Se a COLUNA existe no CSV deste nivel. Nao e a mesma pergunta que 'o
// indicador existe neste censo': a mediana de renda existe em 2000 no
// municipio e nao existe no estado, porque a mediana de um estado nao sai das
// medianas dos seus municipios e a extracao so agregou por municipio. Sem esta
// checagem o mapa fica cinza inteiro, sem dizer por que.
export function temColuna(nivel, col) {
  const l = cache.get(nivel.id)?.linhas;
  return !l?.length ? true : col in l[0];
}

// Fonte do choropleth para um indicador, no nível ativo.
//
// O piso de amostra é aplicado aqui, não na pintura: unidade com denominador
// pequeno demais fica FORA do conjunto de valores, então não recebe cor e,
// principalmente, não entra no cálculo dos quantis que definem a escala. Deixar
// entrar faria um punhado de unidades ruidosas dominarem a rampa.
// 'pop' vai junto com 'values' porque a legenda mostra quanta GENTE cai em cada
// classe, não quantas unidades. São coisas muito diferentes: metade dos
// municípios do Brasil somam menos de 10% da população.
export function fonteDoIndicador(nivel, ind) {
  const dados = cache.get(nivel.id);
  if (!dados) {
    return { values: new Map(), pop: new Map(), label: ind.label, ind, descartadas: 0 };
  }

  const values = new Map();
  const pop = new Map();
  let descartadas = 0;
  for (const d of dados.linhas) {
    const v = d[ind.col];
    if (v == null || Number.isNaN(v)) continue;
    const n = d[ind.den];
    if (n != null && n < PISO_AMOSTRA) { descartadas++; continue; }
    const cod = String(d[nivel.chaveCsv]);
    values.set(cod, v);
    pop.set(cod, d.pop_pond ?? 0);
  }
  return { values, pop, label: ind.label, unidade: ind.unidade, ind, descartadas };
}


// Valores de um indicador em TODOS os censos que o tem, no mesmo nivel
// geografico. Serve para a escala comparavel entre censos: sem isso cada ano
// classifica sobre a propria distribuicao e a mesma cor quer dizer coisas
// diferentes em 1991 e em 2022.
//
// Carrega os CSVs que ainda nao estao em memoria. Sao poucos e pequenos (o
// maior fora de 2022 tem 2,4 MB), e ficam no cache depois da primeira vez.
// 'prefixo' restringe a serie a um recorte: com uma unidade recortada, a
// escala comparavel entre censos deve ser a serie DAQUELA unidade ao longo dos
// censos, nao a do pais. O codigo carrega a hierarquia (cod_ap comeca pelos
// digitos do municipio, que comecam pelos da UF), entao o mesmo prefixo
// seleciona as unidades correspondentes em cada censo, sem coluna extra.
// 'anos' restringe a serie a um conjunto de censos. Num facet, os cortes tem
// de cobrir exatamente os censos que aparecem na figura: usar todos daria
// classes que nenhum painel alcanca, e usar so o da tela quebraria a
// comparacao, que e a razao de existir do facet.
export async function valoresDaSerie(nivel, ind, prefixo = null, soAnos = null) {
  const camadas = CAMADAS.filter(
    (c) => c.nivel === nivel && indicadoresDoAno(c.ano).includes(ind)
           && (!soAnos || soAnos.includes(c.ano)));
  await Promise.all(camadas.map(carregarNivel));

  const vals = [];
  const anos = [];
  for (const c of camadas) {
    let entrou = 0;
    for (const d of cache.get(c.id)?.linhas ?? []) {
      if (prefixo && !String(d[c.chaveCsv]).startsWith(prefixo)) continue;
      const v = d[ind.col];
      if (v == null || Number.isNaN(v)) continue;
      const n = d[ind.den];
      if (n != null && n < PISO_AMOSTRA) continue;
      vals.push(v);
      entrou++;
    }
    // um censo que nao contribuiu valor nenhum neste nivel nao entra na lista
    // que a nota mostra: dizer "cortes sobre 1991, 2000 e 2010" quando 1991 nao
    // tem a coluna e mentir sobre a base da escala
    if (entrou) anos.push(c.ano);
  }
  return { valores: vals, anos: anos.sort() };
}
