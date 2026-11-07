<?php

namespace App\Http\Controllers;

use App\Http\Requests\CajaDiaRequest;
use App\Models\Factura;
use App\Support\Caja;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/** Movimientos y balance de caja de un dia (hora local de la clinica), opcionalmente de un turno. Solo caja y administrador. */
class CajaController extends Controller
{
    /**
     * Cobros y anulaciones del dia, mas recientes primero. Cada fila: comprobante (si hubo cobro), cargo, paciente, metodo, monto y
     * estado PAGADO o ANULADO (con motivo). Un dia es acotado, por eso no lleva cursor. Filtros: `turno`, `metodo`, `tipo`.
     */
    public function movimientos(CajaDiaRequest $request): JsonResponse
    {
        $fecha = $request->validated('fecha') ?? now(Caja::zona())->toDateString();
        [$desde, $hasta] = Caja::rangoDelDia($fecha, $request->validated('turno'));
        $tipo = $request->validated('tipo') ?? 'todos';
        $metodo = $request->validated('metodo');

        $cobros = DB::table('pagos as p')
            ->join('facturas as f', 'f.id', '=', 'p.factura_id')
            ->leftJoin('pacientes_proyeccion as pp', 'pp.paciente_id', '=', 'f.paciente_id')
            ->whereBetween('p.pagado_en', [$desde, $hasta->subMicrosecond()])
            ->when($metodo, fn ($q) => $q->where('p.metodo', $metodo))
            ->select('p.pagado_en as en', 'p.comprobante_numero', 'p.metodo', 'p.monto', 'f.id as factura_id', 'f.numero_cargo', 'f.estado', 'f.motivo_anulacion', 'f.paciente_id', 'pp.nombre')
            ->get()->map(fn ($r) => $this->fila($r, $r->comprobante_numero, $r->metodo));

        // Cargos anulados el mismo dia que NUNCA se cobraron (los cobrados que se anulan ya salen arriba con estado ANULADO).
        $anulados = $metodo ? collect() : DB::table('facturas as f')
            ->leftJoin('pacientes_proyeccion as pp', 'pp.paciente_id', '=', 'f.paciente_id')
            ->leftJoin('pagos as p', 'p.factura_id', '=', 'f.id')
            ->whereNull('p.id')
            ->whereBetween('f.anulada_en', [$desde, $hasta->subMicrosecond()])
            ->select('f.anulada_en as en', DB::raw('f.monto as monto'), 'f.id as factura_id', 'f.numero_cargo', 'f.estado', 'f.motivo_anulacion', 'f.paciente_id', 'pp.nombre')
            ->get()->map(fn ($r) => $this->fila($r, null, null));

        $filas = $cobros->concat($anulados)
            ->when($tipo === 'cobros', fn ($c) => $c->where('estado', 'PAGADO'))
            ->when($tipo === 'anulaciones', fn ($c) => $c->where('estado', 'ANULADO'))
            ->sortByDesc('en')->values();

        return response()->json(['fecha' => $fecha, 'turno' => $request->validated('turno'), 'items' => $filas, 'siguiente' => null]);
    }

    /**
     * Totales del dia: cobrado (solo cargos que siguen PAGADOS) por metodo, cantidad de cobros y anulaciones, y lo pendiente de cobro
     * hoy (todos los cargos por cobrar, de cualquier fecha).
     */
    public function balance(CajaDiaRequest $request): JsonResponse
    {
        $fecha = $request->validated('fecha') ?? now(Caja::zona())->toDateString();
        [$desde, $hasta] = Caja::rangoDelDia($fecha, $request->validated('turno'));
        $fin = $hasta->subMicrosecond();

        $porMetodo = array_fill_keys(['EFECTIVO', 'TRANSFERENCIA', 'POS'], 0.0);
        $cobros = 0;
        $total = 0.0;
        foreach (DB::table('pagos as p')->join('facturas as f', 'f.id', '=', 'p.factura_id')
            ->where('f.estado', 'PAGADA')->whereBetween('p.pagado_en', [$desde, $fin])
            ->groupBy('p.metodo')->selectRaw('p.metodo, SUM(p.monto) as monto, COUNT(*) as n')->get() as $r) {
            $porMetodo[$r->metodo] = (float) $r->monto;
            $total += (float) $r->monto;
            $cobros += (int) $r->n;
        }
        $anulaciones = Factura::whereBetween('anulada_en', [$desde, $fin])->count();
        $pend = Factura::whereIn('estado', Factura::COBRABLES)->selectRaw('COALESCE(SUM(monto), 0) as monto, COUNT(*) as n')->first();

        return response()->json([
            'fecha' => $fecha,
            'turno' => $request->validated('turno'),
            'moneda' => 'BOB',
            'totalCobrado' => Caja::dinero($total),
            'porMetodo' => array_map(fn ($v) => Caja::dinero($v), $porMetodo),
            'cobros' => $cobros,
            'anulaciones' => $anulaciones,
            'pendiente' => ['monto' => Caja::dinero($pend->monto), 'cargos' => (int) $pend->n],
        ]);
    }

    private function fila(object $r, ?string $comprobante, ?string $metodo): array
    {
        $anulado = $r->estado === 'ANULADA';

        return [
            'en' => Caja::iso($r->en),
            'hora' => Caja::hora($r->en),
            'comprobante' => $comprobante,
            'cargo' => $r->numero_cargo,
            'facturaId' => $r->factura_id,
            'paciente' => ['id' => $r->paciente_id, 'nombre' => $r->nombre],
            'metodo' => $metodo,
            'monto' => Caja::dinero($r->monto),
            'estado' => $anulado ? 'ANULADO' : 'PAGADO',
            'motivo' => $anulado ? $r->motivo_anulacion : null,
        ];
    }
}
