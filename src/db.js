const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tse_auditoria.db');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA busy_timeout = 15000;');
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    dbInstance.exec('PRAGMA temp_store = MEMORY;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS urnas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uf TEXT NOT NULL,
      regiao TEXT NOT NULL,
      municipio TEXT NOT NULL,
      cod_municipio INTEGER NOT NULL,
      zona INTEGER NOT NULL,
      secao INTEGER NOT NULL,
      local_votacao TEXT NOT NULL,
      cod_local INTEGER NOT NULL,
      modelo_urna TEXT NOT NULL,
      fuso_horario TEXT DEFAULT 'UTC-3',
      
      aptos INTEGER NOT NULL,
      comparecimento INTEGER NOT NULL,
      abstencoes INTEGER NOT NULL,
      taxa_abstencao REAL NOT NULL,
      
      votos_nominais INTEGER NOT NULL,
      votos_cand_1 INTEGER NOT NULL,
      votos_cand_2 INTEGER NOT NULL,
      pct_cand_1 REAL NOT NULL,
      pct_cand_2 REAL NOT NULL,
      votos_brancos INTEGER NOT NULL,
      votos_nulos INTEGER NOT NULL,
      
      votos_apos_17h INTEGER NOT NULL DEFAULT 0,
      pct_votos_apos_17h REAL NOT NULL DEFAULT 0,
      horario_abertura TEXT DEFAULT '08:00:00',
      horario_encerramento TEXT DEFAULT '17:01:00',
      
      votos_sem_biometria INTEGER NOT NULL DEFAULT 0,
      pct_sem_biometria REAL NOT NULL DEFAULT 0,
      apenas_biometria INTEGER NOT NULL DEFAULT 1,
      
      tempo_medio_voto_seg REAL NOT NULL DEFAULT 38.0,
      votos_rapidos_15s INTEGER NOT NULL DEFAULT 0,
      reinicializacoes_urna INTEGER NOT NULL DEFAULT 0,
      
      media_cand_1_escola REAL NOT NULL DEFAULT 50.0,
      z_score_escola REAL NOT NULL DEFAULT 0.0,
      score_anomalia REAL NOT NULL DEFAULT 0.0,
      flags_anomalia TEXT NOT NULL DEFAULT '[]',
      curva_horaria_json TEXT NOT NULL DEFAULT '{}',

      -- Colunas do 1º Turno para Comparação Direta Seção a Seção
      comparecimento_1t INTEGER NOT NULL DEFAULT 0,
      abstencoes_1t INTEGER NOT NULL DEFAULT 0,
      taxa_abstencao_1t REAL NOT NULL DEFAULT 0,
      votos_cand_1_1t INTEGER NOT NULL DEFAULT 0,
      votos_cand_2_1t INTEGER NOT NULL DEFAULT 0,
      votos_outros_1t INTEGER NOT NULL DEFAULT 0,
      pct_cand_1_1t REAL NOT NULL DEFAULT 0,
      pct_cand_2_1t REAL NOT NULL DEFAULT 0,
      votos_sem_biometria_1t INTEGER NOT NULL DEFAULT 0,
      diff_cand_1 INTEGER NOT NULL DEFAULT 0,
      diff_cand_2 INTEGER NOT NULL DEFAULT 0,
      diff_abstencao REAL NOT NULL DEFAULT 0,
      
      UNIQUE(uf, cod_municipio, zona, secao)
    );
  `);

  // Garante migração das colunas do 1º Turno caso a tabela já exista
  const existingCols = new Set(
    db.prepare('PRAGMA table_info(urnas)').all().map(c => c.name)
  );
  const cols1t = [
    ['comparecimento_1t', 'INTEGER NOT NULL DEFAULT 0'],
    ['abstencoes_1t', 'INTEGER NOT NULL DEFAULT 0'],
    ['taxa_abstencao_1t', 'REAL NOT NULL DEFAULT 0'],
    ['votos_cand_1_1t', 'INTEGER NOT NULL DEFAULT 0'],
    ['votos_cand_2_1t', 'INTEGER NOT NULL DEFAULT 0'],
    ['votos_outros_1t', 'INTEGER NOT NULL DEFAULT 0'],
    ['pct_cand_1_1t', 'REAL NOT NULL DEFAULT 0'],
    ['pct_cand_2_1t', 'REAL NOT NULL DEFAULT 0'],
    ['votos_sem_biometria_1t', 'INTEGER NOT NULL DEFAULT 0'],
    ['diff_cand_1', 'INTEGER NOT NULL DEFAULT 0'],
    ['diff_cand_2', 'INTEGER NOT NULL DEFAULT 0'],
    ['diff_abstencao', 'REAL NOT NULL DEFAULT 0'],
    ['segundos_apos_17h', 'INTEGER NOT NULL DEFAULT 0'],
    ['horario_encerramento_brt', "TEXT NOT NULL DEFAULT '17:00:00'"],
    ['votos_cand_1_apos_17h', 'INTEGER NOT NULL DEFAULT 0'],
    ['votos_cand_2_apos_17h', 'INTEGER NOT NULL DEFAULT 0']
  ];
  for (const [colName, colDef] of cols1t) {
    if (!existingCols.has(colName)) {
      db.exec(`ALTER TABLE urnas ADD COLUMN ${colName} ${colDef};`);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_urnas_uf ON urnas(uf);
    CREATE INDEX IF NOT EXISTS idx_urnas_municipio ON urnas(uf, municipio);
    CREATE INDEX IF NOT EXISTS idx_urnas_biometria ON urnas(apenas_biometria);
    CREATE INDEX IF NOT EXISTS idx_urnas_apos17h ON urnas(votos_apos_17h);
    CREATE INDEX IF NOT EXISTS idx_urnas_abstencao ON urnas(taxa_abstencao);
    CREATE INDEX IF NOT EXISTS idx_urnas_anomalia ON urnas(score_anomalia);
    CREATE INDEX IF NOT EXISTS idx_urnas_modelo ON urnas(modelo_urna);
    CREATE INDEX IF NOT EXISTS idx_urnas_zscore ON urnas(z_score_escola);
    CREATE INDEX IF NOT EXISTS idx_urnas_diff1 ON urnas(diff_cand_1);
    CREATE INDEX IF NOT EXISTS idx_urnas_diff2 ON urnas(diff_cand_2);
  `);
}

