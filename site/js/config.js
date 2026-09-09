// Config central: catálogo de indicadores e helpers de tema.
//
// Esta é a única fonte de verdade da interface. Indicador novo = coluna nova em
// site/data/resumo.csv + entrada aqui. Os tiles NÃO mudam: o valor entra por
// expressão 'match' no paint do MapLibre, nunca como atributo do tile.
//
// Campos:
//   col        coluna em resumo.csv
//   tema       agrupa no seletor (ordem definida em TEMAS)
//   unidade    sufixo na legenda e no painel
//   dir        +1 alto é melhor, -1 alto é pior, 0 neutro (composição).
//              dir = -1 inverte a rampa de cor, senão o mapa sugere que o
//              extremo ruim é bom. dir = 0 usa paleta neutra.
//   dec        casas decimais na exibição
//   den        coluna com o denominador amostral, para o piso de confiança
//   desc       texto exibido sob o seletor

export function themeVar(nome, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || fallback;
}

// ------------------------------------------------------------------- censos
// Seis censos. 2022 vem dos microdados de acesso controlado processados aqui;
// 1970 a 2010 vêm dos microdados da amostra, extraídos no BigQuery
// (ver Analise/Historico).
//
// CADA CENSO É DESENHADO NA MALHA DO SEU PRÓPRIO ANO. Não há compatibilização
// territorial: eram 3.952 municípios em 1970 contra 5.570 hoje, e os que
// existiam mudaram de limite. O mapa mostra "o Brasil de 1970 como ele era",
// não "a evolução do município X" — para isso seriam necessárias Áreas Mínimas
// Comparáveis, que é outro exercício.
export const ANOS = [
  { ano: 1970 }, { ano: 1980 }, { ano: 1991 },
  { ano: 2000 }, { ano: 2010 }, { ano: 2022, default: true },
];

// Dimensão geográfica, comum a todos os anos.
//   chave      propriedade do tile usada na junção (vira o feature id)
//   chaveCsv   coluna equivalente no CSV
//   camada     source-layer dentro do PMTiles
const GEO = {
  ap:  { label: 'Área de ponderação', camada: 'ap',
         chave: 'code_weighting', chaveCsv: 'cod_ap' },
  mun: { label: 'Município', camada: 'mun',
         chave: 'code_muni', chaveCsv: 'cod_mun' },
  uf:  { label: 'Estado', camada: 'ufs',
         chave: 'code_state', chaveCsv: 'cod_uf' },
};

// (ano, nível) -> malha + dados. Área de ponderação existe em 2000, 2010 e
// 2022; antes de 2000 o IBGE não publicou essa divisão.
const FONTES = [
  [2022, 'ap',  'areas_ponderacao.pmtiles',      'resumo_ap.csv'],
  [2022, 'mun', 'municipios.pmtiles',            'resumo_mun.csv'],
  [2022, 'uf',  'ufs.pmtiles',                   'resumo_uf.csv'],
  [2010, 'ap',  'areas_ponderacao_2010.pmtiles', 'hist_ap_2010.csv'],
  [2010, 'mun', 'municipios_2010.pmtiles',       'hist_mun_2010.csv'],
  [2010, 'uf',  'ufs_2010.pmtiles',              'hist_uf_2010.csv'],
  // A malha de AP de 2000 não vem do geobr (que só tem 2010 e 2022): é
  // construída por scripts/gerar_malha_ap_2000.R a partir da composição
  // setor -> área do IBGE, com as 89 áreas metropolitanas que sobravam
  // fechadas por vizinhança. 9.336 de 9.336, e somar as áreas de um município
  // reproduz o valor municipal em 5.507 de 5.507.
  [2000, 'ap',  'areas_ponderacao_2000.pmtiles', 'hist_ap_2000.csv'],
  [2000, 'mun', 'municipios_2000.pmtiles',       'hist_mun_2000.csv'],
  [2000, 'uf',  'ufs_2000.pmtiles',              'hist_uf_2000.csv'],
  [1991, 'mun', 'municipios_1991.pmtiles',       'hist_mun_1991.csv'],
  [1991, 'uf',  'ufs_1991.pmtiles',              'hist_uf_1991.csv'],
  [1980, 'mun', 'municipios_1980.pmtiles',       'hist_mun_1980.csv'],
  [1980, 'uf',  'ufs_1980.pmtiles',              'hist_uf_1980.csv'],
  [1970, 'mun', 'municipios_1970.pmtiles',       'hist_mun_1970.csv'],
  [1970, 'uf',  'ufs_1970.pmtiles',              'hist_uf_1970.csv'],
];

// Uma camada por par (ano, nível): é a unidade que o mapa declara como fonte e
// que o seletor liga e desliga. O id entra em ids de camada do MapLibre, então
// precisa ser estável.
export const CAMADAS = FONTES.map(([ano, nivel, tiles, csv]) => ({
  id: `${nivel}_${ano}`, ano, nivel, ...GEO[nivel],
  tiles: `pmtiles://./geo/${tiles}`,
  arquivo: `./data/${csv}`,
  default: ano === 2022 && nivel === 'ap',
}));

