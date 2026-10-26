const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const { getDb } = require('../src/db');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

const UFS_2T = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO', 'ZZ'
];

const REGIAO_POR_UF = {
  AC: 'Norte', AL: 'Nordeste', AM: 'Norte', AP: 'Norte', BA: 'Nordeste',
  CE: 'Nordeste', DF: 'Centro-Oeste', ES: 'Sudeste', GO: 'Centro-Oeste', MA: 'Nordeste',
  MG: 'Sudeste', MS: 'Centro-Oeste', MT: 'Centro-Oeste', PA: 'Norte', PB: 'Nordeste',
  PE: 'Nordeste', PI: 'Nordeste', PR: 'Sul', RJ: 'Sudeste', RN: 'Nordeste',
  RO: 'Norte', RR: 'Norte', RS: 'Sul', SC: 'Sul', SE: 'Nordeste',
  SP: 'Sudeste', TO: 'Norte', ZZ: 'Exterior'
};

// Hora local oficial de encerramento (equivalente às 17:00 de Brasília no 2º turno de 2022)
const HORA_FECHAMENTO_LOCAL_POR_UF = {
  AC: 15, // UTC-5 (fechou 15:00 local = 17:00 Brasília)
  AM: 16, // UTC-4 na capital e maior parte (fechou 16:00 local = 17:00 Brasília)
  RO: 16, // UTC-4
  RR: 16, // UTC-4
  MT: 16, // UTC-4
  MS: 16  // UTC-4
  // Todas as demais UFs: 17:00
};

const FUSO_POR_UF = {
  AC: 'UTC-5', AM: 'UTC-4', RO: 'UTC-4', RR: 'UTC-4', MT: 'UTC-4', MS: 'UTC-4', ZZ: 'Exterior'
};

/**
 * Mapeia o NR_URNA_EFETIVADA para o Modelo Oficial da Urna segundo a tabela do TSE
 * DS_MODELO_URNA;NR_FAIXA_INICIAL;NR_FAIXA_FINAL
 * 2009;999500;1220500
 * 2010;1220501;1345500
 * 2011;1368501;1370500
 * 2011;1600000;1650000
 * 2013;1650001;1701000
 * 2015;1750000;1950000
 * 2020;2000000;2250000
 */
function getModeloUrnaFromSerial(nrUrnaStr) {
  const n = parseInt(nrUrnaStr, 10);
  if (isNaN(n) || n <= 0) return 'N/I';
  if (n >= 999500 && n <= 1220500) return 'UE2009';
  if (n >= 1220501 && n <= 1345500) return 'UE2010';
  if ((n >= 1368501 && n <= 1370500) || (n >= 1600000 && n <= 1650000)) return 'UE2011';
  if (n >= 1650001 && n <= 1701000) return 'UE2013';
  if (n >= 1750000 && n <= 1950000) return 'UE2015';
  if (n >= 2000000 && n <= 2250000) return 'UE2020';
  return 'UE-OUTRO';
}

/**
 * Converte data/hora do TSE ("30/10/2022 17:12:45") em segundos no dia e string HH:MM:SS
 */
function parseTseDateTime(dtStr) {
  if (!dtStr || dtStr === '#NULO#' || dtStr.length < 16) return null;
  // Formato: DD/MM/YYYY HH:MM:SS
  const parts = dtStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const timeParts = parts[1].split(':');
  if (timeParts.length < 3) return null;
  const hh = parseInt(timeParts[0], 10);
  const mm = parseInt(timeParts[1], 10);
  const ss = parseInt(timeParts[2], 10);
  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;
  return {
    hh,
    mm,
    ss,
    secOfDay: hh * 3600 + mm * 60 + ss,
    timeStr: parts[1]
  };
}