/**
 * Builds SQL WHERE clause and parameters from query filters
 */
function buildWhereClause(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.uf && filters.uf !== 'TODAS') {
    conditions.push('uf = ?');
    params.push(filters.uf);
  }

  if (filters.regiao && filters.regiao !== 'TODAS') {
    conditions.push('regiao = ?');
    params.push(filters.regiao);
  }

  if (filters.municipio && filters.municipio !== 'TODOS') {
    conditions.push('municipio = ?');
    params.push(filters.municipio);
  }

  if (filters.zona && filters.zona !== 'TODAS') {
    conditions.push('zona = ?');
    params.push(Number(filters.zona));
  }

  if (filters.modelo_urna && filters.modelo_urna !== 'TODOS') {
    conditions.push('modelo_urna = ?');
    params.push(filters.modelo_urna);
  }

  if (filters.apenas_biometria === 'true' || filters.apenas_biometria === '1' || filters.apenas_biometria === true) {
    conditions.push('apenas_biometria = 1');
  } else if (filters.apenas_biometria === 'sem_bio') {
    conditions.push('votos_sem_biometria > 0');
  }

  if (filters.min_apos_17h !== undefined && filters.min_apos_17h !== '' && Number(filters.min_apos_17h) > 0) {
    conditions.push('votos_apos_17h >= ?');
    params.push(Number(filters.min_apos_17h));
  }

  if (filters.corte_horario === 'ate_17h02') {
    conditions.push('segundos_apos_17h < 120');
  } else if (filters.corte_horario === 'ate_17h05') {
    conditions.push('segundos_apos_17h < 300');
  } else if (filters.corte_horario === 'apos_17h02') {
    conditions.push('segundos_apos_17h >= 120');
  } else if (filters.corte_horario === 'apos_17h05') {
    conditions.push('segundos_apos_17h >= 300');
  } else if (filters.corte_horario === 'apos_17h15') {
    conditions.push('segundos_apos_17h >= 900');
  } else if (filters.corte_horario === 'apos_17h30') {
    conditions.push('segundos_apos_17h >= 1800');
  } else if (filters.corte_horario === 'apos_18h00') {
    conditions.push('segundos_apos_17h >= 3600');
  }

  if (filters.max_abstencao !== undefined && filters.max_abstencao !== '' && Number(filters.max_abstencao) < 100) {
    conditions.push('taxa_abstencao <= ?');
    params.push(Number(filters.max_abstencao));
  }

  if (filters.min_z_score !== undefined && filters.min_z_score !== '' && Number(filters.min_z_score) > 0) {
    conditions.push('ABS(z_score_escola) >= ?');
    params.push(Number(filters.min_z_score));
  }

  if (filters.max_tempo_voto !== undefined && filters.max_tempo_voto !== '' && Number(filters.max_tempo_voto) > 0) {
    conditions.push('tempo_medio_voto_seg <= ?');
    params.push(Number(filters.max_tempo_voto));
  }

  // Novo filtro: comparação com o 1º Turno (candidato perdeu votos no 2º turno etc.)
  if (filters.filtro_1t === 'cand1_perdeu') {
    conditions.push('votos_cand_1_1t > 0 AND diff_cand_1 < 0');
  } else if (filters.filtro_1t === 'cand2_perdeu') {
    conditions.push('votos_cand_2_1t > 0 AND diff_cand_2 < 0');
  } else if (filters.filtro_1t === 'qualquer_perdeu') {
    conditions.push('((votos_cand_1_1t > 0 AND diff_cand_1 < -5) OR (votos_cand_2_1t > 0 AND diff_cand_2 < -5))');
  } else if (filters.filtro_1t === 'abstencao_caiu_muito') {
    conditions.push('taxa_abstencao_1t > 0 AND diff_abstencao <= -5.0');
  }

  if (filters.flag_especifica && filters.flag_especifica !== 'TODAS') {
    conditions.push('flags_anomalia LIKE ?');
    params.push(`%"${filters.flag_especifica}"%`);
  }

  if (filters.busca && filters.busca.trim() !== '') {
    const term = `%${filters.busca.trim()}%`;
    conditions.push('(municipio LIKE ? OR local_votacao LIKE ? OR CAST(secao AS TEXT) LIKE ? OR CAST(zona AS TEXT) LIKE ?)');
    params.push(term, term, term, term);
  }

  const whereSQL = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSQL, params };
}

module.exports = {
  getDb,
  buildWhereClause,
  DB_PATH
};
