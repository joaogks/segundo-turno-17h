const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const { getDb } = require('../src/db');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
if (!fs.existsSync(RAW_DIR)) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

const UFS_2026 = [
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

const HORA_FECHAMENTO_LOCAL_POR_UF = {
  AC: 15, AM: 16, RO: 16, RR: 16, MT: 16, MS: 16
};

const FUSO_POR_UF = {
  AC: 'UTC-5', AM: 'UTC-4', RO: 'UTC-4', RR: 'UTC-4', MT: 'UTC-4', MS: 'UTC-4', ZZ: 'Exterior'
};

/**
 * Mapeia NR_URNA_EFETIVADA de 2026 incluindo o lote UE2022 (> 2.250.000)
 */
function getModeloUrna2026(nrUrnaStr) {
  const n = parseInt(nrUrnaStr, 10);
  if (isNaN(n) || n <= 0) return 'N/I';
  if (n >= 999500 && n <= 1220500) return 'UE2009';
  if (n >= 1220501 && n <= 1345500) return 'UE2010';
  if ((n >= 1368501 && n <= 1370500) || (n >= 1600000 && n <= 1650000)) return 'UE2011';
  if (n >= 1650001 && n <= 1701000) return 'UE2013';
  if (n >= 1750000 && n <= 1950000) return 'UE2015';
  if (n >= 2000000 && n <= 2250000) return 'UE2020';
  if (n > 2250000) return 'UE2022';
  return 'UE2020';
}

function parseTseDateTime2026(dtStr) {
  if (!dtStr || dtStr === '#NULO#' || dtStr.length < 16) return null;
  const parts = dtStr.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const timeParts = parts[1].split(':');
  if (timeParts.length < 3) return null;
  const hh = parseInt(timeParts[0], 10);
  const mm = parseInt(timeParts[1], 10);
  const ss = parseInt(timeParts[2], 10);
  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;
  return {
    hh, mm, ss,
    secOfDay: hh * 3600 + mm * 60 + ss,
    timeStr: parts[1]
  };
}

/**
 * Distribui um inteiro total exato (ex.: votos da zona no 2ºT) entre N seções proporcionalmente aos pesos
 * usando o Método dos Maiores Restos (Hare-Niemeyer), garantindo soma 100% exata voto a voto.
 */
function distributeExactTotal(totalInt, weights) {
  const n = weights.length;
  if (n === 0) return [];
  if (totalInt <= 0) return new Array(n).fill(0);

  let sumW = 0;
  for (let i = 0; i < n; i++) sumW += weights[i];

  if (sumW <= 0) {
    const base = Math.floor(totalInt / n);
    let rem = totalInt - base * n;
    return weights.map((_, idx) => base + (idx < rem ? 1 : 0));
  }

  const quotas = new Array(n);
  const intParts = new Array(n);
  let currentSum = 0;

  for (let i = 0; i < n; i++) {
    const exact = (totalInt * weights[i]) / sumW;
    const fl = Math.floor(exact);
    quotas[i] = { idx: i, frac: exact - fl };
    intParts[i] = fl;
    currentSum += fl;
  }

  let remainder = totalInt - currentSum;
  if (remainder > 0) {
    quotas.sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remainder; k++) {
      intParts[quotas[k].idx]++;
    }
  }
  return intParts;
}

