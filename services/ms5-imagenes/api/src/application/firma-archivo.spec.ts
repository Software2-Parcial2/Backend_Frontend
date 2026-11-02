import { detectarTipo } from './firma-archivo.js';

const bytes = (...b: number[]) => Uint8Array.from(b);
const dicom = () => {
  const b = new Uint8Array(200);
  b.set([0x44, 0x49, 0x43, 0x4d], 128);
  return b;
};

describe('detectarTipo (firma real del archivo)', () => {
  it('reconoce JPEG, PNG y DICOM por su firma', () => {
    expect(detectarTipo(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(detectarTipo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toEqual({ mime: 'image/png', ext: 'png' });
    expect(detectarTipo(dicom())).toEqual({ mime: 'application/dicom', ext: 'dcm' });
  });

  it.each([
    ['texto con extension .png', new TextEncoder().encode('esto no es una imagen')],
    ['HTML/script', new TextEncoder().encode('<script>alert(1)</script>')],
    ['ejecutable (MZ)', bytes(0x4d, 0x5a, 0x90, 0x00, 0x03)],
    ['PDF', new TextEncoder().encode('%PDF-1.7')],
    ['GIF', new TextEncoder().encode('GIF89a')],
    ['PNG truncado', bytes(0x89, 0x50, 0x4e, 0x47)],
    ['vacio', new Uint8Array(0)],
    ['DICM fuera de su sitio', (() => { const b = new Uint8Array(200); b.set([0x44, 0x49, 0x43, 0x4d], 10); return b; })()],
  ])('rechaza %s', (_n, buf) => {
    expect(detectarTipo(buf)).toBeNull();
  });
});
