/**
 * Gera a camada completa de dados estáticos (OLAP Cube + 499.206 Seções por UF + Índices Globais)
 * para funcionamento 100% serverless no GitHub Pages (https://joaogks.github.io/segundo-turno-17h/)
 */
const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../src/db');

const db = getDb();
const OUT_DIR = path.join(__dirname, '..', 'public', 'static-data');
const UF_DIR = path.join(OUT_DIR, 'uf');

fs.mkdirSync(UF_DIR, { recursive: true });

console.log('1. Exportando meta.json e municipios.json...');
const ufs = db.prepare(`
  SELECT uf, regiao, COUNT(*) as urnas
  FROM urnas
  GROUP BY uf, regiao
  ORDER BY uf ASC
`).all();

const modelos = db.prepare('SELECT DISTINCT modelo_urna FROM urnas ORDER BY modelo_urna ASC').all().map(r => r.modelo_urna);
fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify({ ufs, modelos }));

const munMap = {};
for (const u of ufs) {
  munMap[u.uf] = db.prepare('SELECT DISTINCT municipio FROM urnas WHERE uf = ? ORDER BY municipio ASC').all(u.uf).map(r => r.municipio);
}
fs.writeFileSync(path.join(OUT_DIR, 'municipios.json'), JSON.stringify(munMap));

console.log('2. Exportando Cubo Analítico Completo das 499.206 Urnas (cube.json)...');
// Faixa de horário exata baseada em segundos_apos_17h:
// 0: < 120 (ate_17h02)
// 1: 120..299 (entre 17h02 e 17h05)
// 2: 300..899 (entre 17h05 e 17h15)
// 3: 900..1799 (entre 17h15 e 17h30)
// 4: 1800..3599 (entre 17h30 e 18h00)
// 5: >= 3600 (apos_18h00)
const cubeRows = db.prepare(`
  SELECT
    uf,
    regiao,
    modelo_urna,
    apenas_biometria,
    CASE
      WHEN segundos_apos_17h < 120 THEN 0
      WHEN segundos_apos_17h < 300 THEN 1
      WHEN segundos_apos_17h < 900 THEN 2
      WHEN segundos_apos_17h < 1800 THEN 3
      WHEN segundos_apos_17h < 3600 THEN 4
      ELSE 5
    END as band_horario,
    CASE WHEN votos_cand_1_1t > 0 AND diff_cand_1 < 0 THEN 1 ELSE 0 END as f_c1_perdeu,
    CASE WHEN votos_cand_2_1t > 0 AND diff_cand_2 < 0 THEN 1 ELSE 0 END as f_c2_perdeu,
    CASE WHEN ABS(z_score_escola) >= 2.5 THEN 1 ELSE 0 END as f_desvio,
    CASE WHEN taxa_abstencao <= 3.0 THEN 1 ELSE 0 END as f_abst_baixa,
    CASE WHEN flags_anomalia LIKE '%"ALTA_LIBERACAO_SEM_BIO"%' THEN 1 ELSE 0 END as f_alta_sem_bio,

    COUNT(*) as urnas,
    SUM(aptos) as aptos,
    SUM(comparecimento) as comparecimento,
    SUM(abstencoes) as abstencoes,
    SUM(votos_nominais) as votos_nominais,
    SUM(votos_cand_1) as votos_cand_1,
    SUM(votos_cand_2) as votos_cand_2,
    SUM(votos_brancos) as votos_brancos,
    SUM(votos_nulos) as votos_nulos,
    SUM(comparecimento_1t) as comparecimento_1t,
    SUM(abstencoes_1t) as abstencoes_1t,
    SUM(votos_cand_1_1t) as votos_cand_1_1t,
    SUM(votos_cand_2_1t) as votos_cand_2_1t,
    SUM(votos_outros_1t) as votos_outros_1t,
    SUM(votos_sem_biometria_1t) as votos_sem_biometria_1t,
    SUM(votos_apos_17h) as votos_apos_17h,
    SUM(votos_cand_1_apos_17h) as votos_cand_1_apos_17h,
    SUM(votos_cand_2_apos_17h) as votos_cand_2_apos_17h,
    SUM(votos_sem_biometria) as votos_sem_biometria,
    SUM(CASE WHEN votos_apos_17h > 0 THEN CAST(ROUND(votos_sem_biometria * (CAST(votos_apos_17h AS REAL) / MAX(1, comparecimento))) AS INTEGER) ELSE 0 END) as votos_sem_biometria_apos_17h
  FROM urnas
  GROUP BY
    uf, regiao, modelo_urna, apenas_biometria, band_horario,
    f_c1_perdeu, f_c2_perdeu, f_desvio, f_abst_baixa, f_alta_sem_bio
`).all();