// Buracos conhecidos na fonte. O que ficava cinza em 1970 e 1980 era o futuro
// Tocantins (nos dois anos) e o futuro Mato Grosso do Sul (em 1970): o arquivo
// de microdados traz essas pessoas SEM código de município, então elas entravam
// no total do estado da época e em polígono nenhum.
//
// Os dois foram recuperados e hoje sobram 5 municípios em 1970 e 2 em 1980. A
// nota fica porque a recuperação não é leitura direta do arquivo — é
// reconstrução, e quem olha o mapa tem direito de saber disso.
export const NOTAS_ANO = {
  1970: 'O norte de Goiás (hoje Tocantins) e Mato Grosso do Sul ficavam cinzas ' +
        'em 1970 — 105 municípios, 826 mil pessoas. Voltaram ao mapa por dois ' +
        'caminhos: 27 de Mato Grosso do Sul tinham o dígito verificador do ' +
        'código divergente do da malha (Campo Grande, Corumbá, Dourados), e 73 ' +
        'vinham sem código de município e foram reencontrados pelos códigos da ' +
        'época — UF, microrregião e o número do município como ele era então. ' +
        'Sobram cinco sem cor, entre eles Cococi (CE), extinto, e uma área em ' +
        'litígio entre Piauí e Ceará. Ver a metodologia.',
  1980: 'Os 52 municípios do norte de Goiás (hoje Tocantins) ficavam cinzas: ' +
        '740 mil pessoas que o arquivo de microdados traz sem código de ' +
        'município e sem nenhuma outra referência geográfica, nem mesmo o ' +
        'domicílio. Foram ' +
        'recuperados do microdado original em SPSS, com as mesmas fórmulas, ' +
        'depois de conferir município a município contra os 171 de Goiás que ' +
        'servem de gabarito. Sobram dois sem cor, Fernando de Noronha entre ' +
        'eles. Ver a metodologia.',
};

export const camadaDe = (ano, nivel) =>
  CAMADAS.find((c) => c.ano === ano && c.nivel === nivel) ?? null;

// Do maior para o menor, sempre na mesma ordem: estado, município, área de
// ponderação. A ordem do catálogo é a de FONTES, que é outra coisa (agrupa por
// ano), e usá-la punha a área de ponderação primeiro em 2000, 2010 e 2022 e o
// município primeiro nos outros — os botões trocavam de lugar ao mudar de censo.
export const ORDEM_NIVEL = ['uf', 'mun', 'ap'];

export const niveisDoAno = (ano) => CAMADAS
  .filter((c) => c.ano === ano)
  .sort((a, b) => ORDEM_NIVEL.indexOf(a.nivel) - ORDEM_NIVEL.indexOf(b.nivel));

// Rótulo curto de cada nível, para o botão que aparece esmaecido no censo em
// que aquele recorte não existe.
export const rotuloNivel = (nivel) => GEO[nivel].label;

// Modo gráfico: recorta uma unidade e desenha só as subdivisões dela, para
// virar figura de relatório. Definido por container -> filhos possíveis.
//
// Os tiles já carregam o que o filtro precisa, então nada é regerado:
// as áreas de ponderação trazem 'code_muni' e 'abbrev_state', e os municípios
// trazem 'abbrev_state'.
//
//   bbox    arquivo com a extensão de cada unidade, para o enquadramento
//   campo   propriedade do tile dos FILHOS que identifica o container
//   tipo    'num' compara com número, 'txt' com string (muda o valor do filtro)
//
// Depende do ano porque a extensão de cada unidade é a da malha daquele ano, e
// porque antes de 2010 não há área de ponderação para acender dentro.
const FILHO_AP_MUN = { nivel: 'ap', label: 'áreas de ponderação',
                       campo: 'code_muni', tipo: 'num' };
const FILHO_AP_UF  = { nivel: 'ap', label: 'áreas de ponderação',
                       campo: 'abbrev_state', tipo: 'txt' };
const FILHO_MUN_UF = { nivel: 'mun', label: 'municípios',
                       campo: 'abbrev_state', tipo: 'txt' };

export function focosDoAno(ano) {
  const temAp = !!camadaDe(ano, 'ap');
  const suf = ano === 2022 ? '' : `_${ano}`;   // 2022 mantém os nomes originais
  const f = {
    uf: { bbox: `./data/bbox_uf${suf}.csv`,
          filhos: temAp ? [FILHO_MUN_UF, FILHO_AP_UF] : [FILHO_MUN_UF] },
  };
  // sem área de ponderação não há o que desenhar dentro de um município
  if (temAp) f.mun = { bbox: `./data/bbox_mun${suf}.csv`, filhos: [FILHO_AP_MUN] };
  return f;
}

// Paletas oferecidas no seletor. 'auto' e o padrao e respeita a direcao do
// indicador (viridis onde ha juizo de valor, cividis onde e composicao); as
// outras sao escolha explicita de quem esta montando a figura.
export const PALETAS = [
  { id: 'auto', label: 'Automática (pela direção do indicador)' },
  { id: 'viridis', label: 'Viridis' },
  { id: 'cividis', label: 'Cividis (segura para daltonismo)' },
  { id: 'magma', label: 'Magma' },
  { id: 'inferno', label: 'Inferno' },
  { id: 'plasma', label: 'Plasma' },
  { id: 'azul', label: 'Azul (uma cor, boa em cinza)' },
  { id: 'verdeazul', label: 'Verde-azul' },
  { id: 'quente', label: 'Quente (amarelo a vermelho)' },
];

