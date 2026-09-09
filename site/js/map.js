// Mapa MapLibre + PMTiles: choropleth por area de ponderacao, hover e clique.
// Basemap vetorial do OpenFreeMap (sem chave de API), camadas escritas a mao
// para as cores seguirem o tema do site.

import { fmtValor, CAMADAS, ANOS, focosDoAno, themeVar } from './config.js';
import { classesRedondas, escalaClasses, coresDasClasses, indiceClasse,
         ascendente } from './escala.js';

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

// Zoom maximo dos tiles: z9. Escolhido comparando os tres no olho, mesma malha
// original, mesmos atributos:
//   z11  101,4 MB  (~4,8 m por unidade de tile) -- indistinguivel do z10, e
//                                                  estoura o limite de 100 MB
//                                                  por arquivo do GitHub
//   z10   68,3 MB  (~9,5 m)
//   z9    44,5 MB  (~19 m)  <- em uso
// Acima do z9 o MapLibre faz overzoom (reaproveita o tile do z9 esticado): o
// mapa continua navegavel no z13+, so nao ganha detalhe novo.

// Camada ativa = par (censo, nivel geografico). Toda operacao daqui para baixo
// trabalha sobre ela: o ano nao e um filtro sobre um mapa unico, e outra malha,
// outro CSV e outra chave de juncao.
let camadaAtiva = CAMADAS.find((c) => c.default) ?? CAMADAS[0];
export function camada() { return camadaAtiva; }

const idFill = (c) => `${c.id}-fill`;

// as quatro camadas que toda fonte declara
const PARTES = ['fill', 'outline', 'selected-fill', 'selected-stroke'];

// as quatro camadas de uma fonte: preenchimento, borda e o par de selecao
function camadasDe(c) {
  const s = `src-${c.id}`;
  const vis = { visibility: c === camadaAtiva ? 'visible' : 'none' };
  return [
    { id: `${c.id}-fill`, type: 'fill', source: s, 'source-layer': c.camada, layout: vis,
      paint: { 'fill-color': '#cccccc', 'fill-opacity': 0.85 } },
    // borda some no zoom Brasil-inteiro para nao engolir a cor
    { id: `${c.id}-outline`, type: 'line', source: s, 'source-layer': c.camada, layout: vis,
      paint: { 'line-color': 'rgba(0,0,0,0.5)',
               'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0, 5, 0.15, 7, 0.4, 10, 0.9] } },
    { id: `${c.id}-selected-fill`, type: 'fill', source: s, 'source-layer': c.camada, layout: vis,
      paint: { 'fill-color': '#ffe600',
               'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.5, 0] } },
    { id: `${c.id}-selected-stroke`, type: 'line', source: s, 'source-layer': c.camada, layout: vis,
      paint: { 'line-color': '#8a7a00',
               'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0] } },
  ];
}

// Contorno de UF desenhado por cima em qualquer nivel, um por censo. Nao e
// enfeite: Mato Grosso do Sul e de 1977 e Tocantins de 1988, entao usar o
// contorno de 2022 sobre o dado de 1970 desenharia divisa que nao existia.
// Reaproveita a fonte da propria camada de UF daquele ano, sem baixar de novo.
const idContorno = (ano) => `contorno-${ano}`;

function camadasContorno() {
  return ANOS.map(({ ano }) => ({
    id: idContorno(ano), type: 'line', source: `src-uf_${ano}`, 'source-layer': 'ufs',
    layout: { visibility: ano === camadaAtiva.ano ? 'visible' : 'none' },
    paint: {
      'line-color': '#8b98a8',
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 8, 1.5],
    },
  }));
}

// Brasil CONTINENTAL, para enquadrar.
//
// O bbox real das UFs vai a leste ate -28,85: Trindade e Martim Vaz pertencem
// ao Espirito Santo e Fernando de Noronha a Pernambuco, entao a extensao
// "correta" do pais carrega mil quilometros de oceano. Enquadrado assim, o
// continente fica encostado a esquerda e sobra uma faixa vazia da largura da
// regiao Sul -- e a figura exportada nasce com ela dentro.
//
// Os quatro extremos continentais, que sao de onde vem estes numeros:
//   oeste  -73,99  nascente do rio Moa, Acre
//   leste  -34,79  Ponta do Seixas, Paraiba
//   norte    5,27  nascente do rio Ailha, Roraima
//   sul    -33,75  Arroio Chui, Rio Grande do Sul
//
// E decisao de MOLDURA, e nao filtro de dado: Fernando de Noronha continua no
// CSV, com cor e valor, e quem navegar ate la ve a ilha normalmente. O que
// muda e so quem manda no enquadramento.
export const BBOX_CONTINENTAL = [[-73.99, -33.75], [-34.79, 5.27]];

export const map = new maplibregl.Map({
  container: 'map-panel',
  style: {
    version: 8,
    // obrigatorio por causa das camadas type:'symbol' — sem isso nao aparece
    // rotulo nenhum e nao ha erro visivel. Nenhuma camada usa icone: sem sprite.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      // url e o TileJSON, nao o padrao de tile: o caminho real e versionado e
      // eles rotacionam a versao. Deixar o MapLibre resolver evita o mapa
      // quebrar sozinho meses depois.
      basemap: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
          '<a href="https://openfreemap.org/">OpenFreeMap</a> · ' +
          '<a href="https://openmaptiles.org/">OpenMapTiles</a>',
      },
      // Uma fonte por par (censo, nivel); a chave de juncao vira feature id.
      // Sao 14 fontes declaradas, mas o PMTiles so busca tile de camada
      // visivel: as outras custam um cabecalho de alguns KB cada.
      ...Object.fromEntries(CAMADAS.map((c) => [
        `src-${c.id}`, { type: 'vector', url: c.tiles, promoteId: c.chave },
      ])),
    },
    layers: [
      // background = terra; a agua e camada por cima. As cores aqui sao so o
      // estado inicial (tema escuro): quem manda e applyMapTheme.
      { id: 'background', type: 'background', paint: { 'background-color': '#0d1117' } },
      // Todas as camadas 'base-' comecam em minzoom 6 (ver ZOOM_BASEMAP). Os
      // tiles z3 do OpenFreeMap trazem o esquema OpenMapTiles inteiro
      // (edificacao, via, uso do solo, POI) e nos desenhamos seis camadas:
      // eram 2,8 MB, quase metade da carga inicial, para um zoom onde 1 px
      // vale ~1,5 km. Na visao Brasil o contexto vem do nosso proprio
      // ufs.pmtiles (0,8 MB), e o basemap entra quando passa a ter uso.
      {
        id: 'base-water', type: 'fill', source: 'basemap', 'source-layer': 'water',
        minzoom: 6,
        // a mesma source-layer traz poligono e linha: sem a guarda de geometria
        // aparecem artefatos
        filter: ['all',
          ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
          ['!=', ['get', 'brunnel'], 'tunnel'],
        ],
        paint: { 'fill-color': '#101c2b' },
      },
      {
        id: 'base-waterway', type: 'line', source: 'basemap', 'source-layer': 'waterway',
        minzoom: 6,
        filter: ['all',
          ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
          ['match', ['get', 'class'], ['river', 'canal'], true, false],
        ],
        paint: {
          'line-color': '#17293c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 12, 1.6],
        },
      },
      // so fronteira de pais: as divisas estaduais vem de ufs.pmtiles.
      // Igualdade, nao '<=': muita feicao de boundary vem sem admin_level e a
      // comparacao com null descarta a feicao silenciosamente.
      {
        id: 'base-boundary', type: 'line', source: 'basemap', 'source-layer': 'boundary',
        minzoom: 6,
        filter: ['all',
          ['==', ['get', 'admin_level'], 2],
          ['!=', ['get', 'maritime'], 1],
          ['!=', ['get', 'disputed'], 1],
          ['!', ['has', 'claimed_by']],
        ],
        paint: {
          'line-color': '#4a5765',
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.2],
        },
      },
      {
        id: 'base-place-pais', type: 'symbol', source: 'basemap', 'source-layer': 'place',
        minzoom: 6, maxzoom: 7,
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 14],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-max-width': 7,
        },
        paint: { 'text-color': '#93a1b0', 'text-halo-color': 'rgba(13,17,23,0.9)', 'text-halo-width': 1.2 },
      },
      // cidade e vila em camadas separadas porque o escalonamento e por zoom e
      // filter nao aceita ['zoom']
      {
        id: 'base-place-cidade', type: 'symbol', source: 'basemap', 'source-layer': 'place',
        minzoom: 6,
        filter: ['==', ['get', 'class'], 'city'],
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 13],
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 20],
        },
        paint: { 'text-color': '#93a1b0', 'text-halo-color': 'rgba(13,17,23,0.9)', 'text-halo-width': 1.2 },
      },
      {
        id: 'base-place-vila', type: 'symbol', source: 'basemap', 'source-layer': 'place',
        minzoom: 7,
        filter: ['==', ['get', 'class'], 'town'],
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 9, 11, 12],
          'text-max-width': 8,
          'symbol-sort-key': ['coalesce', ['get', 'rank'], 20],
        },
        paint: { 'text-color': '#93a1b0', 'text-halo-color': 'rgba(13,17,23,0.9)', 'text-halo-width': 1.2 },
      },

      // Quatro camadas por par (censo, nivel). Todas ficam declaradas; trocar
      // de ano ou de nivel so alterna 'visibility', entao a troca e imediata e
      // nao exige reconstruir fontes nem perder o feature-state.
      ...CAMADAS.flatMap((c) => camadasDe(c)),
      ...camadasContorno(),
    ],
  },
  bounds: BBOX_CONTINENTAL,
  fitBoundsOptions: { padding: 15 },
  attributionControl: false,
  // Sem isto o navegador descarta o conteudo do canvas WebGL depois de pintar,
  // e o PNG exportado sai em branco. Custa um pouco de memoria de video.
  preserveDrawingBuffer: true,
  // areas_ponderacao.pmtiles so tem tiles a partir do z3: sem esse piso, o
  // fitBounds do Brasil inteiro em tela pequena calcula um zoom abaixo disso e
  // o mapa fica vazio ate o usuario dar zoom na mao.
  minZoom: 3,
  cooperativeGestures: window.innerWidth <= 800,
});