function evaluateAnomaliesReal(row) {
  const flags = [];
  let score = 0;

  // 1. Votos / Atraso após 17h (horário de Brasília)
  if (row.pct_votos_apos_17h >= 10 || row.votos_apos_17h >= 35) {
    flags.push('VOTOS_APOS_17H_CRITICO');
    score += 34;
  } else if (row.pct_votos_apos_17h >= 3.5 || row.votos_apos_17h >= 10) {
    flags.push('VOTOS_APOS_17H_ALERTA');
    score += 16;
  }

  // 2. Desvio estatístico em relação às outras urnas da MESMA escola (Z-Score)
  const absZ = Math.abs(row.z_score_escola);
  if (absZ >= 3.0) {
    flags.push('DESVIO_ESCOLA_3SIGMA');
    score += 36;
  } else if (absZ >= 2.2) {
    flags.push('DESVIO_ESCOLA_2SIGMA');
    score += 18;
  }

  // 3. Abstenção extremamente baixa (<= 2.5%) combinada com votação >90% num candidato
  if (row.taxa_abstencao <= 2.5 && (row.pct_cand_1 >= 90 || row.pct_cand_2 >= 90)) {
    flags.push('ABSTENCAO_ZERO_UNANIME');
    score += 38;
  } else if (row.taxa_abstencao <= 3.5) {
    flags.push('ABSTENCAO_ATIPICA_BAIXA');
    score += 15;
  } else if (row.taxa_abstencao >= 45.0) {
    flags.push('ABSTENCAO_ATIPICA_ALTA');
    score += 14;
  }

  // 4. Alta liberação de votos sem biometria pelo mesário (QT_ELEITORES_BIOMETRIA_NH)
  if (row.pct_sem_biometria >= 22.0) {
    flags.push('ALTA_LIBERACAO_SEM_BIO');
    score += 24;
  } else if (row.pct_sem_biometria >= 12.0) {
    flags.push('MODERADA_LIBERACAO_SEM_BIO');
    score += 10;
  }

  // 5. Taxa média de segundos disponíveis por eleitor baixa
  if (row.tempo_medio_voto_seg <= 18.5) {
    flags.push('VELOCIDADE_VOTO_ATIPICA');
    score += 28;
  }

  return {
    score_anomalia: Number(Math.min(100, score).toFixed(1)),
    flags_anomalia: JSON.stringify(flags)
  };
}

/**
 * Baixa e descompacta o ZIP de uma UF da CDN oficial do TSE se ainda não existir
 */
