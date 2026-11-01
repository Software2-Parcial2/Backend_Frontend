// Debe evaluarse ANTES de es-module-shims: lo pone en modo shim para que procese los
// import maps dinamicos (<script type="importmap-shim">) que inserta el orquestador de Native Federation.
(globalThis as { esmsInitOptions?: object }).esmsInitOptions = { shimMode: true };