// handle de depuracao: permite inspecionar o mapa pelo console do navegador
window.__map = map;

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }));

// Shift+arrastar e o box-zoom nativo do MapLibre, e ele come o shift+CLIQUE
// junto: o mousedown com shift entra no handler de caixa e o evento nunca chega
// a camada. Como shift+clique passou a ser o gesto de recortar, o box-zoom sai.
// Nao se perde caminho: a roda, o duplo clique e os botoes de zoom continuam.
map.boxZoom.disable();

map.on('load', () => {
  const attrib = document.querySelector('.maplibregl-ctrl-attrib');
  if (attrib) {
    attrib.classList.remove('maplibregl-compact-show');
    attrib.removeAttribute('open');
  }
});

const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

let hoveredId = null;
let selectedId = null;
let fonteAtiva = null;   // { values: Map<cod_ap, number>, label, unidade }

export function valorFonteAtiva(codAp) {
  if (!fonteAtiva) return null;
  const v = fonteAtiva.values.get(String(codAp));
  return { label: fonteAtiva.label, valorFmt: fmtValor(v, fonteAtiva.ind) };
}

// ---------------------------------------------------------------- choropleth
// fonte = { values, label, unidade, ind } — ind e a entrada de config.js, que
// carrega direcao da escala, casas decimais e prefixo.
// ultimo estado desenhado, guardado para o PNG poder redesenhar a legenda
let ultimo = null;
export function estadoDaLegenda() { return ultimo; }

// opcoes:
//   paleta   nome da paleta escolhida ('auto' respeita a direcao do indicador)
//   dominio  valores sobre os quais CLASSIFICAR, quando diferente dos que estao
//            no mapa. E o que permite a escala comparavel entre censos: as
//            classes saem da serie inteira e so a pintura usa o ano corrente.
const SEM_DADO = '#5b5b5b';

export function updateChoropleth(fonte,
    { paleta = 'auto', dominio = null, borda = 'contraste' } = {}) {
  fonteAtiva = fonte;
  bordaAtiva = borda;
  const vals = [...fonte.values.values()].filter((v) => v != null && !Number.isNaN(v));

  // Sem nenhum valor (a coluna nao existe neste nivel, ou o piso de amostra
  // descartou tudo) o mapa TEM de ficar cinza e a legenda TEM de sumir. Sair
  // cedo deixava a pintura e a legenda do indicador anterior no lugar, o que e
  // pior que nao mostrar nada: o leitor le o mapa velho com o titulo novo.
  if (!vals.length) {
    map.setPaintProperty(idFill(camadaAtiva), 'fill-color', SEM_DADO);
    aplicarBorda(null);
    document.getElementById('choro-legend').innerHTML = '';
    ultimo = null;
    return;
  }

  // Classes de cortes redondos escolhidos a partir da distribuicao: ver
  // classesRedondas. Substituiu a escala por quantil, que dava rampa continua
  // sem corte legivel — a legenda mostrava minimo, mediana e maximo, e com
  // distribuicao assimetrica isso parecia escala logaritmica.
  const sorted = vals.slice().sort(ascendente);
  const dir = fonte.ind?.dir ?? +1;
  const base = dominio && dominio.length
    ? dominio.slice().sort(ascendente) : sorted;
  const classes = classesRedondas(base);
  const escala = escalaClasses(classes, dir, paleta);

  // 'match' e lookup interno do MapLibre; 'in' seria busca linear a cada feicao
  // A chave de junção é a da CAMADA ATIVA, não uma fixa: 'code_weighting' na
  // área de ponderação, 'code_muni' no município, 'code_state' na UF. Fixar
  // uma delas faz os outros níveis caírem no valor padrão e pintarem tudo de
  // cinza, com a legenda correta (ela vem do CSV) escondendo o problema.
  //
  // 'to-number' porque nem toda malha grava o código como número: as do geobr
  // gravam, e a de área de ponderação de 2000, construída neste projeto, já
  // gravou como texto. O 'match' compara por tipo, então texto contra número
  // não casa em nenhuma feição e o mapa inteiro cai no cinza de "sem dado" —
  // com a legenda certa por cima, porque ela vem do CSV. Converter aqui torna
  // a junção independente disso.
  const matchExpr = ['match', ['to-number', ['get', camadaAtiva.chave]]];
  // a mesma expressao, um tom abaixo, para o modo de borda 'tom'
  const matchBorda = ['match', ['to-number', ['get', camadaAtiva.chave]]];
  for (const [cod, v] of fonte.values) {
    if (v == null || Number.isNaN(v)) continue;
    const cor = escala(v);
    matchExpr.push(Number(cod), cor);
    matchBorda.push(Number(cod), escurecer(cor, 0.62));
  }
  matchExpr.push(SEM_DADO);
  matchBorda.push(escurecer(SEM_DADO, 0.62));
  map.setPaintProperty(idFill(camadaAtiva), 'fill-color', matchExpr);
  aplicarBorda(matchBorda);
  renderLegenda(classes, dir, fonte, paleta);
  avisarJuncaoVazia(camadaAtiva, fonte);
}

// Cor da borda dos poligonos.
//
// Com 5.570 municipios no Brasil inteiro a linha de divisa ocupa mais pixel que
// o poligono: o mapa vira uma grade cinza e as manchas somem. E o mesmo
// problema que no ggplot se resolve dando a borda a cor do proprio
// preenchimento — a divisa continua la, separando fisicamente as feicoes, mas
// deixa de desenhar uma grade por cima do dado.
//
//   contraste  a linha escura de sempre, boa no zoom de municipio
//   tom        cada unidade contornada por um tom mais escuro DELA MESMA
//   nenhuma    largura zero; as feicoes encostam sem costura
//
// A versao anterior de 'tom' usava a cor EXATA do preenchimento, e era
// indistinguivel de 'nenhuma': uma borda da cor do proprio poligono e invisivel
// contra ele, e so os pixels de fronteira mudavam (12 a 15% da imagem, todos
// por diferenca pequena). Escurecer devolve a divisa sem devolver a grade.
//
// O custo de 'tom' e real e vale dizer: a divisa fica mais fraca que a de
// contraste, entao no zoom de municipio ela some antes. Por isso o padrao
// continua sendo o contraste.
let bordaAtiva = 'contraste';
let corBordaTema = 'rgba(0,0,0,0.5)';