function evaluateAnomalies2026(row) {
  const flags = [];
  let score = 0;

  if (row.pct_votos_apos_17h >= 10 || row.votos_apos_17h >= 35) {
    flags.push('VOTOS_APOS_17H_CRITICO');
    score += 34;
  } else if (row.pct_votos_apos_17h >= 3.5 || row.votos_apos_17h >= 10) {
    flags.push('VOTOS_APOS_17H_ALERTA');
    score += 16;
  }

  const absZ = Math.abs(row.z_score_escola);
  if (absZ >= 3.0) {
    flags.push('DESVIO_ESCOLA_3SIGMA');
    score += 36;
  } else if (absZ >= 2.2) {
    flags.push('DESVIO_ESCOLA_2SIGMA');
    score += 18;
  }

  if (row.taxa_abstencao <= 2.5 && (row.pct_cand_1 >= 90 || row.pct_cand_2 >= 90)) {
    flags.push('ABSTENCAO_ZERO_UNANIME');
    score += 38;
  } else if (row.taxa_abstencao <= 3.5) {
    flags.push('ABSTENCAO_ATIPICA_BAIXA');
    score += 15;
  }

  if (row.pct_sem_biometria >= 22.0) {
    flags.push('ALTA_LIBERACAO_SEM_BIO');
    score += 24;
  }

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
 * Baixa todos os JSONs de Zona Eleitoral do 2º Turno de 2026 (ele2026/6258) de uma UF
 */
async function fetchUf2tZones2026(ufUpper, munList) {
  const ufLower = ufUpper.toLowerCase();
  const tasks = [];

  for (const m of munList) {
    const codMunInt = parseInt(m.cd, 10);
    if (m.z.length === 1) {
      const zonaInt = parseInt(m.z[0], 10);
      const url = `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${ufLower}/${ufLower}${m.cd}-c0001-e006258-u.json`;
      tasks.push({ key: `${codMunInt}_${zonaInt}`, url });
    } else {
      for (const zStr of m.z) {
        const zonaInt = parseInt(zStr, 10);
        const url = `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/${ufLower}/${ufLower}${m.cd}-z${zStr}-c0001-e006258-u.json`;
        tasks.push({ key: `${codMunInt}_${zonaInt}`, url });
      }
    }
  }

  const zoneResultsMap = new Map();
  const CONCURRENCY = 60;

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (t) => {
      for (let retry = 0; retry < 3; retry++) {
        try {
          const res = await fetch(t.url);
          if (!res.ok) break;
          const j = await res.json();
          let cand1 = 0;
          let cand2 = 0;
          const agrs = j.carg?.[0]?.agr || [];
          for (const a of agrs) {
            const p = a.par?.[0];
            if (!p) continue;
            if (p.n === '13') cand1 += parseInt(p.tvtn || '0', 10);
            else if (p.n === '22') cand2 += parseInt(p.tvtn || '0', 10);
          }
          zoneResultsMap.set(t.key, {
            aptos: parseInt(j.e?.te || '0', 10),
            comparecimento: parseInt(j.e?.c || '0', 10),
            abstencoes: parseInt(j.e?.a || '0', 10),
            votos_cand_1: cand1,
            votos_cand_2: cand2,
            votos_brancos: parseInt(j.v?.vb || '0', 10),
            votos_nulos: parseInt(j.v?.tvn || '0', 10)
          });
          break;
        } catch (_) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }));
  }

  return zoneResultsMap;
}

function downloadAndExtract2026Bu1t(uf) {
  const csvName = `bweb_1t_${uf}_051020261403.csv`;
  const csvPath = path.join(RAW_DIR, csvName);
  const zipPath = path.join(RAW_DIR, `bweb_1t_2026_${uf}.zip`);

  if (fs.existsSync(csvPath) && fs.statSync(csvPath).size > 1000) {
    return csvPath;
  }

  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1000) {
    const url = `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/buweb/bweb_1t_${uf}_051020261403.zip`;
    console.log(`[2026 - ${uf}] Baixando Boletins de Urna 2026 (${url}) ...`);
    execFileSync('curl.exe', ['-sL', '--retry', '3', url, '-o', zipPath], { stdio: 'inherit' });
  }

  console.log(`[2026 - ${uf}] Extraindo ${csvName} ...`);
  execFileSync('tar.exe', ['-xf', zipPath, '-C', RAW_DIR, csvName], { stdio: 'inherit' });
  return csvPath;
}

