/// Modelos de lectura de la API (solo los campos que usa la app).
class Paciente {
  Paciente.fromJson(Map j)
      : id = '${j['id']}', nombre = '${j['nombre']}', numeroHistoria = '${j['numeroHistoria']}', documento = '${j['documento']}';
  final String id, nombre, numeroHistoria, documento;
}

class Cita {
  Cita.fromJson(Map j)
      : citaId = '${j['citaId']}', estado = '${j['estado']}', medicoId = '${j['medicoId']}',
        especialidad = '${j['especialidad'] ?? ''}', fechaHora = '${j['fechaHora']}',
        facturaId = j['facturaId'] as String?, motivoFallo = j['motivoFallo'] as String?;
  final String citaId, estado, medicoId, especialidad, fechaHora;
  final String? facturaId, motivoFallo;
}

class Medico {
  Medico.fromJson(Map j)
      : id = '${j['id']}', nombre = '${j['nombre']}',
        espCodigo = '${(j['especialidad'] as Map?)?['codigo'] ?? ''}',
        consultorio = j['consultorio'] as String?;
  final String id, nombre, espCodigo;
  final String? consultorio;
}

class Especialidad {
  Especialidad.fromJson(Map j) : id = '${j['id']}', codigo = '${j['codigo']}', nombre = '${j['nombre']}', activa = j['activa'] == true;
  final String id, codigo, nombre;
  final bool activa;
}

class Franja {
  Franja.fromJson(Map j) : fechaHora = '${j['fechaHora']}', estado = '${j['estado']}';
  final String fechaHora, estado;
}

class AvisoN {
  AvisoN.fromJson(Map j) : id = '${j['id']}', tipo = '${j['tipo']}', creadaEn = '${j['creadaEn']}', leida = j['leida'] == true;
  final String id, tipo, creadaEn;
  final bool leida;
}

class EstudioN {
  EstudioN.fromJson(Map j)
      : id = '${j['id']}', validacion = '${j['validacion']}', creadaEn = '${j['creadaEn']}',
        informe = (j['informe'] as Map?)?['texto'] as String?;
  final String id, validacion, creadaEn;
  final String? informe;
}

class Prefs {
  Prefs.fromJson(Map j)
      : canales = [for (final c in (j['canales'] as List? ?? [])) '$c'],
        tiposAviso = [for (final c in (j['tiposAviso'] as List? ?? [])) '$c'],
        telegramVinculado = j['telegramVinculado'] == true,
        antelacionHoras = (j['antelacionHoras'] as num?) ?? 24;
  final List<String> canales, tiposAviso;
  final bool telegramVinculado;
  final num antelacionHoras;
}