// 'rgb(r, g, b)' vezes um fator. A escala devolve sempre nesse formato
// (ver coresDasClasses), entao nao ha caso de hex ou nome a tratar.
function escurecer(cor, f) {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(cor);
  if (!m) return cor;
  return `rgb(${Math.round(m[1] * f)}, ${Math.round(m[2] * f)}, ${Math.round(m[3] * f)})`;
}

function aplicarBorda(matchExpr) {
  const id = `${camadaAtiva.id}-outline`;
  if (!map.getLayer(id)) return;
  if (bordaAtiva === 'nenhuma') {
    map.setPaintProperty(id, 'line-opacity', 0);
    return;
  }
  map.setPaintProperty(id, 'line-opacity', 1);
  map.setPaintProperty(id, 'line-color',
    bordaAtiva === 'tom' && matchExpr ? matchExpr : corBordaTema);
}

// Chave do tile que não casa com nenhuma chave do CSV.
//
// Este defeito NÃO se parece com um defeito: o mapa fica cinza uniforme, com a
// legenda correta por cima — ela vem do CSV, que está inteiro. É indistinguível
// de "este censo não tem dado aqui", e foi assim que a área de ponderação de
// 2000 passou despercebida: a malha gravava o código como texto e o 'match'
// compara por tipo.
//
// Roda no 'idle', quando já há tile desenhado; antes disso não há o que
// comparar. Só avisa quando há feição na tela E nenhuma delas casa — nem uma.
function avisarJuncaoVazia(n, fonte) {
  if (!fonte.values.size) return;      // sem dado mesmo: não é este caso
  map.once('idle', () => {
    if (camadaAtiva !== n) return;     // o usuário já trocou de camada
    const fs = map.queryRenderedFeatures({ layers: [idFill(n)] });
    if (!fs.length) return;            // nada carregado ainda
    const casa = fs.some((f) => fonte.values.has(String(Number(f.properties[n.chave]))));
    if (casa) return;
    console.warn(
      `[${n.id}] nenhuma das ${fs.length} feições na tela casa com as ` +
      `${fonte.values.size} chaves do CSV. O mapa vai ficar todo cinza com a ` +
      `legenda certa por cima. Confira o tipo e o formato de '${n.chave}' no ` +
      `tile contra '${n.chaveCsv}' no CSV — exemplo do tile: ` +
      `${JSON.stringify(fs[0].properties[n.chave])}, do CSV: ` +
      `${JSON.stringify(fonte.values.keys().next().value)}`);
  });
}

// Rotulo de uma classe. Faixa fechada mostra os dois extremos; ponta rala vira
// "menos de X" / "X ou mais", porque foi por ser rala que ela virou classe
// aberta em vez de ganhar cortes redondos proprios.
function rotuloClasse(c, ind) {
  const f = (v) => fmtValor(v, ind);
  // "exatamente" so na massa pontual: e o que separa a linha do zero da linha
  // "menos de 2,5%" logo abaixo dela, que sem isso pareceriam se sobrepor
  if (c.massa) return `exatamente ${f(c.lo)}`;
  if (c.exato) return f(c.lo);
  if (c.aberta === 'ambas') return `${f(c.lo)} a ${f(c.hi)}`;
  if (c.aberta === 'baixo') return `menos de ${f(c.hi)}`;
  if (c.aberta === 'alto') return `${f(c.lo)} ou mais`;
  return `${f(c.lo)} a ${f(c.hi)}`;
}

// Legenda por classes, com a distribuicao da POPULACAO ao lado de cada uma.
//
// Duas leituras que a rampa continua nao dava: onde estao os cortes em valor, e
// quanta gente cai em cada faixa. A segunda importa porque unidade e populacao
// divergem muito — metade dos municipios do Brasil soma menos de 10% da gente,
// entao "quantas areas" nao responde "quantas pessoas".
// Casas decimais suficientes para os limites nao colidirem. O indicador declara
// quantas quer (a2_agua_rede pede 1), mas o classificador pode devolver cortes
// mais finos: com 99,25 e 99,3 arredondados para uma casa, duas classes vizinhas
// exibiriam "99,3%" e o leitor nao saberia qual e qual.
function casasNecessarias(classes, ind) {
  let dec = ind?.dec ?? 1;
  for (const c of classes) {
    for (const v of [c.lo, c.hi]) {
      if (v == null) continue;
      const s = String(v);
      const p = s.indexOf('.');
      if (p >= 0) dec = Math.max(dec, s.length - p - 1);
    }
  }
  return Math.min(dec, 4);
}

function renderLegenda(classes, dir, fonte, paletaNome = 'auto') {
  const cores = coresDasClasses(classes, dir, paletaNome);
  const ind = { ...fonte.ind, dec: casasNecessarias(classes, fonte.ind) };
  const total = [...fonte.pop.values()].reduce((a, b) => a + (b || 0), 0);

  const popClasse = new Array(classes.length).fill(0);
  for (const [cod, v] of fonte.values) {
    popClasse[indiceClasse(classes, v)] += fonte.pop.get(cod) || 0;
  }
  const maior = Math.max(...popClasse, 1);

  // maior classe no topo, como se le um ranking
  const linhas = classes.map((c, i) => {
    const pct = total > 0 ? (100 * popClasse[i]) / total : 0;
    return `
      <div class="legend-linha">
        <i class="legend-cor" style="background:${cores[i]}"></i>
        <span class="legend-faixa">${rotuloClasse(c, ind)}</span>
        <span class="legend-barra"><i style="width:${(100 * popClasse[i]) / maior}%"></i></span>
        <span class="legend-pct">${pct > 0 && pct < 0.1 ? '&lt;0,1' : pct.toFixed(1)}%</span>
      </div>`;
  }).reverse().join('');

  ultimo = { classes, cores, popClasse, total, label: fonte.label, ind };

  document.getElementById('choro-legend').innerHTML =
    `<div class="legend-title">${fonte.label}</div>` +
    `<div class="legend-classes">${linhas}</div>` +
    '<div class="legend-nota">barra: % da população</div>';
}

// ------------------------------------------------------------ hover / clique
// Cada nivel tem propriedades diferentes no tile: a area de ponderacao traz o
// municipio junto, o municipio traz a UF, e a UF traz so o proprio nome.
function rotulos(n, props) {
  if (n.nivel === 'ap')  return { titulo: `${props.name_muni} · ${props.abbrev_state}`,
                                  sub: `Área de ponderação ${props.code_weighting}`,
                                  cod: props.code_weighting };
  if (n.nivel === 'mun') return { titulo: `${props.name_muni} · ${props.abbrev_state}`,
                                  sub: `Município ${props.code_muni}`,
                                  cod: props.code_muni };
  return { titulo: props.name_state, sub: `UF ${props.abbrev_state}`,
           cod: props.code_state };
}