// Base da escala de cor. 'ano' recorta a distribuicao do censo que esta na
// tela; 'serie' junta todos os censos em que o indicador existe, no mesmo
// nivel geografico, e classifica sobre esse conjunto. Sem 'serie' os mapas de
// anos diferentes tem cortes diferentes e a cor de 1991 nao quer dizer o mesmo
// que a de 2022 — a comparacao visual entre censos fica errada.
export const BASES_ESCALA = [
  { id: 'ano', label: 'deste censo' },
  { id: 'serie', label: 'comparável entre censos' },
];

export const TEMAS = [
  { id: 'A', label: 'Domicílio e saneamento' },
  { id: 'B', label: 'Educação' },
  { id: 'C', label: 'Trabalho e renda' },
  { id: 'D', label: 'Demografia' },
  { id: 'E', label: 'Migração e deslocamento' },
  { id: 'F', label: 'Domicílio e família' },
];

// Piso de denominador amostral. Abaixo disso a área não recebe cor: proporção
// com denominador minúsculo oscila por ruído e, pior, estica a escala e domina
// o mapa inteiro.
export const PISO_AMOSTRA = 30;

const D = 'n_dom_amostra', P = 'n_pes_amostra', F = 'n_fam_amostra';

// Em que censos o indicador existe. Indicador sem 'anos' é só de 2022, que é o
// caso da grande maioria: os censos antigos têm poucas variáveis comparáveis.
//
// Os quatro que atravessam a série inteira usam A MESMA COLUNA nos dois lados
// (a2_agua_rede, a4_esgoto_rede, a6_lixo_coletado, b1_alfabetizacao), de
// propósito: é o que deixa trocar de ano sem perder o indicador escolhido.
const TODOS = [1970, 1980, 1991, 2000, 2010, 2022];
const HIST  = [1970, 1980, 1991, 2000, 2010];

// Em que censos cada indicador existe. NAO editar a mao: o campo 'anos' é
// reescrito por scripts/gerar_metodologia.py + o utilitário que lê
// site/data/metodologia.json, a partir do que a extração realmente produziu.
// Manter isto a mão já produziu divergência entre catálogo e extração.
//
// 1991 e 2000 têm 143 e 166 colunas de microdado, contra 67 de 1970. Por isso
// quase tudo começa em 1991, e não na série inteira.
const DE1991   = [1991, 2000, 2010, 2022];   // o caso mais comum
const DE2000   = [2000, 2010, 2022];
const C2010    = [2010, 2022];
const HIST1991 = [1991, 2000, 2010];
const H0010    = [2000, 2010];
// anos de estudo, sem instrução e trabalho doméstico: o Censo 2010 trocou anos
// de estudo por nível de instrução e não separa o trabalhador doméstico
const SEM2010  = [1991, 2000, 2022];
// bens duráveis e situação do domicílio: perguntados em 1970 e 1980 e
// abandonados depois, quando renda passou a existir e a medir a mesma coisa
const H7080    = [1970, 1980];
const SO1970   = [1970];
const SO1980   = [1980];
const SO1991   = [1991];
const SO2000   = [2000];
const SO2010   = [2010];
// Só existe quem realmente pode ser comparado. As definições não são idênticas
// entre censos (o denominador de 2022 exclui domicílio coletivo, vago e
// fechado; o dos antigos exclui só o não respondido), então a série mostra
// tendência, não diferença de décimo.
export const indicadoresDoAno = (ano) =>
  INDICADORES.filter((i) => (i.anos ?? [2022]).includes(ano));

