<script setup lang="ts">
// Datos de ejemplo del diseno (ms7-ml). Se conectaran a /ml/inasistencia y /ml/demanda de MS7 en una fase posterior.
const citas = [
  { id: 'CT-20261104-0187', esp: 'Cardiología', fecha: 'Mié 4 nov 08:30', tono: 'err', riesgo: 'Alto · 68 %', accion: true },
  { id: 'CT-20261104-0192', esp: 'Medicina general', fecha: 'Mié 4 nov 09:00', tono: 'warn', riesgo: 'Medio · 41 %', accion: true },
  { id: 'CT-20261104-0201', esp: 'Pediatría', fecha: 'Mié 4 nov 10:30', tono: 'ok', riesgo: 'Bajo · 12 %', accion: false },
]
const variables = [
  { n: 'Inasistencias anteriores', w: 100, p: '38 %' },
  { n: 'Anticipación de la reserva', w: 64, p: '24 %' },
  { n: 'Cancelaciones previas', w: 45, p: '17 %' },
]
const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const nivel = ['Baja', 'Media', 'Alta']
const mapa = [
  { h: '08–10', c: [4, 3, 2, 3, 2] },
  { h: '10–12', c: [3, 4, 3, 2, 2] },
  { h: '14–16', c: [1, 2, 1, 2, 1] },
  { h: '16–18', c: [2, 3, 1, 3, 1] },
]
const etiqueta = (n: number) => (n >= 3 ? nivel[2] : n === 2 ? nivel[1] : nivel[0])
const segmentos = [
  { n: 'Mañanas de inicio de semana', d: 'Mayor frecuencia de consultas; conviene reforzar turnos' },
  { n: 'Tardes de martes y jueves', d: 'Demanda alta concentrada en pocas especialidades' },
  { n: 'Tardes de lunes, miércoles y viernes', d: 'Baja ocupación' },
]
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-ml">
    <div class="ph"><div><h1 id="t-ml" class="h1">Machine Learning</h1><p class="sub">Predicción de inasistencias y patrones de demanda para decisiones administrativas</p></div><span class="sp"></span><span class="chip warn">Datos de ejemplo</span></div>
    <div class="g2">
      <div class="card col" style="gap: 14px">
        <div class="fx"><div class="ct">Riesgo de inasistencia</div><span class="sp"></span><span class="chip pri">Random Forest</span></div>
        <div class="scroll">
          <table class="tbl" style="min-width: 420px">
            <thead><tr><th>Cita</th><th>Fecha</th><th>Riesgo</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in citas" :key="c.id">
                <td><div class="mono">{{ c.id }}</div><div class="sm muted">{{ c.esp }}</div></td>
                <td>{{ c.fecha }}</td>
                <td><span class="chip" :class="c.tono">{{ c.riesgo }}</span></td>
                <td class="tr"><button v-if="c.accion" type="button" class="btn s">Reforzar aviso</button><span v-else class="muted">—</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <hr class="hr" />
        <div class="ct" style="font-size: 14px">Variables con más peso</div>
        <div v-for="v in variables" :key="v.n" class="fi"><span>{{ v.n }}</span><i :style="{ width: v.w + '%' }"></i><span class="b">{{ v.p }}</span></div>
        <div class="sm muted">Se entrena con el dataset público Medical Appointment No Shows. No usa atributos clínicos para no favorecer ni discriminar a nadie. Resultado de apoyo.</div>
      </div>

      <div class="card col" style="gap: 14px">
        <div class="fx"><div class="ct">Patrones de demanda</div><span class="sp"></span><span class="chip pri">K-means</span></div>
        <div class="hm" role="table" aria-label="Demanda por día y franja horaria">
          <b></b><b v-for="d in dias" :key="d">{{ d }}</b>
          <template v-for="f in mapa" :key="f.h">
            <b style="text-align: right; padding-right: 6px">{{ f.h }}</b>
            <span v-for="(n, i) in f.c" :key="i" :class="'h' + n + 'c'">{{ etiqueta(n) }}</span>
          </template>
        </div>
        <hr class="hr" />
        <div class="ct" style="font-size: 14px">Segmentos encontrados</div>
        <div v-for="(s, i) in segmentos" :key="s.n" class="li" style="padding: 8px 0"><span class="chip pri">{{ i + 1 }}</span><div><div class="b">{{ s.n }}</div><div class="sm muted">{{ s.d }}</div></div></div>
        <div class="sm muted">Se aplica sobre las citas de MS3 completadas con datos sintéticos declarados como tales.</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hm { display: grid; grid-template-columns: 56px repeat(5, 1fr); gap: 4px; font-size: 12px; }
.hm b { font-weight: 600; color: var(--ink3); text-align: center; padding: 4px 0; }
.hm span { height: 36px; border-radius: 5px; display: grid; place-items: center; font-weight: 600; }
.h1c { background: #E6F3F5; color: var(--ink); } .h2c { background: #A9D6DC; color: var(--ink); }
.h3c { background: #4E9FAC; color: #0E2A33; } .h4c { background: #0B6572; color: #fff; }
.fi { display: grid; grid-template-columns: minmax(120px, 190px) 1fr 44px; align-items: center; gap: 12px; }
.fi i { display: block; height: 12px; background: var(--pri); border-radius: 0 6px 6px 0; }
</style>