export function initInteracao(onSelect, onDeselect) {
  const alvo = () => ({ source: `src-${camadaAtiva.id}`, sourceLayer: camadaAtiva.camada });

  // Registra para TODAS as camadas de todos os censos. Camada invisivel nao
  // dispara evento nem entra em queryRenderedFeatures, entao so a ativa
  // responde, sem precisar religar nada ao trocar de ano ou de nivel.
  for (const n of CAMADAS) {
    const id = n.id;
    map.on('mousemove', `${id}-fill`, (e) => {
      if (!e.features.length) return;
      if (hoveredId !== null) map.setFeatureState({ ...alvo(), id: hoveredId }, { hover: false });
      hoveredId = e.features[0].id;
      map.setFeatureState({ ...alvo(), id: hoveredId }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';

      const r = rotulos(n, e.features[0].properties);
      const val = fonteAtiva ? fonteAtiva.values.get(String(r.cod)) : null;
      const linha = fonteAtiva
        ? `<span>${fonteAtiva.label}:</span> <b>${fmtValor(val, fonteAtiva.ind)}</b>`
        : '';
      popup.setLngLat(e.lngLat)
        .setHTML(`<strong>${r.titulo}</strong>` +
                 `<br><span class="popup-ap">${r.sub}</span><br>${linha}`)
        .addTo(map);
    });

    map.on('mouseleave', `${id}-fill`, () => {
      if (hoveredId !== null) map.setFeatureState({ ...alvo(), id: hoveredId }, { hover: false });
      hoveredId = null;
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    map.on('click', `${id}-fill`, (e) => {
      if (!e.features.length) return;
      const feat = e.features[0];
      const r = rotulos(n, feat.properties);

      // Shift+clique recorta em vez de selecionar. Nao mexe na selecao nem no
      // feature-state: recortar e mudar o que o mapa desenha, selecionar e
      // mudar o que o painel le, e uma coisa nao implica a outra.
      // props vai junto: o recorte por UF filtra os filhos por abbrev_state.
      if (e.originalEvent?.shiftKey) {
        onSelect(String(r.cod), r.titulo, r.sub, feat.properties, n, true);
        return;
      }

      if (selectedId === feat.id) { clearSelection(); onDeselect(); return; }
      clearSelection();
      selectedId = feat.id;
      map.setFeatureState({ ...alvo(), id: selectedId }, { selected: true });
      onSelect(String(r.cod), r.titulo, r.sub, feat.properties, n, false);
    });
  }

  map.on('click', (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: [idFill(camadaAtiva)] });
    if (!feats.length) { clearSelection(); onDeselect(); }
  });
}

export function clearSelection() {
  if (selectedId !== null) {
    map.setFeatureState(
      { source: `src-${camadaAtiva.id}`, sourceLayer: camadaAtiva.camada, id: selectedId },
      { selected: false });
    selectedId = null;
  }
}

// ------------------------------------------- troca de censo e de nivel
// So alterna visibilidade: todas as fontes ja estao declaradas no estilo.
// O contorno de UF acompanha o ANO, nao o nivel, porque ele e desenhado por
// cima dos tres niveis.

function aplicarVisibilidade() {
  for (const c of CAMADAS) {
    const vis = c === camadaAtiva ? 'visible' : 'none';
    for (const p of PARTES) map.setLayoutProperty(`${c.id}-${p}`, 'visibility', vis);
  }
  for (const { ano } of ANOS) {
    map.setLayoutProperty(idContorno(ano), 'visibility',
                          ano === camadaAtiva.ano && !foco ? 'visible' : 'none');
  }
}

export function setCamada(c, aoTrocar) {
  if (!c || c === camadaAtiva) return;
  clearSelection();
  camadaAtiva = c;
  aplicarVisibilidade();
  aoTrocar?.(c);
}


// ---------------------------------------------------------------- recorte
// Recorta uma unidade (municipio ou UF) e desenha so as subdivisoes dela. O
// entorno some: basta filtrar as camadas dos filhos, sem camada de contexto.
// Entra por shift+clique, e nao por um modo: ver os municipios de um estado e
// navegacao, nao uma tela a parte.
//
// foco = null                            sem recorte
// foco = { cont, cod, sigla, filhos }    unidade escolhida
let foco = null;
export function focoAtual() { return foco; }

// bbox por unidade, carregado sob demanda (o tile nao carrega extensao).
// A extensao e a da malha DAQUELE censo: um municipio de 1970 pode ter sido
// desmembrado depois, e enquadrar pelo contorno de hoje cortaria o dado.
const bboxCache = new Map();

async function carregarBbox(cont) {
  if (bboxCache.has(cont.id)) return bboxCache.get(cont.id);
  const txt = await (await fetch(focosDoAno(cont.ano)[cont.nivel].bbox)).text();
  const m = new Map();
  for (const linha of txt.trim().split(/\r?\n/).slice(1)) {
    const [cod, x1, y1, x2, y2] = linha.split(',');
    m.set(cod, [[+x1, +y1], [+x2, +y2]]);
  }
  bboxCache.set(cont.id, m);
  return m;
}

// Filtro que restringe os filhos ao container. Aplicado nas quatro camadas da
// camada dos filhos; null limpa.
function filtrarFilhos(cf, expr) {
  if (!cf) return;
  for (const p of PARTES) map.setFilter(`${cf.id}-${p}`, expr);
}

// A camada dos filhos e sempre do MESMO censo do container: recortar municipio
// de 1980 e acender area de ponderacao de 2010 seria mapa de duas datas.
const camadaFilhos = (cont, filhos) =>
  CAMADAS.find((c) => c.ano === cont.ano && c.nivel === filhos.nivel) ?? null;

// Entra no modo com a unidade escolhida. 'filhos' vem de focosDoAno()[].filhos.
export async function focar(cont, cod, sigla, filhos) {
  const cf = camadaFilhos(cont, filhos);
  if (!cf) return camadaAtiva;
  const valor = filhos.tipo === 'num' ? Number(cod) : sigla;

  // limpa filtro de um foco anterior que usasse outro nivel de filhos
  if (foco) filtrarFilhos(camadaFilhos(foco.cont, foco.filhos), null);

  foco = { cont, cod: String(cod), sigla, filhos };
  camadaAtiva = cf;
  aplicarVisibilidade();       // ja esconde o contorno de UF: foco esta setado
  // mesma razão do 'to-number' do paint: o campo do container pode vir como
  // texto na malha, e a comparação falharia calada, desenhando zero filhos
  filtrarFilhos(cf, filhos.tipo === 'num'
    ? ['==', ['to-number', ['get', filhos.campo]], valor]
    : ['==', ['get', filhos.campo], valor]);

  const bb = (await carregarBbox(cont)).get(String(cod));
  if (bb) map.fitBounds(bb, { padding: 60, duration: 600 });
  return cf;
}

// Sair do modo NAO volta para o Brasil inteiro: afasta dois niveis de zoom em
// cima do que estava enquadrado. Quem recortou um municipio quase sempre quer
// continuar por ali — ver o entorno, escolher o vizinho — e o salto para a
// visao nacional obrigava a refazer a navegacao toda a cada figura.
const ZOOM_AO_SAIR = 2;

// zoom: false para quem vai reenquadrar em seguida — a troca de censo dentro do
// troca de censo limpa o foco e refoca a mesma unidade, e o afastamento no meio
// seria uma animacao para tras antes da animacao para frente.
export function limparFoco(voltarPara, { zoom = true } = {}) {
  if (!foco) return;
  filtrarFilhos(camadaFilhos(foco.cont, foco.filhos), null);
  foco = null;
  if (voltarPara) camadaAtiva = voltarPara;
  aplicarVisibilidade();       // devolve o contorno de UF do ano corrente
  if (zoom) {
    map.easeTo({ zoom: Math.max(map.getMinZoom(), map.getZoom() - ZOOM_AO_SAIR),
                 duration: 600 });
  }
}

// ------------------------------------------------------- legenda arrastavel
// A legenda faz parte da figura, entao precisa poder sair de cima do dado. Posicao em px dentro de #map-panel.
// Arrasta um elemento dentro do painel do mapa.
//
//   pega   seletor do que serve de alca; sem ele, o elemento inteiro arrasta
//   quando  funcao que diz se o arrasto vale agora (a legenda so no modo
//           grafico; a piramide sempre)
export function tornarArrastavel(el, { pega = null, quando = () => true } = {}) {
  const painel = document.getElementById('map-panel');
  const alca = pega ? el.querySelector(pega) : el;
  let arrastando = false, dx = 0, dy = 0;

  alca.addEventListener('pointerdown', (ev) => {
    // botao dentro da alca (o X de fechar) nao arrasta
    if (ev.target.closest('button') && ev.target.closest('button') !== alca) return;
    if (!quando()) return;
    arrastando = true;
    const r = el.getBoundingClientRect();
    dx = ev.clientX - r.left;
    dy = ev.clientY - r.top;
    alca.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  alca.addEventListener('pointermove', (ev) => {
    if (!arrastando) return;
    const p = painel.getBoundingClientRect();
    // mantem o quadro inteiro dentro do painel do mapa
    const x = Math.max(0, Math.min(ev.clientX - p.left - dx, p.width  - el.offsetWidth));
    const y = Math.max(0, Math.min(ev.clientY - p.top  - dy, p.height - el.offsetHeight));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  });

  const soltar = (ev) => {
    if (!arrastando) return;
    arrastando = false;
    alca.releasePointerCapture?.(ev.pointerId);
  };
  alca.addEventListener('pointerup', soltar);
  alca.addEventListener('pointercancel', soltar);
}

// A legenda arrasta SEMPRE, como a piramide. Ela tapa o canto inferior
// esquerdo, que e onde ficam o Acre, Rondonia e boa parte do Sul dependendo do
// enquadramento; restringir o arrasto a um modo obrigava a entrar nele so
// para tirar a legenda da frente.
export function initLegendaArrastavel() {
  tornarArrastavel(document.getElementById('choro-legend'));
}

// ------------------------------------------------------- modo limpo (print)
// Esconde o basemap e a interface: so os poligonos sobre fundo liso, para
// captura de tela em relatorio. Sem basemap nao ha dado do OSM na imagem,
// entao a atribuicao sai junto.
const CAMADAS_BASE = ['base-water', 'base-waterway', 'base-boundary',
                      'base-place-pais', 'base-place-cidade', 'base-place-vila'];
let modoLimpo = false;
export const modoLimpoLigado = () => modoLimpo;

export function setModoLimpo(ativo) {
  modoLimpo = ativo;
  document.getElementById('map-panel').classList.toggle('modo-limpo', ativo);
  // tambem no <body>: a coluna do indicador e a aba dela vivem FORA do
  // #map-panel desde que viraram coluna do layout, e a marca precisa alcancar
  // as duas
  document.body.classList.toggle('modo-limpo', ativo);

  // O botao do cabecalho nao e mais o unico caminho: o painel de figura tem a
  // mesma chave. Sincronizar aqui e o que impede os dois de discordarem.
  const btn = document.getElementById('btn-limpo');
  if (btn) {
    btn.classList.toggle('ativo', ativo);
    btn.title = ativo ? 'Mostrar mapa de fundo'
                      : 'Modo limpo (só o Brasil, para print)';
  }
  applyMapTheme(document.documentElement.dataset.theme || 'escuro');
}

export function initModoLimpo() {
  const btn = document.getElementById('btn-limpo');
  if (!btn) return;
  btn.addEventListener('click', () => setModoLimpo(!modoLimpo));
}

// ---------------------------------------------------------------- temas
// bg = terra (e o fundo liso do modo limpo). Repintamos as camadas em vez de
// chamar setStyle, que destruiria fontes, camadas e feature-state.
const MAP_TEMAS = {
  escuro: { claro: false, bg: '#0d1117', agua: '#101c2b', rio: '#17293c',
            fronteira: '#4a5765', rotulo: '#93a1b0', halo: 'rgba(13,17,23,0.9)',
            ap: 'rgba(0,0,0,0.5)', uf: '#8b98a8' },
  claro:  { claro: true,  bg: '#eef2f6', agua: '#cfe0ee', rio: '#b9d2e6',
            fronteira: '#a3b1bf', rotulo: '#5a6672', halo: 'rgba(255,255,255,0.9)',
            ap: 'rgba(255,255,255,0.7)', uf: '#5a6672' },
};

export function applyMapTheme(tema) {
  const t = MAP_TEMAS[tema] ?? MAP_TEMAS.escuro;
  const aplicar = () => {
    const vis = modoLimpo ? 'none' : 'visible';
    for (const id of CAMADAS_BASE) map.setLayoutProperty(id, 'visibility', vis);
    map.setPaintProperty('base-water', 'fill-color', t.agua);
    map.setPaintProperty('base-waterway', 'line-color', t.rio);
    map.setPaintProperty('base-boundary', 'line-color', t.fronteira);
    for (const id of ['base-place-pais', 'base-place-cidade', 'base-place-vila']) {
      map.setPaintProperty(id, 'text-color', t.rotulo);
      map.setPaintProperty(id, 'text-halo-color', t.halo);
    }
    map.setPaintProperty('background', 'background-color',
                         (modoLimpo && t.claro) ? '#ffffff' : t.bg);
    // guarda a cor do tema; quem decide se ela e usada e aplicarBorda, porque
    // no modo 'tom' a borda nao e uma cor fixa, e sim uma por unidade
    corBordaTema = t.ap;
    for (const c of CAMADAS) map.setPaintProperty(`${c.id}-outline`, 'line-color', t.ap);
    if (bordaAtiva !== 'contraste' && fonteAtiva) {
      updateChoropleth(fonteAtiva, { borda: bordaAtiva });
    }
    for (const { ano } of ANOS) map.setPaintProperty(idContorno(ano), 'line-color', t.uf);
  };
  if (map.isStyleLoaded()) aplicar();
  else map.once('load', aplicar);
}


// ------------------------------------------------------------ exportar PNG
// A MESMA pilha do --font-body do CSS. O canvas nao herda fonte de lugar
// nenhum: se aqui divergir, a legenda do PNG sai com desenho e metrica
// diferentes da legenda da tela, e a largura medida por measureText nao
// corresponde ao que o usuario viu.
const PILHA_FONTE =
  '"Atkinson Hyperlegible Next", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';

// O canvas do MapLibre so tem os poligonos e o basemap: legenda, titulo e fonte
// sao DOM por cima. Para o PNG sair completo eles sao redesenhados aqui num
// canvas 2D, a partir do mesmo estado que gerou a legenda da tela.
//
// Alternativa descartada: rasterizar o DOM (html2canvas). Traria uma
// dependencia externa de ~200 KB para desenhar seis retangulos e um texto.

const arred = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Medida e pintura separadas porque a legenda e desenhada em dois contextos
// com regras de posicao diferentes: sobre um mapa so, num canto escolhido, e
// embaixo de uma grade de censos, centrada. Quem posiciona precisa do tamanho
// antes de decidir onde cabe.
function medirLegenda(ctx, k, { semBarras = false } = {}) {
  const e = ultimo;
  if (!e) return null;
  const F = (n) => `${n * k}px ${PILHA_FONTE}`;

  const rotulo = (c) => {
    const f = (v) => fmtValor(v, e.ind);
    if (c.massa) return `exatamente ${f(c.lo)}`;
    if (c.exato) return f(c.lo);
    if (c.aberta === 'baixo') return `menos de ${f(c.hi)}`;
    if (c.aberta === 'alto') return `${f(c.lo)} ou mais`;
    return `${f(c.lo)} a ${f(c.hi)}`;
  };

  // mede antes de desenhar: a caixa tem que caber o rotulo mais longo
  ctx.font = F(10.5);
  const linhas = e.classes.map((c, i) => ({
    cor: e.cores[i],
    txt: rotulo(c),
    pct: e.total > 0 ? (100 * e.popClasse[i]) / e.total : 0,
    frac: e.popClasse[i] / Math.max(...e.popClasse, 1),
  })).reverse();
  const larguraTxt = Math.max(...linhas.map((l) => ctx.measureText(l.txt).width));

  const pad = 10 * k, sw = 13 * k, gap = 7 * k, barra = 76 * k, pctW = 34 * k;
  const lh = 17 * k;
  // sem barra a caixa encolhe de verdade: a largura era mais da metade barra
  // e percentual, e manter o espaco vazio deixaria a legenda boiando
  return {
    label: e.label, linhas, larguraTxt, pad, sw, gap, barra, pctW, lh, F,
    semBarras,
    w: pad * 2 + sw + gap + larguraTxt
       + (semBarras ? 0 : gap + barra + gap + pctW),
    h: pad * 2 + 17 * k + linhas.length * lh + 13 * k,
  };
}

function pintarLegenda(ctx, k, m, x, y, rotuloBarra = 'barra: % da população') {
  const { linhas, larguraTxt, pad, sw, gap, barra, pctW, lh, F } = m;

  ctx.fillStyle = themeVar('--overlay', 'rgba(22,27,34,0.94)');
  arred(ctx, x, y, m.w, m.h, 8 * k);
  ctx.fill();
  ctx.strokeStyle = themeVar('--border', 'rgba(255,255,255,0.1)');
  ctx.lineWidth = k;
  ctx.stroke();

  ctx.fillStyle = themeVar('--text', '#e8ecf1');
  ctx.font = `600 ${F(11.5)}`;
  ctx.textBaseline = 'top';
  ctx.fillText(m.label, x + pad, y + pad);

  let cy = y + pad + 17 * k;
  for (const l of linhas) {
    ctx.fillStyle = l.cor;
    arred(ctx, x + pad, cy + 2 * k, sw, sw, 2 * k);
    ctx.fill();

    ctx.fillStyle = themeVar('--text-2', '#aab4bf');
    ctx.font = F(10.5);
    ctx.fillText(l.txt, x + pad + sw + gap, cy + 3 * k);

    if (!m.semBarras) {
      const bx = x + pad + sw + gap + larguraTxt + gap;
      ctx.fillStyle = themeVar('--surface-2', '#151a20');
      arred(ctx, bx, cy + 5 * k, barra, 9 * k, 2 * k);
      ctx.fill();
      if (l.frac > 0) {
        ctx.fillStyle = themeVar('--muted', '#7d8791');
        arred(ctx, bx, cy + 5 * k, Math.max(1.5 * k, barra * l.frac), 9 * k, 2 * k);
        ctx.fill();
      }

      ctx.fillStyle = themeVar('--text-2', '#aab4bf');
      ctx.font = F(10);
      const t = `${l.pct.toFixed(1)}%`;
      ctx.fillText(t, bx + barra + gap + pctW - ctx.measureText(t).width, cy + 4 * k);
    }
    cy += lh;
  }

  ctx.fillStyle = themeVar('--muted', '#7d8791');
  ctx.font = F(9.5);
  ctx.fillText(rotuloBarra, x + pad, cy + 2 * k);
}

// Canto da legenda sobre um mapa. 'i'/'s' = inferior/superior, 'e'/'d' =
// esquerda/direita. O superior desce 46 px para nao encostar no titulo, que e
// desenhado em 18 px com corpo 16.
export const CANTOS_LEGENDA = [
  { id: 'ie', label: 'inferior esquerdo' },
  { id: 'id', label: 'inferior direito' },
  { id: 'se', label: 'superior esquerdo' },
  { id: 'sd', label: 'superior direito' },
];

function desenharLegenda(ctx, k, larg, alt, canto = 'ie') {
  const m = medirLegenda(ctx, k);
  if (!m) return;
  const x = canto[1] === 'd' ? larg - m.w - 10 * k : 10 * k;
  const y = canto[0] === 's' ? 46 * k : alt - m.h - 22 * k;
  pintarLegenda(ctx, k, m, x, y);
}

// ------------------------------------------------------ recorte da figura
// A tela e retangular e o Brasil nao: exportar o canvas inteiro entrega uma
// figura com faixas de oceano dos dois lados. O recorte e a EXTENSAO DO DADO
// projetada em pixel, limitada ao que cabe na tela -- entao quem esta com
// zoom fechado num municipio nao perde nada, porque ali o retangulo do dado
// e maior que a janela e o limite devolve a janela inteira.
//
// A legenda entra na conta: ela e parte da figura, e cortar o mapa rente ao
// dado a deixaria de fora. O retangulo final e a UNIAO dos dois.

// O retangulo do que foi REALMENTE PINTADO, varrendo o canvas.
//
// A primeira versao usava o bbox geografico das UFs daquele censo. Nao serve:
// Trindade pertence ao Espirito Santo e Fernando de Noronha a Pernambuco,
// entao a uniao vai ate a longitude -28,85 -- uns 6 graus a leste do
// continente. O recorte saia praticamente do tamanho da tela, que era
// justamente o que se queria evitar.
//
// Varrer pixel resolve porque mede o que esta na figura, e nao o que esta no
// arquivo de extensao. Na visao do Brasil o basemap nem entra (todas as
// camadas 'base-' comecam no zoom 6), entao o canvas tem so o fundo liso e os
// poligonos: a varredura acha a silhueta exata. Com zoom fechado o basemap
// pinta tudo, a varredura devolve o canvas inteiro e o recorte vira um
// no-op -- que e o comportamento certo, porque ali o mapa ja preenche a tela.
//
// Passo de 2 px: o retangulo nao precisa ser exato ao pixel e isso corta a
// varredura em quatro. A cor de referencia sai do canto superior esquerdo, e
// nao de uma constante de tema, porque o fundo do MAPA e o 'bg' de MAP_TEMAS e
// nao o --bg-page da pagina, e os dois nao sao a mesma cor.
function recorteDesenhado() {
  const src = map.getCanvas();
  const tmp = document.createElement('canvas');
  tmp.width = src.width;
  tmp.height = src.height;
  const c = tmp.getContext('2d', { willReadFrequently: true });
  c.drawImage(src, 0, 0);

  let d;
  try {
    d = c.getImageData(0, 0, tmp.width, tmp.height).data;
  } catch {
    return null;          // canvas contaminado: cai no canvas inteiro
  }

  const r0 = d[0], g0 = d[1], b0 = d[2];
  const TOL = 12, passo = 2;
  let x1 = tmp.width, y1 = tmp.height, x2 = -1, y2 = -1;
  for (let y = 0; y < tmp.height; y += passo) {
    const base = y * tmp.width;
    for (let x = 0; x < tmp.width; x += passo) {
      const i = (base + x) * 4;
      if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0)
          + Math.abs(d[i + 2] - b0) > TOL) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  return { x: x1, y: y1, w: x2 - x1 + passo, h: y2 - y1 + passo };
}

// Um bbox geografico projetado em pixel do canvas.
function recortarPor(k, bb) {
  if (!bb) return null;
  const a = map.project([bb[0][0], bb[1][1]]);
  const b = map.project([bb[1][0], bb[0][1]]);
  return { x1: Math.min(a.x, b.x) * k, y1: Math.min(a.y, b.y) * k,
           x2: Math.max(a.x, b.x) * k, y2: Math.max(a.y, b.y) * k };
}

const retanguloContinental = (k) => recortarPor(k, BBOX_CONTINENTAL);

// Retangulo em pixel do canvas, ja com a legenda dentro e uma folga.
async function recorteDaFigura(comLegenda) {
  const cv = map.getCanvas();
  const k = escalaCanvas();
  const r = recorteDesenhado();
  if (!r) return { x: 0, y: 0, w: cv.width, h: cv.height };

  let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;

  // Limita ao continente. A varredura de pixel acha TUDO o que foi pintado, e
  // as ilhas oceanicas sao pintadas: sem este corte o retangulo volta a
  // carregar a faixa de oceano. Se a intersecao for vazia -- alguem com zoom
  // fechado em Fernando de Noronha -- vale o que foi desenhado, senao a figura
  // sairia em branco.
  // Com recorte aplicado quem manda e a UNIDADE, e nao o que foi pintado: no
  // zoom de um municipio o basemap pinta a tela inteira, a varredura devolve
  // tudo, e a figura de Sao Paulo sairia com meia regiao metropolitana em
  // volta. O bbox da unidade ja esta em memoria -- focar() o carregou para
  // enquadrar -- entao aqui e cache.
  const alvo = foco
    ? recortarPor(k, (await carregarBbox(foco.cont)).get(String(foco.cod)))
    : retanguloContinental(k);
  if (alvo) {
    const ix1 = Math.max(x1, alvo.x1), iy1 = Math.max(y1, alvo.y1);
    const ix2 = Math.min(x2, alvo.x2), iy2 = Math.min(y2, alvo.y2);
    if (ix2 - ix1 > 20 * k && iy2 - iy1 > 20 * k) {
      x1 = ix1; y1 = iy1; x2 = ix2; y2 = iy2;
    }
  }

  if (comLegenda) {
    const l = caixaDaLegenda(k);
    if (l) {
      x1 = Math.min(x1, l.x); y1 = Math.min(y1, l.y);
      x2 = Math.max(x2, l.x + l.w); y2 = Math.max(y2, l.y + l.h);
    }
  }

  const folga = 12 * k;
  x1 = Math.max(0, Math.round(x1 - folga));
  y1 = Math.max(0, Math.round(y1 - folga));
  x2 = Math.min(cv.width, Math.round(x2 + folga));
  y2 = Math.min(cv.height, Math.round(y2 + folga));
  return { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) };
}

// Onde a legenda esta NA TELA, em pixel do canvas. E ela que manda: se o
// usuario arrastou o quadro para cima do oceano vazio, e ali que ele quer a
// legenda na figura tambem. Devolve null quando ela esta escondida (modo
// limpo), e af o chamador cai no canto escolhido.
function caixaDaLegenda(k) {
  const el = document.getElementById('choro-legend');
  const painel = document.getElementById('map-panel');
  if (!el || !painel) return null;
  const r = el.getBoundingClientRect();
  const p = painel.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  return { x: (r.left - p.left) * k, y: (r.top - p.top) * k,
           w: r.width * k, h: r.height * k };
}

// Quebra o texto em linhas que caibam em 'larg'. A fonte JA TEM de estar
// aplicada no ctx: quem mede tem de medir com o corpo com que vai desenhar.
//
// Quebra primeiro nos separadores ' · ', que sao as juntas naturais do titulo
// -- "Paredes de alvenaria com revestimento" numa linha e "São Paulo · SP ·
// por área de ponderação" na outra le bem melhor do que um corte no meio de
// "revestimento". So cai na quebra por palavra quando um trecho sozinho ja
// nao cabe.
function quebrarLinhas(ctx, txt, larg) {
  const cabe = (t) => ctx.measureText(t).width <= larg;
  if (!txt) return [];
  if (cabe(txt)) return [txt];

  const linhas = [];
  let atual = '';
  const empurrar = () => { if (atual) linhas.push(atual); atual = ''; };

  for (const trecho of String(txt).split(' · ')) {
    const junto = atual ? `${atual} · ${trecho}` : trecho;
    if (cabe(junto)) { atual = junto; continue; }
    empurrar();
    if (cabe(trecho)) { atual = trecho; continue; }
    // o trecho sozinho estoura: quebra por palavra
    for (const p of trecho.split(' ')) {
      const t = atual ? `${atual} ${p}` : p;
      if (atual && !cabe(t)) { linhas.push(atual); atual = p; } else atual = t;
    }
  }
  empurrar();
  return linhas;
}

// Titulo e credito sao desenhados SOBRE o mapa, entao levam halo da cor do
// fundo: sem ele o texto some assim que passa por cima de um poligono claro.
//
// O recorte segue a forma do que esta desenhado, e ha forma estreita: Sao
// Paulo em areas de ponderacao sai alto e fino. Por isso o texto quebra em
// vez de sangrar para fora.
function desenharTexto(ctx, k, larg, alt, titulo, creditos) {
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  const halo = themeVar('--bg-page', '#0f1216');
  const util = larg - 28 * k;

  const bloco = (txt, tam, peso, cor, yTopo, deBaixo) => {
    if (!txt) return;
    ctx.font = `${peso} ${tam * k}px ${PILHA_FONTE}`;
    const linhas = quebrarLinhas(ctx, txt, util);
    const lh = tam * 1.3 * k;
    // creditos crescem para CIMA: a ultima linha fica sempre na mesma altura
    const y0 = deBaixo ? yTopo - (linhas.length - 1) * lh : yTopo;
    linhas.forEach((l, i) => {
      const x = (larg - ctx.measureText(l).width) / 2;
      const y = y0 + i * lh;
      ctx.strokeStyle = halo;
      ctx.lineWidth = 3.5 * k;
      ctx.strokeText(l, x, y);
      ctx.fillStyle = cor;
      ctx.fillText(l, x, y);
    });
  };

  bloco(titulo, 16, '600', themeVar('--text', '#e8ecf1'), 18 * k, false);
  bloco(creditos, 10.5, '400', themeVar('--text-2', '#aab4bf'), alt - 24 * k, true);
}

// devicePixelRatio real do canvas do mapa
const escalaCanvas = () =>
  map.getCanvas().width / map.getContainer().clientWidth;

// Espera o mapa parar de pintar. O canvas so guarda o ultimo quadro desenhado,
// entao ler sem isto devolve o quadro anterior. Com teto de tempo: se o mapa ja
// estava ocioso, 'idle' pode nao disparar de novo e a promessa ficaria presa.
export function esperarQuieto(teto = 2500) {
  return new Promise((r) => {
    const t = setTimeout(r, teto);
    map.once('idle', () => { clearTimeout(t); r(); });
    map.triggerRepaint();
  });
}

// Espera os TILES da camada ativa, e nao um relogio.
//
// esperarQuieto() tem teto de 2,5 s e resolve no 'idle'. Os municipios de 2022
// levam uns 3 s para chegar e desenhar, entao a captura do facet fotografava o
// painel pela metade -- uma faixa pintada e o resto so contorno. A figura saia
// ERRADA COM CARA DE CERTA, que e o pior desfecho possivel numa grade que
// existe para ser comparada.
//
// Poll por tempo, e nao por quadro: queryRenderedFeatures forca o MapLibre a
// recolher as feicoes, e chamar isso 60 vezes por segundo atrapalha a
// renderizacao que se esta esperando.
export function esperarTilesDaCamada(teto = 20000) {
  return new Promise((res) => {
    const t0 = Date.now();
    const olhar = () => {
      const id = idFill(camadaAtiva);
      const pronto = map.getLayer(id) && map.isSourceLoaded(`src-${camadaAtiva.id}`)
                     && map.queryRenderedFeatures({ layers: [id] }).length > 0;
      if (pronto || Date.now() - t0 > teto) res(pronto);
      else setTimeout(olhar, 150);
    };
    olhar();
  });
}

// Sem isto, exportar nos primeiros segundos desenha a legenda na fonte de
// sistema, com metrica diferente da que esta na tela -- e a caixa medida por
// measureText sai errada junto.
const esperarFonte = () => document.fonts?.ready ?? Promise.resolve();

export async function montarCanvas({ titulo = '', creditos = '',
                                     comLegenda = true, cantoLegenda = 'ie' } = {}) {
  await esperarFonte();
  await esperarQuieto();

  const src = map.getCanvas();
  const k = escalaCanvas();
  const rec = await recorteDaFigura(comLegenda);

  const out = document.createElement('canvas');
  out.width = rec.w;
  out.height = rec.h;
  const ctx = out.getContext('2d');

  ctx.fillStyle = themeVar('--bg-page', '#0f1216');
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, rec.x, rec.y, rec.w, rec.h, 0, 0, rec.w, rec.h);

  if (comLegenda) {
    // Onde ela esta na tela, menos a origem do recorte. So cai no canto
    // escolhido quando nao ha legenda visivel para copiar a posicao.
    const cx = caixaDaLegenda(k);
    const m = medirLegenda(ctx, k);
    if (cx && m) {
      pintarLegenda(ctx, k, m,
        Math.min(Math.max(0, cx.x - rec.x), out.width - m.w),
        Math.min(Math.max(0, cx.y - rec.y), out.height - m.h));
    } else {
      desenharLegenda(ctx, k, out.width, out.height, cantoLegenda);
    }
  }
  desenharTexto(ctx, k, out.width, out.height, titulo, creditos);
  return out;
}

export async function baixarCanvas(out, nome = 'mapa.png') {
  // Canvas contaminado por textura de outra origem faz toBlob lancar. O
  // basemap do OpenFreeMap manda CORS, entao normalmente nao acontece; se
  // acontecer, o modo limpo resolve porque desliga o basemap.
  const blob = await new Promise((res, rej) => {
    try { out.toBlob((b) => (b ? res(b) : rej(new Error('canvas vazio'))), 'image/png'); }
    catch (e) { rej(e); }
  });
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
}



// ------------------------------------------------- vários censos lado a lado
// Um facet_wrap: a MESMA unidade em vários censos, no mesmo enquadramento e na
// mesma escala de cor, numa figura só. Não são vários mapas — é um mapa
// fotografado várias vezes.
//
// O enquadramento comum é o ponto todo. Cada censo tem a extensão da SUA
// malha, e um município desmembrado depois muda de bbox; deixar cada painel
// enquadrar pelo próprio faria a figura comparar recortes diferentes.

export async function bboxDaUnidade(cont, cod) {
  return (await carregarBbox(cont)).get(String(cod)) ?? null;
}

export function unirBbox(lista) {
  const b = lista.filter(Boolean);
  if (!b.length) return null;
  return [[Math.min(...b.map((x) => x[0][0])), Math.min(...b.map((x) => x[0][1]))],
          [Math.max(...b.map((x) => x[1][0])), Math.max(...b.map((x) => x[1][1]))]];
}

// Enquadra sem animação (a animação seria tempo perdido entre capturas) e
// devolve o retângulo em pixel do canvas que corresponde ao bbox. Como o bbox
// e o container são os mesmos em todas as chamadas, o retângulo também é —
// é isso que faz os painéis recortarem iguais sem redimensionar nada.
export async function enquadrarParaCaptura(bb, padding = 24) {
  map.fitBounds(bb, { padding, duration: 0 });
  await esperarTilesDaCamada();
  await esperarQuieto();

  const k = escalaCanvas();
  const a = map.project([bb[0][0], bb[1][1]]);   // oeste, norte
  const b = map.project([bb[1][0], bb[0][1]]);   // leste, sul
  const cv = map.getCanvas();
  const lim = (v, max) => Math.max(0, Math.min(max, Math.round(v * k)));
  const x = lim(Math.min(a.x, b.x) - padding / 2, cv.width);
  const y = lim(Math.min(a.y, b.y) - padding / 2, cv.height);
  return {
    x, y,
    w: lim(Math.max(a.x, b.x) + padding / 2, cv.width) - x,
    h: lim(Math.max(a.y, b.y) + padding / 2, cv.height) - y,
  };
}

export function capturarRecorte(r) {
  const out = document.createElement('canvas');
  out.width = r.w;
  out.height = r.h;
  const ctx = out.getContext('2d');
  ctx.fillStyle = themeVar('--bg-page', '#0f1216');
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.drawImage(map.getCanvas(), r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return out;
}

// paineis: [{ ano, canvas | null, nota }]. Painel sem canvas vira retângulo
// vazio com a nota — buraco num facet é informação, e pular o censo
// desalinharia a grade e mentiria sobre a série.
// Quanto o texto da GRADE cresce em relacao ao de um mapa so.
//
// Nao e capricho: o k do canvas dimensiona o texto para ser lido na tela, onde
// o mapa ocupa ~900 px. A grade de quatro censos tem 1.800 px de largura, e a
// figura acaba sendo vista reduzida num relatorio ou projetada -- o titulo em
// corpo 16 vira um fio. Multiplicar aqui, e nao no k do painel, mantem os
// mapas com o mesmo detalhe e so aumenta o que e texto.
const TEXTO_GRADE = 3;

export function comporGrade(paineis, { titulo = '', creditos = '',
                                       comLegenda = true, colunas = 0 } = {}) {
  const k = escalaCanvas();
  const kt = k * TEXTO_GRADE;   // escala do texto e da legenda
  const cheio = paineis.find((p) => p.canvas);
  if (!cheio) throw new Error('nenhum censo pôde ser desenhado');
  const pw = cheio.canvas.width, ph = cheio.canvas.height;

  const cols = Math.max(1, colunas || Math.ceil(Math.sqrt(paineis.length)));
  const rows = Math.ceil(paineis.length / cols);
  const vao = 10 * k, mar = 14 * k;

  // mede a legenda antes de dimensionar: ela fica numa faixa abaixo da grade,
  // centrada, e pode ser mais larga que a grade em figura de uma coluna só
  const medida = document.createElement('canvas').getContext('2d');
  const mleg = comLegenda ? medirLegenda(medida, kt, { semBarras: true }) : null;

  const gradeW = cols * pw + (cols - 1) * vao;
  const larguraFinal = Math.round(Math.max(gradeW, mleg?.w ?? 0) + mar * 2);

  // Quebrar ANTES de dimensionar: a altura das faixas de titulo e de fonte
  // depende de quantas linhas cada texto vai ocupar, e a altura do canvas
  // depende delas. Medir com o corpo em que o texto vai sair, senao a conta e
  // de outra coisa.
  const util = larguraFinal - mar * 2;
  medida.font = `600 ${16 * kt}px ${PILHA_FONTE}`;
  const linhasTitulo = quebrarLinhas(medida, titulo, util);
  medida.font = `400 ${10.5 * kt}px ${PILHA_FONTE}`;
  const linhasFonte = quebrarLinhas(medida, creditos, util);
  const lhTitulo = 16 * 1.3 * kt, lhFonte = 10.5 * 1.4 * kt;

  const alturaTitulo = linhasTitulo.length ? linhasTitulo.length * lhTitulo + 14 * kt : 0;
  const alturaLegenda = mleg ? mleg.h + 14 * k : 0;
  const alturaFonte = linhasFonte.length ? linhasFonte.length * lhFonte + 12 * kt : 0;

  const out = document.createElement('canvas');
  out.width = larguraFinal;
  out.height = Math.round(rows * ph + (rows - 1) * vao + alturaTitulo
                          + alturaLegenda + alturaFonte + mar * 2);
  const ctx = out.getContext('2d');
  ctx.fillStyle = themeVar('--bg-page', '#0f1216');
  ctx.fillRect(0, 0, out.width, out.height);

  const x0 = (out.width - gradeW) / 2;
  const y0 = mar + alturaTitulo;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  paineis.forEach((p, i) => {
    const x = x0 + (i % cols) * (pw + vao);
    const y = y0 + Math.floor(i / cols) * (ph + vao);
    if (p.canvas) {
      ctx.drawImage(p.canvas, x, y);
    } else {
      ctx.fillStyle = themeVar('--surface-2', '#151a20');
      ctx.fillRect(x, y, pw, ph);
      ctx.fillStyle = themeVar('--muted', '#7d8791');
      ctx.font = `${11 * kt}px ${PILHA_FONTE}`;
      const t = p.nota ?? 'sem dado neste censo';
      ctx.fillText(t, x + (pw - ctx.measureText(t).width) / 2, y + ph / 2);
    }
    ctx.strokeStyle = themeVar('--border', 'rgba(255,255,255,0.1)');
    ctx.lineWidth = k;
    ctx.strokeRect(x + 0.5 * k, y + 0.5 * k, pw - k, ph - k);

    // rótulo do censo com halo: ele cai sobre o mapa
    ctx.font = `600 ${13 * kt}px ${PILHA_FONTE}`;
    ctx.strokeStyle = themeVar('--bg-page', '#0f1216');
    ctx.lineWidth = 3.5 * kt;
    ctx.strokeText(String(p.ano), x + 9 * kt, y + 7 * kt);
    ctx.fillStyle = themeVar('--text', '#e8ecf1');
    ctx.fillText(String(p.ano), x + 9 * kt, y + 7 * kt);
  });

  if (mleg) {
    // Sem a barra de população: as CORES valem para a grade inteira, porque o
    // domínio dos cortes é o mesmo em todos os painéis, mas a barra é a
    // distribuição de UM censo. Rotular qual era honesto e ainda assim
    // oferecia a leitura errada — barra de um ano encostada em mapa de
    // quatro. O que fica é a afirmação que vale para a figura toda.
    pintarLegenda(ctx, kt, mleg, (out.width - mleg.w) / 2,
                  y0 + rows * ph + (rows - 1) * vao + 14 * k,
                  `mesma escala nos ${paineis.length} painéis`);
  }

  const bloco = (linhas, y0, lh, cor, tam, peso) => {
    ctx.font = `${peso} ${tam * kt}px ${PILHA_FONTE}`;
    ctx.fillStyle = cor;
    linhas.forEach((l, i) => {
      ctx.fillText(l, (out.width - ctx.measureText(l).width) / 2, y0 + i * lh);
    });
  };
  bloco(linhasTitulo, mar, lhTitulo, themeVar('--text', '#e8ecf1'), 16, '600');
  bloco(linhasFonte,
        out.height - mar - linhasFonte.length * lhFonte,
        lhFonte, themeVar('--text-2', '#aab4bf'), 10.5, '400');
  return out;
}