export const INDICADORES = [
  // ---------------------------------------------- A. Domicílio e saneamento
  { col: 'a1_internet', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, default: true, anos: [2022],
    label: 'Domicílios com acesso à internet',
    desc: 'Percentual de domicílios com acesso à internet. Exclui domicílios onde a pergunta não se aplica (coletivos, fechados, vagos).' },
  { col: 'a1b_micro_internet', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: SO2010,
    label: 'Microcomputador com acesso à internet',
    desc: 'Só em 2010, e NÃO é comparável com o indicador de internet de 2022: em 2010 a pergunta era sobre microcomputador com acesso, e não contava celular. Nacional: 30,7%, contra 86,4% de acesso por qualquer aparelho em 2022.' },
  { col: 'a1c_microcomputador', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: H0010,
    label: 'Microcomputador no domicílio',
    desc: 'Domicílios com microcomputador, com ou sem internet. Nacional em 2010: 38,3%.' },
  { col: 'a2_agua_rede', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: TODOS,
    label: 'Água por rede geral',
    desc: 'Domicílios abastecidos pela rede geral de distribuição. Disponível nos seis censos, de 1970 a 2022.' },
  { col: 'a3_agua_dentro', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: TODOS,
    label: 'Água canalizada até dentro do domicílio',
    desc: 'Domicílios com água encanada chegando ao interior da habitação, não apenas ao terreno.' },
  { col: 'a4_esgoto_rede', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: TODOS,
    label: 'Esgoto por rede geral',
    desc: 'Domicílios ligados à rede geral de esgoto ou pluvial. Disponível nos seis censos, de 1970 a 2022.' },
  { col: 'a5_esgoto_inadeq', tema: 'A', unidade: '%', dir: -1, dec: 1, den: D, anos: TODOS,
    label: 'Esgotamento inadequado',
    desc: 'Domicílios que despejam esgoto em vala, rio, lago ou mar, ou que não têm banheiro nem sanitário.' },
  { col: 'a6_lixo_coletado', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: DE1991,
    label: 'Coleta de lixo',
    desc: 'Lixo coletado no domicílio ou depositado em caçamba do serviço de limpeza. Os censos de 1970 e 1980 não perguntaram destino do lixo.' },
  { col: 'a7_banheiro_excl', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Banheiro de uso exclusivo',
    desc: 'Domicílios com ao menos um banheiro de uso exclusivo dos moradores.' },
  { col: 'a7b_sem_banheiro', tema: 'A', unidade: '%', dir: -1, dec: 1, den: D, anos: H7080,
    label: 'Domicílios sem banheiro nem sanitário',
    desc: 'O reverso de "banheiro de uso exclusivo", e o quesito que existe em 1970: naquele ano o censo pergunta o tipo de instalação sanitária, e "não tem" é uma das respostas. Em 1980 sai do uso da instalação.' },
  { col: 'a8_saneamento_ok', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: DE1991,
    label: 'Saneamento adequado (composto)',
    desc: 'Combina os três: água da rede geral, esgoto por rede ou fossa séptica ligada, e banheiro de uso exclusivo. Um domicílio precisa dos três para contar.' },
  { col: 'a9_maq_lavar', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: DE1991,
    label: 'Máquina de lavar roupa',
    desc: 'Indicador indireto de renda e de acesso a bens duráveis.' },
  { col: 'a26_radio', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: H7080,
    label: 'Rádio no domicílio',
    desc: 'Bem durável perguntado em 1970 e 1980, quando o rádio era o único meio de comunicação que alcançava o país inteiro.' },
  { col: 'a27_geladeira', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: H7080,
    label: 'Geladeira no domicílio',
    desc: '26% dos domicílios em 1970 e 50% em 1980. É o bem que melhor separa o país nesses anos, porque depende de energia elétrica, que só metade tinha em 1970.' },
  { col: 'a28_televisao', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: H7080,
    label: 'Televisão no domicílio',
    desc: 'Em 1980 o censo distingue cor de preto e branco; aqui as duas contam como ter televisão, para a série com 1970 continuar significando a mesma coisa.' },
  { col: 'a29_automovel', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: H7080,
    label: 'Automóvel no domicílio',
    desc: 'Em 1980 o censo separa uso particular de uso no trabalho; aqui os dois contam.' },
  { col: 'a30_fogao_lenha', tema: 'A', unidade: '%', dir: -1, dec: 1, den: D, anos: H7080,
    label: 'Cozinha com lenha ou carvão',
    desc: 'Em 1970 sai do tipo de fogão, em 1980 do combustível usado. Mede pobreza e, junto, exposição à fumaça dentro de casa.' },
  { col: 'a31_telefone', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: SO1980,
    label: 'Telefone no domicílio (1980)',
    desc: 'Só 12,6% dos domicílios em 1980. Os censos seguintes deixaram de perguntar, e o quesito só volta em 2010 como telefone celular, que não mede a mesma coisa.' },
  { col: 'a10_parede_alv', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: C2010,
    label: 'Paredes de alvenaria com revestimento',
    desc: 'Qualidade construtiva das paredes externas.' },
  { col: 'a10b_parede_alvenaria', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: [1980, 1991],
    label: 'Paredes de alvenaria (sem separar revestimento)',
    desc: 'Em 1980 e 1991 o censo registra apenas "alvenaria", sem separar com e sem revestimento como 2010 e 2022 fazem. Coluna própria porque compartilhar faria a série mostrar um salto que é só mudança de categoria.' },
  { col: 'a11_adensamento', tema: 'A', unidade: '%', dir: -1, dec: 1, den: D, anos: TODOS,
    label: 'Adensamento excessivo',
    desc: 'Domicílios com mais de dois moradores por cômodo usado como dormitório.' },
  { col: 'a32_comodos', tema: 'A', unidade: '', dir: +1, dec: 2, den: D, anos: SO1980,
    label: 'Cômodos por domicílio (1980)',
    desc: 'Média ponderada. O código 99 é "ignorado" e fica fora: incluí-lo elevaria a média sem erro nenhum aparecer.' },
  { col: 'a33_dormitorios', tema: 'A', unidade: '', dir: +1, dec: 2, den: D, anos: SO1980,
    label: 'Dormitórios por domicílio (1980)',
    desc: 'Média ponderada, com o mesmo 99 de ignorado excluído. 1980 não traz o total de moradores do domicílio, então adensamento não existe nesse ano.' },
  { col: 'a12_proprio_quit', tema: 'A', unidade: '%', dir: 0, dec: 1, den: D, anos: [1970, 1980, 2000, 2010, 2022],
    label: 'Domicílio próprio já quitado',
    desc: 'Próprio de algum morador, já pago, herdado ou ganho.' },
  { col: 'a13_alugado', tema: 'A', unidade: '%', dir: 0, dec: 1, den: D, anos: TODOS,
    label: 'Domicílio alugado',
    desc: 'Composição da condição de ocupação, sem juízo de valor.' },
  { col: 'a14_apartamento', tema: 'A', unidade: '%', dir: 0, dec: 1, den: D, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Apartamento',
    desc: 'Entre os domicílios particulares permanentes ocupados. Marca verticalização.' },
  { col: 'a24_duravel', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: SO1970,
    label: 'Domicílio durável (1970)',
    desc: 'Classificação do próprio censo de 1970: durável contra rústico. Sumiu depois, quando os censos passaram a descrever parede, piso e cobertura separadamente.' },
  { col: 'a25_urbano', tema: 'A', unidade: '%', dir: 0, dec: 1, den: D, anos: H7080,
    label: 'Domicílios em área urbana',
    desc: 'Situação do domicílio declarada pelo censo. Serve de contexto para os outros indicadores: em 1970 a distância entre urbano e rural é maior que a distância entre regiões.' },
  { col: 'a21_com_defic', tema: 'A', unidade: '%', dir: 0, dec: 1, den: D, anos: DE2000,
    label: 'Domicílios com morador com deficiência',
    desc: 'Ao menos um morador com deficiência.' },
  { col: 'a21b_com_defic_1991', tema: 'A', unidade: '%', dir: 0, dec: 1, den: D, anos: SO1991,
    label: 'Domicílios com morador com deficiência (1991)',
    desc: '1991 tem um quesito único de deficiência, com lista de tipos, e não os cinco quesitos graduados de 2000 em diante. Coluna própria porque o instrumento é outro.' },

  // Só nos censos antigos. Energia elétrica não entra em 2022 porque lá ela
  // passa de 99% em praticamente todo município: o mapa seria de uma cor só.
  // Na série 1970-2010 ela é o indicador que mais se move (47,5% para 98,7%).
  { col: 'a22_energia', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: HIST,
    label: 'Energia elétrica no domicílio',
    desc: 'Domicílios com iluminação elétrica. Vai de 47,5% em 1970 a 98,7% em 2010, e é por isso que não entra em 2022: já não distingue lugar nenhum.' },
  { col: 'a23_esgoto_adeq', tema: 'A', unidade: '%', dir: +1, dec: 1, den: D, anos: HIST,
    label: 'Esgotamento adequado',
    desc: 'Rede geral ou fossa séptica. Critério mais frouxo que o saneamento adequado de 2022, e o único que os censos antigos permitem montar.' },

  // ------------------------------------------------------------ B. Educação
  { col: 'b1_alfabetizacao', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: TODOS,
    label: 'Alfabetização (15 anos ou mais)',
    desc: 'Pessoas de 15 anos ou mais que sabem ler e escrever. Disponível nos seis censos: 66,3% em 1970, 90,4% em 2010, 93,5% em 2022.' },
  { col: 'b2_analf_60mais', tema: 'B', unidade: '%', dir: -1, dec: 1, den: P, anos: TODOS,
    label: 'Analfabetismo (60 anos ou mais)',
    desc: 'Concentração do analfabetismo na população idosa, onde ele é maior.' },
  { col: 'b3_freq_6a14', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: [1970, 1991, 2000, 2010, 2022],
    label: 'Frequência escolar, 6 a 14 anos',
    desc: 'Faixa de escolarização obrigatória. Valores próximos de 100% em quase todo o país.' },
  { col: 'b4_freq_15a17', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: [1970, 1991, 2000, 2010, 2022],
    label: 'Frequência escolar, 15 a 17 anos',
    desc: 'Idade do ensino médio, onde a evasão aparece. Discrimina muito mais que a faixa anterior.' },
  { col: 'b5_adequacao', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: [2022],
    label: 'Frequência em nível adequado à idade',
    desc: 'Mede atraso escolar: estar na escola, mas na série certa para a idade.' },
  { col: 'b5b_adequacao', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: H0010,
    label: 'Frequência em série adequada à idade (2010)',
    desc: 'De 6 a 17 anos, frequentando ensino regular na série esperada para a idade ou acima dela. Montado aqui a partir de série e idade; o indicador de 2022 usa variável já derivada pelo IBGE, então os dois não são a mesma medida.' },
  { col: 'b6_fund_completo', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Fundamental completo (25 anos ou mais)',
    desc: 'Recorte 25+ porque abaixo disso muita gente ainda está estudando.' },
  { col: 'b7_medio_completo', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Médio completo (25 anos ou mais)',
    desc: 'Nível de instrução médio completo ou superior.' },
  { col: 'b8_superior_comp', tema: 'B', unidade: '%', dir: +1, dec: 1, den: P, anos: TODOS,
    label: 'Superior completo (25 anos ou mais)',
    desc: 'Concentra-se fortemente em áreas centrais de capitais.' },
  { col: 'b9_anos_estudo', tema: 'B', unidade: ' anos', dir: +1, dec: 1, den: P, anos: SEM2010,
    label: 'Anos de estudo (25 anos ou mais)',
    desc: 'Média ponderada de anos de estudo.' },
  { col: 'b10_sem_instrucao', tema: 'B', unidade: '%', dir: -1, dec: 1, den: P, anos: [1970, 1980, 1991, 2000, 2022],
    label: 'Sem instrução (25 anos ou mais)',
    desc: 'Sem instrução ou menos de um ano de estudo.' },
  { col: 'b10b_sem_fund', tema: 'B', unidade: '%', dir: -1, dec: 1, den: P, anos: SO2010,
    label: 'Sem instrução ou fundamental incompleto (25 anos ou mais)',
    desc: 'Em 2010 o nível de instrução junta "sem instrução" com "fundamental incompleto" numa categoria só, e não há como separar. É outro indicador, mais largo que o "sem instrução" de 2022.' },

  // ---------------------------------------------------- C. Trabalho e renda
  { col: 'c1_participacao', tema: 'C', unidade: '%', dir: 0, dec: 1, den: P, anos: TODOS,
    label: 'Taxa de participação (14 anos ou mais)',
    desc: 'Na força de trabalho, ocupados mais desocupados que procuram, sobre a população de 14 anos ou mais.' },
  { col: 'c2_desocupacao', tema: 'C', unidade: '%', dir: -1, dec: 1, den: P, anos: TODOS,
    label: 'Taxa de desocupação',
    desc: 'Desocupados sobre a força de trabalho, não sobre a população. É a definição usual de desemprego.' },
  { col: 'c3_ocupacao', tema: 'C', unidade: '%', dir: +1, dec: 1, den: P, anos: TODOS,
    label: 'Nível de ocupação',
    desc: 'Ocupados sobre a população de 14 anos ou mais.' },
  { col: 'c4_carteira', tema: 'C', unidade: '%', dir: +1, dec: 1, den: P, anos: DE1991,
    label: 'Carteira de trabalho assinada',
    desc: 'Entre os ocupados. Medida direta de formalização.' },
  { col: 'c5_previdencia', tema: 'C', unidade: '%', dir: +1, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Contribuição previdenciária',
    desc: 'Ocupados contribuintes de instituto de previdência no trabalho principal. Mais abrangente que carteira: alcança autônomo que contribui.' },
  { col: 'c6_domestico', tema: 'C', unidade: '%', dir: 0, dec: 1, den: P, anos: SEM2010,
    label: 'Trabalho doméstico',
    desc: 'Trabalhadores domésticos, inclusive diaristas, entre os ocupados.' },
  { col: 'c7_rend_trab_med', tema: 'C', unidade: '', dir: +1, dec: 0, den: P, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Rendimento do trabalho (média)',
    desc: 'Em reais de janeiro de 2026, deflacionado pelo INPC. Média entre quem tem rendimento de trabalho; não inclui aposentadoria, pensão e benefícios.' },
  { col: 'c8_rend_total_med', tema: 'C', unidade: '', dir: +1, dec: 0, den: P, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Rendimento de todas as fontes (média)',
    desc: 'Em reais de janeiro de 2026, deflacionado pelo INPC. Inclui trabalho, aposentadoria, pensão, Bolsa Família, BPC e aluguel.' },
  { col: 'c9_sem_rendimento', tema: 'C', unidade: '%', dir: -1, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Sem rendimento algum (14 anos ou mais)',
    desc: 'Nenhuma fonte de rendimento declarada.' },
  // Rendimento do DOMICILIO, não da pessoa. Coluna 'a19'/'a20' por herança —
  // o nome é o contrato com os CSVs e com o R —, mas o assunto é renda, e é
  // aqui que se procura por ele.
  { col: 'a19_rdpc_mediana', tema: 'C', unidade: '', dir: +1, dec: 0, den: D, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Rendimento domiciliar per capita (mediana)',
    desc: 'Em reais de janeiro de 2026, deflacionado pelo INPC — comparável entre censos. Mediana ponderada: renda é muito assimétrica, a mediana descreve o domicílio típico e a média sobe com poucos domicílios ricos.' },
  { col: 'a19b_rdpc_media', tema: 'C', unidade: '', dir: +1, dec: 0, den: D, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Rendimento domiciliar per capita (média)',
    desc: 'Em reais de janeiro de 2026, deflacionado pelo INPC. Média ponderada, para comparar com a mediana: a distância entre as duas é uma leitura de desigualdade interna à área.' },
  { col: 'a19c_rdpc_sm', tema: 'C', unidade: ' SM', dir: +1, dec: 2, den: D, anos: [1980, 1991, 2000, 2010],
    label: 'Rendimento domiciliar per capita (salários mínimos)',
    desc: 'Renda medida contra o piso legal do próprio ano, que é outra pergunta que a renda deflacionada: sobe quando o salário mínimo perde valor real. Vem pronto do IBGE. Para comparar poder de compra entre censos, use as colunas em reais.' },
  { col: 'a20_rdpc_baixa', tema: 'C', unidade: '%', dir: -1, dec: 1, den: D, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Domicílios de baixa renda',
    desc: 'Rendimento domiciliar per capita abaixo de meio salário mínimo DO PRÓPRIO CENSO — não de um valor fixo. Por isso não é afetado pela deflação, e mede distância do piso legal, não poder de compra.' },
  { col: 'c10_raz_rend_sexo', tema: 'C', unidade: '', dir: +1, dec: 2, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Razão de rendimento entre sexos',
    desc: 'Rendimento médio feminino dividido pelo masculino. Valor 1 é paridade; abaixo de 1, mulheres ganham menos.' },
  { col: 'c10a_rend_fem', tema: 'C', unidade: '', dir: +1, dec: 0, den: P, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010],
    label: 'Rendimento médio das mulheres',
    desc: 'Em reais de janeiro de 2026. Média do rendimento de todas as fontes entre mulheres com rendimento; é um dos dois lados da razão por sexo. Em 1991 a fonte são faixas de salário mínimo, convertidas pelo mínimo de setembro de 1991.' },
  { col: 'c10b_rend_masc', tema: 'C', unidade: '', dir: +1, dec: 0, den: P, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010],
    label: 'Rendimento médio dos homens',
    desc: 'Em reais de janeiro de 2026. Média do rendimento de todas as fontes entre homens com rendimento. Em 1991 a fonte são faixas de salário mínimo, convertidas pelo mínimo de setembro de 1991.' },
  { col: 'c11_raz_rend_raca', tema: 'C', unidade: '', dir: +1, dec: 2, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Razão de rendimento por cor ou raça',
    desc: 'Rendimento médio de pretos e pardos dividido pelo de brancos. Valor 1 é paridade.' },
  { col: 'c11a_rend_pretos_pardos', tema: 'C', unidade: '', dir: +1, dec: 0, den: P, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010],
    label: 'Rendimento médio de pretos e pardos',
    desc: 'Em reais de janeiro de 2026. Média do rendimento de todas as fontes entre pessoas pretas ou pardas com rendimento.' },
  { col: 'c11b_rend_brancos', tema: 'C', unidade: '', dir: +1, dec: 0, den: P, prefixo: 'R$ ', anos: [1980, 1991, 2000, 2010],
    label: 'Rendimento médio de brancos',
    desc: 'Em reais de janeiro de 2026. Média do rendimento de todas as fontes entre pessoas brancas com rendimento.' },
  { col: 'c12_ocup_superior', tema: 'C', unidade: '%', dir: 0, dec: 1, den: P, anos: DE2000,
    label: 'Ocupações de nível superior e técnico',
    desc: 'Diretores e gerentes, profissionais das ciências e técnicos de nível médio, entre os ocupados.' },
  { col: 'c13_beneficio', tema: 'C', unidade: '%', dir: 0, dec: 1, den: P, anos: TODOS,
    label: 'Recebe aposentadoria, pensão ou benefício',
    desc: 'Inclui Bolsa Família, BPC e aluguel. Composição, não juízo.' },

  // -------------------------------------------------------- D. Demografia
  { col: 'd1a_branca', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Cor ou raça: branca', desc: 'Composição por cor ou raça autodeclarada.' },
  { col: 'd1b_preta', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Cor ou raça: preta', desc: 'Composição por cor ou raça autodeclarada.' },
  { col: 'd1c_amarela', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Cor ou raça: amarela', desc: 'Composição por cor ou raça autodeclarada.' },
  { col: 'd1d_parda', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Cor ou raça: parda', desc: 'Composição por cor ou raça autodeclarada.' },
  { col: 'd1e_indigena_raca', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: DE1991,
    label: 'Cor ou raça: indígena', desc: 'Autodeclaração de cor ou raça. Difere do quesito de pertencimento indígena.' },
  { col: 'd2_idade_mediana', tema: 'D', unidade: ' anos', dir: 0, dec: 0, den: P, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Idade mediana', desc: 'Metade da população está abaixo desta idade.' },
  { col: 'd3_envelhecimento', tema: 'D', unidade: '', dir: 0, dec: 2, den: P, anos: TODOS,
    label: 'Índice de envelhecimento',
    desc: 'População de 65 anos ou mais dividida pela de menores de 15. Acima de 1, há mais idosos que crianças.' },
  { col: 'd5_pop_0a5', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: TODOS,
    label: 'População de 0 a 5 anos', desc: 'Demanda por creche e pré-escola.' },
  { col: 'd6_pop_65mais', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: TODOS,
    label: 'População de 65 anos ou mais', desc: 'Composição etária.' },
  { col: 'd7_razao_sexo', tema: 'D', unidade: '', dir: 0, dec: 2, den: P, anos: TODOS,
    label: 'Razão de sexo',
    desc: 'Homens divididos por mulheres. Abaixo de 1 há mais mulheres.' },
  { col: 'd8_indigena', tema: 'D', unidade: '%', dir: 0, dec: 2, den: P, anos: [2022],
    label: 'Pessoas indígenas',
    desc: 'Quesito de pertencimento indígena. Denominador pequeno na maior parte do país: cuidado com o ruído.' },
  { col: 'd9_quilombola', tema: 'D', unidade: '%', dir: 0, dec: 2, den: P, anos: [2022],
    label: 'Pessoas quilombolas',
    desc: 'Primeira vez que o Censo mede quilombolas. Denominador pequeno fora dos territórios: cuidado com o ruído.' },
  { col: 'd10_deficiencia', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: [2022],
    label: 'Pessoas com deficiência',
    desc: 'Entre a população em que o quesito se aplica.' },
  { col: 'd10b_defic_severa', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: H0010,
    label: 'Pessoas com deficiência severa (critério 2010)',
    desc: 'Quem declarou não conseguir de modo algum ou ter grande dificuldade de enxergar, ouvir ou caminhar, ou deficiência mental. 2022 mudou o instrumento da pergunta, então a comparação direta com o indicador de deficiência de 2022 não vale.' },
  { col: 'd10c_deficiencia_1991', tema: 'D', unidade: '%', dir: 0, dec: 1, den: P, anos: SO1991,
    label: 'Pessoas com deficiência (critério 1991)',
    desc: 'Quem declarou cegueira, surdez, paralisia, falta de membro, deficiência mental ou mais de uma. Pergunta única, sem gradação de dificuldade: não se compara com o critério de 2000 em diante nem com o de 2022.' },
  { col: 'd11_sem_registro', tema: 'D', unidade: '%', dir: -1, dec: 2, den: P, anos: C2010,
    label: 'Sem registro de nascimento',
    desc: 'Sub-registro civil. Percentuais muito baixos em quase todo o país.' },

  // ------------------------------------------- E. Migração e deslocamento
  { col: 'e1_nao_natural', tema: 'E', unidade: '%', dir: 0, dec: 1, den: P, anos: TODOS,
    label: 'Não naturais do município',
    desc: 'Nascidas em outro município ou país. Marca áreas de destino migratório.' },
  { col: 'e2_migrante_5anos', tema: 'E', unidade: '%', dir: 0, dec: 1, den: P, anos: TODOS,
    label: 'Migrantes dos últimos 5 anos',
    desc: 'Moravam em outro município ou país há cinco anos. Migração recente, mais sensível que a anterior.' },
  { col: 'e3_estrangeiro', tema: 'E', unidade: '%', dir: 0, dec: 2, den: P, anos: TODOS,
    label: 'Estrangeiros',
    desc: 'Denominador pequeno na maior parte do país: cuidado com o ruído.' },
  { col: 'e4_trab_outro_mun', tema: 'E', unidade: '%', dir: 0, dec: 1, den: P, anos: C2010,
    label: 'Trabalha em outro município',
    desc: 'Entre os ocupados que informaram o município de trabalho. Marca dependência de polo regional.' },
  { col: 'e4b_trab_estuda_outro_mun', tema: 'E', unidade: '%', dir: 0, dec: 1, den: P, anos: [1970, 2000],
    label: 'Trabalha ou estuda em outro município',
    desc: 'Em 2000 a pergunta é sobre o município onde a pessoa trabalha OU estuda, numa variável só. Não é o mesmo indicador de 2010 e 2022, que perguntam só o trabalho, então tem coluna própria.' },
  { col: 'e5_desloc_mais_1h', tema: 'E', unidade: '%', dir: -1, dec: 1, den: P, anos: C2010,
    label: 'Deslocamento acima de 1 hora',
    desc: 'Entre quem se desloca para o trabalho. Custo urbano da periferia.' },
  { col: 'e6_desloc_minutos', tema: 'E', unidade: ' min', dir: -1, dec: 1, den: P, anos: [2022],
    label: 'Tempo médio de deslocamento',
    desc: 'Média em minutos entre quem se desloca para o trabalho.' },

  // ----------------------------------------------- F. Domicílio e família
  // Composição do domicílio e da família, aos pares: o mesmo quesito medido
  // sobre o DOMICÍLIO e sobre a FAMÍLIA, que não são a mesma unidade — em
  // 1970 há 1,05 família por domicílio. Lado a lado porque os rótulos são
  // quase iguais e os números não, e separados na lista a diferença de
  // metodologia só aparecia comparando valores e desconfiando.
  { col: 'a16_com_criancas', tema: 'F', unidade: '%', dir: 0, dec: 1, den: D, anos: TODOS,
    label: 'Domicílios com crianças',
    desc: 'Domicílios com ao menos uma criança.' },
  { col: 'a15_moradores', tema: 'F', unidade: '', dir: 0, dec: 2, den: D, anos: TODOS,
    label: 'Moradores por domicílio',
    desc: 'Média ponderada do número de moradores.' },
  { col: 'f1_tamanho_familia', tema: 'F', unidade: '', dir: 0, dec: 2, den: F, anos: TODOS,
    label: 'Tamanho médio da família', desc: 'Média ponderada de pessoas por família.' },
  { col: 'a17_resp_mulher', tema: 'F', unidade: '%', dir: 0, dec: 1, den: D, anos: TODOS,
    label: 'Responsável pelo domicílio é mulher',
    desc: 'Composição, sem juízo de valor.' },
  { col: 'f2_resp_mulher', tema: 'F', unidade: '%', dir: 0, dec: 1, den: F, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Família com responsável mulher', desc: 'Composição, sem juízo de valor.' },
  { col: 'a18_idade_resp', tema: 'F', unidade: ' anos', dir: 0, dec: 1, den: D, anos: TODOS,
    label: 'Idade do responsável pelo domicílio',
    desc: 'Média ponderada.' },
  { col: 'f3_idade_resp', tema: 'F', unidade: ' anos', dir: 0, dec: 1, den: F, anos: [1980, 1991, 2000, 2010, 2022],
    label: 'Idade do responsável pela família', desc: 'Média ponderada.' },

];

// Todo indicador com 'prefixo' é monetário, e todos eles saem dos scripts já
// deflacionados para a mesma data — ver scripts/_deflacionar.R. A base não
// entra na legenda, que ficaria ilegível repetindo isso em cada faixa; entra
// onde o número sai da tela: no CSV baixado e na linha de fonte da figura.
export const BASE_MONETARIA = 'R$ de janeiro de 2026';
export const ehMonetario = (ind) => Boolean(ind?.prefixo);

export function fmtValor(v, ind) {
  if (v == null || Number.isNaN(v)) return 'sem dados';
  const dec = ind?.dec ?? 1;
  const pre = ind?.prefixo ?? '';
  const un = ind?.unidade ?? '';
  return `${pre}${v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${un}`;
}

export function fmtInteiro(v) {
  if (v == null || Number.isNaN(v)) return '--';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