fs.writeFileSync(path.join(OUT_DIR, 'cube.json'), JSON.stringify(cubeRows));
console.log(`   -> cube.json gerado com ${cubeRows.length} grupos (${(fs.statSync(path.join(OUT_DIR, 'cube.json')).size / 1024).toFixed(1)} KB)`);

console.log('3. Exportando todas as 499.206 Seções Eleitorais separadas por UF (static-data/uf/<UF>.json)...');
// Schema compacto por array para economizar ~65% de espaço mantendo 100% das colunas:
// [0:id, 1:uf, 2:regiao, 3:municipio, 4:zona, 5:secao, 6:local_votacao, 7:cod_local, 8:modelo_urna,
//  9:aptos, 10:comparecimento, 11:abstencoes, 12:taxa_abstencao, 13:comparecimento_1t, 14:abstencoes_1t,
//  15:taxa_abstencao_1t, 16:diff_abstencao, 17:votos_nominais, 18:votos_cand_1, 19:votos_cand_2,
//  20:pct_cand_1, 21:pct_cand_2, 22:votos_cand_1_1t, 23:votos_cand_2_1t, 24:votos_outros_1t,
//  25:pct_cand_1_1t, 26:pct_cand_2_1t, 27:diff_cand_1, 28:diff_cand_2, 29:votos_brancos, 30:votos_nulos,
//  31:votos_apos_17h, 32:pct_votos_apos_17h, 33:horario_encerramento_brt, 34:segundos_apos_17h,
//  35:votos_cand_1_apos_17h, 36:votos_cand_2_apos_17h, 37:votos_sem_biometria, 38:pct_sem_biometria,
//  39:apenas_biometria, 40:media_cand_1_escola, 41:z_score_escola, 42:score_anomalia]

const stmtUf = db.prepare(`
  SELECT
    id, uf, regiao, municipio, zona, secao, local_votacao, cod_local, modelo_urna,
    aptos, comparecimento, abstencoes, taxa_abstencao,
    comparecimento_1t, abstencoes_1t, taxa_abstencao_1t, diff_abstencao,
    votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
    votos_cand_1_1t, votos_cand_2_1t, votos_outros_1t, pct_cand_1_1t, pct_cand_2_1t,
    diff_cand_1, diff_cand_2, votos_brancos, votos_nulos,
    votos_apos_17h, pct_votos_apos_17h, horario_encerramento_brt, segundos_apos_17h,
    votos_cand_1_apos_17h, votos_cand_2_apos_17h,
    votos_sem_biometria, pct_sem_biometria, apenas_biometria,
    media_cand_1_escola, z_score_escola, score_anomalia
  FROM urnas
  WHERE uf = ?
  ORDER BY votos_apos_17h DESC, id ASC
`);

function packRow(r) {
  return [
    r.id, r.uf, r.regiao, r.municipio, r.zona, r.secao, r.local_votacao, r.cod_local, r.modelo_urna,
    r.aptos, r.comparecimento, r.abstencoes, r.taxa_abstencao,
    r.comparecimento_1t, r.abstencoes_1t, r.taxa_abstencao_1t, r.diff_abstencao,
    r.votos_nominais, r.votos_cand_1, r.votos_cand_2, r.pct_cand_1, r.pct_cand_2,
    r.votos_cand_1_1t, r.votos_cand_2_1t, r.votos_outros_1t, r.pct_cand_1_1t, r.pct_cand_2_1t,
    r.diff_cand_1, r.diff_cand_2, r.votos_brancos, r.votos_nulos,
    r.votos_apos_17h, r.pct_votos_apos_17h, r.horario_encerramento_brt, r.segundos_apos_17h,
    r.votos_cand_1_apos_17h, r.votos_cand_2_apos_17h,
    r.votos_sem_biometria, r.pct_sem_biometria, r.apenas_biometria,
    r.media_cand_1_escola, r.z_score_escola, r.score_anomalia
  ];
}