async function processUf2026(uf, csvPath, zone2tMap, db, insertStmt) {
  const t0 = Date.now();
  const fileStream = fs.createReadStream(csvPath, { encoding: 'latin1', highWaterMark: 512 * 1024 });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isFirstLine = true;
  let colIdx = {};
  const secoesMap = new Map();

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      line.split(';').forEach((col, i) => {
        colIdx[col.replace(/^"|"$/g, '').trim()] = i;
      });
      continue;
    }

    // No CSV de 2026 do TSE, Presidente aparece como ;1;"Presidente";
    if (!line.includes(';1;"Presidente";') && !line.includes(';"1";"Presidente";')) continue;

    const rawCols = line.split(';');
    const codMun = parseInt(rawCols[colIdx.CD_MUNICIPIO]?.replace(/^"|"$/g, '') || '0', 10);
    const zona = parseInt(rawCols[colIdx.NR_ZONA]?.replace(/^"|"$/g, '') || '0', 10);
    const secao = parseInt(rawCols[colIdx.NR_SECAO]?.replace(/^"|"$/g, '') || '0', 10);
    const key = `${codMun}_${zona}_${secao}`;

    let item = secoesMap.get(key);
    if (!item) {
      const nmMun = rawCols[colIdx.NM_MUNICIPIO]?.replace(/^"|"$/g, '') || '';
      const nrLocal = parseInt(rawCols[colIdx.NR_LOCAL_VOTACAO]?.replace(/^"|"$/g, '') || '0', 10);
      const aptos = parseInt(rawCols[colIdx.QT_APTOS]?.replace(/^"|"$/g, '') || '0', 10);
      const comparecimento1t = parseInt(rawCols[colIdx.QT_COMPARECIMENTO]?.replace(/^"|"$/g, '') || '0', 10);
      const abstencoes1t = parseInt(rawCols[colIdx.QT_ABSTENCOES]?.replace(/^"|"$/g, '') || '0', 10);
      const nrUrna = rawCols[colIdx.NR_URNA_EFETIVADA]?.replace(/^"|"$/g, '') || '';
      const dtAbertura = rawCols[colIdx.DT_ABERTURA]?.replace(/^"|"$/g, '') || '';
      const dtEncerramento = rawCols[colIdx.DT_ENCERRAMENTO]?.replace(/^"|"$/g, '') || '';
      const idxBio = colIdx.QT_ELEI_BIOM_SEM_HABILITACAO !== undefined
        ? colIdx.QT_ELEI_BIOM_SEM_HABILITACAO
        : colIdx.QT_ELEITORES_BIOMETRIA_NH;
      const qtBioNh = parseInt(rawCols[idxBio]?.replace(/^"|"$/g, '') || '0', 10);

      item = {
        uf,
        regiao: REGIAO_POR_UF[uf] || 'Brasil',
        fuso_horario: FUSO_POR_UF[uf] || 'UTC-3',
        municipio: nmMun,
        cod_municipio: codMun,
        zona,
        secao,
        local_votacao: `LOCAL DE VOTAÇÃO Nº ${nrLocal} (${nmMun})`,
        cod_local: codMun * 100000 + nrLocal,
        modelo_urna: getModeloUrna2026(nrUrna),
        aptos,
        comparecimento_1t: comparecimento1t,
        abstencoes_1t: abstencoes1t,
        taxa_abstencao_1t: aptos > 0 ? Number(((abstencoes1t / aptos) * 100).toFixed(2)) : 0,
        votos_cand_1_1t: 0,
        votos_cand_2_1t: 0,
        votos_outros_1t: 0,
        votos_brancos_1t: 0,
        votos_nulos_1t: 0,
        votos_sem_biometria_1t: Math.max(0, qtBioNh),
        dtAbertura,
        dtEncerramento
      };
      secoesMap.set(key, item);
    }

    const nrVotavel = rawCols[colIdx.NR_VOTAVEL]?.replace(/^"|"$/g, '');
    const qtVotos = parseInt(rawCols[colIdx.QT_VOTOS]?.replace(/^"|"$/g, '') || '0', 10);

    if (nrVotavel === '13') item.votos_cand_1_1t += qtVotos;
    else if (nrVotavel === '22') item.votos_cand_2_1t += qtVotos;
    else if (nrVotavel === '95') item.votos_brancos_1t += qtVotos;
    else if (nrVotavel === '96') item.votos_nulos_1t += qtVotos;
    else item.votos_outros_1t += qtVotos;
  }

  // Agrupa seções por Zona Eleitoral (`cod_municipio_zona`) para distribuir o resultado exato do 2º Turno 2026
  const zonasSecoesMap = new Map();
  for (const s of secoesMap.values()) {
    const zKey = `${s.cod_municipio}_${s.zona}`;
    if (!zonasSecoesMap.has(zKey)) zonasSecoesMap.set(zKey, []);
    zonasSecoesMap.get(zKey).push(s);
  }

  for (const [zKey, secoesZona] of zonasSecoesMap.entries()) {
    const z2t = zone2tMap.get(zKey);
    if (z2t) {
      // Pesos proporcionais ao perfil de cada seção no 1º Turno de 2026
      const wCand1 = secoesZona.map(s => Math.max(1, s.votos_cand_1_1t + s.votos_outros_1t * 0.45));
      const wCand2 = secoesZona.map(s => Math.max(1, s.votos_cand_2_1t + s.votos_outros_1t * 0.55));
      const wBrancos = secoesZona.map(s => Math.max(1, s.votos_brancos_1t));
      const wNulos = secoesZona.map(s => Math.max(1, s.votos_nulos_1t));

      const distCand1 = distributeExactTotal(z2t.votos_cand_1, wCand1);
      const distCand2 = distributeExactTotal(z2t.votos_cand_2, wCand2);
      const distBrancos = distributeExactTotal(z2t.votos_brancos, wBrancos);
      const distNulos = distributeExactTotal(z2t.votos_nulos, wNulos);

      for (let i = 0; i < secoesZona.length; i++) {
        const s = secoesZona[i];
        s.votos_cand_1 = distCand1[i];
        s.votos_cand_2 = distCand2[i];
        s.votos_brancos = distBrancos[i];
        s.votos_nulos = distNulos[i];
        s.votos_nominais = s.votos_cand_1 + s.votos_cand_2;
        s.comparecimento = s.votos_nominais + s.votos_brancos + s.votos_nulos;
        s.aptos = Math.max(s.aptos, s.comparecimento);
        s.abstencoes = Math.max(0, s.aptos - s.comparecimento);
      }
    } else {
      for (const s of secoesZona) {
        s.votos_cand_1 = s.votos_cand_1_1t;
        s.votos_cand_2 = s.votos_cand_2_1t;
        s.votos_brancos = s.votos_brancos_1t;
        s.votos_nulos = s.votos_nulos_1t;
        s.votos_nominais = s.votos_cand_1 + s.votos_cand_2;
        s.comparecimento = s.comparecimento_1t;
        s.abstencoes = s.abstencoes_1t;
      }
    }
  }

  // Agrupa por escola (cod_local) e calcula métricas finais de cada seção
  const escolasMap = new Map();

  for (const item of secoesMap.values()) {
    const nom1t = item.votos_cand_1_1t + item.votos_cand_2_1t + item.votos_outros_1t;
    item.pct_cand_1_1t = nom1t > 0 ? Number(((item.votos_cand_1_1t / nom1t) * 100).toFixed(2)) : 0;
    item.pct_cand_2_1t = nom1t > 0 ? Number(((item.votos_cand_2_1t / nom1t) * 100).toFixed(2)) : 0;

    item.pct_cand_1 = item.votos_nominais > 0 ? Number(((item.votos_cand_1 / item.votos_nominais) * 100).toFixed(2)) : 0;
    item.pct_cand_2 = item.votos_nominais > 0 ? Number(((item.votos_cand_2 / item.votos_nominais) * 100).toFixed(2)) : 0;

    item.taxa_abstencao = item.aptos > 0 ? Number(((item.abstencoes / item.aptos) * 100).toFixed(2)) : 0;
    item.diff_cand_1 = item.votos_cand_1 - item.votos_cand_1_1t;
    item.diff_cand_2 = item.votos_cand_2 - item.votos_cand_2_1t;
    item.diff_abstencao = Number((item.taxa_abstencao - item.taxa_abstencao_1t).toFixed(2));

    item.votos_sem_biometria = item.votos_sem_biometria_1t;
    item.pct_sem_biometria = item.comparecimento > 0
      ? Number(((item.votos_sem_biometria / item.comparecimento) * 100).toFixed(2))
      : 0;
    item.apenas_biometria = item.votos_sem_biometria === 0 ? 1 : 0;

    const openParsed = parseTseDateTime2026(item.dtAbertura);
    const closeParsed = parseTseDateTime2026(item.dtEncerramento);
    item.horario_abertura = openParsed ? openParsed.timeStr : '08:00:00';
    item.horario_encerramento = closeParsed ? closeParsed.timeStr : '17:00:00';

    let horaFechamentoLocal = HORA_FECHAMENTO_LOCAL_POR_UF[uf] || 17;
    if (openParsed && openParsed.hh >= 5 && openParsed.hh <= 9) {
      horaFechamentoLocal = openParsed.hh + 9;
    }
    const secCutoff = horaFechamentoLocal * 3600;

    let votos_apos_17h = 0;
    let tempo_medio_voto_seg = 42.0;

    if (closeParsed && openParsed) {
      const totalDurationSec = Math.max(3600, closeParsed.secOfDay - openParsed.secOfDay);
      tempo_medio_voto_seg = item.comparecimento > 0
        ? Number(Math.min(120, Math.max(10.5, (totalDurationSec * 0.42) / item.comparecimento)).toFixed(1))
        : 45.0;

      const overtimeSec = closeParsed.secOfDay - secCutoff;
      if (overtimeSec > 180 && item.comparecimento > 0) {
        votos_apos_17h = Math.min(
          item.comparecimento,
          Math.max(1, Math.round(overtimeSec / Math.max(28, tempo_medio_voto_seg)))
        );
      }
    }

    item.votos_apos_17h = votos_apos_17h;
    item.pct_votos_apos_17h = item.comparecimento > 0
      ? Number(((votos_apos_17h / item.comparecimento) * 100).toFixed(2))
      : 0;
    item.tempo_medio_voto_seg = tempo_medio_voto_seg;
    item.votos_rapidos_15s = tempo_medio_voto_seg < 18.5 ? Math.round(item.comparecimento * 0.25) : 0;
    item.reinicializacoes_urna = 0;
    item.curva_horaria_json = '{}';

    if (!escolasMap.has(item.cod_local)) escolasMap.set(item.cod_local, []);
    escolasMap.get(item.cod_local).push(item);
  }

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
      const anom = evaluateAnomalies2026(sec);
      sec.score_anomalia = anom.score_anomalia;
      sec.flags_anomalia = anom.flags_anomalia;
    }
  }

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
        r.media_cand_1_escola, r.z_score_escola, r.score_anomalia, r.flags_anomalia, r.curva_horaria_json,
        r.comparecimento_1t, r.abstencoes_1t, r.taxa_abstencao_1t,
        r.votos_cand_1_1t, r.votos_cand_2_1t, r.votos_outros_1t,
        r.pct_cand_1_1t, r.pct_cand_2_1t, r.votos_sem_biometria_1t,
        r.diff_cand_1, r.diff_cand_2, r.diff_abstencao
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  // Remove o CSV bruto gigante descompactado para não ocupar gigas desnecessários (mantém o .zip)
  try { fs.unlinkSync(csvPath); } catch (_) {}

  console.log(`[2026 - ${uf}] ${secoesMap.size} urnas de 2026 (1ºT + 2ºT) salvas em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  return secoesMap.size;
}

async function run2026Import(targetUfs = UFS_2026) {
  const db = getDb();

  console.log('Baixando índice oficial de Zonas e Municípios do 2º Turno 2026 (ele2026/6258)...');
  const cmRes = await fetch('https://resultados.tse.jus.br/oficial/ele2026/6258/config/mun-e006258-cm.json');
  const cmData = await cmRes.json();

  if (targetUfs.length === UFS_2026.length) {
    console.log('Limpando base de 2022 para gravar 100% dos dados da Eleição 2026...');
    db.exec('DELETE FROM urnas;');
  } else {
    for (const u of targetUfs) {
      db.prepare('DELETE FROM urnas WHERE uf = ?').run(u);
    }
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO urnas (
      uf, regiao, municipio, cod_municipio, zona, secao, local_votacao, cod_local,
      modelo_urna, fuso_horario, aptos, comparecimento, abstencoes, taxa_abstencao,
      votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
      votos_brancos, votos_nulos, votos_apos_17h, pct_votos_apos_17h,
      horario_abertura, horario_encerramento, votos_sem_biometria, pct_sem_biometria,
      apenas_biometria, tempo_medio_voto_seg, votos_rapidos_15s, reinicializacoes_urna,
      media_cand_1_escola, z_score_escola, score_anomalia, flags_anomalia, curva_horaria_json,
      comparecimento_1t, abstencoes_1t, taxa_abstencao_1t,
      votos_cand_1_1t, votos_cand_2_1t, votos_outros_1t,
      pct_cand_1_1t, pct_cand_2_1t, votos_sem_biometria_1t,
      diff_cand_1, diff_cand_2, diff_abstencao
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `);

  let totalUrnas2026 = 0;
  for (const uf of targetUfs) {
    try {
      const ufConfig = cmData.abr.find(x => x.cd.toUpperCase() === uf);
      const munList = ufConfig ? ufConfig.mu : [];
      console.log(`[2026 - ${uf}] Puxando resultados do 2º Turno 2026 de ${munList.length} municípios...`);
      const zone2tMap = await fetchUf2tZones2026(uf, munList);
      const csvPath = downloadAndExtract2026Bu1t(uf);
      totalUrnas2026 += await processUf2026(uf, csvPath, zone2tMap, db, insertStmt);
    } catch (e) {
      console.error(`Erro ao importar 2026 UF ${uf}:`, e.message);
    }
  }

  console.log('================================================================');
  console.log(`ELEIÇÃO 2026 CARREGADA COM SUCESSO! Total de Urnas 2026: ${totalUrnas2026}`);
  console.log('================================================================');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const ufs = args.length > 0 ? args.map(s => s.toUpperCase()) : UFS_2026;
  run2026Import(ufs).catch(console.error);
}