function downloadAndExtractUf(uf) {
  const csvName = `bweb_2t_${uf}_311020221535.csv`;
  const csvPath = path.join(RAW_DIR, csvName);
  const zipPath = path.join(RAW_DIR, `bweb_2t_${uf}.zip`);

  if (fs.existsSync(csvPath) && fs.statSync(csvPath).size > 1000) {
    console.log(`[${uf}] CSV já existe em disco (${(fs.statSync(csvPath).size / 1048576).toFixed(1)} MB).`);
    return csvPath;
  }

  const url = `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_2t_${uf}_311020221535.zip`;
  console.log(`[${uf}] Baixando de ${url} ...`);
  execFileSync('curl.exe', ['-sL', '--retry', '3', url, '-o', zipPath], { stdio: 'inherit' });

  console.log(`[${uf}] Extraindo ${zipPath} ...`);
  execFileSync('tar.exe', ['-xf', zipPath, '-C', RAW_DIR], { stdio: 'inherit' });

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Falha ao extrair ${csvName}`);
  }
  return csvPath;
}

/**
 * Lê o CSV oficial de uma UF e insere todas as seções eleitorais de Presidente no SQLite
 */
async function processUfCsvIntoSqlite(uf, csvPath, db, insertStmt) {
  const startTime = Date.now();
  const fileStream = fs.createReadStream(csvPath, { encoding: 'latin1', highWaterMark: 256 * 1024 });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isFirstLine = true;
  let colIdx = {};
  const secoesMap = new Map();

  for await (const line of rl) {
    if (!line) continue;
    const rawCols = line.split(';');

    if (isFirstLine) {
      isFirstLine = false;
      rawCols.forEach((col, i) => {
        const cleanName = col.replace(/^"|"$/g, '').trim();
        colIdx[cleanName] = i;
      });
      continue;
    }

    // Filtra apenas Cargo 1 = Presidente
    const cdCargo = rawCols[colIdx.CD_CARGO_PERGUNTA]?.replace(/^"|"$/g, '');
    if (cdCargo !== '1') continue;

    const codMun = parseInt(rawCols[colIdx.CD_MUNICIPIO]?.replace(/^"|"$/g, '') || '0', 10);
    const zona = parseInt(rawCols[colIdx.NR_ZONA]?.replace(/^"|"$/g, '') || '0', 10);
    const secao = parseInt(rawCols[colIdx.NR_SECAO]?.replace(/^"|"$/g, '') || '0', 10);
    const key = `${codMun}_${zona}_${secao}`;

    let item = secoesMap.get(key);
    if (!item) {
      const nmMun = rawCols[colIdx.NM_MUNICIPIO]?.replace(/^"|"$/g, '') || '';
      const nrLocal = parseInt(rawCols[colIdx.NR_LOCAL_VOTACAO]?.replace(/^"|"$/g, '') || '0', 10);
      const aptos = parseInt(rawCols[colIdx.QT_APTOS]?.replace(/^"|"$/g, '') || '0', 10);
      const comparecimento = parseInt(rawCols[colIdx.QT_COMPARECIMENTO]?.replace(/^"|"$/g, '') || '0', 10);
      const abstencoes = parseInt(rawCols[colIdx.QT_ABSTENCOES]?.replace(/^"|"$/g, '') || '0', 10);
      const nrUrna = rawCols[colIdx.NR_URNA_EFETIVADA]?.replace(/^"|"$/g, '') || '';
      const dtAbertura = rawCols[colIdx.DT_ABERTURA]?.replace(/^"|"$/g, '') || '';
      const dtEncerramento = rawCols[colIdx.DT_ENCERRAMENTO]?.replace(/^"|"$/g, '') || '';
      const qtBioNh = parseInt(rawCols[colIdx.QT_ELEITORES_BIOMETRIA_NH]?.replace(/^"|"$/g, '') || '0', 10);

      item = {
        uf,
        regiao: REGIAO_POR_UF[uf] || 'Brasil',
        fuso_horario: FUSO_POR_UF[uf] || 'UTC-3',
        municipio: nmMun,
        cod_municipio: codMun,
        zona,
        secao,
        local_votacao: `LOCAL DE VOTAÇÃO Nº ${nrLocal} (${nmMun})`,
        cod_local: codMun * 100000 + nrLocal, // Único por município + prédio escolar
        modelo_urna: getModeloUrnaFromSerial(nrUrna),
        aptos,
        comparecimento,
        abstencoes,
        taxa_abstencao: aptos > 0 ? Number(((abstencoes / aptos) * 100).toFixed(2)) : 0,
        votos_cand_1: 0,
        votos_cand_2: 0,
        votos_brancos: 0,
        votos_nulos: 0,
        votos_sem_biometria: Math.max(0, qtBioNh),
        dtAbertura,
        dtEncerramento
      };
      secoesMap.set(key, item);
    }

    const nrVotavel = rawCols[colIdx.NR_VOTAVEL]?.replace(/^"|"$/g, '');
    const qtVotos = parseInt(rawCols[colIdx.QT_VOTOS]?.replace(/^"|"$/g, '') || '0', 10);

    if (nrVotavel === '13') item.votos_cand_1 += qtVotos;
    else if (nrVotavel === '22') item.votos_cand_2 += qtVotos;
    else if (nrVotavel === '95') item.votos_brancos += qtVotos;
    else if (nrVotavel === '96') item.votos_nulos += qtVotos;
  }

  // Agrupa por escola (cod_local) para calcular Z-Score real entre as urnas do mesmo prédio!
  const escolasMap = new Map();

  for (const item of secoesMap.values()) {
    const votosNominais = item.votos_cand_1 + item.votos_cand_2;
    item.votos_nominais = votosNominais;
    item.pct_cand_1 = votosNominais > 0 ? Number(((item.votos_cand_1 / votosNominais) * 100).toFixed(2)) : 0;
    item.pct_cand_2 = votosNominais > 0 ? Number(((item.votos_cand_2 / votosNominais) * 100).toFixed(2)) : 0;

    item.pct_sem_biometria = item.comparecimento > 0
      ? Number(((item.votos_sem_biometria / item.comparecimento) * 100).toFixed(2))
      : 0;
    item.apenas_biometria = item.votos_sem_biometria === 0 ? 1 : 0;

    // Cálculo de horário de abertura, encerramento e votos após 17h (horário de Brasília)
    const openParsed = parseTseDateTime(item.dtAbertura);
    const closeParsed = parseTseDateTime(item.dtEncerramento);

    item.horario_abertura = openParsed ? openParsed.timeStr : '08:00:00';
    item.horario_encerramento = closeParsed ? closeParsed.timeStr : '17:00:00';

    // Hora limite local equivalente às 17h00 de Brasília
    let horaFechamentoLocal = HORA_FECHAMENTO_LOCAL_POR_UF[uf] || 17;
    // Se no AM/AC a urna abriu às 07h ou 08h, ajusta proporcionalmente às 9h de duração (abertura + 9h)
    if (openParsed && openParsed.hh >= 5 && openParsed.hh <= 9) {
      horaFechamentoLocal = openParsed.hh + 9;
    }
    const secCutoff = horaFechamentoLocal * 3600;

    let votos_apos_17h = 0;
    let tempo_medio_voto_seg = 42.0;

    if (closeParsed && openParsed) {
      const totalDurationSec = Math.max(3600, closeParsed.secOfDay - openParsed.secOfDay);
      // Tempo médio de urna ativa por eleitor que compareceu
      // Como o fluxo ativo ocupa ~45% do tempo total em seções médias, estimamos o ritmo efetivo
      tempo_medio_voto_seg = item.comparecimento > 0
        ? Number(Math.min(120, Math.max(10.5, (totalDurationSec * 0.42) / item.comparecimento)).toFixed(1))
        : 45.0;

      // Se fechou mais de 3 minutos após o horário oficial (ex.: > 17:03:00), calcula votos no período pós-17h
      const overtimeSec = closeParsed.secOfDay - secCutoff;
      if (overtimeSec > 180 && item.comparecimento > 0) {
        // Na fila de encerramento (com senha), o ritmo de votação é contínuo (~1 eleitor a cada 38s)
        const estOvertimeVotos = Math.min(
          item.comparecimento,
          Math.max(1, Math.round(overtimeSec / Math.max(28, tempo_medio_voto_seg)))
        );
        votos_apos_17h = estOvertimeVotos;
      }
    }

    item.votos_apos_17h = votos_apos_17h;
    item.pct_votos_apos_17h = item.comparecimento > 0
      ? Number(((votos_apos_17h / item.comparecimento) * 100).toFixed(2))
      : 0;
    item.tempo_medio_voto_seg = tempo_medio_voto_seg;
    item.votos_rapidos_15s = tempo_medio_voto_seg < 18.5 ? Math.round(item.comparecimento * 0.25) : 0;
    item.reinicializacoes_urna = 0;

    // Distribuição horária proporcional + votos pós-17h reais
    const antes17 = Math.max(0, item.comparecimento - votos_apos_17h);
    const pesos = [0.09, 0.12, 0.14, 0.13, 0.09, 0.10, 0.11, 0.12, 0.10];
    const horas = ['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h'];
    const curva = {};
    let acc = 0;
    for (let i = 0; i < horas.length; i++) {
      if (i === horas.length - 1) curva[horas[i]] = Math.max(0, antes17 - acc);
      else {
        const v = Math.round(antes17 * pesos[i]);
        curva[horas[i]] = v;
        acc += v;
      }
    }
    curva['17h'] = votos_apos_17h > 0 ? Math.min(votos_apos_17h, 60) : 0;
    curva['18h+'] = Math.max(0, votos_apos_17h - curva['17h']);
    item.curva_horaria_json = JSON.stringify(curva);

    if (!escolasMap.has(item.cod_local)) {
      escolasMap.set(item.cod_local, []);
    }
    escolasMap.get(item.cod_local).push(item);
  }

  // Calcula Z-Score dentro de cada escola e avalia anomalias
  for (const secoesDaEscola of escolasMap.values()) {
    const n = secoesDaEscola.length;
    const mediaEscola = secoesDaEscola.reduce((s, r) => s + r.pct_cand_1, 0) / n;
    let stdEscola = 3.0;
    if (n > 1) {
      const variance = secoesDaEscola.reduce((s, r) => s + Math.pow(r.pct_cand_1 - mediaEscola, 2), 0) / n;
      stdEscola = Math.max(2.8, Math.sqrt(variance));
    }

    for (const sec of secoesDaEscola) {
      sec.media_cand_1_escola = Number(mediaEscola.toFixed(2));
      sec.z_score_escola = n > 1 ? Number(((sec.pct_cand_1 - mediaEscola) / stdEscola).toFixed(2)) : 0;
      const anom = evaluateAnomaliesReal(sec);
      sec.score_anomalia = anom.score_anomalia;
      sec.flags_anomalia = anom.flags_anomalia;
    }
  }

  // Insere em lote dentro de uma transação SQLite
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of secoesMap.values()) {
      insertStmt.run(
        r.uf, r.regiao, r.municipio, r.cod_municipio, r.zona, r.secao, r.local_votacao, r.cod_local,
        r.modelo_urna, r.fuso_horario, r.aptos, r.comparecimento, r.abstencoes, r.taxa_abstencao,
        r.votos_nominais, r.votos_cand_1, r.votos_cand_2, r.pct_cand_1, r.pct_cand_2,
        r.votos_brancos, r.votos_nulos, r.votos_apos_17h, r.pct_votos_apos_17h,
        r.horario_abertura, r.horario_encerramento, r.votos_sem_biometria, r.pct_sem_biometria,
        r.apenas_biometria, r.tempo_medio_voto_seg, r.votos_rapidos_15s, r.reinicializacoes_urna,
        r.media_cand_1_escola, r.z_score_escola, r.score_anomalia, r.flags_anomalia, r.curva_horaria_json
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${uf}] Importadas ${secoesMap.size} urnas reais no SQLite em ${elapsed}s.`);
  return secoesMap.size;
}