let totalBytesUf = 0;
for (const u of ufs) {
  const rows = stmtUf.all(u.uf).map(packRow);
  const ufPath = path.join(UF_DIR, `${u.uf}.json`);
  fs.writeFileSync(ufPath, JSON.stringify(rows));
  const sz = fs.statSync(ufPath).size;
  totalBytesUf += sz;
  console.log(`   -> ${u.uf}.json: ${rows.length} urnas (${(sz / 1024 / 1024).toFixed(2)} MB)`);
}
console.log(`   Total das 28 UFs: ${(totalBytesUf / 1024 / 1024).toFixed(2)} MB`);

console.log('4. Exportando índice rápido global para paginação imediata Brasil Inteiro (global_index.json)...');
// Contém as top 600 urnas globais para cada ordenação principal (ASC e DESC) + amostra de 100% biometria
const sortCols = [
  'votos_apos_17h', 'segundos_apos_17h', 'votos_sem_biometria',
  'taxa_abstencao', 'votos_cand_1', 'votos_cand_2', 'z_score_escola', 'uf', 'secao', 'modelo_urna'
];
const globalMap = new Map();

for (const col of sortCols) {
  for (const dir of ['DESC', 'ASC']) {
    const list = db.prepare(`
      SELECT
        id, uf, regiao, municipio, zona, secao, local_votacao, cod_local, modelo_urna,
        aptos, comparecimento, abstencoes, taxa_abstencao,
        comparecimento_1t, abstencoes_1t, taxa_abstencao_1t, diff_abstencao,
        votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
        votos_cand_1_1t, votos_cand_2_1t, votos_outros_1t, pct_cand_1_1t, pct_cand_2_1t,
        diff_cand_1, diff_cand_2, votos_brancos, votos_nulos,
        votos_apos_17h, pct_votos_apos_17h, horario_encerramento_brt, segundos_apos_17h,
        votos_cand_1_apos_17h, votos_cand_2_apos_17h,
        votos_sem_biometria, pct_sem_biometria, apenas_biometria,
        media_cand_1_escola, z_score_escola, score_anomalia
      FROM urnas
      ORDER BY ${col} ${dir}, id ASC
      LIMIT 350
    `).all();
    for (const r of list) {
      if (!globalMap.has(r.id)) globalMap.set(r.id, packRow(r));
    }
  }
}

// Inclui também todas as 1.789 urnas 100% biometria do Brasil para filtro instantâneo global
const bio100Rows = db.prepare(`
  SELECT
    id, uf, regiao, municipio, zona, secao, local_votacao, cod_local, modelo_urna,
    aptos, comparecimento, abstencoes, taxa_abstencao,
    comparecimento_1t, abstencoes_1t, taxa_abstencao_1t, diff_abstencao,
    votos_nominais, votos_cand_1, votos_cand_2, pct_cand_1, pct_cand_2,
    votos_cand_1_1t, votos_cand_2_1t, votos_outros_1t, pct_cand_1_1t, pct_cand_2_1t,
    diff_cand_1, diff_cand_2, votos_brancos, votos_nulos,
    votos_apos_17h, pct_votos_apos_17h, horario_encerramento_brt, segundos_apos_17h,
    votos_cand_1_apos_17h, votos_cand_2_apos_17h,
    votos_sem_biometria, pct_sem_biometria, apenas_biometria,
    media_cand_1_escola, z_score_escola, score_anomalia
  FROM urnas
  WHERE apenas_biometria = 1
`).all();
for (const r of bio100Rows) {
  if (!globalMap.has(r.id)) globalMap.set(r.id, packRow(r));
}

const globalArr = Array.from(globalMap.values());
fs.writeFileSync(path.join(OUT_DIR, 'global_index.json'), JSON.stringify(globalArr));
console.log(`   -> global_index.json: ${globalArr.length} urnas indexadas (${(fs.statSync(path.join(OUT_DIR, 'global_index.json')).size / 1024 / 1024).toFixed(2)} MB)`);
console.log('Concluído com sucesso!');
