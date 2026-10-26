const { getDb } = require('../src/db');

function parseTimeSec(tStr) {
  if (!tStr) return null;
  const parts = tStr.split(':');
  if (parts.length < 3) return null;
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const ss = parseInt(parts[2], 10);
  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;
  return { hh, mm, ss, sec: hh * 3600 + mm * 60 + ss };
}

function formatTimeBrt(totalSec) {
  const clamped = Math.max(0, Math.min(86399, totalSec));
  const hh = Math.floor(clamped / 3600);
  const mm = Math.floor((clamped % 3600) / 60);
  const ss = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function runCalcApos17h() {
  const t0 = Date.now();
  const db = getDb();
  console.log('Calculando votos após as 17h00 (Horário de Brasília) para todas as 499.206 urnas de 2026...');

  const rows = db.prepare(`
    SELECT id, uf, horario_abertura, horario_encerramento,
           comparecimento, votos_nominais, votos_cand_1, votos_cand_2
    FROM urnas
  `).all();

  const updateStmt = db.prepare(`
    UPDATE urnas
    SET
      segundos_apos_17h = ?,
      horario_encerramento_brt = ?,
      votos_apos_17h = ?,
      pct_votos_apos_17h = ?,
      votos_cand_1_apos_17h = ?,
      votos_cand_2_apos_17h = ?
    WHERE id = ?
  `);

  let urnasApos17 = 0;
  let totalVotosApos17 = 0;
  let totalCand1Apos17 = 0;
  let totalCand2Apos17 = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of rows) {
      const openP = parseTimeSec(r.horario_abertura);
      const closeP = parseTimeSec(r.horario_encerramento);

      // Determina o fuso da urna para converter o encerramento para Horário de Brasília (17:00 BRT)
      let offsetHoursToBrt = 0;
      if (r.uf === 'AC') {
        offsetHoursToBrt = 2; // UTC-5 -> BRT (UTC-3)
      } else if (r.uf === 'RO' || r.uf === 'RR' || r.uf === 'MT' || r.uf === 'MS') {
        offsetHoursToBrt = 1; // UTC-4 -> BRT (UTC-3)
      } else if (r.uf === 'AM') {
        // No Amazonas há municípios UTC-5 (abrem 06h) e UTC-4 (abrem 07h)
        offsetHoursToBrt = (openP && openP.hh <= 6) ? 2 : 1;
      }

      const closeSecBrt = closeP ? (closeP.sec + offsetHoursToBrt * 3600) : (17 * 3600);
      const horarioBrt = formatTimeBrt(closeSecBrt);
      const sec17hBrt = 17 * 3600; // 61200s
      const segundosApos17h = Math.max(0, closeSecBrt - sec17hBrt);

      let votosApos17 = 0;
      let cand1Apos17 = 0;
      let cand2Apos17 = 0;

      // Considera votos após 17h quando a urna fechou a partir de 17:02:00 BRT (> 120s após as 17h00,
      // pois até 17:01:59 é o tempo do mesário digitar a senha de encerramento sem fila)
      if (segundosApos17h >= 120 && r.comparecimento > 0) {
        // Cada eleitor na fila pós-17h leva em média ~38 segundos
        const efetivoSegundosFila = segundosApos17h - 60;
        votosApos17 = Math.min(r.comparecimento, Math.max(1, Math.round(efetivoSegundosFila / 38)));

        if (r.votos_nominais > 0) {
          const share1 = r.votos_cand_1 / r.votos_nominais;
          const share2 = r.votos_cand_2 / r.votos_nominais;
          const validRatio = r.votos_nominais / r.comparecimento;
          const nominaisApos17 = Math.round(votosApos17 * validRatio);
          cand1Apos17 = Math.round(nominaisApos17 * share1);
          cand2Apos17 = Math.max(0, nominaisApos17 - cand1Apos17);
        }

        urnasApos17++;
        totalVotosApos17 += votosApos17;
        totalCand1Apos17 += cand1Apos17;
        totalCand2Apos17 += cand2Apos17;
      }

      const pctApos17 = r.comparecimento > 0
        ? Number(((votosApos17 / r.comparecimento) * 100).toFixed(2))
        : 0;

      updateStmt.run(
        segundosApos17h,
        horarioBrt,
        votosApos17,
        pctApos17,
        cand1Apos17,
        cand2Apos17,
        r.id
      );
    }
    db.exec('COMMIT;');
  } catch (e) {
    db.exec('ROLLBACK;');
    throw e;
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_urnas_seg_apos17h ON urnas(segundos_apos_17h);');

  console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
  console.log({
    urnasApos17,
    totalVotosApos17,
    totalCand1Apos17,
    totalCand2Apos17
  });
}

runCalcApos17h();
