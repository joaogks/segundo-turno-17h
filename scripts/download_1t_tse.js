const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { execFileSync } = require('node:child_process');
const { getDb } = require('../src/db');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const UFS_1T = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN',
  'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO', 'ZZ'
];

function downloadAndExtract1tUf(uf) {
  const csvName = `bweb_1t_${uf}_051020221321.csv`;
  const csvPath = path.join(RAW_DIR, csvName);
  const zipPath = path.join(RAW_DIR, `bweb_1t_${uf}.zip`);

  if (fs.existsSync(csvPath) && fs.statSync(csvPath).size > 1000) {
    return csvPath;
  }

  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1000) {
    const url = `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/buweb/bweb_1t_${uf}_051020221321.zip`;
    console.log(`[1ºT - ${uf}] Baixando ${url} ...`);
    execFileSync('curl.exe', ['-sL', '--retry', '3', url, '-o', zipPath], { stdio: 'inherit' });
  }

  console.log(`[1ºT - ${uf}] Extraindo ${csvName} ...`);
  execFileSync('tar.exe', ['-xf', zipPath, '-C', RAW_DIR, csvName], { stdio: 'inherit' });
  return csvPath;
}

async function processUf1t(uf, csvPath, db, updateStmt) {
  const t0 = Date.now();
  const fileStream = fs.createReadStream(csvPath, { encoding: 'latin1', highWaterMark: 512 * 1024 });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let isFirstLine = true;
  let colIdx = {};
  const secoes1t = new Map();

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      line.split(';').forEach((col, i) => {
        colIdx[col.replace(/^"|"$/g, '').trim()] = i;
      });
      continue;
    }

    // Filtro ultra-rápido: ignora linhas de Deputado/Senador/Governador sem precisar dar split!
    if (!line.includes(';"1";"Presidente";')) continue;

    const rawCols = line.split(';');
    const codMun = parseInt(rawCols[colIdx.CD_MUNICIPIO]?.replace(/^"|"$/g, '') || '0', 10);
    const zona = parseInt(rawCols[colIdx.NR_ZONA]?.replace(/^"|"$/g, '') || '0', 10);
    const secao = parseInt(rawCols[colIdx.NR_SECAO]?.replace(/^"|"$/g, '') || '0', 10);
    const key = `${codMun}_${zona}_${secao}`;

    let item = secoes1t.get(key);
    if (!item) {
      const aptos = parseInt(rawCols[colIdx.QT_APTOS]?.replace(/^"|"$/g, '') || '0', 10);
      const comparecimento = parseInt(rawCols[colIdx.QT_COMPARECIMENTO]?.replace(/^"|"$/g, '') || '0', 10);
      const abstencoes = parseInt(rawCols[colIdx.QT_ABSTENCOES]?.replace(/^"|"$/g, '') || '0', 10);
      const qtBioNh = parseInt(rawCols[colIdx.QT_ELEITORES_BIOMETRIA_NH]?.replace(/^"|"$/g, '') || '0', 10);

      item = {
        cod_municipio: codMun,
        zona,
        secao,
        aptos_1t: aptos,
        comparecimento_1t: comparecimento,
        abstencoes_1t: abstencoes,
        taxa_abstencao_1t: aptos > 0 ? Number(((abstencoes / aptos) * 100).toFixed(2)) : 0,
        votos_cand_1_1t: 0,
        votos_cand_2_1t: 0,
        votos_outros_1t: 0,
        votos_sem_biometria_1t: Math.max(0, qtBioNh)
      };
      secoes1t.set(key, item);
    }

    const nrVotavel = rawCols[colIdx.NR_VOTAVEL]?.replace(/^"|"$/g, '');
    const qtVotos = parseInt(rawCols[colIdx.QT_VOTOS]?.replace(/^"|"$/g, '') || '0', 10);

    if (nrVotavel === '13') item.votos_cand_1_1t += qtVotos;
    else if (nrVotavel === '22') item.votos_cand_2_1t += qtVotos;
    else if (nrVotavel !== '95' && nrVotavel !== '96') item.votos_outros_1t += qtVotos;
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of secoes1t.values()) {
      const nominais1t = r.votos_cand_1_1t + r.votos_cand_2_1t + r.votos_outros_1t;
      const pct1_1t = nominais1t > 0 ? Number(((r.votos_cand_1_1t / nominais1t) * 100).toFixed(2)) : 0;
      const pct2_1t = nominais1t > 0 ? Number(((r.votos_cand_2_1t / nominais1t) * 100).toFixed(2)) : 0;

      updateStmt.run(
        r.comparecimento_1t,
        r.abstencoes_1t,
        r.taxa_abstencao_1t,
        r.votos_cand_1_1t,
        r.votos_cand_2_1t,
        r.votos_outros_1t,
        pct1_1t,
        pct2_1t,
        r.votos_sem_biometria_1t,
        r.votos_cand_1_1t,
        r.votos_cand_2_1t,
        r.taxa_abstencao_1t,
        uf,
        r.cod_municipio,
        r.zona,
        r.secao
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  // Remove o CSV bruto gigante do 1º turno (mantendo o .zip em data/raw e os dados no SQLite)
  try { fs.unlinkSync(csvPath); } catch (_) {}

  console.log(`[1ºT - ${uf}] Cruzadas ${secoes1t.size} urnas (1ºT vs 2ºT) em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  return secoes1t.size;
}

async function run1tImport(targetUfs = UFS_1T) {
  const db = getDb();
  const updateStmt = db.prepare(`
    UPDATE urnas
    SET
      comparecimento_1t = ?,
      abstencoes_1t = ?,
      taxa_abstencao_1t = ?,
      votos_cand_1_1t = ?,
      votos_cand_2_1t = ?,
      votos_outros_1t = ?,
      pct_cand_1_1t = ?,
      pct_cand_2_1t = ?,
      votos_sem_biometria_1t = ?,
      diff_cand_1 = votos_cand_1 - ?,
      diff_cand_2 = votos_cand_2 - ?,
      diff_abstencao = ROUND(taxa_abstencao - ?, 2)
    WHERE uf = ? AND cod_municipio = ? AND zona = ? AND secao = ?
  `);

  let total = 0;
  for (const uf of targetUfs) {
    try {
      const csvPath = downloadAndExtract1tUf(uf);
      total += await processUf1t(uf, csvPath, db, updateStmt);
    } catch (e) {
      console.error(`Erro no 1ºT UF ${uf}:`, e.message);
    }
  }
  console.log(`================================================================`);
  console.log(`CRUZAMENTO 1º TURNO vs 2º TURNO CONCLUÍDO! (${total} urnas cruzadas)`);
  console.log(`================================================================`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const ufs = args.length > 0 ? args.map(s => s.toUpperCase()) : UFS_1T;
  run1tImport(ufs).catch(console.error);
}