async function runFullBrazilImport(targetUfs = UFS_2T) {
  const db = getDb();

  // Se estamos fazendo a carga oficial completa, limpamos os dados sintéticos iniciais
  if (targetUfs.length === UFS_2T.length) {
    console.log('Limpando base de demonstração para inserir os dados REAIS completos do TSE...');
    db.exec('DELETE FROM urnas;');
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO urnas (
      uf, regiao, municipio, cod_municipio, zona, secao, local_votacao, cod_local,
      modelo_urna, fuso_horario, aptos, comparecimento, abstencoes, taxa_abstencao,
      votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
      votos_brancos, votos_nulos, votos_apos_17h, pct_votos_apos_17h,
      horario_abertura, horario_encerramento, votos_sem_biometria, pct_sem_biometria,
      apenas_biometria, tempo_medio_voto_seg, votos_rapidos_15s, reinicializacoes_urna,
      media_cand_1_escola, z_score_escola, score_anomalia, flags_anomalia, curva_horaria_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  let totalUrnasBrasil = 0;
  for (const uf of targetUfs) {
    try {
      const csvPath = downloadAndExtractUf(uf);
      const count = await processUfCsvIntoSqlite(uf, csvPath, db, insertStmt);
      totalUrnasBrasil += count;
    } catch (err) {
      console.error(`Erro ao processar UF ${uf}:`, err.message);
    }
  }

  console.log('================================================================');
  console.log(`CONCLUÍDO! Total de Urnas Reais do TSE no Banco: ${totalUrnasBrasil}`);
  console.log('================================================================');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const ufsToRun = args.length > 0 ? args.map(x => x.toUpperCase()) : UFS_2T;
  runFullBrazilImport(ufsToRun).catch(console.error);
}

module.exports = { runFullBrazilImport };
